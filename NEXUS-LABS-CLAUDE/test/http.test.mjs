import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
process.env.NODE_ENV='test';
const {handler}=await import('../server.mjs');
const uid='00000000-0000-4000-8000-000000000001';
test('HTTP rejects unauthenticated/non-admin/malformed/oversize/action requests without model calls',async()=>{
 let isAdmin=false,calls=0;
 const store={admin:async()=>isAdmin};
 const server=http.createServer(handler({store,call:async()=>calls++,config:{enabled:false},supabaseUrl:'https://fixture.invalid',publishableKey:'public',fetcher:async()=>({ok:true,json:async()=>({id:uid})})}));
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const url='http://127.0.0.1:'+server.address().port+'/api/ai/draft';
 try {
 const send=(body,auth=true,type='application/json')=>fetch(url,{method:'POST',headers:{...(auth?{authorization:'Bearer test-token'}:{}),'content-type':type},body});
 assert.equal((await send('{}',false)).status,401);assert.equal((await send('{}')).status,403);isAdmin=true;
 assert.equal((await send('{')).status,400);assert.equal((await send('{}',true,'text/plain')).status,415);assert.equal((await send('x'.repeat(3000))).status,413);
 assert.equal((await send(JSON.stringify({applicationId:uid,requestId:uid,action:'payment'}))).status,403);
 assert.equal((await send(JSON.stringify({applicationId:uid,requestId:uid}))).status,503);assert.equal(calls,0);
 } finally {await new Promise(r=>server.close(r));}
});
