// Separate real-environment CANDIDATE. Importing this module never opens a socket.
import https from 'node:https';import http from 'node:http';import {X509Certificate} from 'node:crypto';import {once} from 'node:events';
import {authorizeDockerRead} from './legacy-policy.ts';
export const VECTOR_API='1.52';
const ID=/^[a-f0-9]{64}$/;const api=v=>/^1\.[0-9]{2,3}$/.test(v??'')?Number(v.slice(2)):NaN;
export function route(method,target,ids,sessionSince){
 if(!Array.isArray(ids)||ids.some(x=>!ID.test(x))||new Set(ids).size!==ids.length||ids.length>4)return null;
 if(typeof target!=='string'||target.length>4096||/[\\#\u0000-\u0020\u007f]/.test(target)||target.includes('//')||target.includes('..'))return null;
 const version=/^\/v(1\.[0-9]{2,3})(?=\/)/.exec(target);if(version&&version[1]!==VECTOR_API)return null;
 const path=target.replace(/^\/v1\.[0-9]{2,3}(?=\/)/,'');
 if(['/_ping','/version'].includes(path)&&['GET','HEAD'].includes(method)&&(method!=='HEAD'||path==='/_ping'))return{path:path==='/_ping'?path:'/version',kind:path==='/_ping'?'ping':'version'};
 if(!ids.length)return null;
 const qIndex=path.indexOf('?'),p=qIndex<0?path:path.slice(0,qIndex),q=new URLSearchParams(qIndex<0?'':path.slice(qIndex+1));
 if([...q.keys()].length!==new Set(q.keys()).size)return null;
 if(p.endsWith('/logs')){
  const m=/^\/containers\/([a-f0-9]{64})\/logs$/.exec(p);if(method!=='GET'||!m||!ids.includes(m[1]))return null;
  if([...q.keys()].some(k=>!['follow','stdout','stderr','since','timestamps','tail','until','details'].includes(k)))return null;
  for(const k of ['follow','stdout','stderr','timestamps'])if(q.has(k)&&!['true','1'].includes(q.get(k)))return null;
  if(q.has('until')&&q.get('until')!=='0')return null;if(q.has('details')&&!['false','0'].includes(q.get('details')))return null;
  if(q.has('since')&&!/^[0-9]{1,12}$/.test(q.get('since')))return null;
  if(q.has('tail')&&q.get('tail')!=='all'&&!/^(?:[0-9]{1,3}|1000)$/.test(q.get('tail')))return null;
  const out=new URLSearchParams({follow:'true',stdout:'true',stderr:'true',timestamps:'true',since:String(Math.max(Number(q.get('since')??sessionSince),sessionSince)),tail:q.get('tail')??'all'});
  return{path:'/v'+VECTOR_API+p+'?'+out,kind:'logs',id:m[1]};
 }
 let policyTarget=target;
 if(p==='/containers/json'&&q.has('size')){if(!['false','0'].includes(q.get('size')))return null;q.delete('size');policyTarget=(version?'/v'+version[1]:'')+p+(q.size?'?'+q:'');}
 const d=authorizeDockerRead(method,policyTarget,ids);if(!d.allowed)return null;
 if(d.projection==='events'){const u=new URL('http://fixed'+d.path);u.searchParams.set('since',String(Math.max(Number(u.searchParams.get('since')??sessionSince),sessionSince)));return{path:'/v'+VECTOR_API+u.pathname+'?'+u.searchParams,kind:'events'};}
 return{path:'/v'+VECTOR_API+d.path,kind:d.projection,id:/\/containers\/([a-f0-9]{64})\/json$/.exec(d.path)?.[1]};
}
export function projectInspect(raw,id){
 if(raw?.Id!==id||!ID.test(id)||typeof raw.Name!=='string'||typeof raw.Created!=='string'||!Number.isFinite(Date.parse(raw.Created))||typeof raw.Config?.Image!=='string'||raw.Config.Image.length>512||/[\u0000-\u001f]/.test(raw.Config.Image))throw Error('vector_metadata_invalid');
 return{Id:id,Name:raw.Name.slice(0,200),Created:raw.Created,Config:{Image:raw.Config.Image,Tty:raw.Config.Tty===true,Labels:{}},State:{Running:raw.State?.Running===true}};
}
export function unixUpstream(socketPath){return({path,method='GET',signal})=>new Promise((resolve,reject)=>{const req=http.request({socketPath,path,method,signal,agent:false,headers:{accept:'application/json'}},resolve);req.on('error',reject);req.end();});}
async function buffer(response,limit=1048576){const parts=[];let n=0;for await(const x of response){n+=x.length;if(n>limit)throw Error('metadata_limit');parts.push(x);}return Buffer.concat(parts).toString('utf8');}
export async function createReadProxy({tls,upstream,allowedIds=[],timeoutMs=2000,streamMs=10000,maxBytes=1048576,maxConcurrent=4,maxRequests=32}){
 if(!tls?.ca||!tls?.cert||!tls?.key||!tls?.clientCert)throw Error('mtls_required');
 if(route('GET','/version',allowedIds,0)===null||![timeoutMs,streamMs,maxBytes,maxConcurrent,maxRequests].every(Number.isSafeInteger)||timeoutMs<30||timeoutMs>10000||streamMs<30||streamMs>60000||maxBytes<1024||maxBytes>1048576||maxConcurrent<1||maxConcurrent>4||maxRequests<1||maxRequests>32)throw Error('invalid_limits');
 allowedIds=Object.freeze([...allowedIds]);
 const clientFingerprint=new X509Certificate(tls.clientCert).fingerprint256;
 const state={mode:'unverified',upstreamCalls:0,requests:0,inflight:0,automaticRetries:0};
 // Required before serving any versioned client read. No fabricated daemon range.
 const preflightAbort=new AbortController();let initial,initialTimer;const version=await Promise.race([(async()=>{initial=await upstream({path:'/version',signal:preflightAbort.signal});if(initial.statusCode!==200)throw Error('daemon_preflight_failed');return JSON.parse(await buffer(initial));})(),new Promise((_,no)=>{initialTimer=setTimeout(()=>{preflightAbort.abort();initial?.destroy();no(Error('daemon_preflight_timeout'));},timeoutMs);})]).finally(()=>clearTimeout(initialTimer));
 if(!Number.isFinite(api(version.MinAPIVersion))||!Number.isFinite(api(version.ApiVersion))||api(version.MinAPIVersion)>52||api(version.ApiVersion)<52)throw Error('vector_api_not_supported');
 state.mode='ready';state.upstreamCalls=1;const streamOnce=new Set();const since=Math.floor(Date.now()/1000)-2;
 const reply=(r,s,data)=>{if(!r.headersSent&&!r.destroyed){r.writeHead(s,{'content-type':'application/json','cache-control':'no-store'});r.end(JSON.stringify(data));}};
 const server=https.createServer({key:tls.key,cert:tls.cert,ca:tls.ca,requestCert:true,rejectUnauthorized:true,minVersion:'TLSv1.2',maxHeaderSize:8192},async(req,res)=>{
  if(!req.socket.authorized||req.socket.getPeerCertificate().fingerprint256!==clientFingerprint)return reply(res,403,{error:'client_denied'});
  const d=route(req.method,req.url,allowedIds,since);
  if(!d||req.headers.upgrade||String(req.headers.connection??'').toLowerCase().includes('upgrade')||req.headers['transfer-encoding']||(req.headers['content-length']&&req.headers['content-length']!=='0')||['authorization','cookie','x-http-method-override','x-original-url','forwarded','x-forwarded-host'].some(k=>req.headers[k]))return reply(res,403,{error:'request_denied'});
  if(state.mode!=='ready')return reply(res,503,{error:'session_halted_no_retry'});
  if(state.requests>=maxRequests){state.mode='halted';return reply(res,503,{error:'session_limit'});}
  if(state.inflight>=maxConcurrent)return reply(res,429,{error:'concurrency_limit'});
  const streamKey=d.kind+':'+(d.id??'events');if(['logs','events'].includes(d.kind)&&streamOnce.has(streamKey)){state.mode='halted';return reply(res,503,{error:'stream_already_attempted_no_retry'});}
  if(['logs','events'].includes(d.kind))streamOnce.add(streamKey);
  state.requests++;state.inflight++;state.upstreamCalls++;let response,timer,ended=false;
  const requestAbort=new AbortController();
  const finish=()=>{if(!ended){ended=true;state.inflight--;clearTimeout(timer);}};
  const halt=()=>{state.mode='halted';requestAbort.abort();response?.destroy();if(res.headersSent)res.destroy();else reply(res,502,{error:'read_failed_no_retry'});finish();};
  const abort=()=>{if(!ended)halt();};res.on('close',()=>{if(!ended){requestAbort.abort();response?.destroy();finish();}});
  timer=setTimeout(abort,['logs','events'].includes(d.kind)?streamMs:timeoutMs);
  try{
   response=await upstream({path:d.path,method:req.method,signal:requestAbort.signal});if(ended){response.destroy();return;}
   if(response.statusCode!==200)throw Error('upstream_failed');
   if(['logs','events'].includes(d.kind)){
    if(d.kind==='logs'&&!String(response.headers['content-type']??'').includes('application/vnd.docker.raw-stream'))throw Error('log_format');
    let n=0,pending='';
    if(d.kind==='events')response.setEncoding('utf8');
    res.writeHead(200,{'content-type':d.kind==='logs'?'application/vnd.docker.raw-stream':'application/x-ndjson','cache-control':'no-store'});
    for await(const chunk of response){n+=Buffer.byteLength(chunk);if(n>maxBytes)throw Error('stream_limit');
     if(d.kind==='logs'){if(!res.write(chunk))await once(res,'drain');}
     else{pending+=chunk;if(pending.length>262144)throw Error('event_limit');let pos;
      while((pos=pending.indexOf('\n'))>=0){const line=pending.slice(0,pos);pending=pending.slice(pos+1);if(!line.trim())continue;const e=JSON.parse(line),id=e.Actor?.ID??e.id;
       if(!allowedIds.includes(id)||e.Type!=='container'||!['start','die','pause','unpause'].includes(e.Action??e.status))continue;
       const out={Type:'container',Action:e.Action??e.status,status:e.Action??e.status,id,Actor:{ID:id,Attributes:{}},time:Number.isSafeInteger(e.time)?e.time:0};
       if(!res.write(JSON.stringify(out)+'\n'))await once(res,'drain');
      }
     }
    }
    if(pending.trim())throw Error('partial_event');res.end();finish();
   }else{
    const body=await buffer(response,maxBytes);let out;
    if(d.kind==='ping'){if(req.method!=='HEAD'&&body.trim()!=='OK')throw Error('ping');res.writeHead(200,{'content-type':'text/plain'});res.end(req.method==='HEAD'?'':'OK');}
    else if(d.kind==='version'){out={ApiVersion:VECTOR_API,MinAPIVersion:VECTOR_API,Os:'linux'};reply(res,200,out);}
    else if(d.kind==='inspect')reply(res,200,projectInspect(JSON.parse(body),d.id));
    else{const rows=JSON.parse(body);if(!Array.isArray(rows))throw Error('bad_list');reply(res,200,rows.filter(x=>allowedIds.includes(x.Id)).map(x=>({Id:x.Id,Names:Array.isArray(x.Names)?x.Names.filter(n=>typeof n==='string').map(n=>n.slice(0,200)).slice(0,10):[]})));}
    finish();
   }
  }catch{halt();}
 });
 server.on('upgrade',(_r,s)=>s.destroy());server.on('connect',(_r,s)=>s.destroy());server.on('tlsClientError',()=>{});
 server.headersTimeout=3000;server.requestTimeout=3000;server.maxRequestsPerSocket=1;
 return{server,state,daemonRange:{min:version.MinAPIVersion,max:version.ApiVersion},close:async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));}};
}
