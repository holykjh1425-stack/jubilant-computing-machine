(() => {
  'use strict';

  const categories = {
    inquiries: { label: '고객 문의 분류', pattern: /문의|상담|메일|이메일|cs|ticket/i, source: '문의 목록',
      result: '유형·우선순위가 정리된 표', scope: ['매일 들어오는 문의를 분류해요', '주 1회 문의를 모아요'], criteria: ['유형별 분류가 정확하면 돼요', '누락 건을 별도로 표시하면 돼요'] },
    orders: { label: '주문·신청 정리', pattern: /주문|신청|예약|접수|결제|order/i, source: '주문·신청 내역',
      result: '중복과 누락이 표시된 정리표', scope: ['매일 신청 내역을 정리해요', '주 1회 주문을 합쳐요'], criteria: ['누락·중복이 구분되면 돼요', '항목별 합계가 맞으면 돼요'] },
    reports: { label: '보고서·시트 요약', pattern: /보고서|정산|집계|엑셀|시트|통계|스프레드|report/i, source: '엑셀·시트 데이터',
      result: '항목별 합계와 예외 요약', scope: ['매일 같은 표를 확인해요', '주 1회 실적 보고서를 만들어요'], criteria: ['합계가 원본과 일치하면 돼요', '예외 행을 따로 보면 돼요'] },
    general: { label: '반복 업무 정리', pattern: /$/, source: '정해진 업무 입력',
      result: '검토 가능한 처리 결과', scope: ['매일 같은 절차를 반복해요', '주 1회 문서를 정리해요'], criteria: ['정상 결과와 예외가 구분되면 돼요', '담당자가 결과를 확인하면 돼요'] }
  };
  const labels = {
    requirements: '입력과 현재 업무 방식 확인', scope: '한 가지 처리 범위로 고정', implementation: '규칙과 출력 초안 설계',
    validation: '정상·누락·예외 예시로 검증', human_review: '담당자가 결과 확인', delivery: '인계와 승인 조건 확인'
  };
  const sensitive = /(?:[\w.+-]+@[\w.-]+\.[a-z]{2,}|\b01[016789][ -]?\d{3,4}[ -]?\d{4}\b|\b\d{6}[ -]?[1-8]\d{6}\b|(?:비밀번호|password|api[ _-]?key|access[ _-]?token|토큰|계좌번호)\s*[:=]\s*\S+|(?:sk-|sb_secret_|gh[pousr]_)[\w-]{10,}|-----BEGIN [A-Z ]*PRIVATE KEY-----)/iu;
  const protect = value => !sensitive.test(value);
  function input(value, max = 300, min = 2) {
    if (typeof value !== 'string') throw Error('BAD_INPUT');
    const clean = value.trim();
    if (Array.from(clean).length < min || Array.from(clean).length > max || clean.includes('\0')) throw Error('BAD_INPUT');
    if (!protect(clean)) throw Error('SENSITIVE_INPUT');
    return clean;
  }
  const classify = value => Object.entries(categories).find(([id, profile]) => id !== 'general' && profile.pattern.test(value))?.[0];
  const select = Object.freeze({ initial: 0, topic: 1, scope: 2, format: 3, manual: 4, criterion: 5, done: 6 });

  function question(stage, profile) {
    if (stage === 'topic') return { text: '어떤 종류의 업무인지 먼저 좁혀볼까요?', choices: ['고객 문의 분류', '주문·신청 정리', '보고서·시트 요약', '기타 반복 업무'] };
    if (stage === 'scope') return { text: profile.source + ' 처리 과정에서 어떤 작업이 얼마나 자주 반복되나요?', choices: profile.scope };
    if (stage === 'format') return { text: '지금 ' + profile.source + '는 어떤 형태인가요? 원본 파일 대신 형식만 알려주세요.', choices: ['고정된 엑셀·CSV가 있어요', '정해진 양식이 있어요', '형식이 제각각이에요'] };
    if (stage === 'manual') return { text: '담당자가 직접 실행해서 아래 결과를 확인해도 괜찮을까요? ' + profile.result,
      choices: ['담당자가 직접 실행해도 돼요', '외부 연동·자동 전송이 필요해요', '아직 정하지 못했어요'] };
    return { text: '어떤 결과가 나오면 해결됐다고 판단할 수 있나요?', choices: profile.criteria };
  }
  function create() {
    return { phase: 'initial', category: null, answers: {}, messages: [] };
  }
  function answer(state, raw) {
    if (state.phase === 'done') throw Error('COMPLETE');
    const text = input(raw, 300, state.phase === 'initial' ? 4 : 2);
    const messages = [...state.messages, { speaker: 'customer', text }];
    const updated = { ...state, answers: { ...state.answers }, messages };
    if (state.phase === 'initial') {
      updated.answers.problem = text;
      updated.category = classify(text);
      updated.phase = updated.category ? 'scope' : 'topic';
    } else if (state.phase === 'topic') {
      updated.category = classify(text) ?? 'general';
      updated.phase = 'scope';
    } else {
      updated.answers[state.phase] = text;
      updated.phase = { scope: 'format', format: 'manual', manual: 'criterion', criterion: 'done' }[state.phase];
    }
    if (updated.phase !== 'done') messages.push({ speaker: 'solq', ...question(updated.phase, categories[updated.category]) });
    return updated;
  }
  function summary(state) {
    if (state.phase !== 'done') throw Error('INCOMPLETE');
    const profile = categories[state.category];
    const fixed = /고정|정해진|정형|일정한|csv|스프레드시트/i.test(state.answers.format) &&
      !/제각각|없어|불규칙|다양/.test(state.answers.format);
    const manual = /수동|직접 실행|사람이 실행|담당자가 실행/.test(state.answers.manual) &&
      !/외부 연동.{0,8}필요|자동 전송.{0,8}필요|자동 발송.{0,8}필요|자동으로 해/.test(state.answers.manual);
    const multiple = /여러 업무|두 개|세 개|2가지|3가지|모든 업무|전체 업무/.test(state.answers.scope + ' ' + state.answers.problem);
    const plan = globalThis.SolqPlanning.executeFree({ agent: 'internal', kind: 'scope', instruction: '업무 분류 자동화' });
    return {
      problem: state.answers.problem, focus: profile.label, source: state.answers.format, effect: state.answers.criterion,
      direction: profile.source + '에서 필요한 항목을 뽑고, 합의한 규칙으로 ' + profile.result + '를 만드는 방향입니다.',
      eligible: fixed && manual && !multiple,
      notes: [!fixed && '입력 형식 합의 필요', !manual && '외부 연동·실행 범위 추가 검토', multiple && '대상 업무 한 가지로 축소'].filter(Boolean),
      steps: plan.result.plan.steps.map(code => labels[code]),
      draft: [
        '문제: ' + state.answers.problem, '반복 업무: ' + state.answers.scope, '입력 형식: ' + state.answers.format,
        '실행 조건: ' + state.answers.manual, '검수 기준: ' + state.answers.criterion
      ].join('\n')
    };
  }
  const stageText = phase => {
    const value = select[phase];
    if (value === 1) return '업무 유형 확인';
    return value >= 2 && value <= 5 ? '진단 ' + (value - 1) + '/4' : '진단 완료';
  };

  // Local-only transport. The real Supabase transport is not instantiated by this page.
  function syntheticAdapter() {
    const saved = new Map();
    let counter = 0;
    return async ({ p_request_id: id, p_payload: values }, mode = 'normal') => {
      if (values.privacy_consent !== true || values.transfer_consent !== true || mode === 'denied') {
        throw Object.assign(new Error('synthetic refusal'), { code: 'DENIED' });
      }
      const bytes = new TextEncoder().encode(JSON.stringify(values));
      const buffer = await globalThis.crypto.subtle.digest('SHA-256', bytes);
      const fingerprint = Array.from(new Uint8Array(buffer), byte => byte.toString(16).padStart(2, '0')).join('');
      const prior = saved.get(id);
      if (prior && prior.fingerprint !== fingerprint) throw Object.assign(new Error('different payload'), { code: 'REQUEST_CONFLICT' });
      if (mode === 'before-save') throw new Error('synthetic unavailable');
      if (prior) return prior.result;
      const receipt = 'NX-20261119-' + (++counter).toString(16).toUpperCase().padStart(8, '0');
      const result = { saved: true, request_id: id, receipt_number: receipt };
      // Keep only the digest and receipt in the transport model, not the original form values.
      saved.set(id, { fingerprint, result });
      if (mode === 'after-save') throw new Error('synthetic response lost');
      return result;
    };
  }
  globalThis.SolqConversation = Object.freeze({ create, answer, summary, stageText, input, protect, syntheticAdapter });
})();
