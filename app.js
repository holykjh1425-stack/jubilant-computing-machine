(() => {
 const form=document.querySelector('#application-form'), message=document.querySelector('#message'), nextLink=document.querySelector('#preview-link');
 if(!form||!message)return;
 const button=form.querySelector('button[type="submit"]'), config=window.NEXUS_CONFIG||{};
 if(!window.supabase||!config.SUPABASE_URL||!config.SUPABASE_ANON_KEY||config.SUPABASE_URL.includes('YOUR-PROJECT')){
  message.textContent='온라인 접수 연결을 준비 중입니다. 전화로 문의해 주세요.';button.disabled=true;return;
 }
 const client=window.supabase.createClient(config.SUPABASE_URL,config.SUPABASE_ANON_KEY);
 form.addEventListener('submit',async event=>{
  event.preventDefault();if(button.disabled||!form.reportValidity())return;
  const fields=new FormData(form), service=String(fields.get('service_type')||'');
  if(fields.get('privacy_consent')!=='on'||fields.get('transfer_consent')!=='on'){message.textContent='필수 동의 내용을 확인해 주세요.';return;}
  if(!String(fields.get('customer_name')||'').trim()||String(fields.get('contact')||'').trim().length<3||!String(fields.get('description')||'').trim()){message.textContent='이름·연락처·원하는 작업을 입력해 주세요.';return;}
  button.disabled=true;message.textContent='신청을 안전하게 접수하고 있습니다…';if(nextLink)nextLink.hidden=true;
  let submitted=false;
  try{
   const {data:receipt,error}=await client.rpc('submit_application',{
    p_customer_name:String(fields.get('customer_name')||'').trim(),p_contact:String(fields.get('contact')||'').trim(),
    p_service_type:service,p_description:String(fields.get('description')||'').trim()+'\n\n[접수 안내 v2026-10-20: 수집·이용 동의 / 국외 전송·보관 동의]',p_privacy_consent:true
   });
   if(error)throw error;
   if(typeof receipt!=='string'||!/^NX-[0-9]{8}-[A-F0-9]{8}$/.test(receipt))throw Error('Receipt missing');
   submitted=true;form.reset();
   try{sessionStorage.setItem('nexus_receipt',receipt);}catch(_){}
   const type=({website:'web',ai_automation:'ai',custom_system:'order',consulting:'ai'})[service]||'ai';
   const url=new URL('preview.html',window.location.href);url.searchParams.set('service',type);
   message.textContent='신청이 접수되었습니다. 접수번호: '+receipt+' · 아래 버튼에서 무료 체험을 시작하세요.';
   if(nextLink){nextLink.href=url.toString();nextLink.hidden=false;nextLink.focus();}
  }catch(_){message.textContent='접수가 완료되지 않았습니다. 다시 시도하거나 031-866-4600으로 문의해 주세요.';}
  finally{button.disabled=submitted;}
 });
})();