// Candidate only. No operational writes, workers, RPCs, or notification paths.
export const SOURCES=Object.freeze({
 applications:'id,status,created_at', ai_work_plans:'id,application_id,created_at',
 orchestrator_jobs:'id,application_id,free_plan_id,status,created_at',
 orchestrator_tasks:'id,job_id,status,attempts,next_attempt_at,error_code',
 production_jobs:'id,application_id,status,payment_observed_at,production_approved_at,quote_acceptance_id',
 solq_quote_acceptances:'id,application_id,accepted_at,recorded_at',
 orchestrator_events:'id,event,code,created_at', production_events:'id,event,created_at',
 solq_free_plan_runs:'application_id,status,attempts,next_attempt_at,error_code'
});
export const fail=(code)=>Object.assign(new Error(code),{code});
export function errorCode(error){return ['AUTH','FORBIDDEN','TIMEOUT','OFFLINE','PARTIAL','CONFLICT','UNAPPROVED'].includes(error?.code)?error.code:'QUERY_FAILED'}
export function guardedFetch(base,fetcher=fetch){return async(input,init={})=>{
 const r=typeof input==='string'?input:input.url, u=new URL(r), method=(init.method||input.method||'GET').toUpperCase();
 if(u.origin!==new URL(base).origin)throw fail('FORBIDDEN');
 const table=u.pathname.match(/^\/rest\/v1\/([a-z_]+)$/)?.[1];
 const auth=(method==='GET'&&u.pathname==='/auth/v1/user')||(method==='POST'&&u.pathname==='/auth/v1/token'&&u.search==='?grant_type=password')||(method==='POST'&&u.pathname==='/auth/v1/logout');
 const read=method==='GET'&&(Object.hasOwn(SOURCES,table||'')||['admin_users','solq_control_writers','solq_control_reviews'].includes(table));
 const review=method==='POST'&&table==='solq_control_reviews';
 if(!auth&&!read&&!review)throw fail('FORBIDDEN');
 const signals=[AbortSignal.timeout(12000),init.signal].filter(Boolean);
 return fetcher(input,{...init,signal:AbortSignal.any(signals),cache:'no-store',redirect:'error',referrerPolicy:'no-referrer'});
}}
export class AdminGate{
 constructor(db,clock=()=>Date.now()){this.db=db;this.clock=clock;this.deadline=0;this.user=null;}
 clear(){this.user=null;this.deadline=0;}
 async verify(){
  if(this.deadline&&this.deadline<=this.clock())throw fail('AUTH');
  const {data:sd,error:se}=await this.db.auth.getSession();const session=sd?.session;
  if(se||!session||!Number.isFinite(session.expires_at)||session.expires_at*1000<=this.clock())throw fail('AUTH');
  const {data,error}=await this.db.auth.getUser();if(error||!data?.user||data.user.id!==session.user?.id)throw fail('AUTH');
  const {data:member,error:me}=await this.db.from('admin_users').select('user_id').eq('user_id',data.user.id).maybeSingle();
  if(me||!member||member.user_id!==data.user.id)throw fail('FORBIDDEN');
  if(session.expires_at*1000<=this.clock())throw fail('AUTH');
  this.deadline=session.expires_at*1000;this.user=data.user;return data.user;
 }
 async writer(){const user=await this.verify();const {data,error}=await this.db.from('solq_control_writers').select('user_id').eq('user_id',user.id).maybeSingle();if(error||data?.user_id!==user.id)throw fail('FORBIDDEN');return user;}
}
export class SupabaseReadAdapter{
 constructor(db){this.db=db;this.gate=new AdminGate(db);}
 verify(){return this.gate.verify()}
 async read(signal){
  const results={}; // Sequential bounds peak requests; one cycle is single-flight.
  for(const [table,columns] of Object.entries(SOURCES)){
   if(signal.aborted)throw fail('AUTH');
   const startedAt=new Date().toISOString();let query=this.db.from(table).select(columns,{count:'exact'}).limit(1000);if(table.endsWith('_events'))query=query.order('created_at',{ascending:false}).order('id',{ascending:false});const result=await query.abortSignal(signal);const resolvedAt=new Date().toISOString();
   if(result.error){if(['PGRST301','PGRST302','PGRST303'].includes(result.error.code))throw fail('AUTH');results[table]={ok:false,error:'QUERY_FAILED',source:'public.'+table,startedAt,resolvedAt};}
   else results[table]={ok:true,complete:result.count===result.data?.length,total:result.count,rows:result.data,source:'public.'+table,startedAt,resolvedAt};
  }
  return {sources:results,source:'Supabase Data API / RLS',at:new Date().toISOString()};
 }
 async reviews(){await this.gate.verify();const {data,error,count}=await this.db.from('solq_control_reviews').select('*',{count:'exact'}).order('id',{ascending:false}).limit(200);if(error)throw fail('QUERY_FAILED');await this.gate.verify();return {rows:data,total:count,complete:count===data.length};}
 async appendReview(record){const user=await this.gate.writer();validateReview(record);const {data,error}=await this.db.from('solq_control_reviews').insert({...record,actor_id:user.id}).select().single();if(error)throw fail(error.code==='23505'?'CONFLICT':'QUERY_FAILED');return data;}
}
export class PollController{
 constructor(adapter,{emit=()=>{},clock=()=>Date.now(),schedule=(fn,ms)=>setTimeout(fn,ms),cancel=id=>clearTimeout(id),online=()=>true,visible=()=>true}={}){Object.assign(this,{adapter,emit,clock,schedule,cancel,online,visible});this.epoch=0;this.busy=null;this.timer=null;this.automatic=false;this.failures=0;this.deadlineTimer=null;}
 clearTimer(){if(this.timer!==null)this.cancel(this.timer);this.timer=null;}
 stop(reason='LOCKED'){this.automatic=false;this.clearTimer();if(this.deadlineTimer!==null)this.cancel(this.deadlineTimer);this.deadlineTimer=null;this.epoch++;this.abort?.abort();this.emit({kind:reason,data:null});}
 start(){this.automatic=true;this.failures=0;return this.refresh();}
 async refresh(){
  if(this.busy)return this.busy;
  if(!this.online()){this.stop('OFFLINE');return;}
  if(!this.visible()){this.stop('HIDDEN');return;}
  this.clearTimer();const epoch=this.epoch;this.abort=new AbortController();
  this.busy=(async()=>{
   try{
    this.emit({kind:'LOADING',data:null});await this.adapter.verify();
    if(epoch!==this.epoch)return;
    const deadline=this.adapter.gate?.deadline;
    if(deadline){if(this.deadlineTimer!==null)this.cancel(this.deadlineTimer);this.deadlineTimer=this.schedule(()=>this.stop('AUTH'),Math.max(0,deadline-this.clock()));}
    const snapshot=await this.adapter.read(this.abort.signal);await this.adapter.verify();
    if(epoch!==this.epoch)return;
    if(!this.visible()||!this.online()){this.stop(!this.online()?'OFFLINE':'HIDDEN');return;}
    this.failures=0;this.lastSuccess=snapshot.at;this.emit({kind:'SUCCESS',data:snapshot});
   }catch(error){if(epoch!==this.epoch)return;this.failures++;const code=errorCode(error);this.emit({kind:code,data:null,lastSuccess:this.lastSuccess});if(['AUTH','FORBIDDEN'].includes(code)||this.failures>=3){this.stop(code);}}
   finally{this.busy=null;if(epoch===this.epoch&&this.automatic&&this.failures<3&&this.visible()&&this.online())this.timer=this.schedule(()=>this.refresh(),60000);}
  })();return this.busy;
 }
}
export function summarize(snapshot){
 const get=t=>snapshot.sources[t], full=t=>get(t)?.ok&&get(t).complete;
 const counts={};for(const t of Object.keys(SOURCES)){const v=get(t);counts[t]={total:v?.ok?v.total:null,complete:!!v?.complete,states:{}};if(full(t))for(const r of v.rows)if(r.status)counts[t].states[r.status]=(counts[t].states[r.status]||0)+1;}
 let anomalies=null;
 if(['applications','ai_work_plans','orchestrator_jobs'].every(full)){
  const apps=new Set(get('applications').rows.map(x=>x.id)),plans=new Map(get('ai_work_plans').rows.map(x=>[x.id,x])),jobs=get('orchestrator_jobs').rows;
  const groups=new Map();let missing=0,mismatch=0;
  for(const j of jobs){if(!j.application_id||!apps.has(j.application_id)||!j.free_plan_id||!plans.has(j.free_plan_id))missing++;else if(plans.get(j.free_plan_id).application_id!==j.application_id)mismatch++;if(j.application_id)groups.set(j.application_id,(groups.get(j.application_id)||0)+1);}
  anomalies={unlinkedJobs:missing,mismatchedJobs:mismatch,duplicateGroups:[...groups.values()].filter(n=>n>1).length,orphanPlans:[...plans.values()].filter(p=>!apps.has(p.application_id)).length};
 }
 return {counts,anomalies};
}
export function validateReview(r){
 if(!r||typeof r.task_id!=='string'||!r.task_id||!['CORE','AUTO','GUARD','SENTINEL','FIN','ATLAS'].includes(r.owner)||!['PASS','NO-GO','미확인'].includes(r.verdict)||!r.facts?.trim()||!r.next_action?.trim()||!Number.isInteger(r.revision)||r.revision<1||!Number.isFinite(Date.parse(r.checked_at))||!Array.isArray(r.evidence)||r.evidence.length>10)throw fail('INVALID_RECORD');
 for(const x of r.evidence){let u;try{u=new URL(x)}catch{throw fail('INVALID_RECORD')}if(u.protocol!=='https:'||u.username||u.password)throw fail('INVALID_RECORD');}
 if(r.verdict==='PASS'&&!r.evidence.length)throw fail('EVIDENCE_REQUIRED');
}
export function localArchive(storage,key='solq-control-local-review-v1'){
 // Reads original bytes; never migrates, removes, or overwrites the legacy key.
 const raw=storage.getItem(key);if(raw===null)return {raw:null,notes:{},logs:[]};
 try{const v=JSON.parse(raw);if(!v||typeof v.notes!=='object'||!v.notes||!Array.isArray(v.logs))throw fail('INVALID_ARCHIVE');return {raw,notes:v.notes,logs:v.logs};}catch{throw fail('INVALID_ARCHIVE');}
}
