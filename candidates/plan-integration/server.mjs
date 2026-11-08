// NON-DEPLOYABLE simulation boundary. No network, secret reader, timers or production adapter.
import {createHash} from 'node:crypto';
import {MockCoordinator,MemoryLedger,prepare} from '../cost-control/engine.mjs';
import {PLAN_STEPS,validateInstruction} from '../../supabase/functions/nexus-orchestrator/engine.mjs';
const digest=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
export class SyntheticRepository {
 #apps=new Map();#approvals=new Map();#results=new Map();#holds=new Set();#queue=Promise.resolve();
 constructor(applications){for(const a of applications){if(a.synthetic!==true||!a.id||!a.revision||!a.tenant)throw Error('synthetic_fixture_required');this.#apps.set(a.id,structuredClone(a));}}
 application(id){const a=this.#apps.get(id);if(!a)throw Error('not_found');return structuredClone(a);}
 approveFixture(id){const a=this.application(id);this.#approvals.set(id,digest(a));}
 approved(a){return this.#approvals.get(a.id)===digest(a);}
 atomic(fn){const p=this.#queue.then(fn);this.#queue=p.catch(()=>{});return p;}
 read(id){return structuredClone(this.#results.get(id)??null);}
 held(id){return this.#holds.has(id);}
 hold(id){this.#holds.add(id);}
 save(id,result){if(this.#results.has(id))throw Error('already_created');this.#results.set(id,structuredClone(result));return this.read(id);}
 fingerprint(){return digest([...this.#apps.values()]);}
}
export class PlanIntegration {
 constructor({repository,simulationOnly,clock=()=>Date.now(),ledger}={}){
  if(simulationOnly!==true||!(repository instanceof SyntheticRepository))throw Error('isolated_fixture_only');
  this.repo=repository;this.clock=clock;
  this.coordinator=new MockCoordinator({clock,ledger:ledger??new MemoryLedger({clock,monthlyNano:1_000_000_000,dailyNano:1_000_000,jobNano:1_000_000})});
 }
 task(a){return {tenant:a.tenant,revision:a.id+':'+a.revision,kind:'analysis',brief:validateInstruction(a.brief),language:'ko'};}
 // Fixture-only approval helper; never exposed through HTTP. Real administrator/budget RPC wiring is pending.
 approveAiFixture(id){const a=this.repo.application(id);if(!this.repo.approved(a))throw Error('plan_approval_required');this.coordinator.ledger.approve(prepare(this.task(a)),{actor:{id:'fixture-admin',syntheticAdmin:true},attempts:1,maxNano:1_000_000});}
 generate(id,{ai=false,outcome='ok'}={}){return this.repo.atomic(async()=>{
  const a=this.repo.application(id);if(!this.repo.approved(a))throw Error('plan_approval_required');
  if(this.repo.held(id))throw Error('manual_review_required');
  const previous=this.repo.read(id);if(previous)return {...previous,reused:true};
  // Do not silently add AI to a previously generated rules plan or replace existing records.
  if(a.existingPlan||a.existingJobs){throw Error('existing_records_require_review');}
  let annotation=null;
  if(ai){
   try{annotation=await this.coordinator.submit(this.task(a),{outcome});}
   catch(e){if(e.message==='approval_required')throw Error('ai_approval_required');this.repo.hold(id);throw Error('ai_budget_or_accounting_blocked');}
   if(annotation.status!=='completed'){this.repo.hold(id);throw Error('ai_failed_manual_review');}
  }
  const draft=await this.coordinator.submit({tenant:a.tenant,revision:a.id+':'+a.revision,kind:'free_plan',brief:a.brief,language:'ko'});
  const plan=draft.result.plan;
  if(JSON.stringify(plan.steps)!==JSON.stringify(PLAN_STEPS)||plan.execution_started!==false||plan.external_execution!=='requires_separate_approval')throw Error('unsafe_plan');
  return this.repo.save(id,{simulationOnly:true,applicationId:id,planId:'sim-plan-'+id,jobId:'sim-job-'+id,
   status:'awaiting_approval',plan,annotation,productionStarted:false,deliveryStarted:false,actualProviderCalls:0,reused:false});
 });}
 async executeLive(){throw Error('live_transport_not_bound_paid_calls_forbidden');}
}
// Trusted authentication callback is injected only by the synthetic harness, never trusted from body/user_metadata.
export function createSimulationHandler({integration,authenticate}){
 return async req=>{
  const reply=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
  try{
   const actor=await authenticate(req);if(!actor?.id)return reply({error:'login_required'},401);
   if(actor.admin!==true)return reply({error:'admin_required'},403);
   if(req.method==='GET')return reply({simulationOnly:true,liveEnabled:false,productionEnabled:false});
   if(req.method!=='POST')return reply({error:'method_denied'},405);
   // Deliberately bounded buffered simulation input, not a production streaming parser.
   const text=await req.text();if(text.length>4096)return reply({error:'body_limit'},413);
   const body=JSON.parse(text);
   if(!body||Object.keys(body).some(k=>!['applicationId','mode'].includes(k))||!['rules','claude_mock'].includes(body.mode))return reply({error:'invalid_request'},400);
   const a=integration.repo.application(body.applicationId);if(a.tenant!==actor.tenant)return reply({error:'scope_denied'},403);
   const result=await integration.generate(a.id,{ai:body.mode==='claude_mock'});
   // Return plan structure only. No customer brief, annotation content, session, token or provider error body.
   return reply({simulationOnly:true,applicationId:result.applicationId,planId:result.planId,jobId:result.jobId,steps:result.plan.steps,status:result.status,reused:result.reused,productionStarted:false,actualProviderCalls:0});
  }catch{return reply({error:'simulation_stopped_no_retry'},409);}
 };
}
