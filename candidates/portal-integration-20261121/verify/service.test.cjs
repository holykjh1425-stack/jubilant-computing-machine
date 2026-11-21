'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
require('../vendor/solq-planning.js');
require('../vendor/dialogue.js');
require('../service.js');
require('../client.js');

const { createService } = globalThis.SolqPortal;
const { createIntake } = globalThis.SolqPortalClient;
const id = n => '01000000-0000-4000-8000-' + String(n).padStart(12, '0');

async function fixture(config) {
  const service = createService(config);
  const roles = { a: service.openFixture('a'), b: service.openFixture('b'), admin: service.openFixture('admin') };
  const call = (action, as, body) => service.handle({ action, session: roles[as], body });
  const notices = (await call('notices')).data;
  const consents = Object.fromEntries(Object.entries(notices).map(([k, v]) => [
    k, { accepted: true, version: v.version, documentSha256: v.documentSha256 }
  ]));
  const draft = { service: 'ai_automation', description: '합성 문의 분류를 자동화하는 시험', consents };
  const submit = (requestId = id(1), body = draft, as = 'a') => call('submit', as, { requestId, draft: body });
  const list = () => call('list', 'admin');
  return { service, roles, call, notices, draft, submit, list };
}

async function prepared(f) {
  const saved = await f.submit();
  assert.equal(saved.status, 200);
  const receipt = saved.data.receiptNumber;
  const body = { receipt, version: 1, amount: 30000 };
  const act = (command, role = 'admin', extra) => f.call(command, role, { ...body, ...extra });
  const plan = await act('plan');
  assert.equal(plan.status, 200);
  assert.equal(plan.data.plan.steps.length, 6);
  const quote = await act('quote');
  assert.equal(quote.status, 200);
  assert.deepEqual([quote.data.quote.total, quote.data.quote.deposit, quote.data.quote.balance], [100000, 30000, 70000]);
  return { act, receipt };
}

test('기존 규칙형 상담에서 여섯 단계가 나옴', () => {
  const c = globalThis.SolqConversation;
  const state = ['합성 문의 자동화', '분류 1종', '고정 CSV', '수동 실행', '분류 확인'].reduce((s, v) => c.answer(s, v), c.create());
  assert.equal(c.summary(state).steps.length, 6);
  assert.throws(() => c.answer(c.create(), '테스트 연락처 example@example.invalid'));
});

test('양쪽 동의 중 하나라도 누락되면 저장하지 않음', async () => {
  const f = await fixture();
  for (const kind of ['privacy', 'transfer']) {
    const d = structuredClone(f.draft);
    d.consents[kind].accepted = false;
    assert.equal((await f.submit(id(1), d)).error, 'CONSENT_REQUIRED');
  }
  assert.deepEqual((await f.list()).data, []);
});

test('개별 고지 버전과 SHA-256 불일치를 거부', async () => {
  const f = await fixture();
  for (const [kind, field, value] of [['privacy', 'version', 'wrong'], ['transfer', 'documentSha256', '0'.repeat(64)]]) {
    const d = structuredClone(f.draft);
    d.consents[kind][field] = value;
    assert.equal((await f.submit(id(1), d)).error, 'NOTICE_MISMATCH');
  }
  assert.equal((await f.list()).data.length, 0);
});

test('동시 동일 키의 원본·별도 동의·접수번호·신청 ID가 하나로 연결됨', async () => {
  const f = await fixture();
  const [x, y] = await Promise.all([f.submit(), f.submit()]);
  assert.equal(x.data.applicationId, y.data.applicationId);
  assert.equal(x.data.receiptNumber, y.data.receiptNumber);
  assert.deepEqual([x.data.replayed, y.data.replayed].sort(), [false, true]);
  const record = (await f.call('get', 'admin', { receipt: x.data.receiptNumber })).data;
  assert.deepEqual(record.original, f.draft);
  assert.equal(record.id, x.data.applicationId);
  assert.notEqual(record.consentEvidence.privacy.documentSha256, record.consentEvidence.transfer.documentSha256);
  for (const item of Object.values(record.consentEvidence)) assert.match(item.recordedAtUtc, /Z$/);
});

test('같은 키에 다른 원본을 보내면 원래 신청을 유지', async () => {
  const f = await fixture();
  const saved = (await f.submit()).data;
  assert.equal((await f.submit(id(1), { ...f.draft, description: '상이한 합성 문의 원본' })).error, 'REQUEST_CONFLICT');
  assert.equal((await f.call('get', 'a', { receipt: saved.receiptNumber })).data.original.description, f.draft.description);
  assert.equal((await f.list()).data.length, 1);
});

