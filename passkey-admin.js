(() => {
 const db=window.NEXUS_ADMIN_DB, login=document.querySelector('#passkey-login'),register=document.querySelector('#passkey-register'), message=document.querySelector('#passkey-message');
 if(!db||!login||!register)return;
 let generation=0;
 async function ceremony(button,method){
  button.disabled=true;message.textContent='기기에서 본인 확인을 진행해 주세요.';
  try {
   if(!window.isSecureContext||!window.PublicKeyCredential)throw Error('unsupported');
   if(typeof db.auth[method]!=='function')throw Error('unavailable');
   const {error}=await db.auth[method]();if(error)throw error;
   message.textContent=method==='registerPasskey'?'패스키 등록 완료. 다음 로그인부터 사용할 수 있습니다.':'패스키 로그인 완료.';
   if(method==='signInWithPasskey')location.reload();
  }catch{message.textContent='패스키를 완료하지 못했습니다. 프로젝트 활성화·도메인 설정·기기 지원 또는 취소 여부를 확인해 주세요. 기존 로그인은 사용할 수 있습니다.';}
  finally{button.disabled=false;}
 }
 login.addEventListener('click',()=>ceremony(login,'signInWithPasskey'));
 register.addEventListener('click',()=>ceremony(register,'registerPasskey'));
 async function sync(){
  const current=++generation;register.hidden=true;const {data}=await db.auth.getUser();if(current!==generation||!data.user)return;
  const {data:admin,error}=await db.from('admin_users').select('user_id').eq('user_id',data.user.id).maybeSingle();
  if(current===generation&&!error&&admin)register.hidden=false;
 }
 db.auth.onAuthStateChange(()=>queueMicrotask(sync));sync();
})();
