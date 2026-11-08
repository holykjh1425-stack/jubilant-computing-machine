(function(root){'use strict';
 const receipt=/^NX-\d{8}-[A-F0-9]{8}$/;
 const labels={follow_up:'추가 확인',features:'확인 항목',proposed_scope:'제안 범위',proposed_actions:'계획 내용',expected_result:'예상 결과',limitations:'제약',possible_costs:'예상 비용',next_action:'다음 확인'};
 function build(application,snapshot){
  const {plan,job}=snapshot||{},p=plan?.plan;
  if(!receipt.test(application.receipt_number)||!plan||plan.application_id!==application.id||!job||job.application_id!==application.id||job.free_plan_id!==plan.id||p?.application_id&&p.application_id!==application.id)throw Error('PLAN_LINK_REQUIRED');
  if(!Array.isArray(p.steps)||p.steps.length!==6||!Array.isArray(p.details)||p.details.length!==6)throw Error('SIX_STEPS_REQUIRED');
  const lines=['SOLQ 무료 6단계 계획','접수번호: '+application.receipt_number,'안내: 규칙 기반 계획 초안이며, 실제 제작·검증·납품이 완료됐다는 의미는 아닙니다.'];
  p.details.forEach((d,i)=>{
   if(d.ordinal!==i+1||typeof d.title!=='string'||!d.title.trim())throw Error('INVALID_PLAN_DETAILS');
   lines.push('',(i+1)+'. '+d.title);
   for(const [key,label] of Object.entries(labels))if(d[key]!==undefined){
    const value=d[key];if(value!==null&&typeof value!=='string'&&!Array.isArray(value))continue;
    const text=Array.isArray(value)?value.filter(v=>typeof v==='string').join(' / '):value;
    if(text)lines.push(label+': '+String(text).slice(0,3000));
   }
  });
  lines.push('','다음 순서: 관리자 검토 → 개별 견적 → 고객 동의 → 착수금 수동 확인 → 별도 제작 승인',
   '기본형 총제작비 100,000원부터 · 기본형 착수금 30,000원 · 기본형 잔금 70,000원',
   '최종 금액과 범위는 개별 견적으로 정하며, 월 유지관리는 선택형 별도 계약입니다.',
   '이 안내문은 자동 발송되지 않습니다.');
  return lines.join('\n');
 }
 function create({verifyAdmin,readSnapshot}){
  let epoch=0,busy=false;const invalidate=()=>{epoch++;};
  async function preview(application,alive=()=>true){
   if(busy)throw Error('BUSY');busy=true;const stamp=epoch;
   try{
    if(!alive())throw Error('STALE_VIEW');const actor=await verifyAdmin();
    const snapshot=await readSnapshot(application),text=build(application,snapshot);
    const after=await verifyAdmin();
    if(!alive()||stamp!==epoch||!actor?.id||after?.id!==actor.id)throw Error('STALE_SESSION');
    return {text,application_id:application.id,receipt_number:application.receipt_number,plan_id:snapshot.plan.id,job_id:snapshot.job.id};
   }finally{busy=false;}
  }
  return {preview,invalidate};
 }
 root.SOLQ_PLAN_HANDOFF={build,create};
})(typeof window==='undefined'?globalThis:window);
