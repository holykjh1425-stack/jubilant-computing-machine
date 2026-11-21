import { createHash, randomUUID } from 'node:crypto';
import { createFixtureTransport, createPortalAdapter } from '../adapter.mjs';

const digest = value => createHash('sha256').update(value).digest('hex');
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const fixtureNotices = Object.freeze({
  privacy: { version: 'fixture-privacy-v1', documentSha256: digest('Synthetic privacy fixture') },
  transfer: { version: 'fixture-transfer-v1', documentSha256: digest('Synthetic transfer fixture') }
});

export const consentFixture = () => Object.fromEntries(
  Object.entries(fixtureNotices).map(([kind, notice]) => [kind, { ...notice, accepted: true }])
);

const fail = code => { throw Object.assign(new Error(code), { code }); };
const fixtures = Object.freeze({ a: 'fixture-a', b: 'fixture-b', staff: 'fixture-staff' });
const allowedServices = new Set(['website', 'ai_automation', 'custom_system', 'consulting']);

function normalize(input) {
  const description = typeof input?.description === 'string' ? input.description.replace(/^[ \t\r\n]+|[ \t\r\n]+$/g, '') : '';
  if (!allowedServices.has(input?.service) || !description || [...description].length > 2200) fail('INVALID_INPUT');
  const consents = {};
  for (const [kind, expected] of Object.entries(fixtureNotices)) {
    const got = input.consents?.[kind];
    if (got?.accepted !== true) fail('CONSENT_REQUIRED');
    if (got.version !== expected.version || got.documentSha256 !== expected.documentSha256) fail('NOTICE_MISMATCH');
    consents[kind] = { accepted: true, ...expected };
  }
  return { service: input.service, description, consents };
}

