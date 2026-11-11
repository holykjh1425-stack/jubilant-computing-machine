// Synthetic QA only. Never included in the production candidate page.
import {fail} from './ops-core.mjs';
export function createFixtureAdapter(){
 let scenario='admin';let reviews=[],reads=0,active=0,maxActive=0;
 const adapter={gate:{deadline:Date.now()+3600000,clear(){}},setScenario(value){scenario=value;},stats(){return {reads,maxActive}},
 async verify(){if(scenario==='nonadmin')throw fail('FORBIDDEN');if(scenario==='expired')throw fail('AUTH');return {id:'11111111-1111-4111-8111-111111111111'}},
 async read(){reads++;active++;maxActive=Math.max(maxActive,active);try{if(scenario==='failure')throw fail('QUERY_FAILED');const definitions={
 applications:[{id:'SYNTHETIC-A',status:'received'},{id:'SYNTHETIC-B',status:'reviewing'}],
 ai_work_plans:[{id:'PLAN-A',application_id:'SYNTHETIC-A'}],
 orchestrator_jobs:[{id:'JOB-A',application_id:'SYNTHETIC-A',free_plan_id:'PLAN-A',status:'awaiting_approval'},{id:'JOB-B',application_id:null,free_plan_id:null,status:'failed'}],
 orchestrator_tasks:[{id:'TASK-A',job_id:'JOB-A',status:'failed',attempts:2,next_attempt_at:'2026-11-13T00:00:00Z',error_code:'SYNTHETIC_FAILURE'}],
 production_jobs:[{id:'PROD-A',application_id:'SYNTHETIC-A',status:'awaiting_deposit',payment_observed_at:null,production_approved_at:null,quote_acceptance_id:null}],
 solq_quote_acceptances:[],orchestrator_events:[{id:1,event:'SYNTHETIC_READONLY',code:'NO_EXTERNAL_EXECUTION',created_at:'2026-11-12T00:00:00Z'}],production_events:[],solq_free_plan_runs:[]};
 return {at:new Date().toISOString(),source:'격리 메모리 fixture · 고객 데이터 없음',sources:Object.fromEntries(Object.entries(definitions).map(([k,v])=>[k,scenario==='partial'&&k==='ai_work_plans'?{ok:false,error:'QUERY_FAILED',source:'fixture.'+k}:{ok:true,complete:true,total:v.length,rows:v,source:'fixture.'+k}]))};}finally{active--}},
 async reviews(){await adapter.verify();return {rows:reviews.slice().reverse(),total:reviews.length,complete:true}},async appendReview(r){await adapter.verify();const {validateReview}=await import('./ops-core.mjs');validateReview(r);if(reviews.some(x=>x.task_id===r.task_id&&x.revision>=r.revision))throw fail('CONFLICT');const row={...r,id:reviews.length+1,actor_id:'SYNTHETIC-ADMIN'};reviews.push(row);return row;}};
 return adapter;
}
