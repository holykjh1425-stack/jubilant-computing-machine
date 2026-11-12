import {sections,diagnosis,safeEvidence,matchRecords} from './domain.mjs';
const $=s=>document.querySelector(s),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let records=[],selected=null,tab='diagnosis',session=false,busy=false,generation=0,lastSuccess=null;
const tone=s=>s==='정상'?'normal':s==='실패'?'danger':s==='미확인'?'neutral':'warn';
const badge=(s,t)=>`<span class="badge ${t||tone(s)}">${esc(s)}</span>`;
function notice(text,error=false){$('#notice').textContent=text;$('#notice').className='notice'+(error?' error':'')}
function clear(){records=[];selected=null;$('#case-list').replaceChildren();$('#case-head').replaceChildren();$('#panel').replaceChildren();$('#total').textContent='—';$('#progress-total').textContent='—';$('#detail-content').hidden=true;$('#empty').hidden=false;$('#empty').textContent='표시할 최신 조회 데이터가 없습니다.'}
function end(message='합성 세션을 종료했습니다. 화면의 조회 데이터와 임시 분기 입력을 비웠습니다.'){
 generation++;session=false;clear();$('#protected').hidden=true;$('#gate').hidden=false;$('#logout').hidden=true;notice(message);
}
async function load(error=''){
 if(!session||busy)return;busy=true;const stamp=generation;$('#refresh').disabled=true;
 try{
  const r=await fetch('/api/demo-snapshot',{headers:{'x-solq-demo-role':'synthetic-admin','x-solq-demo-error':error},cache:'no-store'});
  if(stamp!==generation)return;
  if(!r.ok){clear();$('#checked').textContent='조회 실패 · 최신값 없음'+(lastSuccess?' / 이전 성공: '+lastSuccess:'');if(r.status===401){end('인증 만료 모의: 조회를 차단하고 상세 데이터를 비웠습니다. 합성 세션을 다시 시작해 주세요.');return}throw Error('READ_FAILED')}
  const d=await r.json();if(stamp!==generation)return;
  if(!Array.isArray(d.records)||d.source!=='SYNTHETIC_FIXTURES_ONLY')throw Error('READ_FAILED');
  records=d.records;selected=records.some(x=>x.receipt===selected)?selected:records[0]?.receipt;
  lastSuccess=new Date(d.checkedAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',hour12:false})+' KST';
  $('#source').textContent='조회 성공 · 출처: 서버 합성 fixture / 실제 Supabase 미연결';$('#checked').textContent='최종 조회 '+lastSuccess;
  $('#protected').hidden=false;$('#gate').hidden=true;$('#logout').hidden=false;
  $('#total').textContent=records.length;$('#progress-total').textContent=records.filter(r=>diagnosis(r.answers).known>0).length+' / '+records.length;
  notice('합성 관리자 세션 · 조회 전용. 분기 탐색은 메모리에서만 실행하며, 저장·상태 변경·외부 전송은 없습니다.');renderList();
 }catch{if(stamp===generation){clear();$('#source').textContent='조회 실패 · 최신값 없음';$('#checked').textContent='이전 성공: '+(lastSuccess||'없음')+' · 과거 값은 화면에서 제거';notice('연결 끊김·조회 실패 모의: 과거 값을 최신 값으로 표시하지 않습니다. 수동 새로고침으로 복구하세요.',true)}}
 finally{busy=false;$('#refresh').disabled=false}
}
function renderList(){
 const rows=matchRecords(records,$('#search').value,$('#filter').value);
 if(!rows.some(r=>r.receipt===selected))selected=rows[0]?.receipt;
 $('#case-list').innerHTML=rows.map(r=>`<button class="case-item ${r.receipt===selected?'selected':''}" data-case="${esc(r.receipt)}" aria-pressed="${r.receipt===selected}"><strong>${esc(r.receipt)}</strong><b>${esc(r.label)}</b><div class="case-bottom">${badge(r.integrity)}<span>진단 ${diagnosis(r.answers).progress}%</span></div></button>`).join('');
 $('#empty').hidden=!!rows.length;$('#empty').textContent='검색 결과가 없습니다. 검색어나 상태 필터를 바꿔 주세요.';$('#detail-content').hidden=!rows.length;
 $('#case-list').querySelectorAll('button').forEach(b=>b.onclick=()=>{selected=b.dataset.case;renderList()});if(rows.length)renderDetail();
}
function renderDetail(){
 const r=records.find(x=>x.receipt===selected);if(!r)return;const d=diagnosis(r.answers);
 $('#case-head').innerHTML=`<div class="case-title"><div><span class="mono">${esc(r.receipt)}</span><h3>${esc(r.label)}</h3></div>${badge(r.integrity)}</div><p class="case-sub">${esc(r.type)} · 신청 내용과 진단 기록을 분리한 합성 사례</p><div class="progress-row"><span>진단 정보 ${d.known}/8</span><div class="progress-track"></div><b>${d.progress}%</b></div>`;
 // CSP disallows style attributes: use a native progress element instead.
 const track=$('.progress-track');const progress=document.createElement('progress');progress.max=100;progress.value=d.progress;progress.setAttribute('aria-label','진단 정보 확인률');track.replaceChildren(progress);
 document.querySelectorAll('[role=tab]').forEach(b=>{b.setAttribute('aria-selected',b.dataset.tab===tab);b.tabIndex=b.dataset.tab===tab?0:-1;b.id='tab-'+b.dataset.tab;b.setAttribute('aria-controls','panel')});$('#panel').setAttribute('aria-labelledby','tab-'+tab);
 if(tab==='diagnosis'){
  $('#panel').innerHTML=`<div class="summary-box"><div class="eyebrow">CONFIRMED OBSERVATION</div><p>${esc(d.summary)}</p><small>우선 점검: ${esc(d.priority)} · 자동화 효과와 견적 금액은 미산정</small></div><h4 class="mini-heading">미확인 정보 <span class="mono">${d.unknown.length} AREAS</span></h4><div class="unknown-tags">${d.unknown.length?d.unknown.map(s=>`<span>${esc(s)}</span>`).join(''):'<span>8개 영역 입력 확인 · 사실 검증은 별도</span>'}</div><h4 class="mini-heading">답변에서 이어지는 다음 질문</h4>${d.questions.map((q,i)=>`<div class="question"><span class="number">0${i+1}</span><div><b>${esc(q.question)}</b><small>분기 근거 / ${esc(q.reason)}</small></div></div>`).join('')||'<p class="muted">추가 분기 없음. 정보의 사실 여부는 담당자 확인이 필요합니다.</p>'}<div class="diag-fields">${sections.map((s,i)=>`<details><summary>${i+1}. ${esc(s)}<span>${r.answers[i]?'입력 확인':'미확인'}</span></summary><div class="field-answer">${esc(r.answers[i]||'확인된 정보 없음')}</div></details>`).join('')}</div><section class="sandbox"><h4>질문 분기 탐색 <span class="badge neutral">미저장</span></h4><p>합성 답변을 바꿔 질문 분기를 확인합니다. 원본 진단·진행률·견적 상태에는 반영되지 않습니다.</p><label for="branch-field">탐색할 진단 영역</label><select id="branch-field">${sections.map((s,i)=>`<option value="${i}" ${i===2?'selected':''}>${esc(s)}</option>`).join('')}</select><label for="branch-answer">임시 답변</label><textarea id="branch-answer" maxlength="1000" placeholder="예: 엑셀에 주문 정보를 반복 입력합니다. 실제 개인정보를 입력하지 마세요."></textarea><div class="sandbox-actions"><button id="explore" class="primary">분기 미리보기</button><button id="reset-branch">임시 입력 비우기</button></div><div class="branch-result" id="branch-result" aria-live="polite"></div></section>`;
  $('#explore').onclick=()=>{const a={...r.answers,[$('#branch-field').value]:$('#branch-answer').value};const x=diagnosis(a);$('#branch-result').innerHTML=x.questions.map(q=>`<p>${esc(q.question)}<br><small>근거: ${esc(q.reason)}</small></p>`).join('')||'<p>추가 분기 없음. 사실 확인은 별도입니다.</p>'};
  $('#reset-branch').onclick=()=>{$('#branch-answer').value='';$('#branch-result').replaceChildren()};
 }else if(tab==='plans'){
  $('#panel').innerHTML=`<div class="status-grid"><div><small>견적 검토</small>${badge(r.quote,'neutral')}</div><div><small>실제 입금 확인</small>${badge(r.deposit,'neutral')}</div><div><small>별도 제작 승인</small>${badge(r.approval,'neutral')}</div></div><p class="muted">세 상태는 독립입니다. 이 화면에서 변경하거나 제작을 실행할 수 없습니다.</p><h4 class="mini-heading">무료 6단계 계획과 진단 근거 비교</h4><p class="mono">${esc(r.planStatus)}</p><div class="table-wrap"><table><thead><tr><th>무료 계획 · 합성</th><th>연결된 진단 근거</th></tr></thead><tbody>${Array.from({length:6},(_,i)=>`<tr><td>${i+1}. ${esc(r.plan[i]||'계획 미확인')}</td><td>${esc(r.answers[i]||'진단 근거 미확인')}</td></tr>`).join('')}</tbody></table></div>${r.integrity==='중복'?'<div class="notice">중복 계획은 최신본을 자동 선택하지 않습니다. 버전별 원문·생성 근거 확인이 남아 있습니다.</div>':''}<div class="next-action"><b>NEXT CHECK</b>${esc(r.next)}</div>`;
 }else{
  const evidence=safeEvidence(r.evidence);
  $('#panel').innerHTML=`<div class="next-action"><b>다음 점검 작업 · 관리자 검토 대기</b>${esc(r.next)}</div><h4 class="mini-heading">증거 링크</h4>${evidence?`<a class="evidence-link" target="_blank" rel="noopener noreferrer" href="${esc(evidence)}">${esc(evidence)}</a><p class="muted">수동으로 열 때만 이동합니다. 링크는 별도 과제 기록이며 이 합성 기업의 사실 증거는 아닙니다.</p>`:'<p class="muted">등록된 증거 없음 · 미확인</p>'}<h4 class="mini-heading">보존된 조회 기록 · 합성</h4>${r.audit.length?r.audit.map(a=>`<div class="audit-entry"><small>${esc(a.at)} · ${esc(a.kind)} · 담당: 합성 관리자</small><p>${esc(a.text)}</p></div>`).join(''):'<p class="muted">조회 기록 없음</p>'}<h4 class="mini-heading">실제 변경 이력</h4><p class="muted">변경 기능이 없어 신규 변경 이력이 생성되지 않습니다. 위 조회 기록은 변경 증거가 아닙니다.</p><details><summary>향후 변경 기능의 필수 관문</summary><div class="field-answer">관리자 재인증 · 대상/변경값 명시 승인 · 변경 전후 기록 · 독립 진단 저장소 · 최소 권한 · 감사 추적 · 별도 운영 적용 승인</div></details>`;
 }
}
$('#enter').onclick=()=>{session=true;generation++;load()};$('#logout').onclick=()=>end();$('#refresh').onclick=()=>load();$('#search').oninput=renderList;$('#filter').onchange=renderList;
document.querySelectorAll('[role=tab]').forEach(b=>{b.onclick=()=>{tab=b.dataset.tab;renderDetail()};b.onkeydown=e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const tabs=[...document.querySelectorAll('[role=tab]')],i=tabs.indexOf(b),next=e.key==='Home'?0:e.key==='End'?tabs.length-1:(i+(e.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;tabs[next].click();tabs[next].focus()}});
document.querySelectorAll('[data-error]').forEach(b=>b.onclick=()=>load(b.dataset.error));
$('#deny').onclick=async()=>{const stamp=++generation;clear();try{const r=await fetch('/api/demo-snapshot',{headers:{'x-solq-demo-role':'synthetic-customer'}});if(stamp===generation)end('일반 계정 접근 모의: 서버가 HTTP '+r.status+'로 조회를 거부했습니다. 실제 고객 데이터는 연결되지 않았습니다.')}catch{if(stamp===generation)end('일반 계정 접근 모의 중 연결 실패. 조회 데이터는 제거했습니다.')}};
