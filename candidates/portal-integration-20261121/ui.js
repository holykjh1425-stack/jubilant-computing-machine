(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const conversation = globalThis.SolqConversation;
  const service = globalThis.SolqPortal.createService();
  const messages = {
    AUTH_REQUIRED: '합성 고객 또는 관리자 역할을 선택하세요.',
    SESSION_EXPIRED: '합성 세션이 만료됐습니다. 역할을 다시 선택하세요.',
    CONSENT_REQUIRED: '두 합성 동의 항목을 모두 확인하세요.',
    NOTICE_MISMATCH: '고지 버전이 달라 저장할 수 없습니다.',
    INVALID_INPUT: '합성 입력의 형식이나 길이를 확인하세요.',
    SENSITIVE_INPUT: '개인정보나 자격증명을 입력하지 마세요.',
    NOT_FOUND: '조회할 수 있는 접수가 없습니다.',
    DENIED: '이 작업을 수행할 합성 역할 권한이 없습니다.',
    IN_FLIGHT: '현재 요청을 확인 중입니다.',
    REQUEST_CONFLICT: '이 요청의 원본이 달라졌습니다. 이전 원본으로 확인하거나 완료 후 새 신청을 준비하세요.',
    SAVE_UNCERTAIN: '저장 결과를 확인할 수 없습니다. 같은 내용으로 다시 제출하세요.',
    STALE_QUOTE: '견적 버전이 변경됐습니다. 최신 상태를 먼저 조회하세요.',
    PLAN_REQUIRED: '먼저 무료 계획을 준비하세요.',
    QUOTE_REQUIRED: '먼저 현재 견적에 고객이 동의해야 합니다.',
    DEPOSIT_REQUIRED: '먼저 수동 입금 확인이 필요합니다.',
    APPROVAL_REQUIRED: '별도 제작 승인이 필요합니다.',
    RELEASE_DISABLED: '세 모의 관문이 완료됐습니다. 실제 제작과 외부 발송은 비활성입니다.',
    INVALID_STATE: '현재 상태에서는 이 작업을 진행할 수 없습니다.',
    INVALID_DEPOSIT: '합성 착수금과 확인 금액이 일치해야 합니다.',
    CANCELLED: '취소된 신청입니다.',
    COLLISION_EXHAUSTED: '저장 여부를 확인할 수 없습니다. 같은 내용으로 다시 제출하세요.'
  };
  const labels = { requirements: '요구사항', scope: '범위', implementation: '구현 계획',
    validation: '검증', human_review: '사람의 검토', delivery: '납품 계획' };
  const eventNames = { received: '접수', free_plan: '무료 계획', quote: '견적 발행', accept: '견적 동의',
    deposit: '모의 입금 확인', approve: '모의 제작 승인', cancel: '취소' };
  const clients = new Map();
  let state = conversation.create();
  let persona = 'anonymous';
  let session = null;
  let manifest;
  let busy = false;
  let opened = null;

  function say(message, error = false) {
    $('status').textContent = message;
    $('status').dataset.error = String(error);
  }

  async function run(fn) {
    if (busy) return;
    busy = true;
    $('persona').disabled = true;
    try { await fn(); }
    catch (err) { say(messages[err.code ?? err.message] ?? '합성 작업을 확인할 수 없습니다.', true); }
    finally { busy = false; $('persona').disabled = false; }
  }

  const send = (action, body) => service.handle({ action, session, body });
  async function data(action, body) {
    const r = await send(action, body);
    if (r.status !== 200) throw Object.assign(new Error(r.error), { code: r.error });
    return r.data;
  }

  function element(tag, text, className) {
    const e = document.createElement(tag);
    if (text) e.textContent = text;
    if (className) e.className = className;
    return e;
  }

  function button(label, command, fn) {
    const e = element('button', label, 'quiet');
    e.type = 'button';
    e.dataset.action = command;
    e.addEventListener('click', fn);
    return e;
  }

  function paintConversation(updateDraft = false) {
    const turns = state.messages.map(line => element('p', line.text, 'turn ' + line.speaker));
    if (!turns.length) turns.push(element('p', '어떤 반복 업무를 줄이고 싶으신가요?', 'turn'));
    $('conversation').replaceChildren(...turns);
    const options = state.messages.at(-1)?.choices ?? [];
    $('suggestions').replaceChildren(...options.map(choice => button(choice, 'suggestion', () => answer(choice))));
    $('dialogue-form').hidden = state.phase === 'done';
    $('draft').hidden = state.phase !== 'done';
    if (state.phase === 'done') {
      const sample = conversation.summary(state);
      $('direction').textContent = sample.direction;
      $('preview-steps').replaceChildren(...sample.steps.map(s => element('li', s)));
      if (updateDraft) $('description').value = sample.draft;
    }
  }

  function answer(value) {
    try {
      state = conversation.answer(state, value);
      $('answer').value = '';
      paintConversation(true);
      say(state.phase === 'done' ? '무료 계획을 준비했습니다.' : '상담 답변을 기록했습니다.');
    } catch (err) { say(messages[err.message] ?? '합성 답변을 확인해 주세요.', true); }
  }

  async function refreshList() {
    const items = await data('list');
    $('list').replaceChildren(...items.map(item =>
      button(item.receipt, 'open-record', () => run(() => openRecord(item.receipt)))));
    if (!items.length) $('list').append(element('p', '접수된 합성 신청이 없습니다.'));
  }

  function clearRecord() {
    opened = null;
    $('record').hidden = true;
    $('record').replaceChildren();
    $('record-actions').replaceChildren();
    $('receipt').value = '';
  }

  function paintRecord(record) {
    opened = record;
    $('record').hidden = false;
    $('receipt').value = record.receipt;
    const q = record.quote ? '견적 v' + record.quote.version + ' · ' + record.quote.total.toLocaleString('ko-KR') + '원' : '견적 대기';
    const stage = record.cancelled ? '취소됨' : record.approval ? '모의 제작 승인 완료' :
      record.deposit ? '모의 입금 확인 · 제작 승인 대기' : record.quote?.acceptedAtUtc ? '견적 동의 · 입금 확인 대기' : '진행 중';
    $('record').replaceChildren(
      element('strong', record.receipt), element('p', stage + ' · ' + q),
      element('pre', record.original.description),
      ...(record.plan ? [element('p', '무료 계획 · ' + record.plan.steps.map(s => labels[s]).join(' · '))] : []),
      element('p', record.events.map(e => eventNames[e.action]).join(' · '))
    );
    const actions = [];
    if (persona === 'admin' && !record.cancelled) {
      actions.push(['무료 계획 생성', 'plan'], ['견적 발행', 'quote'], ['모의 입금 확인', 'deposit'],
        ['별도 제작 승인', 'approve'], ['제작 관문 점검', 'checkExecution']);
    }
    if ((persona === 'a' || persona === 'b') && !record.cancelled) {
      if (record.quote && !record.quote.acceptedAtUtc) actions.push(['현재 견적 동의', 'accept']);
      actions.push(['합성 신청 취소', 'cancel']);
    }
    $('record-actions').replaceChildren(...actions.map(([label, action]) => button(label, action, () => run(async () => {
      const next = await data(action, {
        receipt: opened.receipt, version: opened.quote?.version, amount: globalThis.SolqPortal.PRICE.deposit
      });
      paintRecord(next);
      say(label + ' 처리 완료');
    }))));
  }

  async function openRecord(receipt) {
    clearRecord();
    $('receipt').value = receipt;
    paintRecord(await data('get', { receipt }));
    say('합성 접수 정보를 조회했습니다.');
  }

  async function changeRole() {
    const previous = persona;
    persona = $('persona').value;
    service.closeFixture(session);
    session = service.openFixture(persona);
    clearRecord();
    $('confirmation').textContent = '';
    delete $('confirmation').dataset.receipt;
    $('list').replaceChildren();
    const customer = persona === 'a' || persona === 'b';
    $('consult').hidden = persona === 'admin';
    $('queue').hidden = persona !== 'admin';
    $('lookup').hidden = persona === 'anonymous';
    $('intake-form').hidden = !customer;
    $('sign-in-note').hidden = customer;
    if (previous !== 'anonymous' || !customer) {
      state = conversation.create();
      $('description').value = '';
      $('privacy').checked = false;
      $('transfer').checked = false;
    }
    $('fault').value = 'normal';
    paintConversation();
    if (persona === 'admin') await refreshList();
    say('합성 역할을 전환했습니다.');
  }

  function intakeClient() {
    if (!clients.has(persona)) {
      clients.set(persona, globalThis.SolqPortalClient.createIntake({
        notices: manifest,
        async send(action, body) {
          const mode = $('fault').value;
          if (mode === 'before') throw Error('synthetic before save');
          const response = await send(action, body);
          if (mode === 'after' && response.status === 200) throw Error('synthetic response lost');
          return response;
        }
      }));
    }
    return clients.get(persona);
  }

  async function initialize() {
    manifest = await data('notices');
    for (const kind of ['privacy', 'transfer']) $(kind + '-notice').textContent = manifest[kind].text;
    $('persona').addEventListener('change', () => run(changeRole));
    $('dialogue-form').addEventListener('submit', e => { e.preventDefault(); answer($('answer').value); });
    $('example').addEventListener('click', () => {
      state = conversation.create();
      for (const value of ['문의 내용을 자동화하고 싶어요', '문의 한 종류', '고정 CSV', '수동 실행', '분류 누락 검토']) answer(value);
    });
    $('intake-form').addEventListener('submit', e => {
      e.preventDefault();
      run(async () => {
        $('confirmation').textContent = '';
        delete $('confirmation').dataset.receipt;
        const consents = Object.fromEntries(['privacy', 'transfer'].map(kind => [
          kind, { accepted: $(kind).checked, version: manifest[kind].version, documentSha256: manifest[kind].documentSha256 }
        ]));
        const result = await intakeClient().submit({ service: $('service').value, description: $('description').value, consents });
        $('confirmation').textContent = '저장 확인 · ' + result.receiptNumber;
        $('confirmation').dataset.receipt = result.receiptNumber;
        $('receipt').value = result.receiptNumber;
        say(result.replayed ? '기존 접수번호를 재확인했습니다.' : '합성 신청이 저장됐습니다.');
      });
    });
    $('new-request').addEventListener('click', () => run(async () => {
      intakeClient().beginNew();
      $('confirmation').textContent = '';
      delete $('confirmation').dataset.receipt;
      $('privacy').checked = false;
      $('transfer').checked = false;
      say('새 합성 신청을 준비했습니다.');
    }));
    $('lookup-form').addEventListener('submit', e => {
      e.preventDefault();
      const receipt = $('receipt').value.trim();
      run(() => openRecord(receipt));
    });
    $('reload').addEventListener('click', () => run(refreshList));
    paintConversation();
    $('persona').disabled = false;
    say('로컬 합성 상담을 시작할 수 있습니다.');
  }
  initialize().catch(() => say('로컬 후보를 열 수 없습니다.', true));
})();
