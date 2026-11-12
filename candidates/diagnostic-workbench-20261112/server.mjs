import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {fixtures} from './fixtures.mjs';
const assets=new Map([['/','index.html'],['/app.mjs','app.mjs'],['/domain.mjs','domain.mjs'],['/style.css','style.css'],['/qa-mobile','qa-mobile.html'],['/qa-tablet','qa-tablet.html']]);
const mime={html:'text/html; charset=utf-8',mjs:'text/javascript; charset=utf-8',css:'text/css; charset=utf-8'};
export function handler(req,res){
 res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Content-Type-Options','nosniff');
 res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'self'; base-uri 'none'; form-action 'none'");
 const send=(code,value)=>{res.writeHead(code,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(value))};
 if(req.method!=='GET')return send(405,{error:'READ_ONLY'});
 const path=new URL(req.url,'http://localhost').pathname;
 // Demo-only header is not real authentication. Never serve any customer data on this route.
 if(path==='/api/demo-snapshot'){
  if(req.headers['x-solq-demo-role']!=='synthetic-admin')return send(401,{error:'DEMO_SESSION_REQUIRED'});
  if(req.headers['x-solq-demo-error']==='expired')return send(401,{error:'AUTH_EXPIRED'});
  if(req.headers['x-solq-demo-error']==='offline')return send(503,{error:'READ_FAILED'});
  return send(200,{source:'SYNTHETIC_FIXTURES_ONLY',checkedAt:new Date().toISOString(),success:true,records:fixtures});
 }
 if(path.startsWith('/api/'))return send(403,{error:'LIVE_NOT_CONNECTED'});
 const asset=assets.get(path);if(!asset)return send(404,{error:'NOT_FOUND'});
 readFile(new URL('./public/'+asset,import.meta.url)).then(body=>{res.writeHead(200,{'Content-Type':mime[asset.split('.').at(-1)]});res.end(body)}).catch(()=>send(500,{error:'ASSET_UNAVAILABLE'}));
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const argument=name=>{const i=process.argv.indexOf(name);return i>=0?process.argv[i+1]:undefined};
 const port=Number(argument('--port')||process.env.PORT||3000);
 http.createServer(handler).listen(port,argument('--host')||'127.0.0.1');
}
