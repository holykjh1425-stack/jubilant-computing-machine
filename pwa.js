(() => {
 const button=document.querySelector('#install-app'),status=document.querySelector('#install-status');
 let pending;
 if('serviceWorker' in navigator && window.isSecureContext) navigator.serviceWorker.register('./sw.js').catch(()=>{});
 window.addEventListener('beforeinstallprompt',event=>{
  event.preventDefault();pending=event;if(button)button.hidden=false;
 });
 if(button)button.addEventListener('click',async()=>{
  if(!pending)return;button.disabled=true;
  try{await pending.prompt();const result=await pending.userChoice;
   if(status)status.textContent=result.outcome==='accepted'?'설치 요청을 보냈습니다. 기기의 설치 안내를 확인해 주세요.':'설치를 취소했습니다. 웹에서 계속 이용할 수 있습니다.';
  }catch(_){if(status)status.textContent='브라우저 메뉴에서 앱 설치 또는 홈 화면에 추가를 선택해 주세요.';}
  finally{pending=null;button.hidden=true;button.disabled=false;}
 });
 window.addEventListener('appinstalled',()=>{pending=null;if(button)button.hidden=true;if(status)status.textContent='홈 화면에 넥서스랩스가 추가되었습니다.';});
})();