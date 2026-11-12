import {validateArtifact} from '../../../supabase/functions/nexus-production/artifact.mjs';
import {buildPrompt} from '../../../core/providers.mjs';

export const WORKER_BOUNDARY=Object.freeze({liveEnabled:false,paidEnabled:false,externalExecution:false,provider:'synthetic',automaticPublicDeployment:false});
const allowedRequest=new Set(['actorId','applicationId','idempotencyKey','kind','message','scopeTags','contractRevision','expectedPreviewVersion']);
const err=code=>Object.assign(new Error(code),{code});
const clone=x=>structuredClone(x);
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeText=s=>typeof s==='string'&&s.trim().length>0&&s.length<=4000;
const integer=n=>Number.isSafeInteger(n)&&n>=0;
const canonical=x=>JSON.stringify({applicationId:x.applicationId,kind:x.kind,message:x.message,scopeTags:[...x.scopeTags].sort(),contractRevision:x.contractRevision,expectedPreviewVersion:x.expectedPreviewVersion});

// Isolated, single-process in-memory server authority. This is not a live auth service.
export function classifyRevision(message){
 const text=String(message||'').normalize('NFKC').trim();
 // Client-supplied scope tags never authorize capability changes. This small
 // deterministic candidate only accepts a bounded set of passive editing intents.
 if(/결제|로그인|회원|인증|예약|API|연동|추가\s*페이지|페이지\s*추가|새\s*페이지|기능|데이터|수집|발송|문자|이메일|메시지|스크립트|javascript|script|실행|배포|삭제|예산|계약|환불|재고|회계|정산|자동화/i.test(text))return {allowed:false,code:'OUT_OF_SCOPE'};
 if(!/(색상|색깔|글자색|배경색|여백|간격|문구|제목|폰트|글꼴|글자\s*크기|텍스트)/.test(text)||!/(수정|변경|조정|교체|바꿔|바꾸|늘려|줄여|맞춰|해\s*줘|해\s*주세요)/.test(text))return {allowed:false,code:'SCOPE_REVIEW_REQUIRED'};
 let rest=text.replace(/["“][^"”]{0,120}["”]|'[^']{0,120}'/g,'');
 rest=rest.replace(/#[a-f0-9]{3,8}|\d+(?:\.\d+)?\s*(?:px|rem|em|%)/gi,'');
 rest=rest.replace(/홈페이지|미리보기|시안|소제목|본문|문구|텍스트|제목|글자색|배경색|색상|색깔|글자|배경|여백|간격|폰트|글꼴|크기|스타일|초록색|녹색|빨간색|파란색|흰색|검은색|회색|노란색|베이지색|작게|크게|조금|단순히|간단히|변경|수정|조정|교체|바꾸어|바꿔|바꾸|늘려|줄여|맞춰|해주세요|해주셔요|주세요|부탁드려요|부탁합니다|해줘|해\s*주세요|해\s*줘|으로|에서|만|을|를|은|는|이|가|의|로|에|더|좀/g,'');
 rest=rest.replace(/[\s.,!?~:;()·-]/g,'');
 return rest?{allowed:false,code:'SCOPE_REVIEW_REQUIRED'}:{allowed:true,code:'PASSIVE_EDIT_ONLY'};
}

export function createSyntheticWorker(seedContracts=[],{adminIds=[],clock=()=>Date.now(),providerFailureCount=0}={}){
 const admins=new Set(adminIds),contracts=new Map(),jobs=new Map(),keys=new Map(),versions=new Map(),events=[];
 let sequence=0,artifactSeq=0,tail=Promise.resolve(),failureBudget=providerFailureCount;
 const atomic=fn=>{const next=tail.then(fn);tail=next.catch(()=>{});return next;};
 const audit=(type,data)=>{events.push({id:events.length+1,type,...data,at:new Date(clock()).toISOString(),synthetic:true});};
 for(const raw of seedContracts){
  if(!raw.applicationId||!raw.ownerId||!raw.customerId||contracts.has(raw.applicationId))throw err('INVALID_AUTHORITY');
  const c={contractRevision:1,revisionLimit:1,budgetMicroUsd:20000,unitCeilingMicroUsd:5000,maxAttempts:2,scopeTags:['landing','text','style'],spentMicroUsd:0,reservedMicroUsd:0,revisionsUsed:0,...clone(raw)};
  if(![c.contractRevision,c.revisionLimit,c.budgetMicroUsd,c.unitCeilingMicroUsd,c.maxAttempts,c.spentMicroUsd,c.reservedMicroUsd,c.revisionsUsed].every(integer)||c.contractRevision<1||c.maxAttempts<1||!Array.isArray(c.scopeTags)||c.unitCeilingMicroUsd<1||c.maxAttempts>5)throw err('INVALID_AUTHORITY');
  contracts.set(c.applicationId,c);
 }
 function own(actor,application){const c=contracts.get(application);if(!c||c.ownerId!==actor)throw err('NOT_FOUND');return c;}
 function gate(c){
  if(!c.quoteAcceptedAt)throw err('QUOTE_CONSENT_REQUIRED');
  if(!c.depositConfirmedAt||!admins.has(c.depositConfirmedBy))throw err('DEPOSIT_NOT_CONFIRMED');
  if(!c.productionApprovedAt||!admins.has(c.productionApprovedBy))throw err('PRODUCTION_NOT_APPROVED');
  if(c.cancelled===true)throw err('CONTRACT_CANCELLED');
 }
 function authorizeScope(c,input){
  if(!Array.isArray(input.scopeTags)||!input.scopeTags.length||input.scopeTags.some(x=>!c.scopeTags.includes(x)))throw err('OUT_OF_SCOPE');
  if(input.contractRevision!==undefined&&input.contractRevision!==c.contractRevision)throw err('CONTRACT_CHANGED');
 }
 async function request(input){return atomic(()=>{
  if(!input||Object.keys(input).some(k=>!allowedRequest.has(k))||!safeText(input.message)||!['initial','revision'].includes(input.kind)||typeof input.idempotencyKey!=='string'||!/^[A-Za-z0-9_-]{8,100}$/.test(input.idempotencyKey))throw err('INVALID_REQUEST');
  const c=own(input.actorId,input.applicationId);authorizeScope(c,input);
  const fingerprint=canonical({...input,contractRevision:c.contractRevision});
  const scopedKey=c.applicationId+'|'+input.idempotencyKey;
  if(keys.has(scopedKey)){const previous=jobs.get(keys.get(scopedKey));if(previous.fingerprint!==fingerprint)throw err('IDEMPOTENCY_CONFLICT');return publicJob(previous);}
  if(input.kind==='revision'){const classification=classifyRevision(input.message);if(!classification.allowed)throw err(classification.code);}
  if(input.kind==='revision'&&input.expectedPreviewVersion!==undefined&&input.expectedPreviewVersion!==(versions.get(c.applicationId)?.length||0))throw err('PREVIEW_VERSION_CHANGED');
  if(input.kind==='revision'&&c.revisionsUsed>=c.revisionLimit)throw err('REVISION_LIMIT');
  if(input.kind==='revision'&&!(versions.get(c.applicationId)?.length))throw err('REVISION_BEFORE_PREVIEW');
  if(input.kind==='initial'&&[...jobs.values()].some(j=>j.applicationId===c.applicationId&&j.kind==='initial'))throw err('INITIAL_ALREADY_EXISTS');
  const job={id:'SYNTHETIC-JOB-'+(++sequence),applicationId:c.applicationId,customerId:c.customerId,ownerId:c.ownerId,kind:input.kind,message:input.message,scopeTags:[...input.scopeTags],contractRevision:c.contractRevision,parentPreviewVersion:versions.get(c.applicationId)?.length||0,fingerprint,idempotencyKey:input.idempotencyKey,status:'queued',attempts:0,errorCode:null,nextAttemptAt:null,createdAt:new Date(clock()).toISOString(),synthetic:true};
  // Draft queueing is permitted before the two manual gates; execution is not.
  if(input.kind==='revision')c.revisionsUsed++;
  jobs.set(job.id,job);keys.set(scopedKey,job.id);audit('request_queued',{applicationId:c.applicationId,jobId:job.id,actorId:input.actorId});return publicJob(job);
 });}
 function publicJob(job){const {message,fingerprint,ownerId,...value}=job;return clone(value);}
 async function tick({jobId}={}){
  const claimed=await atomic(()=>{
   const j=jobs.get(jobId);if(!j)throw err('NOT_FOUND');
   if(['completed','running','blocked','failed'].includes(j.status))return {skip:true,job:publicJob(j)};
   if(j.nextAttemptAt&&clock()<Date.parse(j.nextAttemptAt))return {skip:true,job:publicJob(j)};
   const c=contracts.get(j.applicationId);
   try{gate(c);authorizeScope(c,j);if(j.contractRevision!==c.contractRevision)throw err('CONTRACT_CHANGED');if(j.kind==='revision'&&(versions.get(c.applicationId)?.length||0)!==j.parentPreviewVersion)throw err('PREVIEW_VERSION_CHANGED');if(j.attempts>=c.maxAttempts)throw err('ATTEMPT_LIMIT');if(c.spentMicroUsd+c.reservedMicroUsd+c.unitCeilingMicroUsd>c.budgetMicroUsd)throw err('BUDGET_LIMIT');}
   catch(error){j.status=['DEPOSIT_NOT_CONFIRMED','PRODUCTION_NOT_APPROVED','QUOTE_CONSENT_REQUIRED'].includes(error.code)?'awaiting_approval':'blocked';j.errorCode=error.code;audit('claim_blocked',{applicationId:c.applicationId,jobId:j.id,code:error.code});return {skip:true,job:publicJob(j)};}
   c.reservedMicroUsd+=c.unitCeilingMicroUsd;j.status='running';j.attempts++;j.errorCode=null;j.nextAttemptAt=null;j.lease='SYNTHETIC-LEASE-'+j.id+'-'+j.attempts;audit('attempt_reserved',{applicationId:c.applicationId,jobId:j.id,reservedMicroUsd:c.unitCeilingMicroUsd,attempt:j.attempts});return {job:clone(j),reservation:c.unitCeilingMicroUsd};
  });
  if(claimed.skip)return {executionStarted:false,job:claimed.job,boundary:WORKER_BOUNDARY};
  let result,validation,error;
  try{
   // Reuse existing prompt format and validation, never invoke the existing paid provider.
   buildPrompt({plan:{requirements:claimed.job.message,scopeTags:claimed.job.scopeTags,untrusted_customer_data:true}});
   if(failureBudget>0){failureBudget--;throw err('SYNTHETIC_PROVIDER_FAILURE');}
   result={summary:'합성 제작 워커의 격리 시안 · 실제 AI 호출 없음',files:[{path:'index.html',content:'<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SOLQ 합성 시안</title><style>body{margin:0;background:#f4f7f3;color:#18382e;font:16px/1.8 system-ui}main{max-width:760px;margin:auto;padding:48px 24px}small{color:#627c6f}h1{font-size:38px;line-height:1.3}section{background:white;border:1px solid #d9e5dc;border-radius:14px;padding:24px;margin:24px 0}</style></head><body><main><small>SOLQ / 격리 제작 시안</small><h1>요청하신 홈페이지의 첫 구조</h1><p>아래 내용은 합성 시안입니다. 계약·납품 완료를 의미하지 않습니다.</p><section><h2>고객이 요청한 방향</h2><p>'+escape(claimed.job.message)+'</p></section><section><h2>다음 검토</h2><p>문구·페이지 구성·모바일 배치를 확인하고 승인 범위 안에서 수정 요청을 남겨 주세요.</p></section></main></body></html>'}]};
   validation=await validateArtifact(result);
  }catch(e){error=e.code||'INVALID_ARTIFACT';}
  return atomic(()=>{
   const j=jobs.get(claimed.job.id),c=contracts.get(j.applicationId);
   if(j.lease!==claimed.job.lease||j.status!=='running')throw err('STALE_COMPLETION');
   c.reservedMicroUsd-=claimed.reservation;
   // Consume reserved worst-case budget on failed/uncertain attempt as well: no free repeated inference.
   c.spentMicroUsd+=claimed.reservation;
   if(error){j.status=j.attempts<c.maxAttempts?'retry_wait':'failed';j.errorCode=error;j.nextAttemptAt=j.status==='retry_wait'?new Date(clock()+30000*j.attempts).toISOString():null;audit('attempt_failed',{applicationId:c.applicationId,jobId:j.id,code:error,attempt:j.attempts});return {executionStarted:true,job:publicJob(j),boundary:WORKER_BOUNDARY};}
   // Revalidate gate before making any generated result visible.
   try{gate(c);if(j.contractRevision!==c.contractRevision)throw err('CONTRACT_CHANGED');if(j.kind==='revision'&&(versions.get(c.applicationId)?.length||0)!==j.parentPreviewVersion)throw err('PREVIEW_VERSION_CHANGED');}
   catch(e){j.status='blocked';j.errorCode=e.code;audit('artifact_withheld',{applicationId:c.applicationId,jobId:j.id,code:e.code});return {executionStarted:true,job:publicJob(j),boundary:WORKER_BOUNDARY};}
   const list=versions.get(c.applicationId)||[];const version={id:'SYNTHETIC-PREVIEW-'+(++artifactSeq),version:list.length+1,applicationId:c.applicationId,customerId:c.customerId,jobId:j.id,createdAt:new Date(clock()).toISOString(),validation,artifact:result,synthetic:true,publication:'private_candidate_only'};list.push(version);versions.set(c.applicationId,list);j.status='completed';j.previewVersion=version.version;audit('preview_version_created',{applicationId:c.applicationId,jobId:j.id,version:version.version});return {executionStarted:true,job:publicJob(j),version:clone(version),boundary:WORKER_BOUNDARY};
  });
 }
 async function snapshot({actorId,applicationId}){return atomic(()=>{const c=own(actorId,applicationId);return {applicationId,customerId:c.customerId,contract:{scopeTags:clone(c.scopeTags),revisionLimit:c.revisionLimit,revisionsUsed:c.revisionsUsed,contractRevision:c.contractRevision,quoteAccepted:!!c.quoteAcceptedAt,depositConfirmed:!!c.depositConfirmedAt,productionApproved:!!c.productionApprovedAt},cost:{budgetMicroUsd:c.budgetMicroUsd,spentMicroUsd:c.spentMicroUsd,reservedMicroUsd:c.reservedMicroUsd,actualPaidUsd:0,costBasis:'synthetic reservation only; not actual provider invoice'},jobs:[...jobs.values()].filter(j=>j.applicationId===applicationId).map(publicJob),versions:clone(versions.get(applicationId)||[]),events:clone(events.filter(e=>e.applicationId===applicationId)),boundary:WORKER_BOUNDARY};});}
 async function fixtureAdminConfirm({actorId,applicationId,kind}){return atomic(()=>{if(!admins.has(actorId))throw err('ADMIN_REQUIRED');const c=contracts.get(applicationId);if(!c)throw err('NOT_FOUND');const at=new Date(clock()).toISOString();if(kind==='deposit'){c.depositConfirmedAt=at;c.depositConfirmedBy=actorId;}else if(kind==='production'){if(!c.depositConfirmedAt||!c.quoteAcceptedAt)throw err('PREREQUISITES_REQUIRED');c.productionApprovedAt=at;c.productionApprovedBy=actorId;}else throw err('INVALID_REQUEST');audit('fixture_admin_'+kind,{applicationId,actorId});return {confirmed:true,synthetic:true};});}
 return Object.freeze({request,tick,snapshot,fixtureAdminConfirm,boundary:WORKER_BOUNDARY});
}
