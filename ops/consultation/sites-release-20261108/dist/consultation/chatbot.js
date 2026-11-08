(() => {
  'use strict';
  const navigation = performance.getEntriesByType('navigation')[0];
  if (Number.isInteger(navigation?.responseStatus)) document.documentElement.dataset.documentHttpStatus = String(navigation.responseStatus);
  const $ = id => document.getElementById(id);
  const sectionToSector = {A:'other',B:'company',C:'company',D:'company',E:'company',F:'estate',G:'store',H:'company',I:'store',J:'company',K:'company',L:'estate',M:'company',N:'company',O:'other',P:'education',Q:'other',R:'store',S:'other',T:'other',U:'other'};
  let catalog = null, ksic = null, sector = null, questions = [], answers = [], index = 0, output = '', industryNote = '';
  const clean = (value, limit = 240) => String(value).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, limit);
  const money = value => Number(value).toLocaleString('ko-KR') + '원';
  function resetResult() {
    index = 0; answers = []; output = '';
    $('summary').textContent = ''; $('result').hidden = true; $('copy-status').textContent = '';
  }
  function displayQuestion() {
    $('question-area').hidden = false;
    $('question-label').textContent = '질문 ' + (index + 1) + ' / ' + questions.length + ' — ' + questions[index];
    $('answer').value = '';
    $('conversation').textContent = (index === 0 ? sector.greeting + '\n\n' : '') + questions[index];
    $('answer').focus();
  }
  function choose(key, code = '', note = '') {
    if (!catalog || !Object.hasOwn(catalog.sectors, key)) return;
    sector = catalog.sectors[key]; resetResult(); industryNote = note;
    const special = code && ksic ? ksic.sections[code].special_questions : [];
    questions = [...new Set([...special, ...sector.questions])].slice(0, 5);
    $('sector').value = key;
    $('industry-hint').textContent = note || '선택한 분야의 질문으로 안내합니다. 최종 제작 범위는 담당자가 확인합니다.';
    displayQuestion();
  }
  function finish() {
    const p = catalog.common_minimal_package;
    const lines = ['[SOLQ 상담 요약]', '상담 분야: ' + sector.label, '업종·필요 업무: ' + (clean($('industry-input').value,100) || '분야 직접 선택'), industryNote, '', ...answers.map(a => a.question + '\n→ ' + a.value), '', '[조건부 제작비 안내 · 부가세 별도]', '무료 상담·6단계 계획: 0원', '간단한 최소기능형: ' + money(p.base_price_krw) + '부터', '간편 관리자 기능: ' + money(p.admin_addon_krw) + ' 추가부터', '간단한 기본 기능 + 간편 관리자: ' + money(p.base_price_krw + p.admin_addon_krw) + '부터', '표준형: ' + money(p.package_300k.price_krw) + '부터 · 합의 범위 수정 1회', '선택형 월 운영·유지관리: 별도 견적 (월 금액 미확정)', '기본형의 기능·수정 범위와 관리자 권한은 견적에서 확인합니다. 기능 추가·구조 변경은 별도 견적이며 구현 오류 보완은 수정 횟수에서 차감하지 않습니다.'];
    if ([...sector.complex,'결제','연동','개인정보','명부','회원','생성형','API'].some(word => answers.some(a => a.value.toLowerCase().includes(word.toLowerCase())))) lines.push('외부 연동·결제·민감정보 등 추가 검토가 필요한 요청은 담당자가 보안·개발 범위를 확인한 뒤 개별 견적을 안내합니다.');
    lines.push('', catalog.policies.price_disclaimer, '도메인·호스팅·외부 서비스 비용은 필요 여부와 금액을 먼저 확인합니다.', '', '[정식 신청 후 진행 순서]', '무료 계획·관리자 검토 → 개별 견적 동의 → 기본형 착수금 30,000원 수동 입금 확인 → 별도 관리자 제작 승인 → 제작', '상담만으로 접수·계약·결제·제작이 시작되지 않습니다.', '아래 요약을 복사해 기존 신청서의 원하는 작업에 필요한 내용만 붙여 넣고, 개인정보·국외 이전 동의를 확인한 뒤 직접 제출해 주세요.');
    output = lines.filter(line => line !== undefined).join('\n');
    $('summary').textContent = output;
    $('conversation').textContent = '말씀해 주신 내용을 정리했습니다. 아직 정식 접수된 것은 아닙니다.';
    $('question-area').hidden = true; $('result').hidden = false; $('result-title').focus();
  }
  function next(skip = false) {
    if (!sector || $('question-area').hidden) return;
    const value = skip ? '미정' : clean($('answer').value);
    if (!value) { $('conversation').textContent = '간단히 답해 주시거나 아직 미정이에요를 선택해 주세요.'; $('answer').focus(); return; }
    answers.push({question:questions[index], value}); index += 1;
    if (index < questions.length) displayQuestion(); else finish();
  }
  function restart() {
    resetResult(); sector = null; questions = []; industryNote = '';
    $('industry-input').value = ''; $('answer').value = ''; $('question-label').textContent = '';
    $('sector').value = ''; $('question-area').hidden = true;
    $('conversation').textContent = '입력 내용을 지웠습니다. 업종이나 필요한 업무를 알려 주세요.';
    $('industry-hint').textContent = '업종별 매뉴얼은 상담을 위한 참고안이며 최종 산업분류 판정이 아닙니다.';
    $('industry-input').focus();
  }
  function classify() {
    const value = clean($('industry-input').value, 100);
    if (!value) { $('industry-hint').textContent = '업종명이나 필요한 업무를 먼저 입력해 주세요.'; $('industry-input').focus(); return; }
    if (!catalog) return;
    if (/교회|종교단체/.test(value)) { choose('church', '', '교회 홈페이지 상담으로 안내합니다. 교인·헌금자 개인정보는 입력하지 마세요.'); return; }
    if (/자동화|자동 분류|자동분류|반복 업무|반복업무/.test(value)) { choose('automation', '', '업무자동화 상담으로 안내합니다. 실제 업무 흐름과 승인 단계를 확인하겠습니다.'); return; }
    if (!ksic) { choose('other', '', '업종 매뉴얼 연결을 확인하지 못해 일반 상담으로 안내합니다. 분야를 직접 선택할 수도 있습니다.'); return; }
    const lower = value.toLowerCase();
    const matches = Object.entries(ksic.aliases).filter(([alias]) => {
      if (/^[a-z]+$/i.test(alias)) return lower.split(/[^a-z]+/).includes(alias.toLowerCase());
      return lower.includes(alias.toLowerCase());
    }).sort((a,b) => b[0].length - a[0].length);
    if (!matches.length) { choose('other', '', '업종을 확실히 분류하기 어려워 일반 상담으로 안내합니다. 담당자가 실제 사업 내용을 확인합니다.'); return; }
    const code = matches[0][1], entry = ksic.sections[code];
    choose(sectionToSector[code] || 'other', code, '참고 상담 산업군: ' + code + ' ' + entry.name + '. 실제 사업 내용 확인 전 잠정 안내입니다.');
  }
  $('classify').addEventListener('click', classify);
  $('industry-input').addEventListener('keydown', e => {if (e.key === 'Enter') {e.preventDefault(); classify();}});
  $('sector').addEventListener('change', () => {
    if ($('sector').value) {$('industry-input').value = ''; choose($('sector').value);}
    else {resetResult(); sector = null; $('question-area').hidden = true; $('conversation').textContent = '업종이나 상담 분야를 선택해 주세요.';}
  });
  $('next').addEventListener('click', () => next()); $('skip').addEventListener('click', () => next(true));
  $('answer').addEventListener('keydown', e => {if (e.key === 'Enter') {e.preventDefault(); next();}});
  $('restart').addEventListener('click', restart); $('cancel').addEventListener('click', restart);
  $('copy').addEventListener('click', async () => {
    if (!output) return;
    try {await navigator.clipboard.writeText(output); $('copy-status').textContent = '복사했습니다. 신청서의 원하는 작업에 필요한 내용만 붙여 넣어 주세요.';}
    catch (_) {$('copy-status').textContent = '자동 복사를 사용할 수 없습니다. 위 요약을 길게 누르거나 드래그해 직접 복사할 수 있습니다.';}
  });
  async function loadJson(path) {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 6000);
    try {
      const response = await fetch(path, {method:'GET',credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer',signal:controller.signal});
      const label = path.includes('KSIC') ? 'routing' : 'catalog';
      document.documentElement.dataset[label + 'HttpStatus'] = String(response.status);
      document.documentElement.dataset[label + 'ContentType'] = response.headers.get('content-type') || '';
      if (!response.ok || !/application\/(?:[\w.+-]*\+)?json/i.test(response.headers.get('content-type') || '')) throw new Error('Manual unavailable');
      const body = await response.text(); if (body.length > 100000) throw new Error('Manual too large');
      return JSON.parse(body);
    } finally {clearTimeout(timer);}
  }
  function validateCatalog(data) {
    const p = data?.common_minimal_package;
    if (data?.status !== 'public_consultation_scope_conditional' || !p || p.base_price_krw !== 100000 || p.admin_addon_krw !== 50000 || p.package_300k?.price_krw !== 300000 || !data.policies?.price_disclaimer) throw new Error('Invalid catalog');
    for (const key of ['church','store','company','education','estate','automation','other']) {
      const s = data.sectors?.[key];
      if (!s || typeof s.label !== 'string' || typeof s.greeting !== 'string' || !Array.isArray(s.questions) || !s.questions.length || s.questions.some(q=>typeof q!=='string'||q.length>500) || !Array.isArray(s.complex)) throw new Error('Invalid sector');
    }
    return data;
  }
  function validateRouting(data) {
    if (!data?.sections || Object.keys(data.sections).sort().join('') !== 'ABCDEFGHIJKLMNOPQRSTU' || !data.aliases) throw new Error('Invalid routing');
    for (const entry of Object.values(data.sections)) if (typeof entry.name !== 'string' || !Array.isArray(entry.special_questions) || entry.special_questions.some(q=>typeof q!=='string'||q.length>500)) throw new Error('Invalid questions');
    for (const [alias,code] of Object.entries(data.aliases)) if (!alias || alias.length > 100 || !Object.hasOwn(data.sections,code)) throw new Error('Invalid alias');
    return data;
  }
  Promise.allSettled([loadJson('./sector-catalog.candidate.json').then(validateCatalog),loadJson('./KSIC11-21-SECTOR-ROUTING.candidate.json').then(validateRouting)]).then(results => {
    if (results[0].status !== 'fulfilled') {console.warn('[SOLQ] 상담 매뉴얼 연결 실패:', results[0].reason?.message || 'unavailable');$('conversation').textContent = '상담 매뉴얼을 불러오지 못했습니다. 상단의 무료 계획 신청이나 하단 담당자 문의를 이용해 주세요.'; return;}
    catalog = results[0].value; ksic = results[1].status === 'fulfilled' ? results[1].value : null;
    for (const [key, s] of Object.entries(catalog.sectors)) $('sector').add(new Option(s.label,key));
    $('sector').disabled = false; $('classify').disabled = false;
    $('conversation').textContent = '안녕하세요. 어떤 업종에서 어떤 일을 준비하고 계신가요?';
    if (!ksic) $('industry-hint').textContent = '업종 자동 분류 연결을 확인하지 못했습니다. 아래 상담 분야를 직접 선택해 주세요.';
  });
})();
