import http from 'node:http';
import pg from 'pg';
import {Fault,UUID,configuration,providers,orchestrate} from './core.mjs';
import {Store} from './store.mjs';
export function handler({store,call,config,supabaseUrl,publishableKey,fetcher=fetch}) {
  return async (req,res)=> {
    res.setHeader('Cache-Control','no-store'); res.setHeader('X-Content-Type-Options','nosniff');
    const send=(status,value)=>{res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(value));};
    try {
      if(req.method!=='POST'||req.url!=='/api/ai/draft') return send(404,{error:'NOT_FOUND'});
      if(!/^Bearer [A-Za-z0-9_.-]+$/.test(req.headers.authorization||'')) throw new Fault('UNAUTHORIZED',401);
      const auth=await fetcher(supabaseUrl+'/auth/v1/user',{headers:{apikey:publishableKey,authorization:req.headers.authorization},signal:AbortSignal.timeout(10000),redirect:'error'});
      if(!auth.ok) throw new Fault('UNAUTHORIZED',401);
      const user=await auth.json();
      if(!UUID.test(user.id||'')||!await store.admin(user.id)) throw new Fault('FORBIDDEN',403);
      if(!req.headers['content-type']?.startsWith('application/json')) throw new Fault('CONTENT_TYPE',415);
      let size=0; const chunks=[];
      for await(const chunk of req) {size+=chunk.length; if(size>2048) throw new Fault('BODY_LIMIT',413);chunks.push(chunk);}
      let body;try {body=JSON.parse(Buffer.concat(chunks).toString('utf8'));} catch {throw new Fault('INVALID_JSON');}
      if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!['applicationId','requestId','action'].includes(k))) throw new Fault('INVALID_REQUEST');
      send(200,await orchestrate({store,call,config},user.id,body));
    } catch(e) {send(e instanceof Fault?e.status:500,{error:e instanceof Fault?e.code:'INTERNAL'});}
  };
}
if(process.env.NODE_ENV!=='test') {
  const config=configuration(process.env),url=new URL(process.env.SUPABASE_URL);
  if(url.protocol!=='https:') throw new Fault('CONFIG_SUPABASE_URL',503);
  // Require a verified TLS connection; never set rejectUnauthorized:false.
  const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,max:3,connectionTimeoutMillis:10000,ssl:{rejectUnauthorized:true}});
  const server=http.createServer(handler({store:new Store(pool),call:providers(config),config,supabaseUrl:url.origin,publishableKey:process.env.SUPABASE_PUBLISHABLE_KEY}));
  server.requestTimeout=10000; server.headersTimeout=10000;
  server.listen(Number(process.env.PORT||8787),'127.0.0.1');
}
