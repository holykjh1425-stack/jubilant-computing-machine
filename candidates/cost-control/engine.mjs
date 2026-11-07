import {createHash, randomUUID} from 'node:crypto';
import {executeFree, validateInstruction, PLAN_STEPS} from '../../supabase/functions/nexus-orchestrator/engine.mjs';
export const POLICY=Object.freeze({version:'solq-mock-v1',priceVersion:'2026-10-28',liveEnabled:false,monthlyNano:5_000_000_000,dailyNano:500_000_000,jobNano:20_000_000,maxAttempts:2,maxInput:8192,maxOutput:2048,priceExpires:'2026-11-04T00:00:00Z'});
// USD per million tokens converted to exact nano-USD per token. Standard first-party text only.
export const MODELS=Object.freeze({'claude-haiku-5-5':Object.freeze({input:100,output:500,rank:0}), 'claude-sonnet-5-5':Object.freeze({input:2000,output:10000,rank:1})});
export function integer(n,min=0,max=Number.MAX_SAFE_INTEGER){if(!Number.isSafeInteger(n)||n<min||n>max)throw Error('invalid_integer');return n;}
export function cost(model,input,output){const p=MODELS[model];if(!p)throw Error('unknown_model');integer(input,0,POLICY.maxInput);integer(output,0,POLICY.maxOutput);return integer(input*p.input+output*p.output);}
export const usd=n=>integer(n)/1e9;
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const period=t=>{const day=new Date(t+9*3600_000).toISOString().slice(0,10);return{day,month:day.slice(0,7)};};
export function prepare(raw){
 if(typeof raw.tenant!=='string'||!raw.tenant||typeof raw.revision!=='string'||!raw.revision)throw Error('tenant_revision_required');
 const brief=validateInstruction(raw.brief).normalize('NFC');
 const kind=raw.kind;const language=raw.language??'ko';if(!['ko','en'].includes(language))throw Error('language_not_supported');
 const model=['design','code'].includes(kind)?'claude-sonnet-5-5':'claude-haiku-5-5';
 // Only explicit required task fields: no conversation, tokens, attachments, customer profile or hidden context.
 const prompt=JSON.stringify({version:POLICY.version,kind,brief,language});
 const inputCap=Buffer.byteLength(prompt,'utf8')+512; // Planning bound; NOT a verified Anthropic tokenizer.
 const outputCap=['design','code'].includes(kind)?1024:512;
 const key=hash([raw.tenant,raw.revision,prompt,model,POLICY.priceVersion]);
 return {key,tenant:raw.tenant,kind,brief,language,model,inputCap,outputCap,prompt,revision:raw.revision};
}
export function validateResult(result){return !!result&&typeof result.summary==='string'&&result.summary.length>0&&result.summary.length<=2000&&Array.isArray(result.checklist)&&result.checklist.length>0&&result.checklist.length<=8&&result.checklist.every(x=>typeof x==='string'&&x.length>0&&x.length<=250)&&result.requiresReview===true&&result.productionCompleted===false;}
// Isolated reference ledger only. Never a durable/multi-process production ledger or real authentication.
export class MemoryLedger {
 #approvals=new Map();#entries=new Map();#queue=Promise.resolve();#healthy=true;
 constructor({dailyNano=POLICY.dailyNano,monthlyNano=POLICY.monthlyNano,jobNano=POLICY.jobNano,clock=()=>Date.now()}={}){
  this.clock=clock;this.limits=Object.freeze({dailyNano:integer(dailyNano,0,POLICY.dailyNano),monthlyNano:integer(monthlyNano,0,POLICY.monthlyNano),jobNano:integer(jobNano,0,POLICY.jobNano)});
 }
 #atomic(fn){const p=this.#queue.then(fn);this.#queue=p.catch(()=>{});return p;}
 #admin(actor){if(actor?.syntheticAdmin!==true||typeof actor.id!=='string')throw Error('synthetic_admin_required');}
 approve(task,{actor,attempts=1,allowUpgrade=false,expires=this.clock()+60000,maxNano=this.limits.jobNano}={}){
  this.#admin(actor);integer(attempts,1,POLICY.maxAttempts);integer(expires,this.clock()+1);integer(maxNano,0,this.limits.jobNano);
  if(this.#approvals.has(task.key))throw Error('approval_immutable');
  if(MODELS[task.model]?.rank>0&&!allowUpgrade)throw Error('upgrade_approval_required');
  this.#approvals.set(task.key,Object.freeze({model:task.model,inputCap:task.inputCap,outputCap:task.outputCap,attempts,expires,maxNano,actorId:actor.id}));
 }
 reserve(task,attempt){return this.#atomic(()=>{
  if(!this.#healthy)throw Error('accounting_unhealthy');
  if(this.clock()>Date.parse(POLICY.priceExpires))throw Error('pricing_expired');
  integer(attempt,1,POLICY.maxAttempts);integer(task.inputCap,1,POLICY.maxInput);integer(task.outputCap,1,POLICY.maxOutput);
  const a=this.#approvals.get(task.key);if(!a)throw Error('approval_required');
  if(a.expires<=this.clock()||a.model!==task.model||a.inputCap!==task.inputCap||a.outputCap!==task.outputCap)throw Error('approval_scope_mismatch');
  if(attempt>a.attempts)throw Error('attempt_limit');
  const id=task.key+':'+attempt;if(this.#entries.has(id))throw Error('duplicate_attempt');
  const earlier=[...this.#entries.values()].filter(x=>x.key===task.key);
  if(attempt!==earlier.length+1||earlier.some(x=>x.state!=='failed_known'))throw Error('retry_requires_known_failure');
  const reserveNano=cost(task.model,task.inputCap,task.outputCap);const now=period(this.clock());
  const amount=x=>x.chargeNano;const all=[...this.#entries.values()];
  const total=xs=>xs.reduce((s,x)=>s+amount(x),0);
  if(total(earlier)+reserveNano>Math.min(a.maxNano,this.limits.jobNano))throw Error('job_budget');
  if(total(all.filter(x=>x.day===now.day||x.state==='reserved'||x.state==='unknown'))+reserveNano>this.limits.dailyNano)throw Error('daily_budget');
  if(total(all.filter(x=>x.month===now.month||x.state==='reserved'||x.state==='unknown'))+reserveNano>this.limits.monthlyNano)throw Error('monthly_budget');
  const row={id,key:task.key,model:task.model,inputCap:task.inputCap,outputCap:task.outputCap,...now,reserveNano,chargeNano:reserveNano,state:'reserved',lease:randomUUID()};
  this.#entries.set(id,row);return structuredClone(row);
 });}
 settle(reservation,{usage,quality=true,knownFailure=false}={}){return this.#atomic(()=>{
  const row=this.#entries.get(reservation.id);if(!row||row.lease!==reservation.lease)throw Error('lease_mismatch');
  if(row.state!=='reserved')return {state:row.state,idempotent:true};
  if(knownFailure){row.state='failed_known';return {state:row.state};} // Conservatively retain full worst-case debit, including retry cost.
  try {
   if(!usage)throw Error('missing_usage');integer(usage.input,0,POLICY.maxInput);integer(usage.output,0,POLICY.maxOutput);
   const actual=cost(row.model,usage.input,usage.output);
   if(usage.input>row.inputCap||usage.output>row.outputCap||actual>row.reserveNano)throw Error('usage_overrun');
   row.chargeNano=actual;row.state=quality?'settled':'quality_failed';
   // On a period transition retain a conservative extra worst-case hold; never silently reset spend.
   if(period(this.clock()).day!==row.day){row.chargeNano=row.reserveNano;row.state='unknown';this.#healthy=false;}
  }catch{row.state='unknown';this.#healthy=false;}
  return {state:row.state,chargeNano:row.chargeNano};
 });}
 reconcileWorstCase(actor){return this.#atomic(()=>{this.#admin(actor);const now=period(this.clock());for(const row of this.#entries.values())if(row.state==='unknown'){row.state='failed_known';row.day=now.day;row.month=now.month;}this.#healthy=true;});}
 halt(){return this.#atomic(()=>{this.#healthy=false;});}
 snapshot(){return {simulationOnly:true,healthy:this.#healthy,limits:this.limits,rows:[...this.#entries.values()].map(({lease,...x})=>({...x})),totalNano:[...this.#entries.values()].reduce((s,x)=>s+x.chargeNano,0),liveCalls:0,actualUsd:0};}
}
export class MockCoordinator {
 #cache=new Map();#inflight=new Map();
 constructor({ledger=new MemoryLedger(),clock=()=>Date.now()}={}){this.ledger=ledger;this.clock=clock;this.mockCalls=0;}
 classify(raw){const task=prepare(raw);if(['classify','free_plan'].includes(task.kind))return {engine:'free_rules',task};if(['analysis','design','document','code'].includes(task.kind))return{engine:'claude_candidate',task,estimateNano:cost(task.model,task.inputCap,task.outputCap),status:'awaiting_approval'};return{engine:'work_manual_review',task,status:'unsupported_kind'};}
 async submit(raw,{attempt=1,outcome='ok'}={}){
  const route=this.classify(raw),{task}=route;const cached=this.#cache.get(task.key);
  if(cached&&cached.expires>this.clock())return{...structuredClone(cached.result),engine:'result_cache',cacheHit:true};
  if(this.#inflight.has(task.key))return this.#inflight.get(task.key);
  const work=this.#run(route,{attempt,outcome});this.#inflight.set(task.key,work);
  try{return await work;}finally{this.#inflight.delete(task.key);}
 }
 async #run({engine,task},{attempt,outcome}){
  if(engine==='work_manual_review')return{status:'awaiting_manual_review',engine};
  if(engine==='free_rules'){
   const r=executeFree({agent:'internal',kind:task.kind==='classify'?'requirements':'scope',instruction:task.brief});
   if(r.status!=='completed'||r.result.paid_calls!==0||r.result.execution_started!==false||(task.kind==='free_plan'&&JSON.stringify(r.result.plan.steps)!==JSON.stringify(PLAN_STEPS)))throw Error('free_result_invalid');
   const result={engine,status:'completed',result:r.result,estimateNano:0,liveCalls:0};this.#cache.set(task.key,{expires:this.clock()+300000,result});return result;
  }
  const reservation=await this.ledger.reserve(task,attempt);this.mockCalls++;
  const settle=async data=>{try{return await this.ledger.settle(reservation,data);}catch{await this.ledger.halt();throw Error('ledger_write_failed_halted');}};
  if(outcome==='known_failure'){await settle({knownFailure:true});return{engine:'claude_mock',status:'failed_known',retryAutomatic:false};}
  if(outcome==='timeout'||outcome==='usage_missing'){await settle({});return{engine:'claude_mock',status:'halted_unknown_usage',retryAutomatic:false};}
  const result=outcome==='bad_quality'?{summary:''}:{summary:'합성 요구사항 검토 초안',checklist:['입력 범위 확인','관리자 결과 검토'],requiresReview:true,productionCompleted:false};
  const usage={input:Math.min(512,task.inputCap),output:128};const quality=validateResult(result);
  const settlement=await settle({usage,quality});
  if(settlement.state==='unknown')return{engine:'claude_mock',status:'halted_unknown_usage'};
  const response={engine:'claude_mock',status:quality?'completed':'quality_failed',result,usage,estimateNano:reservation.reserveNano,simulatedNano:settlement.chargeNano,liveCalls:0,reviewRequired:true};
  if(quality)this.#cache.set(task.key,{expires:this.clock()+300000,result:response});return response;
 }
 async executeLive(){throw Error('live_adapter_absent_key_unverified_paid_execution_forbidden');}
}
