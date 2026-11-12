// Read-only adapter for existing worker snapshots. Never invokes tick/provider/deployment.
// authority must be loaded from existing trusted server contract/access validation records.
export function createWorkerCompletionReader({worker,readAuthority}={}){
 return async ({caseId,version,kind})=>{
  const a=await readAuthority({caseId,version});if(!a||a.caseId!==caseId||!a.ownerId||!a.applicationId)return null;
  const s=await worker.snapshot({actorId:a.ownerId,applicationId:a.applicationId});
  if(s.applicationId!==a.applicationId)return null;
  const v=s.versions.find(x=>x.version===version&&x.applicationId===a.applicationId);
  const j=v&&s.jobs.find(x=>x.id===v.jobId&&x.previewVersion===version&&x.applicationId===a.applicationId);
  if(!j||!v||!['initial','revision'].includes(j.kind)||j.contractRevision!==a.contractRevision)return null;
  const actualKind=j.kind==='initial'?'production_completed':'revision_completed';if(kind!==actualKind)return null;
  return {caseId,version,kind,status:j.status,validation:v.validation?.passed===true?'PASS':'NO-GO',accessValidated:a.accessValidated===true,
   quoteAccepted:s.contract.quoteAccepted===true&&a.quoteAccepted===true,depositConfirmed:s.contract.depositConfirmed===true&&a.depositConfirmed===true,
   productionApproved:s.contract.productionApproved===true&&a.productionApproved===true,cancelled:a.cancelled,
   depositConfirmedBy:a.depositConfirmedBy,productionApprovedBy:a.productionApprovedBy,contractRevision:a.contractRevision,
   revisionWithinScope:actualKind==='revision_completed'&&a.revisionWithinScope===true};
 };
}
export function createCompletionRecheck({readCompletion}={}){
 return async job=>{
  const e=await readCompletion({caseId:job.caseId,version:job.version,kind:job.kind});
  return !!e&&e.caseId===job.caseId&&e.version===job.version&&e.kind===job.kind&&e.contractRevision===job.contractRevision&&e.status==='completed'&&e.validation==='PASS'&&e.accessValidated===true&&e.quoteAccepted===true&&e.depositConfirmed===true&&e.productionApproved===true&&e.cancelled===false&&(job.kind!=='revision_completed'||e.revisionWithinScope===true);
 };
}
