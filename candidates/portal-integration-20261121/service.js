(() => {
  'use strict';

  const PRICE = Object.freeze({ total: 100000, deposit: 30000, balance: 70000, currency: 'KRW' });
  const STEPS = Object.freeze(['requirements', 'scope', 'implementation', 'validation', 'human_review', 'delivery']);
  const NOTICES = Object.freeze({
    privacy: Object.freeze({ version: 'fixture-privacy-v1', text: '합성 시험용 개인정보 항목입니다. 실제 개인정보를 입력하지 마세요.' }),
    transfer: Object.freeze({ version: 'fixture-transfer-v1', text: '합성 시험용 국외 이전 항목입니다. 이 후보는 외부로 전송하지 않습니다.' })
  });
  const FIXTURES = Object.freeze({
    a: Object.freeze({ id: 'synthetic-a', role: 'customer' }),
    b: Object.freeze({ id: 'synthetic-b', role: 'customer' }),
    admin: Object.freeze({ id: 'synthetic-admin', role: 'admin' })
  });
  const SERVICE_TYPES = new Set(['website', 'ai_automation', 'custom_system', 'consulting']);
  const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
  const RECEIPT = /^NX-[0-9]{8}-[A-F0-9]{8}$/;
  const errors = {
    AUTH_REQUIRED: 401, SESSION_EXPIRED: 401, DENIED: 403, NOT_FOUND: 404,
    INVALID_INPUT: 400, CONSENT_REQUIRED: 422, NOTICE_MISMATCH: 422,
    REQUEST_CONFLICT: 409, QUOTE_REQUIRED: 409, STALE_QUOTE: 409, PLAN_REQUIRED: 409,
    DEPOSIT_REQUIRED: 409, APPROVAL_REQUIRED: 409, INVALID_STATE: 409,
    INVALID_DEPOSIT: 422, CANCELLED: 409, RELEASE_DISABLED: 403,
    COLLISION_EXHAUSTED: 503, SAVE_UNCERTAIN: 503, PLAN_UNAVAILABLE: 503
  };
  class PortalError extends Error {
    constructor(code) { super(code); this.code = code; }
  }
  const stop = code => { throw new PortalError(code); };
  const copy = value => structuredClone(value);
  const iso = clock => new Date(clock()).toISOString();

  async function digest(value) {
    const bytes = new TextEncoder().encode(value);
    return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
      n => n.toString(16).padStart(2, '0')).join('');
  }

  async function notices() {
    const result = {};
    for (const kind of Object.keys(NOTICES)) {
      const notice = NOTICES[kind];
      result[kind] = { ...notice, documentSha256: await digest(notice.text) };
    }
    return result;
  }

  function normalize(draft, manifest) {
    if (!SERVICE_TYPES.has(draft?.service) || typeof draft.description !== 'string') stop('INVALID_INPUT');
    const description = draft.description.trim();
    if (!description || description.length > 2200 || /[\u0000-\u0009\u000B-\u001F]/.test(description) ||
        !globalThis.SolqConversation.protect(description)) stop('INVALID_INPUT');
    const consent = {};
    for (const kind of Object.keys(NOTICES)) {
      const entry = draft.consents?.[kind];
      if (entry?.accepted !== true) stop('CONSENT_REQUIRED');
      const expected = manifest[kind];
      if (entry.version !== expected.version || entry.documentSha256 !== expected.documentSha256) stop('NOTICE_MISMATCH');
      consent[kind] = { accepted: true, version: expected.version, documentSha256: expected.documentSha256 };
    }
    return { service: draft.service, description, consents: consent };
  }

  // A future server adapter implements makePlan(input). Only these offline adapters are registered.
  const adapters = Object.freeze({
    rules: {
      async makePlan({ description }) {
        const run = globalThis.SolqPlanning.executeFree({ agent: 'internal', kind: 'scope', instruction: description });
        if (!run.verified) stop('PLAN_UNAVAILABLE');
        return run.result.plan.steps;
      }
    },
    mock: { async makePlan() { return [...STEPS]; } }
  });

  function createService({ clock = Date.now, newApplicationId = () => crypto.randomUUID(), provider = 'rules' } = {}) {
    if (!Object.hasOwn(adapters, provider)) stop('PLAN_UNAVAILABLE');
    const manifest = notices();
    const sessions = new Map();
    const applications = new Map();
    const byReceipt = new Map();
    const byRequest = new Map();

    // This selector issues local fixture sessions only. It is never an API route.
    function openFixture(persona) {
      if (persona === 'anonymous') return null;
      if (!Object.hasOwn(FIXTURES, persona)) stop('AUTH_REQUIRED');
      const token = crypto.randomUUID();
      sessions.set(token, { ...FIXTURES[persona], expiresAt: clock() + 15 * 60 * 1000 });
      return token;
    }

    function actor(token, role) {
      const session = sessions.get(token);
      if (!session) stop('AUTH_REQUIRED');
      if (session.expiresAt <= clock()) {
        sessions.delete(token);
        stop('SESSION_EXPIRED');
      }
      if (role && session.role !== role) stop('DENIED');
      return session;
    }

    function owned(receipt, caller) {
      const record = applications.get(byReceipt.get(receipt));
      if (!record || (caller.role !== 'admin' && caller.id !== record.ownerId)) stop('NOT_FOUND');
      return record;
    }

    function response(record, replayed) {
      if (applications.get(record.id) !== record || byReceipt.get(record.receipt) !== record.id ||
          byRequest.get(record.ownerId + '/' + record.requestId) !== record.id) stop('SAVE_UNCERTAIN');
      return { saved: true, applicationId: record.id, receiptNumber: record.receipt,
        requestId: record.requestId, fingerprint: record.fingerprint, replayed };
    }

    async function submit(token, { requestId, draft }) {
      const initial = actor(token, 'customer');
      if (typeof requestId !== 'string' || !UUID.test(requestId)) stop('INVALID_INPUT');
      const original = normalize(draft, await manifest);
      const fingerprint = await digest(JSON.stringify(original));
      const caller = actor(token, 'customer');
      if (caller.id !== initial.id) stop('DENIED');
      const key = caller.id + '/' + requestId;
      const previous = byRequest.get(key);
      if (previous) {
        const prior = applications.get(previous);
        if (!prior) stop('SAVE_UNCERTAIN');
        if (prior.fingerprint !== fingerprint) stop('REQUEST_CONFLICT');
        return response(prior, true);
      }

      // There is no await between the uniqueness checks and publishing the row and indices.
      const at = iso(clock);
      for (let attempt = 0; attempt < 4; attempt++) {
        const id = newApplicationId();
        if (typeof id !== 'string' || !UUID.test(id)) stop('SAVE_UNCERTAIN');
        const receipt = 'NX-' + at.slice(0, 10).replaceAll('-', '') + '-' + id.slice(0, 8).toUpperCase();
        if (applications.has(id) || byReceipt.has(receipt)) continue;
        const consentEvidence = Object.fromEntries(Object.entries(original.consents)
          .map(([kind, value]) => [kind, { ...value, recordedAtUtc: at }]));
        const record = { id, receipt, ownerId: caller.id, requestId, original, fingerprint,
          receivedAtUtc: at, consentEvidence, plan: null, quote: null, deposit: null,
          approval: null, cancelled: false, events: [] };
        event(record, caller, 'received');
        applications.set(id, record);
        byReceipt.set(receipt, id);
        byRequest.set(key, id);
        return response(record, false);
      }
      stop('COLLISION_EXHAUSTED');
    }

    function event(record, caller, action) {
      record.events.push({ action, role: caller.role, atUtc: iso(clock) });
    }

    async function preparePlan(token, record) {
      const steps = await adapters[provider].makePlan({ description: record.original.description });
      const caller = actor(token, 'admin');
      if (record.cancelled) stop('CANCELLED');
      if (JSON.stringify(steps) !== JSON.stringify(STEPS)) stop('PLAN_UNAVAILABLE');
      if (!record.plan) {
        record.plan = { provider, steps: [...steps], executionStarted: false, paidCalls: 0 };
        event(record, caller, 'free_plan');
      }
    }

    function transition(record, caller, action, body) {
      if (record.cancelled) stop('CANCELLED');
      switch (action) {
        case 'cancel':
          record.cancelled = true;
          break;
        case 'quote':
          if (!record.plan) stop('PLAN_REQUIRED');
          if (record.deposit || record.approval) stop('INVALID_STATE');
          record.quote = { ...PRICE, version: (record.quote?.version ?? 0) + 1, acceptedAtUtc: null };
          break;
        case 'accept':
          if (!record.quote) stop('QUOTE_REQUIRED');
          if (body.version !== record.quote.version) stop('STALE_QUOTE');
          if (record.quote.acceptedAtUtc) return;
          record.quote.acceptedAtUtc = iso(clock);
          break;
        case 'deposit':
          if (!record.quote?.acceptedAtUtc) stop('QUOTE_REQUIRED');
          if (body.version !== record.quote.version) stop('STALE_QUOTE');
          if (body.amount !== PRICE.deposit) stop('INVALID_DEPOSIT');
          if (record.deposit) return;
          record.deposit = { quoteVersion: body.version, amount: body.amount, atUtc: iso(clock), simulated: true };
          break;
        case 'approve':
          if (!record.deposit || record.deposit.quoteVersion !== record.quote?.version) stop('DEPOSIT_REQUIRED');
          if (body.version !== record.quote.version) stop('STALE_QUOTE');
          if (record.approval) return;
          record.approval = { quoteVersion: body.version, atUtc: iso(clock), simulated: true };
          break;
        default:
          stop('INVALID_INPUT');
      }
      event(record, caller, action);
    }

    function checkExecution(record) {
      if (record.cancelled) stop('CANCELLED');
      if (!record.quote?.acceptedAtUtc) stop('QUOTE_REQUIRED');
      if (record.deposit?.quoteVersion !== record.quote.version) stop('DEPOSIT_REQUIRED');
      if (record.approval?.quoteVersion !== record.quote.version) stop('APPROVAL_REQUIRED');
      stop('RELEASE_DISABLED');
    }

    const adminActions = new Set(['list', 'plan', 'quote', 'deposit', 'approve', 'checkExecution']);
    async function handle({ action, session, body = {} } = {}) {
      try {
        if (action === 'notices') return { status: 200, data: copy(await manifest) };
        if (action === 'submit') return { status: 200, data: await submit(session, body) };
        const caller = actor(session, adminActions.has(action) ? 'admin' : action === 'accept' ? 'customer' : null);
        if (action === 'list') {
          return { status: 200, data: Array.from(applications.values(),
            ({ id, receipt, receivedAtUtc }) => ({ id, receipt, receivedAtUtc })) };
        }
        const record = owned(body.receipt, caller);
        if (action === 'plan') await preparePlan(session, record);
        else if (action === 'checkExecution') checkExecution(record);
        else if (action !== 'get') transition(record, caller, action, body);
        // The receipt and original only leave this service for the owner or administrator.
        return { status: 200, data: copy(record) };
      } catch (err) {
        const code = err instanceof PortalError ? err.code : 'SAVE_UNCERTAIN';
        return { status: errors[code], error: code };
      }
    }

    return Object.freeze({ handle, openFixture, closeFixture: token => sessions.delete(token) });
  }

  globalThis.SolqPortal = Object.freeze({ createService, normalize, digest, PRICE, UUID, RECEIPT });
})();
