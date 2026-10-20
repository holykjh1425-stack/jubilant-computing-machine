(() => {
 const panel=document.querySelector('#support-admin-panel'),list=document.querySelector('#support-admin-list'),message=document.querySelector('#support-admin-message'),c=window.NEXUS_CONFIG||{};
 if(!panel||!window.supabase||!c.SUPABASE_URL||!c.SUPABASE_ANON_KEY)return;
 const db=window.supabase.createClient(c.SUPABASE_URL,c.SUPABASE_ANON_KEY);let generation=0,timer=null,loading=false;
 async function load(){if(loading||panel.hidden)return;loading=true;const current=generation;
  try{const {data,error}=await db.from('support_inquiries').select('id,question,language,answer,created_at,answered_at').order('created_at',{ascending:false}).limit(200);if(current!==generation)return;if(error)throw error;
   list.replaceChildren();message.textContent='답변 대기 '+data.filter(x=>!x.answer).length+'건 · 최근 '+data.length+'건 표시';
   for(const item of data){const card=document.createElement('details'),summary=document.createElement('summary'),meta=document.createElement('p'),question=document.createElement('p'),label=document.createElement('label'),answer=document.createElement('textarea'),save=document.createElement('button'),feedback=document.createElement('p');
    summary.textContent=(item.answer?'답변 완료 · ':'답변 대기 · ')+item.language+' · '+new Date(item.created_at).toLocaleString();meta.textContent='문의번호 '+item.id;question.textContent=item.question;question.style.whiteSpace='pre-wrap';question.style.overflowWrap='anywhere';label.textContent='고객에게 표시할 답변';answer.value=item.answer;answer.maxLength=8000;answer.rows=6;answer.style.width='100%';label.append(answer);save.type='button';save.className='btn';save.textContent='답변 저장';feedback.setAttribute('role','status');
    save.addEventListener('click',async()=>{const text=answer.value.trim();if(!text){feedback.textContent='답변을 입력해 주세요.';return;}save.disabled=true;
     try{const {data:updated,error}=await db.from('support_inquiries').update({answer:text,answered_at:new Date().toISOString()}).eq('id',item.id).eq('answer',item.answer).select('id').single();if(current!==generation)return;if(error||!updated)throw Error('conflict');item.answer=text;summary.textContent='답변 완료 · '+item.language;feedback.textContent='저장 완료 · 고객이 문의창에서 조회할 수 있습니다.';}
     catch(_){if(current===generation)feedback.textContent='저장 실패 · 권한 또는 다른 변경을 확인하고 새로고침해 주세요.';}finally{save.disabled=false;}
    });card.append(summary,meta,question,label,save,feedback);list.append(card);}
  }catch(_){if(current===generation)message.textContent='문의 조회 실패 · 관리자 권한과 연결을 확인해 주세요.';}finally{loading=false;}
 }
 async function sync(){const current=++generation;clearInterval(timer);timer=null;const {data}=await db.auth.getSession();if(current!==generation)return;panel.hidden=!data.session;list.replaceChildren();message.textContent='';if(data.session){load();timer=setInterval(()=>{if(!document.hidden&&!Array.from(list.children).some(x=>x.open))load();},15000);}}
 document.querySelector('#support-admin-refresh').addEventListener('click',()=>{if(Array.from(list.children).some(x=>x.open)&&!window.confirm('열린 문의의 저장하지 않은 답변은 사라집니다. 새로고침할까요?'))return;load();});
 document.addEventListener('nexus-admin-session',()=>{queueMicrotask(sync);});
 db.auth.onAuthStateChange(event=>{if(event==='SIGNED_IN'||event==='SIGNED_OUT')queueMicrotask(sync);});sync();
})();