test('접수번호 충돌 시 재할당 후 기존 접수 보존', async () => {
  const queue = [id(7), id(8), '02000000-0000-4000-8000-000000000009'];
  const f = await fixture({ newApplicationId: () => queue.shift() });
  const first = (await f.submit()).data;
  const second = (await f.submit(id(2))).data;
  assert.notEqual(first.receiptNumber, second.receiptNumber);
  assert.equal(second.applicationId, '02000000-0000-4000-8000-000000000009');
  assert.equal((await f.submit()).data.applicationId, first.applicationId);
  assert.equal((await f.list()).data.length, 2);
});

test('할당 한도 소진은 오류이며 접수번호를 추가하지 않음', async () => {
  const f = await fixture({ newApplicationId: () => id(7) });
  assert.equal((await f.submit()).status, 200);
  const result = await f.submit(id(2));
  assert.equal(result.error, 'COLLISION_EXHAUSTED');
  assert.equal(result.data, undefined);
  assert.equal((await f.list()).data.length, 1);
});

test('저장 전 실패와 저장 후 응답 유실을 동일한 키로 재확인', async () => {
  for (const mode of ['before', 'after']) {
    const f = await fixture();
    const sent = [];
    const client = createIntake({
      notices: f.notices, makeId: () => id(1), async send(action, body) {
        sent.push(body.requestId);
        if (sent.length === 1 && mode === 'before') throw Error('link lost before commit');
        const result = await f.call(action, 'a', body);
        if (sent.length === 1 && mode === 'after') throw Error('response lost after commit');
        return result;
      }
    });
    await assert.rejects(client.submit(f.draft), { code: 'SAVE_UNCERTAIN' });
    assert.throws(() => client.beginNew(), { code: 'SAVE_UNCERTAIN' });
    await assert.rejects(client.submit({ ...f.draft, description: '미확인 상태에서 본문 변경' }), { code: 'REQUEST_CONFLICT' });
    assert.equal((await f.list()).data.length, mode === 'before' ? 0 : 1);
    const saved = await client.submit(f.draft);
    assert.equal(saved.replayed, mode === 'after');
    assert.deepEqual(sent, [id(1), id(1)]);
    assert.equal((await f.list()).data.length, 1);
  }
});

test('신청 ID가 없는 성공 응답을 저장 성공으로 표시하지 않음', async () => {
  const f = await fixture();
  const c = createIntake({ notices: f.notices, makeId: () => id(1),
    async send(action, body) {
      const r = await f.call(action, 'a', body);
      delete r.data.applicationId;
      return r;
    }
  });
  await assert.rejects(c.submit(f.draft), { code: 'SAVE_UNCERTAIN' });
  assert.throws(() => c.beginNew(), { code: 'SAVE_UNCERTAIN' });
});

test('다른 신청과 연결된 접수번호 응답을 성공으로 표시하지 않음', async () => {
  const f = await fixture({ newApplicationId: () => id(9) });
  const c = createIntake({ notices: f.notices, makeId: () => id(1),
    async send(action, body) {
      const r = await f.call(action, 'a', body);
      r.data.receiptNumber = r.data.receiptNumber.slice(0, -8) + '00000000';
      return r;
    }
  });
  await assert.rejects(c.submit(f.draft), { code: 'SAVE_UNCERTAIN' });
});

test('합성 고객 A/B와 익명의 역할 경계, 관리자만 목록 조회', async () => {
  const f = await fixture();
  assert.equal((await f.submit(id(1), f.draft, 'anonymous')).error, 'AUTH_REQUIRED');
  const a = (await f.submit()).data.receiptNumber;
  const b = (await f.submit(id(1), f.draft, 'b')).data.receiptNumber;
  assert.notEqual(a, b);
  assert.equal((await f.call('get', 'b', { receipt: a })).error, 'NOT_FOUND');
  assert.equal((await f.call('get', 'a', { receipt: b })).error, 'NOT_FOUND');
  assert.equal((await f.call('list', 'a')).error, 'DENIED');
  assert.equal((await f.call('approve', 'a', { receipt: a })).error, 'DENIED');
  assert.equal((await f.call('get', 'b', { receipt: b })).status, 200);
  assert.equal((await f.list()).data.length, 2);
});

