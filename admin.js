(() => {
  const $ = (s) => document.querySelector(s);
  const login = $('#login-panel'), panel = $('#data-panel'), form = $('#login-form');
  const msg = $('#login-msg'), dataMsg = $('#data-msg'), rows = $('#rows');
  const config = window.NEXUS_CONFIG || {};
  if (!window.supabase || !config.SUPABASE_URL || config.SUPABASE_URL.includes('YOUR-PROJECT') || !config.SUPABASE_ANON_KEY) {
    msg.textContent = 'Supabase 연결 설정을 확인해 주세요.';
    form.querySelector('button').disabled = true;
    return;
  }
  const db = window.supabase.createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY);
  const labels = { received: '접수 · 확인 필요', reviewing: '신청 확인 · 검토 중', deposit_confirmed: '입금 확인', in_progress: '작업 중', completed: '완료', cancelled: '취소' };
  const baseTitle = document.title;
  const monitor = document.createElement('p');
  monitor.id = 'inquiry-monitor'; monitor.className = 'msg'; monitor.setAttribute('role', 'status'); monitor.setAttribute('aria-live', 'polite');
  const alertButton = document.createElement('button');
  alertButton.type = 'button'; alertButton.className = 'btn'; alertButton.textContent = '새 신청 브라우저 알림 켜기';
  const acknowledge = document.createElement('button');
  acknowledge.type = 'button'; acknowledge.className = 'btn'; acknowledge.textContent = '알림 확인'; acknowledge.hidden = true;
  panel.prepend(acknowledge); panel.prepend(alertButton); panel.prepend(monitor);
  let timer = null, generation = 0, userId = null, busy = false, pending = 0;
  let displayedRowsGeneration = 0;
  const pendingKey = () => 'nexus-inquiry-pending:' + userId;
  function storePending() { try { localStorage.setItem(pendingKey(), String(pending)); } catch (_) {} }
  function showPending() {
    acknowledge.hidden = pending === 0;
    if (pending > 0) {
      monitor.textContent = '새 신청 알림 ' + pending + '건 · 아래 접수 목록을 확인해 주세요.';
      document.title = '[새 신청 ' + pending + '건] ' + baseTitle;
    } else {
      monitor.textContent = '신청 감지 중 · 관리자 화면이 열린 동안 15초마다 확인합니다.';
      document.title = baseTitle;
    }
  }
  acknowledge.addEventListener('click', () => {
    pending = 0; storePending(); showPending();
    dataMsg.textContent = '알림을 확인했습니다. 각 신청의 상태는 아래에서 직접 변경해 주세요.';
  });
  alertButton.addEventListener('click', async () => {
    if (!('Notification' in window)) { dataMsg.textContent = '브라우저 알림 미지원 · 화면 알림은 계속 표시됩니다.'; return; }
    try {
      const permission = await window.Notification.requestPermission();
      dataMsg.textContent = permission === 'granted' ? '브라우저 알림 허용됨 · 관리자 화면을 열어 두세요.' : '브라우저 알림 미허용 · 화면 알림은 계속 표시됩니다.';
    } catch (_) { dataMsg.textContent = '브라우저 알림을 켜지 못했습니다. 화면 알림은 계속 표시됩니다.'; }
  });
  function stopMonitor() {
    generation++; clearInterval(timer); timer = null; userId = null; pending = 0;
    acknowledge.hidden = true; document.title = baseTitle;
  }
  function show(on) {
    login.classList.toggle('hidden', on); panel.classList.toggle('hidden', !on);
    if (on) startMonitor(); else stopMonitor();
  }
  async function load() {
    const request = ++displayedRowsGeneration;
    dataMsg.textContent = '불러오는 중…';
    try {
      const { data, error } = await db.from('applications').select('id,receipt_number,created_at,customer_name,contact,service_type,description,status').order('created_at', { ascending: false }).limit(200);
      if (request !== displayedRowsGeneration) return;
      if (error) throw error;
      rows.replaceChildren(); dataMsg.textContent = data.length ? data.length + '건 표시' : '신청 내역이 없습니다.';
      data.forEach((application) => {
        const tr = document.createElement('tr');
        [application.receipt_number, new Date(application.created_at).toLocaleString('ko-KR'), application.customer_name, application.contact, application.service_type, application.description].forEach((value) => {
          const td = document.createElement('td'); td.textContent = value || ''; tr.append(td);
        });
        const td = document.createElement('td'), select = document.createElement('select');
        select.className = 'status'; select.setAttribute('aria-label', application.receipt_number + ' 상태');
        Object.entries(labels).forEach(([value, label]) => {
          const option = document.createElement('option'); option.value = value; option.textContent = label; option.selected = value === application.status; select.append(option);
        });
        select.addEventListener('change', async () => {
          const previous = application.status, next = select.value;
          if (next === previous) return;
          if (next === 'deposit_confirmed' && !window.confirm('은행의 실제 입금 내역에서 입금자와 견적 금액을 대조하셨나요? 확인한 경우에만 입금 확인으로 저장합니다.')) {
            select.value = previous; return;
          }
          select.disabled = true;
          try {
            const { data: updated, error: updateError } = await db.from('applications').update({ status: next }).eq('id', application.id).eq('status', previous).select('id').single();
            if (updateError || !updated) throw updateError || new Error('No matching row');
            application.status = next;
            dataMsg.textContent = application.receipt_number + ' · ' + labels[next] + ' 저장 완료';
          } catch (_) {
            select.value = previous;
            dataMsg.textContent = '상태 저장 실패 · 다른 변경이 있었거나 권한이 없습니다. 새로고침 후 확인해 주세요.';
          } finally { select.disabled = false; }
        });
        td.append(select); tr.append(td); rows.append(tr);
      });
    } catch (_) { if (request === displayedRowsGeneration) dataMsg.textContent = '조회 실패 · 관리자 권한과 연결을 확인해 주세요.'; }
  }
  async function startMonitor() {
    stopMonitor(); const current = generation;
    const { data: auth } = await db.auth.getSession();
    if (!auth.session || current !== generation) return;
    userId = auth.session.user.id;
    try { pending = Number(localStorage.getItem(pendingKey()) || 0); } catch (_) { pending = 0; }
    if (!Number.isSafeInteger(pending) || pending < 0) pending = 0;
    showPending();
    async function poll() {
      if (busy || current !== generation) return;
      busy = true;
      try {
        const key = 'nexus-inquiry-cursor:' + userId;
        let cursor = 0;
        try { cursor = Number(localStorage.getItem(key) || 0); } catch (_) {}
        if (!Number.isSafeInteger(cursor) || cursor < 0) cursor = 0;
        const { data: events, error } = await db.from('inquiry_events').select('id,detected_at').gt('id', cursor).order('id', { ascending: true }).limit(100);
        if (current !== generation) return;
        if (error) throw error;
        if (events.length) {
          pending += events.length; storePending();
          try { localStorage.setItem(key, String(events[events.length - 1].id)); } catch (_) {}
          showPending(); await load();
          if (current !== generation) return;
          if ('Notification' in window && window.Notification.permission === 'granted') {
            try { new window.Notification('NEXUS LABS 새 신청', { body: '관리자 화면에서 신청 내용을 확인해 주세요.', tag: 'nexus-new-inquiry' }); } catch (_) {}
          }
        } else { showPending(); }
      } catch (_) {
        if (current === generation) monitor.textContent = '신청 감지 연결 실패 · 자동 재시도합니다.' + (pending ? ' 미확인 알림 ' + pending + '건이 있습니다.' : '');
      } finally { busy = false; }
    }
    poll(); timer = setInterval(poll, 15000);
  }
  form.addEventListener('submit', async (event) => {
    event.preventDefault(); msg.textContent = '로그인 중…';
    const fields = new FormData(form);
    const { error } = await db.auth.signInWithPassword({ email: fields.get('email'), password: fields.get('password') });
    if (error) { msg.textContent = '로그인 실패 · 계정과 관리자 등록을 확인해 주세요.'; return; }
    show(true); load();
  });
  $('#refresh').addEventListener('click', load);
  $('#logout').addEventListener('click', async () => {
    const { error } = await db.auth.signOut();
    if (error) { dataMsg.textContent = '로그아웃 실패 · 다시 시도해 주세요.'; return; }
    displayedRowsGeneration++; show(false); rows.replaceChildren();
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && userId) startMonitor(); });
  db.auth.onAuthStateChange((event) => { if (event === 'SIGNED_OUT') { displayedRowsGeneration++; show(false); rows.replaceChildren(); } });
  db.auth.getSession().then(({ data }) => { if (data.session) { show(true); load(); } });
})();
