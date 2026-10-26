/* Candidate only. Read on lookup; writes require an explicit evidence form submission. */
(()=>{
 const db=window.NEXUS_ADMIN_DB;if(!db)return;
 const section=document.createElement('section');section.className='login-card';section.hidden=true;
 const h=document.createElement('h2');h.textContent='견적 · 동의 · 착수금 증거';section.append(h);
 const message=document.createElement('p');message.setAttribute('role','status');
 const content=document.createElement('div');content.style.overflowWrap='anywhere';
 const lookup=document.createElement('form'),receipt=document.createElement('input'),button=document.createElement('button');
 receipt.required=true;receipt.setAttribute('aria-label','증거 조회 접수번호');receipt.placeholder='접수번호';button.className='button primary';button.textContent='견적·입금 증거 조회';lookup.append(receipt,button);section.append(lookup,message,content);document.querySelector('main').append(section);
 let epoch=0;
 const show=(tag,text,parent=content)=>{const e=document.createElement(tag);e.textContent=text;parent.append(e);return e;};
 async function session(){const e=++epoch;section.hidden=true;content.replaceChildren();const {data}=await db.auth.getUser();if(!data.user)return;const r=await db.from('admin_users').select('user_id').eq('user_id',data.user.id).maybeSingle();if(e===epoch&&!r.error&&r.data)section.hidden=false;}
 async function invoke(body){const r=await db.functions.invoke('solq-quote-evidence',{body});if(r.error||r.data?.error)throw Error();return r.data;}
 function actionForm(title,fields,action,base,check){
 const f=document.createElement('form');f.style.cssText='margin:24px 0;display:grid;gap:12px';show('h3',title,f);const inputs={};
 for(const [key,label,type] of fields){const l=show('label',label,f),i=document.createElement('input');i.type=type;i.required=true;i.style.minWidth='0';if(type==='number'){i.min='30000';i.step='1';}l.append(i);inputs[key]=i;}
 if(check){const l=document.createElement('label'),c=document.createElement('input');c.type='checkbox';c.required=true;l.append(c,document.createTextNode(check));f.append(l);}
 const submit=show('button',title,f);submit.type='submit';submit.className='button secondary';
 f.onsubmit=async e=>{e.preventDefault();submit.disabled=true;try{const body={action,...base};for(const [k,i] of Object.entries(inputs))body[k]=i.type==='number'?Number(i.value):i.type==='datetime-local'?new Date(i.value).toISOString():i.value.trim();await invoke(body);content.replaceChildren();message.textContent='증거 저장 완료. 다시 조회해 최신 상태를 확인하세요. 제작은 시작되지 않았습니다.';}catch{message.textContent='저장 실패 · 최신 견적·원본 증거·권한을 확인하세요.';}finally{submit.disabled=false;}};
 content.append(f);
 }
 lookup.onsubmit=async e=>{e.preventDefault();const stamp=++epoch;button.disabled=true;content.replaceChildren();try{
 const {data:a,error}=await db.from('applications').select('id,receipt_number').eq('receipt_number',receipt.value.trim()).single();if(error||!a)throw Error();
 const r=await invoke({action:'list',application_id:a.id});if(stamp!==epoch)return;
 const q=r.quotes?.[0];show('p','접수번호: '+a.receipt_number);
 show('p',q?`최신 견적 v${q.version} · ${q.amount_krw}원 · 유효기한 ${q.expires_at}`:'등록된 견적이 없습니다.');
 const pre=show('pre',JSON.stringify({동의:r.evidence,입금증거:r.deposits,수동확인:r.confirmations},null,2));pre.style.cssText='white-space:pre-wrap;overflow-wrap:anywhere';
 message.textContent='원본 증거 대조 후 등록하세요. 동의·입금 증거·수동 확인은 별도이며 제작 승인이 아닙니다.';
 actionForm('새 견적 버전 등록',[['quote_reference','견적 원본 참조','text'],['amount_krw','총 견적액(원)','number'],['expires_at','견적 유효기한','datetime-local']],'issue_quote',{application_id:a.id});
 if(!q||new Date(q.expires_at)<=new Date())return;
 if(!r.accepted)actionForm('동의 증거 등록',[['accepted_at','고객 실제 동의 시각','datetime-local'],['evidence_reference','동의 원본 참조','text']],'record',{application_id:a.id,quote_reference:q.quote_reference,quote_version:String(q.version),amount_krw:q.amount_krw,accepted:true,evidence_verified:true},'최신 견적의 고객·버전·금액·동의 원본을 대조했습니다.');
 actionForm('착수금 30,000원 입금 증거 등록',[['paid_at','입금 시각','datetime-local'],['transaction_reference','은행 거래 고유 참조','text'],['evidence_reference','입금 증거 원본 참조','text']],'record_deposit',{application_id:a.id,quote_id:q.id,amount_krw:30000});
 for(const d of r.deposits||[])if(d.quote_id===q.id&&!(r.confirmations||[]).some(c=>c.deposit_id===d.id))actionForm('은행 원장 대조 후 수동 확인',[],'confirm_deposit',{application_id:a.id,quote_id:q.id,deposit_id:d.id,bank_verified:true},'실제 은행 원장에서 고객·거래·30,000원 입금을 직접 확인했습니다.');
 }catch{if(stamp===epoch)message.textContent='조회 실패 · 권한과 API 반영 상태를 확인하세요.';}finally{button.disabled=false;}};
 db.auth.onAuthStateChange(()=>queueMicrotask(session));session();
})();