test('현재 견적 동의, 모의 입금, 별도 승인 전 제작 차단 및 승인 이후에도 실제 실행 차단', async () => {
  const f = await fixture();
  const { act } = await prepared(f);
  assert.equal((await act('checkExecution')).error, 'QUOTE_REQUIRED');
  assert.equal((await act('accept', 'a')).status, 200);
  assert.equal((await act('checkExecution')).error, 'DEPOSIT_REQUIRED');
  assert.equal((await act('approve')).error, 'DEPOSIT_REQUIRED');
  assert.equal((await act('deposit', 'admin', { amount: 1 })).error, 'INVALID_DEPOSIT');
  const deposit = await act('deposit');
  assert.equal(deposit.data.deposit.simulated, true);
  assert.equal((await act('checkExecution')).error, 'APPROVAL_REQUIRED');
  const approved = await act('approve');
  assert.equal(approved.data.approval.simulated, true);
  assert.equal((await act('approve')).data.events.filter(e => e.action === 'approve').length, 1);
  assert.equal((await act('checkExecution')).error, 'RELEASE_DISABLED');
  assert.equal(approved.data.plan.paidCalls, 0);
  assert.equal(approved.data.plan.executionStarted, false);
});

test('견적 갱신 시 이전 버전은 무효, 모의 입금 후 견적 덮어쓰기 차단', async () => {
  const f = await fixture();
  const { act } = await prepared(f);
  assert.equal((await act('accept', 'a')).status, 200);
  assert.equal((await act('quote')).data.quote.version, 2);
  assert.equal((await act('accept', 'a')).error, 'STALE_QUOTE');
  assert.equal((await act('deposit')).error, 'QUOTE_REQUIRED');
  assert.equal((await act('accept', 'a', { version: 2 })).status, 200);
  assert.equal((await act('deposit')).error, 'STALE_QUOTE');
  assert.equal((await act('deposit', 'admin', { version: 2 })).status, 200);
  assert.equal((await act('quote')).error, 'INVALID_STATE');
});

test('취소는 접수 증거를 남기고 이후 전이를 모두 중지', async () => {
  const f = await fixture();
  const { act } = await prepared(f);
  assert.equal((await act('cancel', 'b')).error, 'NOT_FOUND');
  const cancelled = await act('cancel', 'a');
  assert.equal(cancelled.data.cancelled, true);
  assert.deepEqual(cancelled.data.original, f.draft);
  assert.equal((await act('accept', 'a')).error, 'CANCELLED');
  assert.equal((await act('approve')).error, 'CANCELLED');
  assert.equal((await act('checkExecution')).error, 'CANCELLED');
});

test('세션 만료·철회는 읽기 및 쓰기 거부', async () => {
  let now = Date.parse('2026-11-21T00:00:00Z');
  const f = await fixture({ clock: () => now });
  const receipt = (await f.submit()).data.receiptNumber;
  f.service.closeFixture(f.roles.b);
  assert.equal((await f.call('get', 'b', { receipt })).error, 'AUTH_REQUIRED');
  now += 15 * 60 * 1000;
  assert.equal((await f.call('get', 'a', { receipt })).error, 'SESSION_EXPIRED');
  assert.equal((await f.call('approve', 'admin', { receipt })).error, 'SESSION_EXPIRED');
});

test('mock 계획은 로컬이며 등록되지 않은 공급자는 시작되지 않음', async () => {
  assert.throws(() => createService({ provider: 'external' }), { code: 'PLAN_UNAVAILABLE' });
  const f = await fixture({ provider: 'mock' });
  const { act } = await prepared(f);
  const result = await act('get', 'a');
  assert.deepEqual(result.data.plan, {
    provider: 'mock', steps: [...globalThis.SolqPlanning.PLAN_STEPS], executionStarted: false, paidCalls: 0
  });
});

test('SQL 후보는 미적용 및 rollback으로 표시되고 클라이언트 쓰기 권한이 없음', () => {
  const sql = fs.readFileSync(path.join(__dirname, '../review/portal-boundaries.REVIEW_ONLY.sql'), 'utf8');
  assert.match(sql, /REVIEW_ONLY \/ NOT_APPLIED/);
  assert.match(sql, /unique \(owner_id, request_id\)/);
  assert.match(sql, /application_owner_or_staff_read/);
  for (const verb of ['upload', 'update', 'delete']) assert.match(sql, new RegExp('solq_dev01_no_client_' + verb));
  assert.doesNotMatch(sql, /grant (?:insert|update|delete)[^;]+ to (?:authenticated|anon)/i);
  assert.match(sql, /rollback;\s*$/i);
});
