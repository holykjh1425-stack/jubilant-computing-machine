// No SDK retries, no OpenAI dependency, no secret/customer data logging.
export const MODEL = 'claude-haiku-5-5';
const ORIGIN = 'https://holykjh1425-stack.github.io';
const ALLOWED_ORIGINS = new Set([ORIGIN, 'https://nexus-labs.lemonyglade2048.chatgpt.site', 'https://solqtech.com', 'https://www.solqtech.com']);
const TEST_KEY = 'claude-connection-v1';
const MAX_BODY_BYTES = 2048;

class Failure extends Error {
  constructor(status, code) { super(code); this.status = status; }
}

async function readBody(req) {
  if (!req.body) throw new Failure(400, 'invalid_body');
  const reader = req.body.getReader();
  let size = 0;
  const chunks = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) { await reader.cancel(); throw new Failure(413, 'body_too_large'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); }
  catch { throw new Failure(400, 'invalid_json'); }
}

export function createHandler({ url, serviceKey, fetchFn = fetch }) {
  const baseHeaders = {
    'Content-Type': 'application/json', 'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': ORIGIN, 'Vary': 'Origin',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
  async function db(path, method = 'GET', body) {
    const res = await fetchFn(`${url}/rest/v1/${path}`, {
      method, headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(10000), redirect: 'error',
    });
    // Never forward backend response bodies: a secret may be present.
    if (!res.ok) throw new Failure(503, 'database_unavailable');
    return await res.json();
  }
  async function keyFromVault() {
    const key = await db('rpc/nexus_ai_key', 'POST', {});
    if (typeof key !== 'string' || !key.startsWith('sk-ant-')) throw new Failure(503, 'vault_key_unavailable');
    return key;
  }
  return async req => {
    const requestOrigin = req.headers.get('origin');
    const headers = { ...baseHeaders, 'Access-Control-Allow-Origin': ALLOWED_ORIGINS.has(requestOrigin) ? requestOrigin : ORIGIN };
    const reply = (body, status = 200) => new Response(JSON.stringify(body), { status, headers });
    try {
      const origin = req.headers.get('origin');
      if (origin && !ALLOWED_ORIGINS.has(origin)) return reply({ error: 'origin_denied' }, 403);
      if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
      if (req.method !== 'POST') return reply({ error: 'method_not_allowed' }, 405);
      if (!url || !serviceKey) throw new Failure(503, 'server_not_configured');
      const authorization = req.headers.get('authorization') ?? '';
      if (!authorization.startsWith('Bearer ')) throw new Failure(401, 'login_required');
      const auth = await fetchFn(`${url}/auth/v1/user`, {
        headers: { apikey: serviceKey, Authorization: authorization },
        signal: AbortSignal.timeout(10000), redirect: 'error',
      });
      if (!auth.ok) throw new Failure(401, 'invalid_session');
      const user = await auth.json();
      if (!user.id) throw new Failure(401, 'invalid_session');
      const admins = await db(`admin_users?select=user_id&user_id=eq.${encodeURIComponent(user.id)}`);
      if (!Array.isArray(admins) || admins.length !== 1) throw new Failure(403, 'admin_required');
      const body = await readBody(req);
      if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Failure(400, 'invalid_body');
      if (body.action === 'health') {
        await keyFromVault();
        await db('ai_connection_runs?select=run_key&limit=1');
        await db('ai_work_plans?select=id&limit=1');
        return reply({ ready: true, provider: 'anthropic', model: MODEL, paid_calls: 0,
          production_execution_enabled: false });
      }
      if (body.action === 'plan') {
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.application_id ?? '')) {
          throw new Failure(400, 'invalid_application_id');
        }
        const existing = await db(`ai_work_plans?select=*&application_id=eq.${body.application_id}&order=created_at.asc&limit=1`);
        if (existing.length) return reply({plan:existing[0],paid_calls:0,execution_started:false,existing:true});
        const applications = await db(`applications?select=id,receipt_number,status,service_type&id=eq.${body.application_id}`);
        if (applications.length !== 1) throw new Failure(404, 'application_not_found');
        const application = applications[0];
        // Plans are internal metadata. Customer status/content is never updated.
        const steps = ['requirements', 'scope', 'implementation', 'validation', 'human_review', 'delivery'];
        const plans = await db('ai_work_plans', 'POST', {
          application_id: application.id, created_by: user.id,
          plan: { receipt_number: application.receipt_number, service_type: application.service_type,
            steps, payment_confirmed: ['deposit_confirmed', 'in_progress', 'completed'].includes(application.status),
            external_execution: 'requires_separate_approval' },
        });
        return reply({ plan: plans[0], paid_calls: 0, execution_started: false });
      }
      if (body.action !== 'live_test') throw new Failure(400, 'unsupported_action');
      if (body.confirm !== 'one-minimal-claude-call') throw new Failure(400, 'explicit_test_confirmation_required');
      // Check schema and key access before consuming the global one-attempt slot.
      const apiKey = await keyFromVault();
      const claimed = await db('rpc/nexus_ai_claim_test', 'POST', { p_admin: user.id });
      if (claimed !== true) throw new Failure(409, 'test_already_attempted');
      let providerResult;
      try {
        const res = await fetchFn('https://api.anthropic.com/v1/messages', {
          method: 'POST', headers: { 'Content-Type': 'application/json',
            'anthropic-version': '2023-06-01', 'x-api-key': apiKey },
          body: JSON.stringify({ model: MODEL, max_tokens: 8, thinking: { type: 'disabled' },
            messages: [{ role: 'user', content: 'Reply only OK.' }] }),
          signal: AbortSignal.timeout(20000), redirect: 'error',
        });
        if (!res.ok) throw new Error('provider_request_failed');
        const value = await res.json();
        const input = value.usage?.input_tokens;
        const output = value.usage?.output_tokens;
        if (!Number.isSafeInteger(input) || input < 0 || !Number.isSafeInteger(output) || output < 0) {
          throw new Error('provider_usage_missing');
        }
        const text = (value.content ?? []).filter(x => x.type === 'text').map(x => x.text).join('').trim();
        if (text !== 'OK' || value.stop_reason !== 'end_turn') throw new Error('unexpected_provider_response');
        providerResult = { status: 'succeeded', input_tokens: input, output_tokens: output,
          estimated_cost_usd: (input * 0.10 + output * 0.50) / 1_000_000 };
      } catch {
        // Failure/timeout may still have been charged; never retry or free the slot.
        try { await db(`ai_connection_runs?run_key=eq.${TEST_KEY}`, 'PATCH', {
          status: 'failed', error_code: 'provider_failed_or_unknown', completed_at: new Date().toISOString(),
        }); } catch { /* Slot remains reserved even if final audit write fails. */ }
        throw new Failure(502, 'provider_failed_or_unknown_no_retry');
      }
      const saved = await db(`ai_connection_runs?run_key=eq.${TEST_KEY}`, 'PATCH', {
        ...providerResult, completed_at: new Date().toISOString(),
      });
      if (saved.length !== 1) throw new Failure(503, 'audit_write_failed_no_retry');
      return reply({ ...providerResult, model: MODEL, paid_calls: 1, cost_is_estimate: true });
    } catch (error) {
      return reply({ error: error instanceof Failure ? error.message : 'server_unavailable' },
        error instanceof Failure ? error.status : 503);
    }
  };
}
