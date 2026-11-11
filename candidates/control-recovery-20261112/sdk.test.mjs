import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFile} from 'node:fs/promises';
import {SupabaseReadAdapter,guardedFetch,SOURCES} from './ops-core.mjs';
test('pinned real SDK with synthetic HTTP: login/getUser/membership/read projections; nonadmin blocks reads',async()=>{
 const sandbox={WebSocket,URL,URLSearchParams,Headers,Request,Response,AbortController,AbortSignal,TextEncoder,TextDecoder,atob,btoa,setTimeout,clearTimeout,setInterval,clearInterval,console};
 vm.createContext(sandbox);vm.runInContext(await readFile(new URL('../../vendor/supabase-2.118.0.js',import.meta.url),'utf8'),sandbox);
 const base='https://isolated.example.supabase.co';let member=true,reads=[],requests=[];
 const id='11111111-1111-4111-8111-111111111111';const user={id,aud:'authenticated',role:'authenticated',email:'synthetic@example.invalid',app_metadata:{provider:'email'},user_metadata:{},created_at:'2026-11-12T00:00:00Z'};
 const b64=x=>Buffer.from(JSON.stringify(x)).toString('base64url');const token=b64({alg:'HS256',typ:'JWT'})+'.'+b64({sub:id,exp:Math.floor(Date.now()/1000)+3600})+'.SYNTHETIC_UNSIGNED_NOT_VALID';
 const fetcher=async(input,init={})=>{const u=new URL(typeof input==='string'?input:input.url);requests.push([u.pathname,init.method]);let body;
 if(u.pathname==='/auth/v1/token')body={access_token:token,refresh_token:'SYNTHETIC_ONLY',expires_in:3600,token_type:'bearer',user};
 else if(u.pathname==='/auth/v1/user')body=user;
 else {const table=u.pathname.split('/').pop();if(table==='admin_users')body=member?[{user_id:id}]:[];else {assert.ok(Object.hasOwn(SOURCES,table));reads.push(table);assert.equal(u.searchParams.get('select'),SOURCES[table]);body=[];}}
 return new Response(JSON.stringify(body),{status:200,headers:{'Content-Type':'application/json','Content-Range':'*/0'}});};
 const db=sandbox.supabase.createClient(base,'sb_publishable_SYNTHETIC_ONLY',{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:guardedFetch(base,fetcher)}});
 const login=await db.auth.signInWithPassword({email:'synthetic@example.invalid',password:'SYNTHETIC_ONLY'});assert.equal(login.error,null);
 const adapter=new SupabaseReadAdapter(db);await adapter.verify();const snap=await adapter.read(new AbortController().signal);assert.equal(Object.keys(snap.sources).length,9);assert.equal(reads.length,9);assert.ok(requests.filter(x=>x[0]==='/auth/v1/user').length>=1);
 member=false;await assert.rejects(adapter.verify(),{code:'FORBIDDEN'});assert.equal(reads.length,9);assert.equal(requests.filter(([path,m])=>m==='POST'&&!path.startsWith('/auth/')).length,0);
});