export function createHarness({ clock = Date.now, newId = randomUUID, snapshot, onFirstWrite } = {}) {
  let committed = structuredClone(snapshot ?? { cases: [], consents: [], workflows: [] });
  let working;
  let tail = Promise.resolve();
  const sessions = new Map();
  const staffIds = new Set([fixtures.staff]);

  function session(persona, lifetime = 60000) {
    if (!Object.hasOwn(fixtures, persona)) fail('UNKNOWN_FIXTURE');
    const token = randomUUID();
    sessions.set(token, { id: fixtures[persona], validUntil: clock() + lifetime });
    return token;
  }

  function verify(token) {
    const found = sessions.get(token);
    if (!found || clock() >= found.validUntil) fail('AUTH_REQUIRED');
    return { id: found.id, staff: staffIds.has(found.id), token };
  }

  function transaction(work) {
    const result = tail.then(async () => {
      working = structuredClone(committed);
      try {
        const answer = await work();
        committed = working;
        return structuredClone(answer);
      } finally {
        working = undefined;
      }
    });
    tail = result.catch(() => {});
    return result;
  }

  function verified(row, original, replayed) {
    const hash = digest(JSON.stringify(original));
    const consentRows = working.consents.filter(x => x.applicationId === row.id);
    if (hash !== row.fingerprint || JSON.stringify(row.original) !== JSON.stringify(original) ||
        consentRows.length !== 2 || !working.workflows.some(x => x.applicationId === row.id) ||
        Object.entries(original.consents).some(([kind, expected]) => !consentRows.some(entry =>
          entry.kind === kind && entry.recordedAtUtc === row.receivedAtUtc &&
          JSON.stringify(entry.notice) === JSON.stringify(expected)))) fail('SAVE_UNCERTAIN');
    return { saved: true, requestId: row.requestId, applicationId: row.id, receiptNumber: row.receiptNumber,
      serverFingerprint: row.fingerprint, replayed };
  }

  function submit(identity, { requestId, draft }) {
    if (identity.staff) fail('DENIED');
    if (typeof requestId !== 'string' || !uuid.test(requestId)) fail('INVALID_INPUT');
    const original = normalize(draft);
    const found = working.cases.find(x => x.ownerId === identity.id && x.requestId === requestId);
    if (found) {
      if (JSON.stringify(found.original) !== JSON.stringify(original)) fail('REQUEST_CONFLICT');
      return verified(found, original, true);
    }
    const at = new Date(clock()).toISOString();
    for (let i = 0; i < 4; i++) {
      const id = newId();
      if (typeof id !== 'string' || !uuid.test(id)) fail('SAVE_UNCERTAIN');
      if (working.cases.some(x => x.id === id)) fail('SAVE_UNCERTAIN');
      const receiptNumber = 'NX-' + at.slice(0, 10).replaceAll('-', '') + '-' + id.slice(0, 8).toUpperCase();
      if (working.cases.some(x => x.receiptNumber === receiptNumber)) continue;
      const row = { id, ownerId: identity.id, requestId, receiptNumber, original,
        fingerprint: digest(JSON.stringify(original)), receivedAtUtc: at };
      working.cases.push(row);
      onFirstWrite?.();
      for (const [kind, notice] of Object.entries(original.consents)) {
        working.consents.push({ applicationId: id, kind, notice, recordedAtUtc: at });
      }
      working.workflows.push({ applicationId: id, version: 0, accepted: null, paid: null, approved: null, cancelled: false });
      return verified(row, original, false);
    }
    fail('COLLISION_EXHAUSTED');
  }

  function change(identity, row, state, { action, version, amount }) {
    if (['quote','deposit','approve','check_execution'].includes(action) && !identity.staff) fail('DENIED');
    if (action === 'check_execution') {
      const reason = state.cancelled ? 'CANCELLED' : state.accepted === null ? 'QUOTE_REQUIRED' :
        state.paid === null ? 'DEPOSIT_REQUIRED' : state.approved === null ? 'APPROVAL_REQUIRED' : 'RELEASE_DISABLED';
      return { allowed: false, reason };
    }
    if (state.cancelled) fail('CANCELLED');
    switch (action) {
      case 'cancel':
        state.cancelled = true;
        break;
      case 'quote':
        if (state.paid !== null) fail('INVALID_STATE');
        state.version++;
        state.accepted = null;
        break;
      case 'accept':
        if (identity.staff || row.ownerId !== identity.id) fail('DENIED');
        if (!state.version || state.version !== version) fail('STALE_QUOTE');
        state.accepted = version;
        break;
      case 'deposit':
        if (state.accepted === null || state.accepted !== version) fail('QUOTE_REQUIRED');
        if (amount !== 30000) fail('INVALID_DEPOSIT');
        state.paid = version;
        break;
      case 'approve':
        if (state.paid === null || state.paid !== version) fail('DEPOSIT_REQUIRED');
        state.approved = version;
        break;
      default:
        fail('INVALID_ACTION');
    }
    return { ...row, state };
  }

  function invoke(route, previousIdentity, body) {
    const identity = verify(previousIdentity.token);
    if (route === 'submit_case') return submit(identity, body);
    if (route === 'read_object') {
      return { allowed: body.bucket === 'solq-dev02-fixture' &&
        (identity.staff || body.key?.split('/')?.[0] === identity.id) };
    }
    if (route === 'write_object') fail('DENIED');
    const row = working.cases.find(item => item.receiptNumber === body.receipt &&
      (identity.staff || item.ownerId === identity.id));
    if (!row) fail('NOT_FOUND');
    const state = working.workflows.find(x => x.applicationId === row.id);
    if (route === 'case_view') return { ...row, state };
    return change(identity, row, state, body);
  }

  const transport = createFixtureTransport({ auth: { verify }, postgrest: { invoke }, postgres: { transaction } });
  return Object.freeze({
    adapter: createPortalAdapter({ mode: 'fixture', transport }), session,
    revokeSession: token => sessions.delete(token), revokeStaff: () => staffIds.delete(fixtures.staff),
    snapshot: () => structuredClone(committed)
  });
}
