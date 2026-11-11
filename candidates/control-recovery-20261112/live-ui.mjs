import {AdminGate,SupabaseReadAdapter,PollController,summarize,guardedFetch,SOURCES} from './ops-core.mjs';
import {LIVE_READ_ENABLED,SERVER_REVIEWS_ENABLED} from './deployment.candidate.mjs';
export function makeLiveAdapter(){
 const cfg=window.NEXUS_CONFIG;
 if(!window.supabase||!cfg?.SUPABASE_URL||!cfg?.SUPABASE_ANON_KEY)return null;
 const db=window.supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_ANON_KEY,{global:{fetch:guardedFetch(cfg.SUPABASE_URL)},auth:{storage:sessionStorage,storageKey:'nexus-intake-admin',persistSession:true,autoRefreshToken:false,detectSessionInUrl:false}});
 return new SupabaseReadAdapter(db);
}
export function mount({adapter,fixture=false,tasks,esc,toast,legacy,localState,onReviews=()=>{}}){
 const $=s=>document.querySelector(s);let current=null;const enabled=fixture||LIVE_READ_ENABLED;
 const statusLabels={LOCKED:'관리자 인증 필요',LOADING:'권한 확인·조회 중',SUCCESS:fixture?'격리 모의 조회 성공':'운영 조회 성공',AUTH:'인증 만료·조회 차단',FORBIDDEN:'관리자 권한 없음·조회 차단',OFFLINE:'연결 끊김·조회 중단',HIDDEN:'화면 숨김·조회 중단',QUERY_FAILED:'조회 실패·최신 수치 없음'};
 const fmt=x=>x?new Date(x).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',hour12:false}):'없음';
 $('#loginSubmit').disabled=!enabled||!adapter;$('#liveEmail').disabled=$('#livePassword').disabled=!enabled||!adapter;$('#liveRefresh').disabled=$('#liveAuto').disabled=!enabled||!adapter;$('#liveLogout').disabled=!enabled||!adapter;
 $('#approvalState').textContent=fixture?'격리 모의 연결 · 실제 고객 데이터 없음':enabled?'운영 조회 승인 설정 적용':'운영 연결 잠금 · 별도 승인 전';
 $('#legacyCount').textContent=legacy?.error?'이전 로컬 기록 읽기 실패 · 원본 보존':`이전 로컬 기록 ${Object.keys(legacy?.notes||{}).length}개 · 원본 키 보존`;
 function clearCurrent(){current=null;onReviews([]);document.querySelectorAll('.server-private').forEach(node=>node.remove());for(const id of ['liveMetrics','liveSources','liveDetails'])$('#'+id).replaceChildren();$('#liveMetrics').innerHTML='<p class="sub">표시할 최신 운영값이 없습니다. 아래 과거 보존 기준과 구분해 주세요.</p>';$('#serverSave').disabled=true;$('#serverRead').disabled=true;$('#serverReviews').replaceChildren();}
 let controller;
 function render(event){
  $('#liveState').textContent=statusLabels[event.kind]||event.kind;
  if(event.kind!=='SUCCESS'){clearCurrent();$('#lastSuccess').textContent=fmt(controller?.lastSuccess);if(['AUTH','FORBIDDEN','OFFLINE','HIDDEN'].includes(event.kind))$('#liveAuto').checked=false;return;}
  current=event.data;if(Object.values(event.data.sources).some(x=>!x.ok||!x.complete))$('#liveState').textContent='일부 조회 실패·불완전 · 출처별 확인';$('#lastSuccess').textContent=fmt(event.data.at);$('#liveSourceLabel').textContent=event.data.source;
  const sum=summarize(event.data);const statList=[['applications','최신 신청'],['ai_work_plans','최신 무료 계획'],['orchestrator_jobs','최신 작업'],['production_jobs','최신 제작 관리']];
  $('#liveMetrics').innerHTML=statList.map(([t,label])=>`<div class="stat"><div class="label">${label}</div><div class="num">${sum.counts[t].total??'—'}<em>건</em></div><small>${fixture?'모의 전체값':'최신 전체값'} · 합성 구분 미확인</small></div>`).join('');
  $('#liveSources').innerHTML=Object.entries(event.data.sources).map(([table,x])=>`<div class="row"><div class="grow"><h3>${esc(table)}</h3><p>${esc(x.source)} · ${fmt(x.resolvedAt||event.data.at)}</p></div><span class="badge ${!x.ok?'no':x.complete?'pass':'unknown'}">${!x.ok?'조회 실패':x.complete?'조회 성공':'일부 조회'}</span></div>`).join('');
  $('#liveDetails').innerHTML='<h3>접수·작업·제작 상태</h3><p class="sub">출처별 순차 조회입니다. 원자적 스냅샷이 아니므로 연결 이상은 재확인할 후보입니다.</p>'+statList.map(([t,label])=>`<p class="sub">${label}: ${sum.counts[t].complete?esc(JSON.stringify(sum.counts[t].states)):'상태 분포 미확인 (조회 실패 또는 1,000행 제한)'}</p>`).join('')+`<p class="sub">미연결·중복: ${sum.anomalies?esc(JSON.stringify(sum.anomalies)):'전체 자료 미확보 · 미확인'}</p>`+`<p class="sub">중복은 신청별 복수 작업 그룹 후보입니다. 오류로 단정하거나 자동 병합하지 않습니다.</p>`;
  for(const t of ['solq_quote_acceptances','solq_free_plan_runs','orchestrator_tasks']){const v=sum.counts[t];$('#liveDetails').insertAdjacentHTML('beforeend',`<p class="sub">${esc(t)} · 전체 ${v.total??'미확인'} · ${v.complete?esc(JSON.stringify(v.states)):'분포 미확인'}</p>`);}
  const production=event.data.sources.production_jobs;
  if(production?.ok&&production.complete){const rows=production.rows;$('#liveDetails').insertAdjacentHTML('beforeend',`<p class="sub">입금 관찰 시각 있음 ${rows.filter(x=>x.payment_observed_at).length} · 별도 제작 승인 시각 있음 ${rows.filter(x=>x.production_approved_at).length} · 견적 동의 연결 있음 ${rows.filter(x=>x.quote_acceptance_id).length} (시각·연결 존재 집계이며 적법성 재검증 아님)</p>`);}
  const taskSource=event.data.sources.orchestrator_tasks;
  if(taskSource?.ok&&taskSource.complete){$('#liveDetails').insertAdjacentHTML('beforeend',`<p class="sub">실패 ${taskSource.rows.filter(x=>x.status==='failed').length} · 재시도 예정 시각 있음 ${taskSource.rows.filter(x=>x.next_attempt_at).length} · 최대 시도 횟수 ${Math.max(0,...taskSource.rows.map(x=>x.attempts||0))}</p>`);}
  for(const t of ['orchestrator_events','production_events']){const v=event.data.sources[t];$('#liveDetails').insertAdjacentHTML('beforeend',`<p class="sub">${esc(t)} · ${v?.ok?v.total:'미확인'}건 · 감사 이벤트 ${v?.ok?Math.min(10,v.rows.length):0}개 표시</p>`);if(v?.ok)for(const r of v.rows.slice(0,10))$('#liveDetails').insertAdjacentHTML('beforeend',`<div class="statusline">${esc(r.event)} / ${esc(r.code||'—')} · ${fmt(r.created_at)}</div>`);}
  $('#liveDetails').insertAdjacentHTML('beforeend','<div class="alert">Cron·독립 실행기·백업·보안 상태는 이 조회로 검증되지 않습니다. 별도 증거 장부에서 추적합니다.</div>');
  $('#serverRead').disabled=!(fixture||SERVER_REVIEWS_ENABLED);$('#serverSave').disabled=!(fixture||SERVER_REVIEWS_ENABLED);
 }
 controller=adapter?new PollController(adapter,{emit:event=>{try{render(event)}catch(error){if(fixture)console.error('fixture render:',error.message);throw error}},online:()=>navigator.onLine,visible:()=>!document.hidden}):null;
 clearCurrent();
 $('#liveRefresh').onclick=()=>controller?.refresh();
 $('#liveAuto').onchange=()=>$('#liveAuto').checked?controller?.start():controller?.stop('LOCKED');
 $('#liveLogin').onsubmit=async e=>{e.preventDefault();if(!enabled||!adapter)return;$('#loginSubmit').disabled=true;try{
  if(!fixture){const {error}=await adapter.db.auth.signInWithPassword({email:$('#liveEmail').value.trim(),password:$('#livePassword').value});if(error)throw Error('AUTH');adapter.gate.clear();}
  await controller.refresh();
 }catch{controller.stop('AUTH')}finally{$('#livePassword').value='';$('#loginSubmit').disabled=false}};
 $('#liveLogout').onclick=async()=>{controller?.stop('LOCKED');adapter?.gate?.clear();$('#liveAuto').checked=false;if(!fixture&&adapter)await adapter.db.auth.signOut({scope:'local'});};
 if(!fixture&&adapter)adapter.db.auth.onAuthStateChange((event)=>{if(event==='SIGNED_OUT')controller.stop('AUTH');});
 document.addEventListener('visibilitychange',()=>{if(document.hidden)controller?.stop('HIDDEN')});window.addEventListener('offline',()=>controller?.stop('OFFLINE'));window.addEventListener('pagehide',()=>controller?.stop('LOCKED'));
 $('#serverRead').onclick=async()=>{const epoch=controller.epoch;try{const result=await adapter.reviews();if(epoch!==controller.epoch)return;onReviews(result.rows);$('#serverReviews').innerHTML=`<p class="sub">${fixture?'격리 모의':'서버'} 기록 ${result.rows.length} / ${result.total} · ${result.complete?'전체 조회':'최근 200개 · 일부 조회'} · ${fmt(new Date())}</p>`+result.rows.map(r=>`<div class="row"><div class="grow"><h3>${esc(r.task_id)} · ${esc(r.verdict)} · ${esc(r.owner)} · v${r.revision}</h3><p>${esc(r.facts)} · ${fmt(r.checked_at)}</p><p>차단: ${esc(r.blocker)} / 다음: ${esc(r.next_action)}</p><p>증거: ${esc(r.evidence.join(' / '))}</p><p>담당자: ${esc(r.actor_id)}</p></div></div>`).join('');}catch{$('#serverReviews').textContent='서버 기록 조회 실패 · 권한 또는 미적용 테이블 확인 필요';}};
 $('#serverSave').onclick=async()=>{if(!$('#serverConsent').checked){toast('서버 점검 기록 추가 승인을 체크해 주세요.');return}const epoch=controller.epoch;const t=tasks.find(t=>t.id===$('#detail').dataset.task);if(!t)return;
  const payload={task_id:t.code,revision:Number($('#reviewRevision').value),owner:t.owner,verdict:$('#reviewVerdict').value,checked_at:$('#reviewDate').value?new Date($('#reviewDate').value).toISOString():'',facts:$('#note').value.trim(),blocker:$('#reviewBlocker').value.trim(),next_action:$('#nextNote').value.trim(),evidence:$('#evidenceUrl').value.trim()?[$('#evidenceUrl').value.trim()]:[]};
  $('#serverSave').disabled=true;try{await adapter.appendReview(payload);if(epoch===controller.epoch){toast('서버 장부에 새 이력을 추가했습니다. 고객 상태는 변경하지 않았습니다.');$('#detail').close();$('#serverRead').click()}}catch(error){if(epoch===controller.epoch)$('#formError').textContent=error.code==='CONFLICT'?'동시 변경 충돌: 서버 장부의 최신 버전을 확인한 뒤 다음 버전 번호로 기록해 주세요.':'저장 실패 또는 결과 미확인. 자동 재시도하지 않습니다. 서버 이력을 먼저 재조회하세요.';}finally{if(epoch===controller.epoch)$('#serverSave').disabled=false;$('#serverConsent').checked=false;}};
 $('#legacyExport').onclick=()=>{if(legacy?.raw==null){toast('내려받을 이전 로컬 기록이 없습니다.');return}const url=URL.createObjectURL(new Blob([legacy.raw],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='SOLQ-legacy-preserved.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};
 // Test controls exist only on the separate synthetic fixture page.
 if(fixture&&adapter.setScenario){$('#fixtureControls').classList.remove('hidden');$('#fixtureScenario').onchange=()=>{controller.stop('LOCKED');adapter.setScenario($('#fixtureScenario').value)};}
}
