(() => {
const form=document.querySelector('#application-form'), message=document.querySelector('#message'), button=form.querySelector('button');
form.addEventListener('submit',async e=>{
 e.preventDefault(); if(!form.reportValidity())return;
 const c=window.NEXUS_CONFIG||{};
 if(!window.supabase||!c.SUPABASE_URL||c.SUPABASE_URL.includes('YOUR-PROJECT')||!c.SUPABASE_ANON_KEY||c.SUPABASE_ANON_KEY.includes('YOUR_SUPABASE')){
  message.textContent='서버 연결 전입니다. 현재 신청은 전송되지 않았습니다.';return;
 }
 const f=new FormData(form), payload={customer_name:String(f.get('customer_name')).trim(),contact:String(f.get('contact')).trim(),service_type:String(f.get('service_type')),description:String(f.get('description')).trim(),privacy_consent:f.get('privacy_consent')==='on'};
 button.disabled=true;message.textContent='전송 중…';
 try{const client=window.supabase.createClient(c.SUPABASE_URL,c.SUPABASE_ANON_KEY);const {data,error}=await client.from('applications').insert(payload).select('receipt_number').single();if(error)throw error;message.textContent='접수 완료: '+data.receipt_number;form.reset();}
 catch(err){console.error(err);message.textContent='접수에 실패했습니다. 성공으로 처리되지 않았습니다.';}
 finally{button.disabled=false;}
});
})();