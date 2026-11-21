import assert from 'node:assert/strict';
import test from 'node:test';
import { createPortalAdapter } from '../adapter.mjs';
import { consentFixture, createHarness } from './fixture.mjs';

const id = n => '01000000-0000-4000-8000-' + String(n).padStart(12, '0');
const input = () => ({ service: 'ai_automation', description: 'Synthetic enquiry workflow', consents: consentFixture() });
const invoke = (h, route, session, body) => h.adapter.request({ route, session, body });
const submit = (h, a, requestId = id(1), draft = input()) => invoke(h, 'submit_case', a, { requestId, draft });
const view = (h, t, receipt) => invoke(h, 'case_view', t, { receipt });
const action = (h, t, receipt, name, version, amount) =>
  invoke(h, 'case_action', t, { receipt, action: name, version, amount });

test('adapter is off by default and admits no real mode or alternate destination', async () => {
  const off = createPortalAdapter();
  assert.equal(off.mode, 'off');
  await assert.rejects(off.request({ route: 'submit_case' }), { code: 'ADAPTER_DISABLED' });
  assert.throws(() => createPortalAdapter({ mode: 'live' }), { code: 'LIVE_TRANSPORT_UNAVAILABLE' });
  assert.throws(() => createPortalAdapter({ url: 'http://localhost:54321' }), { code: 'INVALID_ISOLATION_TARGET' });
  assert.throws(() => createPortalAdapter({ database: 'unapproved' }), { code: 'INVALID_ISOLATION_TARGET' });
  assert.throws(() => createPortalAdapter({ mode: 'fixture', transport: {} }), { code: 'INVALID_FIXTURE_TRANSPORT' });
});

test('unknown routes and anonymous application/storage reads or submissions are denied', async () => {
  const h = createHarness();
  await assert.rejects(invoke(h, 'arbitrary_rpc', null, {}), { code: 'ROUTE_NOT_ALLOWED' });
  await assert.rejects(submit(h, null), { code: 'AUTH_REQUIRED' });
  await assert.rejects(view(h, null, 'NX-20261121-01000000'), { code: 'AUTH_REQUIRED' });
  await assert.rejects(invoke(h, 'read_object', null, {}), { code: 'AUTH_REQUIRED' });
  assert.equal(h.snapshot().cases.length, 0);
});

test('A/B access is isolated and staff retains the minimum permitted read', async () => {
  const h = createHarness();
  const a = h.session('a'), b = h.session('b'), admin = h.session('staff');
  const receipt = (await submit(h, a)).receiptNumber;
  await assert.rejects(view(h, b, receipt), { code: 'NOT_FOUND' });
  await assert.rejects(submit(h, admin), { code: 'DENIED' });
  assert.equal((await view(h, a, receipt)).original.description, input().description);
  assert.equal((await view(h, admin, receipt)).receiptNumber, receipt);
  await assert.rejects(action(h, a, receipt, 'approve', 1), { code: 'DENIED' });
});

test('private object fixture permits owner/staff read only; wrong bucket and client writes are denied', async () => {
  const h = createHarness();
  const a = h.session('a'), b = h.session('b'), staff = h.session('staff');
  const object = { bucket: 'solq-dev02-fixture', key: 'fixture-a/note.txt' };
  assert.deepEqual(await invoke(h, 'read_object', a, object), { allowed: true });
  assert.deepEqual(await invoke(h, 'read_object', b, object), { allowed: false });
  assert.deepEqual(await invoke(h, 'read_object', staff, object), { allowed: true });
  assert.deepEqual(await invoke(h, 'read_object', a, { ...object, bucket: 'other' }), { allowed: false });
  for (const role of [a, b, staff]) await assert.rejects(invoke(h, 'write_object', role, object), { code: 'DENIED' });
});

test('absence or change of either consent blocks the entire submission', async () => {
  const h = createHarness();
  const a = h.session('a');
  for (const kind of ['privacy', 'transfer']) {
    const blank = input();
    blank.consents[kind].accepted = false;
    await assert.rejects(submit(h, a, id(1), blank), { code: 'CONSENT_REQUIRED' });
    const changed = input();
    changed.consents[kind].documentSha256 = 'f'.repeat(64);
    await assert.rejects(submit(h, a, id(1), changed), { code: 'NOTICE_MISMATCH' });
  }
  assert.deepEqual(h.snapshot(), { cases: [], consents: [], workflows: [] });
});

test('a failure between writing the original and consent rolls back the transaction', async () => {
  const h = createHarness({ onFirstWrite() { throw Error('synthetic consent failure'); } });
  await assert.rejects(submit(h, h.session('a')), /synthetic consent failure/);
  assert.deepEqual(h.snapshot(), { cases: [], consents: [], workflows: [] });
});

