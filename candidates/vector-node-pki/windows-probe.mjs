// NO live daemon access on import or default execution.
import {pathToFileURL}from'node:url';import{execFileSync}from'node:child_process';import{resolve,join,basename,dirname}from'node:path';
import{lstatSync,realpathSync,readFileSync,readdirSync,unlinkSync,writeFileSync}from'node:fs';import{createHash}from'node:crypto';import https from'node:https';
import{createReadProxy,unixUpstream}from'./proxy.mjs';import{makeCertificates}from'./certificates.mjs';
export function snapshot(docker){
 const call=args=>execFileSync(docker,['--context','desktop-linux',...args],{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:8000,maxBuffer:65536});
 const ids=call(['ps','-aq','--no-trunc']).trim().split(/\r?\n/).filter(Boolean).sort();
 if(ids.length!==14||ids.some(x=>!/^[a-f0-9]{64}$/.test(x)))throw Error('expected_14_containers');
 const format='{"Id":{{json .Id}},"Name":{{json .Name}},"Status":{{json .State.Status}},"StartedAt":{{json .State.StartedAt}},"Restarts":{{.RestartCount}},"RestartPolicy":{{json .HostConfig.RestartPolicy.Name}}}';
 const rows=call(['inspect','--format',format,...ids]).trim().split(/\r?\n/).map(JSON.parse).sort((a,b)=>a.Id.localeCompare(b.Id));
 if(rows.length!==14)throw Error('snapshot_mismatch');
 const vector=rows.find(x=>x.Name==='/supabase_vector_SOLQ-LOCAL-TEST');
 if(!vector||vector.Status!=='exited'||vector.RestartPolicy!=='no')throw Error('safe_vector_state_required');
 if(rows.filter(x=>x!==vector).some(x=>x.Status!=='running'))throw Error('other_13_running_required');
 return{count:rows.length,fingerprint:createHash('sha256').update(JSON.stringify(rows)).digest('hex')};
}
export async function approvedProbe({directory,nodeApproved=false,docker}){
 if(!nodeApproved||process.platform!=='win32')throw Error('WINDOWS_EXPLICIT_APPROVAL_REQUIRED');
 const dir=resolve(directory);if(dirname(dir).toLowerCase()!==resolve(process.env.LOCALAPPDATA??'').toLowerCase()||!/^SOLQVectorReadProbe-[a-f0-9-]{36}$/.test(basename(dir))||lstatSync(dir).isSymbolicLink()||realpathSync(dir).toLowerCase()!==dir.toLowerCase()||readFileSync(join(dir,'private-acl.marker'),'utf8')!=='OWNER_AND_SYSTEM_ONLY')throw Error('PRIVATE_RUN_DIRECTORY_REQUIRED');
 let proxy,result,tls;let before;
 try{
  tls=makeCertificates();before=snapshot(docker);
  // Fixed existing local pipe only. Never exposes the pipe or daemon TCP listener.
  const upstream=unixUpstream('\\\\.\\pipe\\dockerDesktopLinuxEngine');
  proxy=await createReadProxy({tls,upstream,allowedIds:[]});
  await new Promise((yes,no)=>{proxy.server.once('error',no);proxy.server.listen(19443,'127.0.0.1',yes);});
  const port=proxy.server.address().port;if(port===2375)throw Error('FORBIDDEN_PORT');
  const get=path=>new Promise((yes,no)=>{const req=https.request({hostname:'127.0.0.1',port,servername:'localhost',path,method:'GET',ca:tls.ca,cert:tls.clientCert,key:tls.clientKey,agent:false,rejectUnauthorized:true},res=>{let body='';res.on('data',x=>body+=x);res.on('end',()=>yes({status:res.statusCode,body}));});req.on('error',no);req.setTimeout(3000,()=>req.destroy());req.end();});
  const ping=await get('/_ping'),version=await get('/v1.52/version');if(ping.status!==200||ping.body!=='OK'||version.status!==200)throw Error('MTLS_READ_PROBE_FAILED');
  await proxy.close();proxy=null;const after=snapshot(docker);
  result={status:before.fingerprint===after.fingerprint?'READ_PROXY_PASS':'PRESERVATION_MISMATCH',daemonApi52Supported:true,mtlsReadProxy:true,scope:'ping/version only; no container logs',before,after,vectorRecovered:false,containersChangedByProbe:0,newDockerObjects:0,host2375Opened:false};
 }catch{result={status:'STOPPED_NO_RETRY',before:before??null,vectorRecovered:false,newDockerObjects:0};}
 finally{
  if(proxy){try{await proxy.close();}catch{}}
  for(const key of ['key','clientKey','otherKey'])tls?.[key]?.fill(0);
  // Best effort Buffer wipe; native TLS/KeyObject memory is reclaimed at process exit.
  // Delete only this newly created run's PKI; retain sanitized result. Never delete a container or firewall rule.
  for(const file of readdirSync(dir))if(/^(ca|server|client|other)\.(key|crt|csr|srl|ext)$/.test(file)){try{unlinkSync(join(dir,file));}catch{result={...result,cleanupIncomplete:true};}}
 }
 writeFileSync(join(dir,'result.json'),JSON.stringify(result,null,2)+'\n',{mode:0o600});return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 if(!process.argv.includes('--approved-local-read-proxy'))console.log('PREPARATION_ONLY: no Docker, certificate or listening socket access.');
 else{const i=process.argv.indexOf('--approved-local-read-proxy');try{const result=await approvedProbe({directory:process.argv[i+1],docker:process.argv[i+2],nodeApproved:true});console.log(JSON.stringify(result));if(result.status!=='READ_PROXY_PASS')process.exitCode=1;}catch{console.log('STOPPED: approval/platform/private-folder prerequisite failed; no retry.');process.exitCode=1;}}
}
