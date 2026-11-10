/* Optional additive panel; existing approval/status handlers are not replaced. */
(() => {
 if(!window.SOLQ_NOTIFICATIONS)return;
 const panel=document.getElementById('data-panel');if(!panel)return;
 const box=document.createElement('section'),title=document.createElement('h2'),button=document.createElement('button'),status=document.createElement('p'),list=document.createElement('div');
 title.textContent='고객 이벤트·알림 이력';button.type='button';button.textContent='알림 이력 새로고침';status.setAttribute('role','status');
 box.append(title,button,status,list);panel.append(box);
 let generation=0;
 async function refresh(){
  const current=++generation;list.replaceChildren();status.textContent='';
  const db=window.NEXUS_ADMIN_DB;const session=db&&(await db.auth.getSession()).data.session;
  if(!session){status.textContent='관리자 로그인이 필요합니다.';return;}
  button.disabled=true;
  try{
   const data=await window.SOLQ_NOTIFICATIONS.snapshot(session.access_token);if(current!==generation)return;
   for(const item of data.outbox){const row=document.createElement('p');row.style.overflowWrap='anywhere';row.textContent=[item.created_at,item.audience,item.status,`시도 ${item.attempts}`,item.error_code||''].join(' · ');list.append(row);}
   for(const item of data.events){const row=document.createElement('p');row.textContent=[item.created_at,item.receipt_number||item.application_id,item.kind].join(' · ');row.style.overflowWrap='anywhere';list.append(row);}
   for(const item of data.attempts){const row=document.createElement('p');row.textContent=[item.created_at,item.notification_id,`시도 ${item.attempt}`,item.outcome,item.error_code||''].join(' · ');row.style.overflowWrap='anywhere';list.append(row);}
   status.textContent='최근 이벤트·발송 요청·결과 각 최대 100건 · accepted는 발송사 접수이며 수신 완료가 아닙니다.';
  }catch{if(current===generation)status.textContent='조회 실패 · 관리자 권한 또는 알림 연결을 확인해 주세요.';}
  finally{if(current===generation)button.disabled=false;}
 }
 button.addEventListener('click',refresh);
 document.addEventListener('nexus-admin-session',()=>{generation++;list.replaceChildren();status.textContent='';button.disabled=false;});
})();
