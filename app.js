(() => {
  const form = document.querySelector('#application-form');
  const message = document.querySelector('#message');
  if (!form || !message || !window.supabase) return;
  const button = form.querySelector('button[type="submit"]');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!form.reportValidity() || button.disabled) return;
    const config = window.NEXUS_CONFIG || {};
    if (!config.SUPABASE_URL || !config.SUPABASE_ANON_KEY ||
        config.SUPABASE_URL.includes('YOUR-PROJECT')) {
      message.textContent = '서버 설정이 완료되지 않았습니다.';
      return;
    }
    const fields = new FormData(form);
    const payload = {
      customer_name: String(fields.get('customer_name') || '').trim(),
      contact: String(fields.get('contact') || '').trim(),
      service_type: String(fields.get('service_type') || ''),
      description: String(fields.get('description') || '').trim(),
      privacy_consent: fields.get('privacy_consent') === 'on',
      status: 'received',
      internal_note: null
    };
    button.disabled = true;
    message.textContent = '전송 중…';
    try {
      const client = window.supabase.createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY);
      // Public users have INSERT permission only; SELECT/RETURNING would violate RLS.
      const { data: receipt, error } = await client.rpc('submit_application', {
        p_customer_name: payload.customer_name,
        p_contact: payload.contact,
        p_service_type: payload.service_type,
        p_description: payload.description,
        p_privacy_consent: payload.privacy_consent
      });
      if (error) throw error;
      if (!receipt || !/^NX-[0-9]{8}-[A-F0-9]{8}$/.test(receipt)) throw new Error('Receipt number was not returned');
      message.textContent = `신청이 접수되었습니다. 접수번호: ${receipt} — 담당자가 확인 후 연락드립니다.`;
      form.reset();
      // Only redirect after a confirmed receipt; never put customer details in the URL.
      const previewType = ({ website: 'web', ai_automation: 'ai', custom_system: 'order', consulting: 'ai' })[payload.service_type] || 'ai';
      const previewUrl = new URL('preview.html', window.location.href);
      previewUrl.searchParams.set('service', previewType);
      message.textContent += ' 잠시 후 체험 화면으로 이동합니다.';
      window.setTimeout(() => { window.location.assign(previewUrl.toString()); }, 1800);
    } catch (error) {
      console.error('NEXUS application submission failed', error);
      message.textContent = '접수에 실패했습니다. 다시 시도하거나 관리자에게 문의해 주세요.';
    } finally {
      button.disabled = false;
    }
  });
})();
