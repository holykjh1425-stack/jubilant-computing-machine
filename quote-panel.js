/* Read-only lookup. Every evidence mutation requires its own explicit form. */
(()=>{'use strict';
 const db=window.NEXUS_ADMIN_DB;if(!db||!window.createQuoteFlow)return;
 const flow=createQuoteFlow({db}),host=document.querySelector('#data-panel');if(!host)return;
 const section=document.createElement('section');section.className='login-card';section.id='quote-evidence-panel';
 const show=(tag,text,parent)=>{const e=document.createElement(tag);e.textContent=text;parent.append(e);return e;};
 show('h2','견적 · 동의 · 착수금 증거',section);
 show('p','고객이 외부에서 동의한 원본을 관리자가 대조해 등록합니다. 입금 알림·입금 확인·제작 승인은 각각 별도입니다.',section);
 const lookup=document.createElement('form'),receipt=document.createElement('input'),button=document.createElement('button');receipt.required=true;receipt.setAttribute('aria-label','증거 조회 접수번호');receipt.placeholder='접수번호';button.textContent='견적·입금 증거 조회';button.className='button primary';lookup.append(receipt,button);section.append(lookup);
 const message=show('p','',section),content=document.createElement('div');message.setAttribute('role','status');content.style.overflowWrap='anywhere';section.append(content);host.append(section);
 let view=0;
 function clear(){view++;flow.invalidate();content.replaceChildren();message.textContent='';button.disabled=false;}
 function actionForm(context,title,fields,action,check,extra={}){
  const stamp=view,f=document.createElement('form');f.style.cssText='margin:24px 0;display:grid;gap:12px';show('h3',title,f);const inputs={};
  for(const [key,label,type] of fields){const l=show('label',label,f),i=document.createElement('input');i.type=type;i.required=true;i.style.minWidth='0';if(type==='number'){i.min='30000';i.step='1';}l.append(i);inputs[key]=i;}
  let confirm;if(check){const l=document.createElement('label');confirm=document.createElement('input');confirm.type='checkbox';confirm.required=true;l.append(confirm,document.createTextNode(check));f.append(l);}
  const submit=show('button',title,f);submit.type='submit';submit.className='button secondary';
  f.addEventListener('submit',async e=>{e.preventDefault();if(stamp!==view||!f.reportValidity())return;submit.disabled=true;lookup.querySelector('button').disabled=true;
   try{const input={...extra};for(const [k,i] of Object.entries(inputs))input[k]=i.type==='number'?Number(i.value):i.type==='datetime-local'?new Date(i.value).toISOString():i.value.trim();if(confirm)input[action==='record'?'evidence_verified':'bank_verified']=confirm.checked;await flow.write(context,action,input);if(stamp!==view)return;clear();message.textContent='증거 저장 완료. 다시 조회해 확인하세요. 입금 상태나 제작 승인은 자동 변경되지 않습니다.';}
   catch{if(stamp===view){clear();message.textContent='저장 결과를 확정할 수 없습니다. 다시 조회해 최신 기록을 확인하세요. 같은 거래를 임의로 새로 등록하지 마세요.';}}
  });content.append(f);
 }
 lookup.addEventListener('submit',async e=>{e.preventDefault();clear();const stamp=view;button.disabled=true;
  try{const c=await flow.read(receipt.value);if(stamp!==view)return;const r=c.snapshot,q=c.quote;
   show('p','접수번호: '+c.receipt_number,content);
   show('p',q?`최신 견적 v${q.version} · 총 ${Number(q.amount_krw).toLocaleString('ko-KR')}원 · 착수금 30,000원 · 잔금 ${(Number(q.amount_krw)-30000).toLocaleString('ko-KR')}원`:'등록된 견적이 없습니다.',content);
   const pre=show('pre',JSON.stringify({동의:r.evidence,입금증거:r.deposits,수동확인:r.confirmations},null,2),content);pre.style.cssText='white-space:pre-wrap;overflow-wrap:anywhere';
   message.textContent='동의 원본 확인 → 착수금 30,000원 안내 → 고객 입금 알림 → 은행 수동 확인 → 목록의 입금 확인 저장 → 목록에서 별도 제작 승인 → 제작 후 잔금 정산·결과 전달';
   actionForm(c,'새 견적 버전 등록',[['quote_reference','견적 원본 참조','text'],['amount_krw','총 견적액(원)','number'],['expires_at','견적 유효기한','datetime-local']],'issue_quote');
   if(!q||Date.parse(q.expires_at)<=Date.now())return;
   if(!r.accepted)actionForm(c,'동의 증거 등록',[['accepted_at','고객 실제 동의 시각','datetime-local'],['evidence_reference','동의 원본 참조','text']],'record','고객·최신 견적 버전·금액·실제 동의 원본을 대조했습니다.');
   actionForm(c,'착수금 30,000원 입금 증거 등록',[['paid_at','입금 시각','datetime-local'],['transaction_reference','은행 거래 고유 참조','text'],['evidence_reference','입금 증거 원본 참조','text']],'record_deposit');
   for(const d of r.deposits)if(d.quote_id===q.id&&!r.confirmations.some(x=>x.deposit_id===d.id))actionForm(c,'은행 원장 대조 후 수동 확인',[],'confirm_deposit','실제 은행 원장에서 고객·거래·30,000원 입금을 직접 확인했습니다.',{deposit_id:d.id});
  }catch{if(stamp===view)message.textContent='조회 실패 · 관리자 권한·신청 연결·API 반영 상태를 확인하세요.';}finally{if(stamp===view)button.disabled=false;}
 });
 db.auth.onAuthStateChange(()=>clear());document.addEventListener('nexus-admin-session',clear);document.addEventListener('visibilitychange',()=>{if(document.hidden)clear();});
})();
