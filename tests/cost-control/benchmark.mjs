import {performance} from 'node:perf_hooks';import {writeFileSync} from 'node:fs';
import {MockCoordinator,MemoryLedger,prepare,cost,usd} from '../../candidates/cost-control/engine.mjs';
const clock=()=>Date.parse('2026-10-28T00:00:00Z');const actor={id:'synthetic-reviewer',syntheticAdmin:true};
const r=(kind,brief)=>({tenant:'synthetic-benchmark',revision:'v1',kind,brief,language:'ko'});
const ai=r('analysis','가상 매장의 문의 유형과 자동화 범위를 분석');const design=r('design','가상 매장의 입력·결과 화면 자동화 설계');
const tasks=[r('classify','홈페이지 문의 유형 분류'),r('free_plan','홈페이지 무료 6단계 계획'),ai,ai,design,design];
async function measure(mode){const samples=[];let last;
 for(let n=0;n<30;n++){
  const ledger=new MemoryLedger({clock});const c=new MockCoordinator({ledger,clock});const approvals=new Set();let complete=0,blocked=0,cacheHits=0;
  const started=performance.now();
  for(const raw of tasks){const route=c.classify(raw);if(mode==='C'&&route.engine==='claude_candidate'&&!approvals.has(route.task.key)){ledger.approve(route.task,{actor,allowUpgrade:true});approvals.add(route.task.key);}
   try{const result=await c.submit(raw);if(result.status==='completed')complete++;if(result.cacheHit)cacheHits++;}catch(e){if(e.message==='approval_required')blocked++;else throw e;}
  }
  samples.push(performance.now()-started);
  last={inputTasks:tasks.length,uniqueTasks:4,completed:complete,policyBlocked:blocked,manualReviewRequiredUnique:2,observedHumanActions:0,simulatedApprovalEvents:approvals.size,cacheHits,simulatedCalls:c.mockCalls,automaticRetries:0,runtimeErrors:0,metadataQualityPassed:complete,metadataQualityDenominator:complete,simulatedNano:ledger.snapshot().totalNano,actualProviderCalls:0,actualUsd:0};
 }
 samples.sort((a,b)=>a-b);return {...last,localMs:{median:samples[15],p95:samples[28],min:samples[0],samples:30},scope:'local fixture computation only; excludes model/network/human latency; no real semantic-quality evaluation'};
}
const nano=(h,s)=>h*cost('claude-haiku-5-5',2000,512)+s*cost('claude-sonnet-5-5',4000,1000);
const report={generatedUtc:new Date().toISOString(),environment:{node:process.version,host:'Work scratch isolated local process, no network used'},sameSyntheticTaskCount:6,A:{status:'unverified',reason:'No Work telemetry or same-task historical baseline; no additional Work session was created',localMs:null,workUsage:null,humanActions:null,tokens:null,qualityRate:null},B:await measure('B'),C:await measure('C'),uniqueAIPlanningCaps:[ai,design].map(raw=>{const t=prepare(raw);return{kind:t.kind,model:t.model,inputTokenPlanningBound:t.inputCap,outputTokenLimit:t.outputCap,estimatedMaxUsd:usd(cost(t.model,t.inputCap,t.outputCap)),tokenizerVerified:false};}),monthlyScenarios:[{haiku:1000,sonnet:0},{haiku:5000,sonnet:100},{haiku:0,sonnet:1000}].map(x=>({...x,estimatedUsd:usd(nano(x.haiku,x.sonnet)),withinPlannedFiveDollarCap:nano(x.haiku,x.sonnet)<=5e9,minDaysAtHalfDollarCap:Math.ceil(nano(x.haiku,x.sonnet)/5e8)})),scenarioAssumptions:'All input incl system overhead: Haiku2000/output512; Sonnet4000/output1000; no cache/batch savings, retries, tools, tax or FX included. Planning only; not permission to spend.',workUsageReduction:'unverified',realClaudeLatency:'unverified',realClaudeQuality:'unverified',actualProviderCalls:0,actualUsd:0};
writeFileSync(new URL('./comparison.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
