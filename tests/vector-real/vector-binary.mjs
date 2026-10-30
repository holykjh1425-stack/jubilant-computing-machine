// Real Vector 0.58.0 executable; fake daemon only. No real Docker client/container/socket.
import http from'node:http';import{spawn,execFileSync}from'node:child_process';import{mkdtempSync,mkdirSync,writeFileSync,rmSync}from'node:fs';import{join}from'node:path';import{tmpdir}from'node:os';import assert from'node:assert/strict';
import{createReadProxy,unixUpstream}from'../../candidates/vector-real/proxy.mjs';import{makeCertificates}from'../../candidates/vector-real/certificates.mjs';
const binary=process.env.SOLQ_VECTOR_BINARY;assert.ok(binary);assert.match(execFileSync(binary,['--version'],{encoding:'utf8'}),/vector 0\.58\.0/);
const dir=mkdtempSync(join(tmpdir(),'solq-vector058-bin-')),id='d'.repeat(64),socket=join(dir,'synthetic-api.sock'),tag='SOLQ_VECTOR058_SYNTHETIC_CANARY';let daemon,proxy,child,calls=[],diagnostics='';
try{
 const tls=makeCertificates(dir);mkdirSync(join(dir,'data'),{mode:0o700});
 daemon=http.createServer((req,res)=>{calls.push({method:req.method,path:req.url});
  const json=v=>{res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(v));};
  if(req.url==='/version')return json({ApiVersion:'1.56',MinAPIVersion:'1.40',Version:'SYNTHETIC_ONLY'});
  if(req.url==='/_ping'||req.url==='/v1.52/_ping'){res.writeHead(200);return res.end('OK');}
  if(req.url.startsWith('/v1.52/containers/json'))return json([{Id:id,Names:['/solq-synthetic-only']}]);
  if(req.url==='/v1.52/containers/'+id+'/json')return json({Id:id,Name:'/solq-synthetic-only',Created:new Date(Date.now()-60000).toISOString(),Config:{Image:'synthetic-only:local',Tty:false,Labels:{},Env:['SECRET=SHOULD_NEVER_PASS']},State:{Running:true}});
  if(req.url.startsWith('/v1.52/events')){res.writeHead(200,{'content-type':'application/json'});res.flushHeaders();return;}
  if(req.url.startsWith('/v1.52/containers/'+id+'/logs')){
   res.writeHead(200,{'content-type':'application/vnd.docker.raw-stream'});const payload=Buffer.from(new Date(Date.now()+10).toISOString()+' '+tag+'\n'),h=Buffer.alloc(8);h[0]=1;h.writeUInt32BE(payload.length,4);res.write(Buffer.concat([h,payload]));return;
  }
  res.writeHead(403);res.end();
 });await new Promise(r=>daemon.listen(socket,r));
 proxy=await createReadProxy({tls,upstream:unixUpstream(socket),allowedIds:[id],timeoutMs:3000,streamMs:20000});await new Promise((yes,no)=>{proxy.server.once('error',no);proxy.server.listen(19443,'127.0.0.1',yes);});
 const config={data_dir:join(dir,'data'),api:{enabled:false},sources:{docker:{type:'docker_logs',docker_host:'https://localhost:19443',include_containers:[id],tls:{ca_file:join(dir,'ca.crt'),crt_file:join(dir,'client.crt'),key_file:join(dir,'client.key')}}},sinks:{safe_console:{type:'console',inputs:['docker'],target:'stdout',encoding:{codec:'json'}}}};
 const path=join(dir,'vector.json');writeFileSync(path,JSON.stringify(config),{mode:0o600});
 child=spawn(binary,['--config',path],{stdio:['ignore','pipe','pipe']});let stdout='',stderr='';child.stdout.on('data',v=>stdout+=v);child.stderr.on('data',v=>{stderr=(stderr+v).slice(-16000);diagnostics=stderr;});
 const event=await new Promise((yes,no)=>{const timer=setTimeout(()=>no(Error('VECTOR_CANARY_NOT_RECEIVED')),12000);child.on('error',()=>{clearTimeout(timer);no(Error('VECTOR_START_FAILED'));});child.on('exit',()=>{clearTimeout(timer);no(Error('VECTOR_EXITED_BEFORE_CANARY'));});child.stdout.on('data',()=>{for(const line of stdout.split('\n')){try{const e=JSON.parse(line);if(JSON.stringify(e).includes(tag)){clearTimeout(timer);yes(e);return;}}catch{}}});});
 assert.ok(JSON.stringify(event).includes(tag));assert.ok(!JSON.stringify(event).includes('SHOULD_NEVER_PASS'));assert.equal(calls.filter(x=>x.method!=='GET'&&x.method!=='HEAD').length,0);
 assert.ok(calls.some(x=>x.path.startsWith('/v1.52/containers/json')));assert.ok(calls.some(x=>x.path==='/v1.52/containers/'+id+'/json'));const log=calls.find(x=>x.path.startsWith('/v1.52/containers/'+id+'/logs'));assert.ok(log);assert.equal(new URL('http://fake'+log.path).searchParams.get('timestamps'),'true');
 const result={timestampUtc:new Date().toISOString(),result:'PASS',actualVectorBinary:'0.58.0 Linux official release',apiUsed:'1.52',actualMtls:true,syntheticCanaryReceived:true,metadataImageRetained:true,secretFieldsRemoved:true,upstreamMethods:[...new Set(calls.map(x=>x.method))],requestPaths: calls.map(x=>x.path.replaceAll(id,'SYNTHETIC_ID')),actualDockerAccesses:0,newDockerObjects:0,windowsDocker29_9_2Verified:false,existingVectorRecovered:false,providerCalls:0,actualApiUsd:0};writeFileSync('tests/vector-real/binary-results.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
}catch(error){console.error('VECTOR_BINARY_FIXTURE_FAILED: '+error.message);console.error('SYNTHETIC_ONLY_DIAGNOSTIC '+diagnostics.split('\n').filter(x=>/ERROR|error|unknown field|missing field|configuration/i.test(x)&&!/PRIVATE|BEGIN|CERTIFICATE/.test(x)).map(x=>x.replace(/[A-Za-z0-9+\/=]{40,}/g,'[opaque]')).join('\n').slice(-3000));process.exitCode=1;}
finally{if(child&&child.exitCode===null){child.kill('SIGTERM');await Promise.race([new Promise(r=>child.once('exit',r)),new Promise(r=>setTimeout(()=>{child.kill('SIGKILL');r();},2000))]);}if(proxy)await proxy.close();if(daemon){daemon.closeAllConnections();await new Promise(r=>daemon.close(r));}rmSync(dir,{recursive:true,force:true});}
