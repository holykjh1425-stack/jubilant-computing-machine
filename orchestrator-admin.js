(() => {
 const c=window.NEXUS_CONFIG||{}, panel=document.querySelector('#orchestrator-panel');
 if(!panel||!window.NEXUS_ADMIN_DB)return;
 const db=window.NEXUS_ADMIN_DB, $=s=>document.querySelector(s), message=$('#orchestrator-message'), jobs=$('#orchestrator-jobs'), agents=$('#orchestrator-agents');
 let generation=0,timer,busy=false,submissionKey=null;
 const labels={queued:'대기',running:'진행 중',retry_wait:'재시도 대기',blocked:'차단',failed:'실패',awaiting_approval:'검토·승인 필요',completed:'검증 완료'};
 async function call(body){
  const {data,error}=await db.functions.invoke('nexus-orchestrator',{body});
  if(error||data?.error)throw Error('connection');return data;
 }
 function el(tag,text){const x=document.createElement(tag);if(text!==undefined)x.textContent=text;return x;}
 async function refresh(run=false){
  if(busy||panel.hidden)return;busy=true;const current=generation;
  try{
   if(run)await call({action:'tick'});
   const data=await call({action:'snapshot'});if(current!==generation)return;
   agents.replaceChildren();for(const [name,cap] of Object.entries(data.agents)){
    const line=el('p',`${name} · ${cap.enabled?'사용 가능': '비활성'} · ${cap.interface||'확인된 인터페이스 없음'}${cap.reason?' · '+cap.reason:''}`);agents.append(line);
   }
   jobs.replaceChildren();for(const job of data.jobs){
    const card=el('details'), title=el('summary',`${labels[job.status]||job.status} · ${job.instruction.slice(0,70)}`);
    card.append(title,el('p',`작업번호 ${job.id}`),el('p',job.instruction));
    const list=el('ol');for(const task of data.tasks.filter(t=>t.job_id===job.id)){
     const li=el('li',`${task.kind} · ${task.agent} · ${labels[task.status]||task.status} · 시도 ${task.attempts}/3${task.verified?' · 결과 검증 통과':''}`);
     if(task.error_code)li.append(el('p',`오류·차단 사유: ${task.error_code}`));
     if(task.result){const pre=el('pre',JSON.stringify(task.result,null,2));li.append(pre);}list.append(li);
    }card.append(list);
    const audit=el('details'),auditTitle=el('summary','작업 이력');audit.append(auditTitle);
    for(const event of data.events.filter(e=>e.job_id===job.id))audit.append(el('p',`${new Date(event.created_at).toLocaleString('ko-KR')} · ${event.event}${event.code?' · '+event.code:''}`));
    card.append(audit);jobs.append(card);
   }
   const worker=data.worker_state?.worker, trial=data.worker_state?.claude_test;
   message.textContent=`최근 작업 ${data.jobs.length}건 · 상시 무료 워커: ${worker?.last_finished_at?new Date(worker.last_finished_at).toLocaleString('ko-KR'):'실행 기록 없음'}${worker?.last_error?' · '+worker.last_error:''} · Claude 연결 시험: ${trial?.status||'기록 없음'} · 유료 고객 제작 비활성`;
  }catch{if(current===generation)message.textContent='중앙 작업 서버에 연결하지 못했습니다. 운영 적용·권한을 확인해 주세요. 완료로 처리되지 않았습니다.';}
  finally{busy=false;}
 }
 $('#orchestrator-form').addEventListener('submit',async event=>{
  event.preventDefault();const button=$('#orchestrator-submit');button.disabled=true;
  try{
   submissionKey ||= crypto.randomUUID();
   await call({action:'submit',key:submissionKey,instruction:$('#orchestrator-instruction').value,agent:$('#orchestrator-agent').value});
   submissionKey=null;message.textContent='등록 완료 · 무료 단계 실행 중…';await refresh(true);
  }catch{message.textContent='작업 등록 확인 실패 · 비밀정보 입력 여부와 서버 연결을 확인해 주세요. 같은 내용으로 재시도하면 중복 등록을 방지합니다.';}
  finally{button.disabled=false;}
 });
 // A changed payload must never reuse an idempotency key from an uncertain submission.
 $('#orchestrator-form').addEventListener('input',()=>{submissionKey=null;});
 $('#orchestrator-refresh').addEventListener('click',()=>refresh(false));
 $('#orchestrator-run').addEventListener('click',()=>refresh(true));
 async function sync(){
  const current=++generation;clearInterval(timer);panel.hidden=true;jobs.replaceChildren();agents.replaceChildren();message.textContent='';
  const {data}=await db.auth.getUser();if(current!==generation||!data.user)return;
  const admin=await db.from('admin_users').select('user_id').eq('user_id',data.user.id).maybeSingle();
  if(current!==generation||admin.error||!admin.data)return;
  panel.hidden=false;refresh(false);timer=setInterval(()=>{if(!document.hidden)refresh(true);},15000);
 }
 db.auth.onAuthStateChange(()=>queueMicrotask(sync));sync();
})();
