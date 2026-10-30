import assert from 'node:assert/strict';
import {test} from 'node:test';
import {X509Certificate,createPrivateKey} from 'node:crypto';
import {readFileSync} from 'node:fs';
import https from 'node:https';
import {Readable} from 'node:stream';
import {makeCertificates} from '../../candidates/vector-node-pki/certificates.mjs';
import {createReadProxy} from '../../candidates/vector-node-pki/proxy.mjs';
// Synthetic-only certificate/proxy test. Never imports the approved Windows probe.
const pki=makeCertificates(undefined,undefined,true);
const ca=new X509Certificate(pki.ca),server=new X509Certificate(pki.cert),client=new X509Certificate(pki.clientCert);
test('01 root is CA; leaf is not CA',()=>{assert.equal(ca.ca,true);assert.equal(server.ca,false);assert.equal(client.ca,false);});
test('02 RSA2048 and SHA256 generated chain signatures',()=>{assert.equal(ca.publicKey.asymmetricKeyDetails.modulusLength,2048);assert(ca.verify(ca.publicKey));assert(server.verify(ca.publicKey));assert(client.verify(ca.publicKey));});
test('03 server SAN matches only localhost and 127.0.0.1',()=>{assert(server.checkHost('localhost'));assert(server.checkIP('127.0.0.1'));assert.equal(server.checkHost('outside.example'),undefined);assert.equal(server.checkIP('192.168.65.254'),undefined);});
test('04 distinct serverAuth and clientAuth EKU',()=>{assert.deepEqual(server.keyUsage,['1.3.6.1.5.5.7.3.1']);assert.deepEqual(client.keyUsage,['1.3.6.1.5.5.7.3.2']);});
test('05 one day validity and positive unique serials',()=>{assert(Date.parse(server.validTo)>Date.now());assert(Date.parse(server.validTo)-Date.parse(server.validFrom)<=86461000);assert.notEqual(server.serialNumber,client.serialNumber);});
test('06 matching private keys; no CA private key returned',()=>{assert(server.checkPrivateKey(createPrivateKey(pki.key)));assert(client.checkPrivateKey(createPrivateKey(pki.clientKey)));assert(!Object.hasOwn(pki,'caKey'));});
test('07 provider does not access files, subprocesses, certificate stores or network',()=>{const source=readFileSync(new URL('../../candidates/vector-node-pki/certificates.mjs',import.meta.url),'utf8');assert(!/node:(fs|child_process|https?|net|tls)|execFile|spawn\(/.test(source));});
test('08 generation succeeds with empty PATH, fresh identity each time',()=>{const previous=process.env.PATH;let other;try{process.env.PATH='';other=makeCertificates();}finally{process.env.PATH=previous;}assert.notEqual(new X509Certificate(other.ca).fingerprint256,ca.fingerprint256);other.key.fill(0);other.clientKey.fill(0);});
test('09 actual mTLS with new provider and unchanged read proxy, fake upstream only',async()=>{
 let upstreamCalls=0;
 const proxy=await createReadProxy({tls:pki,allowedIds:[],upstream:async({method='GET',path})=>{
  upstreamCalls++;assert.equal(method,'GET');assert(['/version','/_ping'].includes(path));
  const response=Readable.from([Buffer.from(path==='/_ping'?'OK':JSON.stringify({ApiVersion:'1.52',MinAPIVersion:'1.40',Version:'SYNTHETIC'}))]);response.statusCode=200;response.headers={};return response;
 }});
 try{
  await new Promise((yes,no)=>{proxy.server.once('error',no);proxy.server.listen(0,'127.0.0.1',yes);});
  const port=proxy.server.address().port;
  const request=(extra={})=>new Promise((yes,no)=>{
   const req=https.request({hostname:'127.0.0.1',servername:'localhost',port,path:'/_ping',method:'GET',ca:pki.ca,cert:pki.clientCert,key:pki.clientKey,rejectUnauthorized:true,agent:false,...extra},res=>{let body='';res.on('data',x=>body+=x);res.on('end',()=>yes({status:res.statusCode,body}));});req.on('error',no);req.setTimeout(2000,()=>req.destroy(Error('timeout')));req.end();
  });
  assert.deepEqual(await request(),{status:200,body:'OK'});
  await assert.rejects(request({cert:undefined,key:undefined}));
  assert.equal((await request({cert:pki.otherCert,key:pki.otherKey})).status,403);
  await assert.rejects(request({servername:'outside.example'}));
  assert.equal(upstreamCalls,2);
 }finally{await proxy.close();for(const key of ['key','clientKey','otherKey'])pki[key].fill(0);}
});
