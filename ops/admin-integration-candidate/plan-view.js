(function(root){'use strict';
const labels={requirements:'고객 요청 분석',classification:'서비스 분류',scope:'작업 범위 설정',implementation:'실행 계획',validation:'검증 계획',human_review:'관리자 검토',delivery:'전달 계획'};
const fields={request_excerpt:'신청 내용',sufficient_detail:'내용 충분 여부',follow_up:'추가 확인',service:'서비스',classification_basis:'분류 근거',features:'확인 항목',proposed_scope:'제안 범위',confirmed_scope:'범위 확정',requires_human_review:'관리자 검토 필요',proposed_actions:'실행 계획',execution_started:'실행 시작 여부',expected_result:'예상 결과',limitations:'제약',possible_costs:'비용 안내',next_action:'다음 작업'};
const states={completed:'완료',awaiting_approval:'관리자 검토 대기',requires_separate_approval:'별도 승인 필요',queued:'대기',running:'진행 중',blocked:'차단',failed:'실패'};
function render(list,{plan,job,tasks=[]}){list.replaceChildren();if(!plan)return;
 const p=plan.plan,steps=p.steps||[],details=p.details||[];
 if(steps.length!==6)throw Error('SIX_STEPS_REQUIRED');
 for(let i=0;i<6;i++){const d=details[i],task=tasks.find(t=>t.kind===steps[i]);
 const state=d?.status||task?.status||'stored';
 const li=document.createElement('li'),title=document.createElement('h4'),status=document.createElement('p');
 li.style.cssText='overflow-wrap:anywhere;white-space:normal;margin:16px 0';
 title.textContent=(i+1)+'. '+(d?.title||labels[steps[i]]||steps[i]);
 status.textContent='상태: '+(states[state]|| (state==='stored'?'계획 저장됨 · 실행 상태 미기록':state));
 li.append(title,status);
 if(d){for(const [key,value] of Object.entries(d)){if(['ordinal','title','status'].includes(key))continue;const body=document.createElement('p');body.textContent=(fields[key]||key)+': '+(typeof value==='string'?value:JSON.stringify(value));li.append(body);}}
 else {const body=document.createElement('p');body.textContent='이전 계획에는 단계별 상세 내용이 저장되어 있지 않습니다.';li.append(body);}
 list.append(li);}}
root.SOLQ_PLAN_VIEW={render};
})(typeof window==='undefined'?globalThis:window);
