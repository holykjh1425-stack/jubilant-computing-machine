(() => {
 const db=window.NEXUS_ADMIN_DB;if(!db)return;
 const panel=document.createElement('section');panel.className='panel';panel.hidden=true;
 const title=document.createElement('h2');title.textContent='무료 계획 · 견적 동의 증거';panel.append(title);
 const form=document.createElement('form'), input=document.createElement('input');input.placeholder='접수번호';input.required=true;input.setAttribute('aria-label','견적 조회 접수번호');
 const button=document.createElement('button');button.textContent='고객별 계획·동의 조회';button.className='btn';form.append(input,button);
 const message=document.createElement('p');message.setAttribute('role','status');const content=document.createElement('div');panel.append(form,message,content);document.querySelector('main').append(panel);
 let generation=0;
 async function sync(){const g=++generation;panel.hidden=true;content.replaceChildren();const {data}=await db.auth.getUser();if(!data.user||g!==generation)return;const result=await db.from('admin_users').select('user_id').eq('user_id',data.user.id).maybeSingle();if(g===generation&&!result.error&&result.data)panel.hidden=false;}
 form.addEventListener('submit',async event=>{event.preventDefault();const g=++generation;button.disabled=true;content.replaceChildren();message.textContent='조회 중';try{
  const {data:a,error}=await db.from('applications').select('id,receipt_number').eq('receipt_number',input.value.trim()).single();if(error)throw error;
  const results=await Promise.all([db.from('ai_work_plans').select('plan').eq('application_id',a.id),db.from('orchestrator_jobs').select('status,free_plan_id').eq('application_id',a.id),db.functions.invoke('solq-quote-evidence',{body:{action:'list',application_id:a.id}})]);
  if(g!==generation)return;if(results.some(r=>r.error)||results[2].data?.error)throw Error();
  const pre=document.createElement('pre');pre.style.whiteSpace='pre-wrap';pre.style.overflowWrap='anywhere';pre.textContent=JSON.stringify({receipt_number:a.receipt_number,plans:results[0].data,jobs:results[1].data,quote:results[2].data},null,2);content.append(pre);
  message.textContent='견적 동의는 관리자 검증 증거 기준입니다. 실제 입금 확인·별도 제작 승인 전 제작은 시작되지 않습니다.';
  if(!results[2].data.accepted){
   const evidenceForm=document.createElement('form');const fields={};
   for(const [name,label,type] of [['quote_reference','견적 참조번호','text'],['quote_version','견적 버전','text'],['amount_krw','고객이 동의한 총액(원)','number'],['accepted_at','고객 실제 동의 시각','datetime-local'],['evidence_reference','보관된 동의 원본 증거 참조','text']]){
    const l=document.createElement('label'),i=document.createElement('input');l.textContent=label;i.type=type;i.required=true;i.name=name;if(type==='number'){i.min='1';i.step='1';}l.append(i);evidenceForm.append(l);fields[name]=i;
   }
   const confirm=document.createElement('input');confirm.type='checkbox';confirm.required=true;const label=document.createElement('label');label.append(confirm,document.createTextNode('고객 본인의 동의 원본에서 고객·견적 버전·금액·시각을 대조했습니다.'));
   const save=document.createElement('button');save.textContent='검증한 동의 증거 등록 (제작 승인 아님)';evidenceForm.append(label,save);content.append(evidenceForm);
   evidenceForm.addEventListener('submit',async e=>{e.preventDefault();save.disabled=true;try{
    const body={action:'record',application_id:a.id,accepted:true,evidence_verified:confirm.checked};for(const [key,field] of Object.entries(fields))body[key]=key==='amount_krw'?Number(field.value):key==='accepted_at'?new Date(field.value).toISOString():field.value.trim();
    if(!Number.isSafeInteger(body.amount_krw)||body.amount_krw<=0)throw Error();
    const response=await db.functions.invoke('solq-quote-evidence',{body});if(response.error||response.data?.error)throw Error();
    evidenceForm.remove();message.textContent='동의 증거 등록 완료. 제작에는 실제 입금 확인과 별도 관리자 승인이 필요합니다. 다시 조회해 기록을 확인하세요.';
   }catch{message.textContent='등록 실패 · 증거·견적 잠금 상태·관리자 권한을 확인하세요.';}finally{save.disabled=false;}});
  }

 }catch{if(g===generation)message.textContent='조회 실패 · 관리자 권한과 API 배포 상태를 확인하세요.';}finally{button.disabled=false;}});
 db.auth.onAuthStateChange(()=>queueMicrotask(sync));document.addEventListener('nexus-admin-session',sync);sync();
})();
