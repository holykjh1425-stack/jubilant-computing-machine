// SYNTHETIC-ONLY transport harness. Cannot bind TCP or connect a normal Docker socket.
import http from 'node:http';
import {lstatSync,realpathSync,readFileSync,chmodSync,unlinkSync} from 'node:fs';
import {dirname,basename,resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {once} from 'node:events';
import {authorizeDockerRead,projectContainer} from './docker-read-policy.ts';
export async function startFixtureProxy({directory,upstreamSocket,allowedIds,timeoutMs=1000,maxBytes=1048576,maxConcurrent=4}) {
 const dir=resolve(directory),s=lstatSync(dir);
 if(dirname(dir)!==realpathSync(tmpdir())||!basename(dir).startsWith('solq-proxy-fixture-')||realpathSync(dir)!==dir||!s.isDirectory()||(s.mode&0o777)!==0o700||s.uid!==process.getuid())throw Error('private_fixture_directory_required');
 if(readFileSync(join(dir,'fixture.marker'),'utf8')!=='SOLQ_SYNTHETIC_DAEMON_ONLY')throw Error('fixture_marker_required');
 if(upstreamSocket!==join(dir,'synthetic-api.sock')||!lstatSync(upstreamSocket).isSocket()||lstatSync(upstreamSocket).isSymbolicLink())throw Error('synthetic_socket_required');
 if(!Number.isInteger(timeoutMs)||timeoutMs<30||timeoutMs>10000||!Number.isInteger(maxBytes)||maxBytes<512||maxBytes>1048576||!Number.isInteger(maxConcurrent)||maxConcurrent<1||maxConcurrent>8)throw Error('invalid_limits');
 const ids=Object.freeze([...allowedIds]);if(!authorizeDockerRead('GET','/_ping',ids).allowed)throw Error('pinned_ids_required');
 const socket=join(dir,'restricted-proxy.sock');const state={accepted:0,denied:0,upstreamCalls:0,inflight:0,lastRequestSucceeded:false,streamLimitStops:0};
 const stats=()=>({...state});
 function send(res,code,body){if(!res.destroyed&&!res.headersSent){res.writeHead(code,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(body));}}
 const server=http.createServer({maxHeaderSize:8192},(req,res)=>{
  const decision=authorizeDockerRead(req.method??'',req.url??'',ids);
  const connection=String(req.headers.connection??'').toLowerCase();
  if(!decision.allowed||req.headers.upgrade||connection.includes('upgrade')||req.headers['transfer-encoding']||
   (req.headers['content-length']!==undefined&&req.headers['content-length']!=='0')||
   ['x-http-method-override','x-original-url','x-forwarded-host','x-forwarded-proto','forwarded','proxy-authorization','authorization','cookie'].some(k=>req.headers[k]!==undefined)) {
   state.denied++;return send(res,403,{error:'request_denied'});
  }
  if(state.inflight>=maxConcurrent)return send(res,429,{error:'concurrency_limit'});
  state.accepted++;state.inflight++;state.lastRequestSucceeded=false;state.upstreamCalls++;
  let bytes=0,finished=false,pending='',outputHeaders=false;const started=Date.now();
  const upstream=http.request({socketPath:upstreamSocket,path:decision.path,method:req.method,agent:false,headers:{accept:decision.projection==='logs'?'application/vnd.docker.raw-stream':'application/json'}},async response=>{
   try {
    if(response.statusCode!==200){response.destroy();throw Error('upstream_rejected');}
    const mime=String(response.headers['content-type']??'').split(';')[0];
    if(decision.projection==='logs'&&mime!=='application/vnd.docker.raw-stream')throw Error('unexpected_log_format');
    if(!['logs','ping'].includes(decision.projection)&&!['application/json','application/x-ndjson'].includes(mime))throw Error('unexpected_content_type');
    if(decision.projection==='events')response.setEncoding('utf8');
    let chunks=[];
    for await(const chunk of response){
     bytes+=Buffer.byteLength(chunk);if(bytes>maxBytes){state.streamLimitStops++;throw Error('byte_limit');}
     if(Date.now()-started>timeoutMs)throw Error('deadline');
     if(decision.projection==='logs'){
      if(!outputHeaders){res.writeHead(200,{'content-type':'application/vnd.docker.raw-stream','cache-control':'no-store'});outputHeaders=true;}
      if(!res.write(chunk))await once(res,'drain');
     }else if(decision.projection==='events'){
      pending+=chunk;if(pending.length>262144)throw Error('event_limit');
      let split;while((split=pending.indexOf('\n'))>=0){const line=pending.slice(0,split);pending=pending.slice(split+1);if(!line.trim())continue;
       const event=JSON.parse(line),id=event.Actor?.ID??event.id;
       if(!ids.includes(id)||event.Type!=='container')continue;
       const action=event.Action??event.status;if(!['start','die','stop','destroy','pause','unpause','restart'].includes(action))continue;
       const out={Type:'container',Action:action,status:action,id,Actor:{ID:id,Attributes:{}},time:Number.isSafeInteger(event.time)?event.time:0};
       if(!outputHeaders){res.writeHead(200,{'content-type':'application/x-ndjson','cache-control':'no-store'});outputHeaders=true;}
       if(!res.write(JSON.stringify(out)+'\n'))await once(res,'drain');
      }
     }else chunks.push(Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk));
    }
    if(decision.projection==='logs'){state.lastRequestSucceeded=true;res.end();}
    else if(decision.projection==='events'){if(pending.trim())throw Error('partial_event');state.lastRequestSucceeded=true;if(!outputHeaders)res.writeHead(200,{'content-type':'application/x-ndjson','cache-control':'no-store'});res.end();}
    else {
     const body=Buffer.concat(chunks).toString('utf8');chunks=[];
     if(decision.projection==='ping'){
      if(req.method!=='HEAD'&&body.trim()!=='OK')throw Error('bad_ping');res.writeHead(200,{'content-type':'text/plain','cache-control':'no-store'});res.end(req.method==='HEAD'?'':'OK');
     }else{
      const raw=JSON.parse(body);let out;
      if(decision.projection==='list'){
       if(!Array.isArray(raw))throw Error('bad_list');out=raw.filter(x=>ids.includes(x?.Id)).map(x=>projectContainer(x,ids));
      }else if(decision.projection==='inspect'){
       const expected=decision.path.split('/')[2];if(raw?.Id!==expected)throw Error('inspect_mismatch');out=projectContainer(raw,ids);
      }else{
       if(!/^1\.[0-9]{2,3}$/.test(raw?.ApiVersion??''))throw Error('bad_version');
       out={ApiVersion:raw.ApiVersion,MinAPIVersion:/^1\.[0-9]{2,3}$/.test(raw.MinAPIVersion??'')?raw.MinAPIVersion:raw.ApiVersion,Os:'linux'};
      }
      send(res,200,out);
     }
     state.lastRequestSucceeded=true;
    }
   }catch{state.lastRequestSucceeded=false;if(res.headersSent)res.destroy();else send(res,502,{error:'upstream_unverified_no_retry'});upstream.destroy();}
   finally{finish();}
  });
  function finish(){if(!finished){finished=true;state.inflight--;clearTimeout(timer);}}
  const timer=setTimeout(()=>{state.lastRequestSucceeded=false;upstream.destroy();if(res.headersSent)res.destroy();else send(res,504,{error:'deadline_no_retry'});finish();},timeoutMs);
  upstream.on('error',()=>{state.lastRequestSucceeded=false;send(res,502,{error:'upstream_unavailable_no_retry'});finish();});
  res.on('close',()=>{upstream.destroy();finish();});
  upstream.end();
 });
 // Never proxy WebSocket/CONNECT upgrades or forward a client supplied host/header.
 server.on('upgrade',(_req,socket)=>socket.destroy());server.on('connect',(_req,socket)=>socket.destroy());
 server.headersTimeout=2000;server.requestTimeout=2000;server.maxRequestsPerSocket=1;
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(socket,resolve);});chmodSync(socket,0o600);
 return {socket,stats,close:async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));try{unlinkSync(socket);}catch{}}};
}
