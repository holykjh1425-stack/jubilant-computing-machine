(() => {
 const $=s=>document.querySelector(s), form=$('#support-form'), lookup=$('#lookup-form');
 const message=$('#support-message'), status=$('#lookup-message'), config=window.NEXUS_CONFIG||{};
 if(!window.supabase||!config.SUPABASE_URL||!config.SUPABASE_ANON_KEY||!window.crypto?.getRandomValues){message.textContent='문의 연결을 준비하지 못했습니다. 잠시 후 다시 열어 주세요.';form.querySelector('button').disabled=true;lookup.querySelector('button').disabled=true;return;}
 const db=window.supabase.createClient(config.SUPABASE_URL,config.SUPABASE_ANON_KEY);
 let pending=null, sending=false, reading=0;
 form.addEventListener('submit',async e=>{
  e.preventDefault();if(sending)return;
  const f=new FormData(form),question=String(f.get('question')||'').trim(),language=String(f.get('language')||'').trim();
  if(question.length<5||!language||!f.get('consent')||!f.get('transfer')){message.textContent='문의 내용·답변 언어와 두 필수 동의를 확인해 주세요.';return;}
  if(pending&&(pending.question!==question||pending.language!==language)){message.textContent='직전 문의의 접수 결과가 불확실합니다. 같은 내용으로 다시 눌러 결과를 확인해 주세요.';return;}
  if(!pending){const bytes=new Uint8Array(32);window.crypto.getRandomValues(bytes);pending={question,language,key:Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('')};}
  sending=true;form.querySelector('button').disabled=true;message.textContent='접수 중…';
  try{
   const {data,error}=await db.rpc('submit_support_inquiry',{p_question:question,p_language:language,p_access_token:pending.key,p_consent:true,p_transfer_consent:true});
   if(error||!data||!/^[0-9a-f-]{36}$/i.test(data))throw Error('submit');
   $('#new-id').value=data;$('#new-key').value=pending.key;$('#support-receipt').hidden=false;
   lookup.elements.inquiry_id.value=data;lookup.elements.access_token.value=pending.key;
   form.hidden=true;message.textContent='접수 완료 · 문의번호와 확인키를 보관해 주세요.';
  }catch(_){message.textContent='접수 결과를 확인하지 못했습니다. 같은 내용으로 다시 눌러 확인해 주세요. 중복 접수는 방지됩니다.';form.querySelector('button').disabled=false;}
  finally{sending=false;}
 });
 lookup.addEventListener('submit',async e=>{
  e.preventDefault();const request=++reading,f=new FormData(lookup);$('#support-result').hidden=true;$('#question-text').textContent='';$('#answer-text').textContent='';status.textContent='조회 중…';
  const id=String(f.get('inquiry_id')||'').trim(),key=String(f.get('access_token')||'').trim();
  if(!/^[0-9a-f-]{36}$/i.test(id)||!/^[a-f0-9]{64}$/.test(key)){status.textContent='문의번호와 확인키를 확인해 주세요.';return;}
  try{const {data,error}=await db.rpc('read_support_inquiry',{p_id:id,p_access_token:key});if(request!==reading)return;if(error)throw error;if(!data?.length){status.textContent='일치하는 문의가 없습니다. 문의번호와 확인키를 확인해 주세요.';return;}
   $('#question-text').textContent=data[0].question;$('#answer-text').textContent=data[0].answer||'관리자가 확인 중입니다. 나중에 다시 조회해 주세요.';$('#support-result').hidden=false;status.textContent=data[0].answer?'답변이 등록되었습니다.':'답변 대기 중';
  }catch(_){if(request===reading)status.textContent='조회에 실패했습니다. 잠시 후 다시 시도해 주세요.';}
 });
})();
