import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandler, MODEL } from '../supabase/functions/nexus-ai/handler.mjs';

const ADMIN = '11111111-1111-4111-8111-111111111111';
const APP = '22222222-2222-4222-8222-222222222222';
// Fictional values only. These never leave the stub transport.
const SECRET = 'sk-ant-unit-test-placeholder';
const json = (x, status = 200) => new Response(JSON.stringify(x), { status });
function fixture(options = {}) {
  const calls = []; let claimed = false;
  const fetchFn = async (url, init = {}) => {
    calls.push({ url, ...init });
    const path = new URL(url).pathname;
    if (path === '/auth/v1/user') return json({ id: ADMIN }, options.invalidAuth ? 401 : 200);
    if (path.endsWith('/admin_users')) return json(options.notAdmin ? [] : [{ user_id: ADMIN }]);
    if (path.endsWith('/rpc/nexus_ai_key')) return json(options.missingKey ? null : SECRET);
    if (path.endsWith('/rpc/nexus_ai_claim_test')) {
      if (options.claimFailure) return json({}, 500);
      if (claimed) return json(false);
      claimed = true; return json(true);
    }
    if (path.endsWith('/ai_connection_runs')) {
      if (options.auditFailure && init.method === 'PATCH') return json({}, 500);
      return json(init.method === 'PATCH' ? [{ run_key: 'claude-connection-v1' }] : []);
    }
    if (path.endsWith('/ai_work_plans')) return json(init.method === 'POST' ? [{ id: APP, ...JSON.parse(init.body) }] : []);
    if (path.endsWith('/applications')) return json([{ id: APP, receipt_number: 'NX-FICTIONAL', status: 'received', service_type: 'website' }]);
    if (url === 'https://api.anthropic.com/v1/messages') {
      if (options.timeout) throw new Error(SECRET);
      if (options.providerFailure) return json({ error: SECRET }, 401);
      if (options.invalidUsage) return json({ content: [] });
      return json({ content: [{ type: 'text', text: options.badText ? 'NO' : 'OK' }],
        stop_reason: 'end_turn', usage: { input_tokens: 12, output_tokens: 2 } });
    }
    throw new Error('Unexpected transport request: ' + url);
  };
  const handle = createHandler({ url: 'https://example.supabase.co', serviceKey: 'test-service-key', fetchFn });
  const request = (body, extra = {}) => handle(new Request('https://example.supabase.co/functions/v1/nexus-ai', {
    method: 'POST', headers: { authorization: 'Bearer synthetic-user-jwt', 'content-type': 'application/json', ...extra },
    body: JSON.stringify(body),
  }));
  return { calls, request, handle, paid: () => calls.filter(x => x.url === 'https://api.anthropic.com/v1/messages') };
}
const live = { action: 'live_test', confirm: 'one-minimal-claude-call' };

test('health checks DB and Vault without a provider call or key disclosure', async () => {
  const f = fixture(); const res = await f.request({ action: 'health' });
  assert.equal(res.status, 200); const text = await res.text();
  assert.match(text, /"ready":true/); assert.ok(!text.includes(SECRET)); assert.equal(f.paid().length, 0);
});
test('no login, invalid login, and non-admin are denied before Vault/provider access', async () => {
  for (const options of [{}, { invalidAuth: true }, { notAdmin: true }]) {
    const f = fixture(options);
    const res = await f.request(live, options.invalidAuth || options.notAdmin ? {} : { authorization: '' });
    assert.equal(res.status, options.notAdmin ? 403 : 401);
    assert.equal(f.paid().length, 0); assert.ok(!f.calls.some(x => x.url.includes('nexus_ai_key')));
  }
});
test('cross-origin requests are denied before auth and unsupported action cannot call provider', async () => {
  const f = fixture(); assert.equal((await f.request(live, { origin: 'https://other.invalid' })).status, 403);
  assert.equal(f.calls.length, 0);
  assert.equal((await f.request({ action: 'openai' })).status, 400); assert.equal(f.paid().length, 0);
});
test('missing key, missing confirmation, or failed DB claim never calls provider', async () => {
  for (const options of [{ missingKey: true }, { claimFailure: true }]) {
    const f = fixture(options); assert.equal((await f.request(live)).status, 503); assert.equal(f.paid().length, 0);
  }
  const f = fixture(); assert.equal((await f.request({ action: 'live_test' })).status, 400); assert.equal(f.paid().length, 0);
});
test('concurrent and subsequent requests share one paid attempt; fixed minimal payload and estimated usage', async () => {
  const f = fixture(); const results = await Promise.all([f.request(live), f.request(live), f.request(live)]);
  assert.deepEqual(results.map(x => x.status).sort(), [200, 409, 409]);
  assert.equal(f.paid().length, 1); const call = f.paid()[0];
  assert.equal(call.headers['x-api-key'], SECRET); const payload = JSON.parse(call.body);
  assert.equal(payload.model, MODEL); assert.equal(payload.max_tokens, 8);
  assert.deepEqual(payload.messages, [{ role: 'user', content: 'Reply only OK.' }]);
  const value = await results.find(x => x.status === 200).json();
  assert.equal(value.estimated_cost_usd, 0.0000022); assert.equal(value.cost_is_estimate, true);
  assert.equal((await f.request(live)).status, 409); assert.equal(f.paid().length, 1);
});
test('provider errors, unknown timeout, invalid usage, and invalid response never retry or leak secrets', async () => {
  for (const options of [{ timeout: true }, { providerFailure: true }, { invalidUsage: true }, { badText: true }]) {
    const f = fixture(options); const res = await f.request(live);
    assert.equal(res.status, 502); assert.ok(!(await res.text()).includes(SECRET));
    assert.equal((await f.request(live)).status, 409); assert.equal(f.paid().length, 1);
  }
});
test('audit failure after success does not release slot or call provider again', async () => {
  const f = fixture({ auditFailure: true }); assert.equal((await f.request(live)).status, 503);
  assert.equal((await f.request(live)).status, 409); assert.equal(f.paid().length, 1);
});
test('plan creates internal metadata without changing customer tables or making paid calls', async () => {
  const f = fixture(); const res = await f.request({ action: 'plan', application_id: APP });
  assert.equal(res.status, 200); const value = await res.json();
  assert.equal(value.execution_started, false); assert.equal(value.plan.plan.payment_confirmed, false);
  assert.equal(value.plan.plan.steps.length, 6); assert.equal(f.paid().length, 0);
  assert.ok(f.calls.filter(x => x.url.includes('/applications')).every(x => x.method === 'GET'));
  assert.equal((await f.request({ action: 'plan', application_id: '../rpc/evil' })).status, 400);
});
test('streamed request size is bounded even without content-length', async () => {
  const f = fixture(); assert.equal((await f.request({ action: 'health', extra: 'x'.repeat(3000) })).status, 413);
  assert.equal(f.paid().length, 0);
});
