// Read local files only. Does not connect to production or execute SQL/tests.
import {readFile,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../../',import.meta.url));
const html=await readFile(path.join(root,'admin.html'),'utf8');
const refs=[...html.matchAll(/<(?:script|link)\b[^>]*\b(?:src|href)="([^"]+)"/g)].map(m=>m[1]);
if(refs.length!==8 || new Set(refs).size!==8)throw Error('Expected exactly eight direct admin dependencies');
if(refs.some(p=>/^(?:[a-z]+:|\/)|\.\./i.test(p)))throw Error('Unexpected external or parent dependency');
const admin=['admin.html',...refs];
const api=['supabase/functions/nexus-orchestrator/index.ts','supabase/functions/nexus-orchestrator/handler.mjs','supabase/functions/nexus-orchestrator/engine.mjs'];
const guard=['ops/admin-integration-candidate/link-guard.sql'];
const files=[];
for(const [group,paths] of Object.entries({admin,api,guard}))for(const file of paths){
 const bytes=await readFile(path.join(root,file));
 if(!(await stat(path.join(root,file))).isFile())throw Error('Missing file '+file);
 files.push({group,path:file,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
}
console.log(JSON.stringify({source_commit:'6b591012a83650a5d1e3da61f4ecfb1584b26b21',purpose:'Dependency and content manifest only; not deployment approval',admin_document_and_dependencies:admin.length,api_files:api.length,guard_files:guard.length,excluded:['quote API','quote-panel.js','entire candidate folder'],files},null,2));
