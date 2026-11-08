(() => {
  'use strict';
  const $ = s=>document.querySelector(s), cfg=window.NEXUS_CONFIG || {};
  const login=$('#login-panel'), panel=$('#data-panel'), form=$('#login-form'), msg=$('#login-msg'), dataMsg=$('#data-msg'), rows=$('#rows');
  const labels={received:'접수 · 확인 필요',reviewing:'신청 검토 중',deposit_confirmed:'입금 확인',in_progress:'작업 중',completed:'완료',cancelled:'취소'};
  const services={website:'웹사이트 제작',ai_automation:'AI 업무 자동화',custom_system:'맞춤형 시스템',consulting:'기타 상담'};
  if(!window.supabase || !/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(cfg.SUPABASE_URL || '') || !/^sb_publishable_[\w-]+$/.test(cfg.SUPABASE_ANON_KEY || '')){msg.textContent='관리자 연결 설정을 확인해 주세요.';form.querySelector('[type=submit]').disabled=true;return;}
  const db=window.supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_ANON_KEY,{auth:{storage:window.sessionStorage,storageKey:'nexus-intake-admin',persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}});
  window.NEXUS_ADMIN_DB=db;
  form.querySelector('[type=submit]').disabled=false;
  let generation=0,loadGeneration=0,supportGeneration=0,supportSaving=0,supportItems=[],user=null,page=0,total=0,busy=false,restoring=false;
  const supportRows=$('#support-admin-list'),supportMsg=$('#support-admin-message'),supportRefresh=$('#support-admin-refresh');
  const pageSize=25;
  function say(el,text,error=false){el.textContent=text;el.dataset.kind=error?'error':'info';}
  function clearDashboard(){freeViews.clear();generation++;loadGeneration++;supportGeneration++;supportItems=[];user=null;rows.replaceChildren();supportRows.replaceChildren();say(supportMsg,'');panel.hidden=true;login.hidden=false;$('#session-label').textContent='';$('#result-count').textContent='';say(dataMsg,'');}
  async function verifyAdmin(){
    const {data,error}=await db.auth.getUser();
    if(error || !data.user)throw Object.assign(new Error('AUTH'),{code:'AUTH'});
    const {data:admin,error:permission}=await db.from('admin_users').select('user_id').eq('user_id',data.user.id).maybeSingle();
    if(permission || !admin)throw Object.assign(new Error('NOT_ADMIN'),{code:'NOT_ADMIN'});
    return data.user;
  }
  async function enterDashboard(){
    const current=++generation;
    try{const verified=await verifyAdmin();if(current!==generation)return;user=verified;login.hidden=true;panel.hidden=false;$('#session-label').textContent='관리자 · '+(verified.email || '로그인됨');form.elements.password.value='';page=0;await Promise.all([load(),loadSupport()]);}
    catch(error){if(current!==generation)return;clearDashboard();await db.auth.signOut({scope:'local'});say(msg,error.code==='NOT_ADMIN'?'로그인한 계정에 관리자 권한이 없습니다. 기존 관리자 등록을 확인해 주세요.':'로그인 세션을 확인할 수 없습니다. 다시 로그인해 주세요.',true);}
  }
  function element(tag,text,cls){const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(cls)node.className=cls;return node;}
  function renderSupport(inquiry){
    const current=generation,listGeneration=supportGeneration,card=element('details',undefined,'application-card support-card');
    const summary=element('summary'),status=element('strong',inquiry.answer?'답변 완료':'답변 대기'),date=element('time',new Date(inquiry.created_at).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',dateStyle:'medium',timeStyle:'short'}));date.dateTime=inquiry.created_at;summary.append(status,date);
    const id=element('p','문의번호 '+inquiry.id,'subtle'),question=element('p',inquiry.question,'support-question'),label=element('label','고객에게 표시할 답변'),answer=element('textarea');
    answer.value=inquiry.answer || '';answer.dataset.savedAnswer=answer.value;answer.maxLength=8000;answer.rows=6;answer.setAttribute('aria-label',inquiry.id+' 문의 답변');label.append(answer);
    const save=element('button','답변 저장','button primary'),feedback=element('p','','card-message');save.type='button';save.disabled=true;feedback.setAttribute('role','status');
    answer.addEventListener('input',()=>{save.disabled=!answer.value.trim() || answer.value.trim()===(inquiry.answer || '');feedback.textContent='';});
    save.addEventListener('click',async()=>{
      const text=answer.value.trim();if(!user || save.disabled || current!==generation || listGeneration!==supportGeneration || !text)return;
      supportSaving++;supportRefresh.disabled=true;save.disabled=true;answer.disabled=true;feedback.textContent='답변을 저장하고 있습니다…';
      try{
        let query=db.from('support_inquiries').update({answer:text,answered_at:new Date().toISOString()}).eq('id',inquiry.id);
        query=inquiry.answer===null?query.is('answer',null):query.eq('answer',inquiry.answer);
        const {data,error}=await query.select('id,answer').maybeSingle();
        if(current!==generation || listGeneration!==supportGeneration)return;
        if(error || !data)throw new Error('SAVE_FAILED');
        inquiry.answer=data.answer;answer.value=data.answer;answer.dataset.savedAnswer=data.answer;status.textContent='답변 완료';say(supportMsg,'최근 '+supportItems.length+'건 · 답변 대기 '+supportItems.filter(item=>!item.answer).length+'건');feedback.textContent='저장했습니다. 고객이 문의번호와 조회키로 답변을 확인할 수 있습니다.';
      }catch(_){if(current===generation && listGeneration===supportGeneration)feedback.textContent='저장하지 못했습니다. 다른 변경이나 권한 만료가 있을 수 있으니 문의 새로고침 후 확인해 주세요.';}
      finally{supportSaving--;supportRefresh.disabled=supportSaving>0;if(current===generation && listGeneration===supportGeneration){answer.disabled=false;save.disabled=!answer.value.trim() || answer.value.trim()===(inquiry.answer || '');}}
    });
    card.append(summary,id,question,label,save,feedback);return card;
  }
  async function loadSupport(){
    if(!user || supportSaving)return;const current=++supportGeneration,authGeneration=generation;supportRefresh.disabled=true;say(supportMsg,'문의 내역을 불러오는 중…');supportRows.setAttribute('aria-busy','true');
    try{
      const {data,error}=await db.from('support_inquiries').select('id,question,language,answer,created_at,answered_at').order('created_at',{ascending:false}).order('id',{ascending:false}).limit(200);
      if(current!==supportGeneration || authGeneration!==generation)return;if(error)throw error;
      supportRows.replaceChildren();supportItems=data;
      if(data.length){data.forEach(item=>supportRows.append(renderSupport(item)));say(supportMsg,'최근 '+data.length+'건 · 답변 대기 '+data.filter(item=>!item.answer).length+'건');}
      else{say(supportMsg,'접수된 고객 문의가 없습니다.');}
    }catch(_){if(current===supportGeneration && authGeneration===generation){supportRows.replaceChildren();say(supportMsg,'문의 내역을 불러오지 못했습니다. 관리자 권한과 연결을 확인해 주세요.',true);}}
    finally{if(current===supportGeneration){supportRefresh.disabled=supportSaving>0;supportRows.removeAttribute('aria-busy');}}
  }
  const free=createFreeWorkflow({db,config:cfg,verifyAdmin});
  const freeViews=new Map();
  setInterval(()=>{if(user&&!document.hidden)for(const update of freeViews.values())update();},30000);
  function planControls(application,article){
    const current=generation,box=element('section',undefined,'request-details'),message=element('p','','card-message'),list=element('ol'),refresh=element('button','계획·작업 조회','button secondary');
    refresh.type='button';message.setAttribute('role','status');
    box.append(element('h3','무료 계획 6단계'),element('p','서버 자동 처리 결과를 조회합니다.'),refresh,message,list);article.append(box);
    async function update(){if(current!==generation||!user)return;refresh.disabled=true;try{
      const v=await free.snapshot(application);if(current!==generation||!user)return;
      message.textContent='접수번호: '+application.receipt_number+(v.plan?' · 계획 ID: '+v.plan.id:' · 계획 대기')+(v.job?' · 작업 ID: '+v.job.id:' · 연결 작업 없음');
      window.SOLQ_PLAN_VIEW.render(list,v);
    }catch(e){if(current===generation&&user){list.replaceChildren();message.textContent='조회 오류: '+e.message;}}finally{refresh.disabled=false;}}
    refresh.addEventListener('click',update);freeViews.set(application.id,update);update();
  }
  function render(application){
    const article=element('article',undefined,'application-card');
    const top=element('div',undefined,'application-header'),receipt=element('strong',application.receipt_number),badge=element('span',labels[application.status] || application.status,'status-badge');badge.dataset.status=application.status;
    const date=element('time',new Date(application.created_at).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',dateStyle:'medium',timeStyle:'short'}));date.dateTime=application.created_at;top.append(receipt,badge,date);article.append(top);
    const fields=element('dl',undefined,'customer-fields');for(const [label,value] of [['신청자',application.customer_name],['이메일',application.contact],['서비스',services[application.service_type] || application.service_type]]){const group=element('div');group.append(element('dt',label),element('dd',value));fields.append(group);}article.append(fields);
    const details=element('details',undefined,'request-details');details.append(element('summary','신청 내용 보기'),element('p',application.description));article.append(details);
    const controls=element('div',undefined,'status-editor'),label=element('label','진행 상태'),select=element('select');select.setAttribute('aria-label',application.receipt_number+' 진행 상태');
    for(const [value,text] of Object.entries(labels)){const option=element('option',text);option.value=value;select.append(option);}select.value=application.status;label.append(select);
    const save=element('button','상태 저장','button primary');save.type='button';save.disabled=true;
    const feedback=element('p','','card-message');feedback.setAttribute('role','status');select.addEventListener('change',()=>{save.disabled=select.value===application.status;feedback.textContent='';});
    save.addEventListener('click',async()=>{
      const next=select.value,previous=application.status,current=generation;if(!user || save.disabled || !Object.hasOwn(labels,next))return;
      if(next==='in_progress' && previous!=='deposit_confirmed'){feedback.textContent='은행 내역을 수동 확인하고 입금 확인 상태를 저장한 뒤 별도로 제작을 승인하세요.';return;}
      if(next==='deposit_confirmed' && !window.confirm('은행의 실제 입금 내역에서 입금자와 견적 금액을 직접 대조하셨나요? 입금 알림만으로 확인 처리하지 마세요.'))return;
      if(next==='in_progress' && !window.confirm('입금 확인이 저장되어 있습니다. 계약·작업 범위를 확인하고 실제 제작 시작을 승인하시겠습니까? 기존 자동 작업 시스템에 반영될 수 있습니다.'))return;
      save.disabled=true;select.disabled=true;feedback.textContent='상태를 저장하고 있습니다…';
      try{
        if(next==='in_progress'){
          const {error:approvalError}=await db.rpc('solq_approve_production',{p_application:application.id});
          if(approvalError)throw approvalError;
          if(current!==generation)return;
          application.status='in_progress';badge.textContent=labels.in_progress;badge.dataset.status='in_progress';feedback.textContent='별도 제작 승인을 저장했습니다. 서버와 DB에서 입금·관리자 권한을 확인했습니다.';
          if($('#status-filter').value && $('#status-filter').value!=='in_progress')await load();
          return;
        }
        const {data,error}=await db.from('applications').update({status:next}).eq('id',application.id).eq('status',previous).select('id,status').maybeSingle();
        if(current!==generation)return;
        if(error)throw error;if(!data)throw Object.assign(new Error('CONFLICT'),{code:'CONFLICT'});
        application.status=data.status;badge.textContent=labels[data.status];badge.dataset.status=data.status;feedback.textContent='상태를 '+labels[data.status]+'(으)로 저장했습니다.';
        if($('#status-filter').value && $('#status-filter').value!==data.status)await load();
      }catch(error){if(current!==generation)return;select.value=previous;feedback.textContent=error.code==='CONFLICT'?'다른 관리자가 변경했거나 권한이 만료됐습니다. 새로고침 후 확인해 주세요.':'저장을 확인하지 못했습니다. 새로고침으로 현재 상태를 확인해 주세요.';}
      finally{if(current===generation){select.disabled=false;save.disabled=select.value===application.status;}}
    });controls.append(label,save);article.append(controls,feedback);planControls(application,article);return article;
  }
  async function load(){
    if(!user)return;const current=++loadGeneration,authGeneration=generation;busy=true;say(dataMsg,'신청 내역을 불러오는 중…');$('#refresh').disabled=true;rows.setAttribute('aria-busy','true');
    const queryText=$('#search').value.trim().toUpperCase(),filter=$('#status-filter').value;
    if(queryText && !/^[A-Z0-9-]+$/.test(queryText)){say(dataMsg,'접수번호에는 영문, 숫자, 하이픈만 입력해 주세요.',true);busy=false;$('#refresh').disabled=false;rows.removeAttribute('aria-busy');return;}
    try{
      let query=db.from('applications').select('id,receipt_number,created_at,customer_name,contact,service_type,description,status',{count:'exact'}).order('created_at',{ascending:false}).order('id',{ascending:false}).range(page*pageSize,(page+1)*pageSize-1);
      if(filter)query=query.eq('status',filter);if(queryText)query=query.ilike('receipt_number',queryText+'%');
      const {data,error,count}=await query;if(current!==loadGeneration || authGeneration!==generation)return;if(error)throw error;
      total=count || 0;if(page>0 && !data.length){page--;await load();return;}
      freeViews.clear();rows.replaceChildren();if(!data.length){const empty=element('div',undefined,'empty-state');empty.append(element('h3','표시할 신청 내역이 없습니다.'),element('p','검색 조건을 바꾸거나 새로고침해 주세요.'));rows.append(empty);}else data.forEach(a=>rows.append(render(a)));
      $('#result-count').textContent='신청 '+total.toLocaleString('ko-KR')+'건';$('#page-label').textContent=(page+1)+' / '+Math.max(1,Math.ceil(total/pageSize));$('#previous-page').disabled=page===0;$('#next-page').disabled=(page+1)*pageSize>=total;say(dataMsg,'');
    }catch(error){if(current!==loadGeneration || authGeneration!==generation)return;rows.replaceChildren();$('#result-count').textContent='';$('#previous-page').disabled=true;$('#next-page').disabled=true;say(dataMsg,'목록을 불러오지 못했습니다. 로그인 세션과 관리자 권한을 확인해 주세요.',true);if(error.status===401 || error.code==='PGRST301'){clearDashboard();await db.auth.signOut({scope:'local'});say(msg,'로그인이 만료됐습니다. 다시 로그인해 주세요.',true);}}
    finally{if(current===loadGeneration){busy=false;$('#refresh').disabled=false;rows.removeAttribute('aria-busy');}}
  }
  form.addEventListener('submit',async event=>{event.preventDefault();const button=form.querySelector('[type=submit]');if(button.disabled || !form.reportValidity())return;button.disabled=true;say(msg,'로그인 및 관리자 권한 확인 중…');try{const {error}=await db.auth.signInWithPassword({email:form.elements.email.value.trim(),password:form.elements.password.value});form.elements.password.value='';if(error)throw error;await enterDashboard();}catch(_){clearDashboard();say(msg,'로그인하지 못했습니다. 이메일과 비밀번호를 확인해 주세요.',true);}finally{button.disabled=false;}});
  $('#password-toggle').addEventListener('click',()=>{const field=$('#admin-password'),visible=field.type==='password';field.type=visible?'text':'password';$('#password-toggle').textContent=visible?'숨김':'표시';$('#password-toggle').setAttribute('aria-pressed',String(visible));});
  $('#filter-form').addEventListener('submit',event=>{event.preventDefault();page=0;load();});$('#refresh').addEventListener('click',load);
  supportRefresh.addEventListener('click',()=>{if(supportSaving)return;if(Array.from(supportRows.querySelectorAll('textarea')).some(input=>input.value!==input.dataset.savedAnswer) && !window.confirm('저장하지 않은 문의 답변이 사라집니다. 새로고침할까요?'))return;loadSupport();});
  $('#previous-page').addEventListener('click',()=>{if(page>0 && !busy){page--;load();}});$('#next-page').addEventListener('click',()=>{if((page+1)*pageSize<total && !busy){page++;load();}});
  $('#logout').addEventListener('click',async()=>{clearDashboard();try{const {error}=await db.auth.signOut({scope:'local'});if(error)throw error;say(msg,'안전하게 로그아웃했습니다.');}catch(_){try{sessionStorage.removeItem('nexus-intake-admin');}catch(_){}say(msg,'이 화면의 신청 정보를 지웠습니다. 로그아웃 연결을 확인하려면 창을 닫아 주세요.',true);}});
  db.auth.onAuthStateChange(event=>{if(event==='SIGNED_OUT'){clearDashboard();form.elements.password.value='';}});
  async function restore(){if(restoring)return;restoring=true;try{const {data,error}=await db.auth.getSession();if(error)throw error;if(data.session)await enterDashboard();}catch(_){clearDashboard();say(msg,'세션을 복원하지 못했습니다. 다시 로그인해 주세요.',true);}finally{restoring=false;}}
  document.addEventListener('visibilitychange',()=>{if(document.hidden){rows.replaceChildren();supportRows.replaceChildren();supportItems=[];loadGeneration++;supportGeneration++;}else if(user){enterDashboard();}});
  restore();
})();
