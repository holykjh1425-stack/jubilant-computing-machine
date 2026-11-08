import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFile} from 'node:fs/promises';
const code=await readFile(new URL('../ops/admin-integration-candidate/free-workflow.js',import.meta.url),'utf8');
function fixture({badPlan=false,badJob=false,duplicate=false}={}){
 const context={};vm.runInNewContext(code,context);const calls=[];
 const db={from(table){const q={select(){calls.push(table);return q},eq(){return q},order(){return q},limit(){return q},then(resolve){let data=table==='ai_work_plans'?[{id:'p1',application_id:badPlan?'other':'a1',plan:{application_id:'a1'}}]:table==='orchestrator_jobs'?[{id:'j1',application_id:'a1',free_plan_id:badJob?'other':'p1'}]:[];if(duplicate&&table==='orchestrator_jobs')data.push({...data[0],id:'j2'});resolve({data});}};return q;}};
 return {workflow:context.createFreeWorkflow({db,verifyAdmin:async()=>{}}),calls};
}
test('repeated administrator reads find server-linked jobs without mutation',async()=>{const {workflow,calls}=fixture();for(let i=0;i<5;i++){const r=await workflow.snapshot({id:'a1'});assert.equal(r.job.id,'j1');}assert.equal(calls.length,15);assert.deepEqual(Object.keys(workflow),['snapshot']);});
for(const [name,options,error] of [['cross customer plan',{badPlan:true},/PLAN_MISMATCH/],['cross plan job',{badJob:true},/JOB_MISMATCH/],['duplicate job',{duplicate:true},/DUPLICATE/]])test(name,async()=>{await assert.rejects(fixture(options).workflow.snapshot({id:'a1'}),error)});
const viewCode=await readFile(new URL('../ops/admin-integration-candidate/plan-view.js',import.meta.url),'utf8');
class Element{constructor(tag){this.tag=tag;this.children=[];this.style={};this.textContent='';}append(...nodes){this.children.push(...nodes)}replaceChildren(){this.children=[]}}
test('six stored detail titles, content, and statuses render independently from four engine tasks',()=>{
 const context={document:{createElement:tag=>new Element(tag)}};vm.runInNewContext(viewCode,context);
 const list=new Element('ol');const steps=['requirements','classification','scope','implementation','validation','human_review'];
 context.SOLQ_PLAN_VIEW.render(list,{plan:{plan:{steps,details:steps.map((kind,i)=>({title:'단계 '+(i+1),proposed_scope:'고객별 상세 '+i,...(i===5?{status:'awaiting_approval'}:{})}))}},tasks:steps.slice(0,4).map(kind=>({kind,status:'completed'}))});
 assert.equal(list.children.length,6);assert.equal(list.children[5].children[1].textContent,'상태: 관리자 검토 대기');
 for(let i=0;i<6;i++){assert.equal(list.children[i].children[0].textContent,(i+1)+'. 단계 '+(i+1));assert.ok(list.children[i].children[2].textContent.includes('고객별 상세 '+i))}
});
test('legacy missing details are identified instead of fabricated; text stays literal',()=>{
 const context={document:{createElement:tag=>new Element(tag)}};vm.runInNewContext(viewCode,context);const list=new Element('ol');
 context.SOLQ_PLAN_VIEW.render(list,{plan:{plan:{steps:['<img src=x onerror=alert(1)>','classification','scope','implementation','validation','human_review']}}});
 assert.equal(list.children[0].children[0].textContent,'1. <img src=x onerror=alert(1)>');assert.ok(list.children[0].children[2].textContent.includes('저장되어 있지 않습니다'));
});
