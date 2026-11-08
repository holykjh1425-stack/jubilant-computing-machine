import {executeFree,validateInstruction,PLAN_STEPS} from '../../supabase/functions/nexus-orchestrator/engine.mjs';

export const POLICY=Object.freeze({liveClaude:false,productionExecution:false,maxFreeAttempts:2,automaticPaidRetries:0});
export const STATE_MAP=Object.freeze({received:'applications.status (existing)',validated:'logical event only',free_plan:'existing free_cycle / rules runner',stored:'ai_work_plans + orchestrator_jobs linkage',quote_waiting:'awaiting_approval (not production approval)',consent:'solq_quote_acceptances candidate',deposit:'solq_deposit_confirmations candidate',production_approval:'production_jobs.production_approved_at candidate',production:'existing protected production claim; disabled here'});
const uuid=x=>typeof x==='string'&&/^[a-f\d]{8}(-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(x);
function identity(app){if(!app||!uuid(app.id)||!uuid(app.tenantId)||typeof app.receipt!=='string'||!/^NX-\d{8}-[A-F\d]{8}$/.test(app.receipt))throw Error('invalid_identity');return `${app.tenantId}:${app.id}`;}
const validPlan=p=>p?.execution_started===false&&p?.external_execution==='requires_separate_approval'&&p?.paid_calls===0&&JSON.stringify(p.steps)===JSON.stringify(PLAN_STEPS);
export function route({kind,complexity}={}){
 if(['free_plan','classify'].includes(kind))return 'free_rules';
 if(['analysis','code_review','exception_design'].includes(kind)&&complexity==='high')return 'claude_candidate';
 return 'manual_review';
}
export function claudeGate(request,approval,now=Date.now()){
 if(route(request)!=='claude_candidate')return {allowed:false,reason:'free_or_manual_first'};
 if(!approval||approval.verifiedByServer!==true||approval.applicationId!==request.applicationId||approval.digest!==request.digest||!Number.isFinite(approval.expiresAt)||approval.expiresAt<=now||approval.maxCalls!==1||!Number.isSafeInteger(approval.maxNano)||approval.maxNano<1)return {allowed:false,reason:'scoped_admin_approval_required'};
 // An approved candidate is still not permission to turn on transport or use an old price/model profile.
 return {allowed:false,reason:'live_transport_disabled',candidateApproved:true};
}
export function productionGate(e,appId,quoteId){
 const shared=x=>x?.verifiedByServer===true&&x.applicationId===appId&&x.quoteId===quoteId;
 if(!uuid(appId)||!uuid(quoteId)||!shared(e?.consent)||!shared(e?.deposit)||!shared(e?.approval))return false;
 return e.consent.amountKrw===100000&&e.deposit.amountKrw===30000&&e.deposit.manualBankChecked===true&&e.approval.separateProductionApproval===true&&Number.isFinite(e.deposit.confirmedAt)&&Number.isFinite(e.approval.approvedAt)&&e.approval.approvedAt>=e.deposit.confirmedAt;
}
// Adapter contract: authenticate server identity; atomic application lock + receipt uniqueness;
// transaction rollback of pair/event writes; tenant scoped reads; durable audit. No memory fallback.
export function createCoordinator({repository,authorize,runner=executeFree,timeoutMs=1000}){
 if(typeof repository?.transaction!=='function'||typeof authorize!=='function')throw Error('server_adapters_required');
 return Object.freeze({
  async process(app,context){
   const key=identity(app);
   if(!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>5000)throw Error('invalid_timeout');
   const run=async task=>{let timer;try{return await Promise.race([Promise.resolve().then(()=>runner(task)),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('free_timeout')),timeoutMs);})]);}finally{clearTimeout(timer);}};
   if(await authorize(context,{tenantId:app.tenantId,applicationId:app.id,action:'free_plan'})!==true)throw Error('permission_denied');
   // No client-supplied completed plan, approval, job id, worker identity or result is accepted.
   const instruction=validateInstruction(app.brief);
   return repository.transaction(key,async tx=>{
    const old=await tx.read(app.tenantId,app.id,app.receipt);
    if(old?.plan||old?.job){
     if(!old.plan||!old.job||old.job.applicationId!==app.id||old.job.planId!==old.plan.id||!validPlan(old.plan))return {status:'manual_review',reason:'existing_linkage_requires_review'};
     return {status:'awaiting_approval',reused:true,planId:old.plan.id,jobId:old.job.id,productionStarted:false};
    }
    const attempts=old?.attempts??0;
    if(old?.uncertain===true||attempts>=POLICY.maxFreeAttempts)return {status:'manual_review',reason:'reconcile_or_attempt_limit'};
    const next=attempts+1;
    let requirements,scope,validation,report;
    try{
     requirements=await run({agent:'internal',kind:'requirements',instruction});
     scope=await run({agent:'internal',kind:'scope',instruction});
     validation=await run({agent:'internal',kind:'validation',instruction,previous:[requirements.result,scope.result]});
     report=await run({agent:'internal',kind:'human_review',instruction,previous:[requirements.result,scope.result,validation.result]});
     if(requirements.status!=='completed'||scope.status!=='completed'||validation.result?.passed!==true||report.status!=='awaiting_approval'||scope.result?.paid_calls!==0||!validPlan({...scope.result?.plan,paid_calls:0}))throw Error('invalid_free_result');
    }catch{
     // Known free compute failures may be retried by a later explicit dispatch, never by a loop here.
     await tx.failure({attempts:next,reason:'free_validation_failed'});
     await tx.audit({applicationId:app.id,event:'free_failed',engine:'free_rules',attempt:next,paidCalls:0});
     return {status:'manual_review',reason:'free_validation_failed',automaticRetry:false};
    }
    const pair=await tx.savePair({tenantId:app.tenantId,applicationId:app.id,receipt:app.receipt,plan:{...scope.result.plan,paid_calls:0},attempts:next,status:'awaiting_approval'});
    if(!pair||!uuid(pair.planId)||!uuid(pair.jobId))throw Error('invalid_saved_identity');
    await tx.audit({applicationId:app.id,event:'free_plan_stored',engine:'free_rules',attempt:next,paidCalls:0});
    return {status:'awaiting_approval',...pair,reused:false,productionStarted:false};
   }); // commit error escapes: stop, reconcile durable store before further dispatch; no auto retry.
  },
  async executeClaude(){throw Error('paid_transport_absent');},
  async executeProduction(){throw Error('production_transport_absent');}
 });
}
