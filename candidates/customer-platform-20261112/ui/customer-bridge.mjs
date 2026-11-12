// Approved-environment seam. No db client, Auth, schema or worker is started by importing this module.
import {createCustomerRepository} from '../security/customer-repository.mjs';
import {mountPassivePreview} from '../worker/preview.mjs';
const error=code=>Object.assign(new Error(code),{code});
export function createCustomerBridge({db,enabled=false}={}){
 const repository=createCustomerRepository({db,enabled});
 async function preview({caseId}){
  await repository.verify();const listing=await repository.listPreviews(caseId);const selected=listing.items.filter(x=>x.state==='validated').slice(0,3).sort((a,b)=>a.version-b.version);const versions=[];
  for(const row of selected){const files=await repository.readArtifact(caseId,row.version);for(const file of files){const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(file.content))),b=>b.toString(16).padStart(2,'0')).join('');if(digest!==file.sha256)throw error('ARTIFACT_HASH_MISMATCH');}versions.push({version:row.version,label:'검증된 정적 시안',artifact:{summary:row.validation_summary,files:files.map(x=>({path:x.path,content:x.content}))}});}
  await repository.verify();const requests=await repository.listRequests(caseId);return {status:requests.items[0]?.status||(!versions.length?'시안 준비 전':'시안 조회 성공'),versions,validationLabel:`시안 ${versions.length}개 / 전체 ${listing.total}개 중 최근 범위 · 파일 해시 확인 · 동적 기능 검증 아님`,mount:(frame,version)=>mountPassivePreview(frame,version.artifact)};
 }
 async function sendPrivate({caseId,message}){
  await repository.appendMessage(caseId,message);const listing=await repository.listPreviews(caseId);const latest=listing.items.filter(x=>x.state==='validated').reduce((max,x)=>Math.max(max,x.version),0);
  if(!latest)return {message:'인증된 내 신청에 메시지를 기록했습니다. 아직 수정할 시안이 없습니다.'};
  const request=await repository.requestRevision(caseId,{message,expectedVersion:latest});
  return {message:'수정 요청을 접수했습니다. 서버가 계약 범위·승인·비용 한도를 확인한 뒤 처리합니다. 요청 상태: '+request.status};
 }
 return Object.freeze({customer:repository,preview,sendPrivate,boundary:{enabled,paidProvider:false,publicDeployment:false}});
}
