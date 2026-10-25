// All automatic work is bounded, non-executing planning. Never interpret instructions as code.
export const CAPABILITIES = Object.freeze({
 internal: { interface: 'transactional queue', enabled: true, mode: 'rules-only planning', paid: false },
 claude: { interface: 'Messages API', enabled: false, reason: 'production_adapter_not_enabled' },
 openai: { interface: 'Responses API', enabled: false, reason: 'zero_credit_paid_calls_forbidden' },
 codex: { interface: 'Codex SDK / exec / app-server', enabled: false, reason: 'runner_and_auth_not_configured' },
 work: { interface: null, enabled: false, reason: 'no_verified_remote_control_interface' },
});
export function validateInstruction(value) {
 if(typeof value!=='string'||!value.trim()||value.length>2000) throw Error('invalid_instruction');
 if(/sk-|sb_secret_|-----BEGIN|password\s*[:=]|비밀번호\s*[:=]/i.test(value)) throw Error('credential_input_forbidden');
 return value.trim();
}
// Logical roles share the free internal runner; these are not external model agents.
export const ROLES = Object.freeze({requirements:'analysis',scope:'planning',validation:'validation',human_review:'reporting'});
export const PLAN_STEPS = Object.freeze(['requirements','scope','implementation','validation','human_review','delivery']);
export function classifyInstruction(text) {
 const rules = {
  website: /웹사이트|홈페이지|랜딩\s*페이지|website|landing\s*page/i,
  ai_automation: /자동화|챗봇|automation|chatbot/i,
  custom_system: /맞춤\s*시스템|관리\s*시스템|대시보드|custom\s*system|dashboard/i,
  consulting: /컨설팅|상담|consulting/i,
 };
 const candidates=Object.entries(rules).filter(([,pattern])=>pattern.test(text)).map(([kind])=>kind);
 return {service_type:candidates.length===1?candidates[0]:'needs_review',candidates,requires_review:candidates.length!==1,method:'keyword_rules'};
}
function planFor(classification) {
 return {steps:[...PLAN_STEPS],service_type:classification.service_type,
  assignments:PLAN_STEPS.map(kind=>({kind,role:ROLES[kind]||null,
   status:['implementation','delivery'].includes(kind)?'requires_separate_approval':'planning_only'})),
  execution_started:false,external_execution:'requires_separate_approval',paid_calls:0};
}
export function executeFree(task) {
 if(!CAPABILITIES[task.agent]?.enabled) return {status:'blocked',code:CAPABILITIES[task.agent]?.reason||'unknown_agent',verified:false};
 const text=validateInstruction(task.instruction);
 let result;
 if(task.kind==='requirements') result={kind:task.kind,role:ROLES[task.kind],instruction:text,
  classification:classifyInstruction(text),requirements:['입력 요구사항 확인','완료 기준 검토'],mode:'rules_only',execution_started:false,paid_calls:0};
 else if(task.kind==='scope') result={kind:task.kind,deliverable:'요청에 대한 작업 범위 초안',instruction:text,
  role:ROLES[task.kind],plan:planFor(classifyInstruction(text)),
  steps:[...PLAN_STEPS],execution_started:false,paid_calls:0};
 else if(task.kind==='validation') {
  const previous=task.previous||[];
  if(previous.length!==2||previous[0]?.kind!=='requirements'||previous[1]?.kind!=='scope'||
   previous.some(x=>!x||x.paid_calls!==0||x.execution_started!==false)||
   JSON.stringify(previous[1]?.plan?.steps)!==JSON.stringify(PLAN_STEPS)||
   previous[1]?.plan?.external_execution!=='requires_separate_approval')
   return {status:'failed',code:'invalid_upstream_result',verified:false};
  result={kind:task.kind,role:ROLES[task.kind],checks:['선행 단계와 역할 순서','6단계 계획 존재','유료 호출 0회','실행 미시작','제작·납품 승인 대기'],
   passed:true,scope:'workflow_metadata_only',execution_started:false,paid_calls:0};
 } else if(task.kind==='human_review') {
  const previous=task.previous||[];
  if(previous.length!==3||previous[2]?.kind!=='validation'||previous[2]?.passed!==true||
   previous.some(x=>!x||x.paid_calls!==0||x.execution_started!==false))
   return {status:'failed',code:'invalid_report_inputs',verified:false};
  return {status:'awaiting_approval',verified:false,result:{kind:task.kind,role:ROLES[task.kind],
   report:{completed_roles:['analysis','planning','validation'],classification:previous[0].classification,
    plan:previous[1].plan,validation:previous[2],production_completed:false},
   next_action:'관리자가 범위 초안을 검토해야 합니다. 실제 제작·배포는 아직 시작되지 않았습니다.',execution_started:false,paid_calls:0}};
 }
 else return {status:'failed',code:'unsupported_task',verified:false};
 return {status:'completed',verified:true,result};
}
export async function tick(rpc, limit=4) {
 let processed=0;
 for(let i=0;i<Math.min(limit,8);i++) {
  const task=await rpc('claim',{}); if(!task)break;
  let outcome;
  try {outcome=executeFree(task);}
  catch {outcome={status:'failed',code:'invalid_task_input',verified:false};}
  // Never re-execute if this write fails. A persisted lease expires; only free work can retry.
  await rpc('finish',{task_id:task.id,lease:task.lease_token,...outcome}); processed++;
 }
 return {processed,paid_calls:0};
}
