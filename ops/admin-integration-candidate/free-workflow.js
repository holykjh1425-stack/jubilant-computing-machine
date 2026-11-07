/* Read-only: customer automation belongs to the server worker. */
(function(root){'use strict';
function createFreeWorkflow({db,verifyAdmin}){
 async function read(table,column,id){const {data,error}=await db.from(table).select('*').eq(column,id).order('created_at',{ascending:true}).limit(2);if(error)throw Error('READ_'+table);if(data.length>1)throw Error('DUPLICATE_'+table);return data[0]||null;}
 async function snapshot(a){await verifyAdmin();const p=await read('ai_work_plans','application_id',a.id);if(!p)return {plan:null,job:null,tasks:[]};
 if(p.application_id!==a.id||p.plan?.application_id&&p.plan.application_id!==a.id)throw Error('PLAN_MISMATCH');
 const j=await read('orchestrator_jobs','application_id',a.id);
 if(!j)return {plan:p,job:null,tasks:[]};
 if(j.free_plan_id!==p.id||j.application_id!==a.id)throw Error('JOB_MISMATCH');
 const {data,error}=await db.from('orchestrator_tasks').select('kind,status,verified,result,error_code').eq('job_id',j.id).order('ordinal');if(error)throw Error('TASK_READ');return {plan:p,job:j,tasks:data};}
 return {snapshot};
}root.createFreeWorkflow=createFreeWorkflow;
})(typeof window==='undefined'?globalThis:window);