test('concurrent same-key submissions resolve to one row, two separate consents and one receipt', async () => {
  const h = createHarness();
  const a = h.session('a');
  const [first, next] = await Promise.all([submit(h, a), submit(h, a)]);
  assert.equal(first.applicationId, next.applicationId);
  assert.equal(first.receiptNumber, next.receiptNumber);
  assert.deepEqual([first.replayed, next.replayed].sort(), [false, true]);
  const rows = h.snapshot();
  assert.equal(rows.cases.length, 1);
  assert.equal(rows.workflows.length, 1);
  assert.equal(rows.consents.length, 2);
  assert.deepEqual(rows.consents.map(x => x.kind), ['privacy', 'transfer']);
  assert.ok(rows.consents.every(x => x.recordedAtUtc === rows.cases[0].receivedAtUtc));
});

test('same request key with a different body cannot overwrite the original', async () => {
  const h = createHarness();
  const a = h.session('a');
  const first = await submit(h, a);
  await assert.rejects(submit(h, a, id(1), { ...input(), description: 'Other synthetic input' }), { code: 'REQUEST_CONFLICT' });
  assert.deepEqual((await view(h, a, first.receiptNumber)).original, input());
});

test('a receipt conflict allocates another unique receipt and keeps both originals', async () => {
  const queue = [id(10), id(11), '02000000-0000-4000-8000-000000000012'];
  const h = createHarness({ newId: () => queue.shift() });
  const a = h.session('a');
  const first = await submit(h, a);
  const second = await submit(h, a, id(2));
  assert.notEqual(first.receiptNumber, second.receiptNumber);
  assert.equal((await submit(h, a)).applicationId, first.applicationId);
  assert.equal(h.snapshot().cases.length, 2);
});

test('bounded collision failures return no success and preserve existing rows', async () => {
  let next = 0;
  const h = createHarness({ newId: () => id(++next) });
  const a = h.session('a');
  await submit(h, a);
  await assert.rejects(submit(h, a, id(2)), { code: 'COLLISION_EXHAUSTED' });
  assert.equal(h.snapshot().cases.length, 1);
});

test('response loss after commit and mock restart recover the same receipt without a second write', async () => {
  const h = createHarness();
  const a = h.session('a');
  await assert.rejects((async () => {
    await submit(h, a);
    throw Error('synthetic link failure after commit');
  })(), /after commit/);
  const bytes = JSON.stringify(h.snapshot());
  const restarted = createHarness({ snapshot: JSON.parse(bytes) });
  const seen = await submit(restarted, restarted.session('a'));
  assert.equal(seen.replayed, true);
  assert.equal(seen.applicationId, h.snapshot().cases[0].id);
  assert.equal(seen.receiptNumber, h.snapshot().cases[0].receiptNumber);
  assert.equal(JSON.stringify(restarted.snapshot()), bytes);
});

test('an incomplete committed original/consent mirror cannot report success', async () => {
  const h = createHarness();
  await submit(h, h.session('a'));
  const bad = h.snapshot();
  bad.consents.pop();
  const restarted = createHarness({ snapshot: bad });
  await assert.rejects(submit(restarted, restarted.session('a')), { code: 'SAVE_UNCERTAIN' });
  assert.equal(restarted.snapshot().cases.length, 1);
});

test('expiry, session revocation and staff removal are rechecked on later calls', async () => {
  let now = Date.now();
  const h = createHarness({ clock: () => now });
  const a = h.session('a', 10), admin = h.session('staff');
  const receipt = (await submit(h, a)).receiptNumber;
  now += 10;
  await assert.rejects(view(h, a, receipt), { code: 'AUTH_REQUIRED' });
  const next = h.session('a');
  h.revokeSession(next);
  await assert.rejects(view(h, next, receipt), { code: 'AUTH_REQUIRED' });
  h.revokeStaff();
  await assert.rejects(view(h, admin, receipt), { code: 'NOT_FOUND' });
});

test('three gates enforce quote version, exact synthetic amount, separate approval and no execution', async () => {
  const h = createHarness();
  const a = h.session('a'), staff = h.session('staff');
  const r = (await submit(h, a)).receiptNumber;
  const gate = () => action(h, staff, r, 'check_execution');
  assert.deepEqual(await gate(), { allowed: false, reason: 'QUOTE_REQUIRED' });
  await action(h, staff, r, 'quote');
  await action(h, a, r, 'accept', 1);
  await action(h, staff, r, 'quote');
  await assert.rejects(action(h, a, r, 'accept', 1), { code: 'STALE_QUOTE' });
  await action(h, a, r, 'accept', 2);
  assert.equal((await gate()).reason, 'DEPOSIT_REQUIRED');
  await assert.rejects(action(h, staff, r, 'approve', 2), { code: 'DEPOSIT_REQUIRED' });
  await assert.rejects(action(h, staff, r, 'deposit', 2, 1), { code: 'INVALID_DEPOSIT' });
  await action(h, staff, r, 'deposit', 2, 30000);
  assert.equal((await gate()).reason, 'APPROVAL_REQUIRED');
  await action(h, staff, r, 'approve', 2);
  assert.deepEqual(await gate(), { allowed: false, reason: 'RELEASE_DISABLED' });
  await action(h, a, r, 'cancel');
  assert.equal((await gate()).reason, 'CANCELLED');
  await assert.rejects(action(h, staff, r, 'approve', 2), { code: 'CANCELLED' });
});
