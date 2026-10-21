// All automatic work is bounded, non-executing planning. Never interpret instructions as code.
export const CAPABILITIES = Object.freeze({
 internal: { interface: 'transactional queue', enabled: true, mode: 'rules-only planning', paid: false },
 claude: { interface: 'Messages API', enabled: false, reason: 'budget_activation_required' },
 openai: { interface: 'Responses API', enabled: false, reason: 'zero_credit_paid_calls_forbidden' },
 codex: { interface: 'Codex SDK / exec / app-server', enabled: false, reason: 'runner_and_budget_not_configured' },
 work: { interface: null, enabled: false, reason: 'no_verified_remote_control_interface' },
});
export function validateInstruction(value) {
 if(typeof value!=='string'||!value.trim()||value.length>2000) throw Error('invalid_instruction');
 if(/sk-|sb_secret_|-----BEGIN|password\s*[:=]|비밀번호\s*[:=]/i.test(value)) throw Error('credential_input_forbidden');
 return value.trim();
}
export function executeFree(task) {
 if(!CAPABILITIES[task.agent]?.enabled) return {status:'blocked',code:CAPABILITIES[task.agent]?.reason||'unknown_agent',verified:false};
 const text=validateInstruction(task.instruction);
 let result;
 if(task.kind==='requirements') result={kind:task.kind,instruction:text,requirements:['입력 요구사항 확인','완료 기준 검토'],mode:'rules_only',paid_calls:0};
 else if(task.kind==='scope') result={kind:task.kind,deliverable:'요청에 대한 작업 범위 초안',instruction:text,
  steps:['요구사항 확인','구현 범위 검토','검증 기준 확인','관리자 검토'],execution_started:false,paid_calls:0};
 else if(task.kind==='validation') {
  const previous=task.previous||[];
  if(previous.length!==2||previous.some(x=>!x||x.paid_calls!==0)) return {status:'failed',code:'invalid_upstream_result',verified:false};
  result={kind:task.kind,checks:['선행 단계 결과 존재','유료 호출 0회','실행 미시작'],passed:true,scope:'workflow_metadata_only',paid_calls:0};
 } else if(task.kind==='human_review') return {status:'awaiting_approval',verified:false,result:{kind:task.kind,
  next_action:'관리자가 범위 초안을 검토해야 합니다. 실제 제작·배포는 아직 시작되지 않았습니다.',paid_calls:0}};
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
