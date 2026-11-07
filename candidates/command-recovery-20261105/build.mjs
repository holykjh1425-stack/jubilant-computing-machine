import fs from 'node:fs';
import crypto from 'node:crypto';
const c=JSON.parse(fs.readFileSync(new URL('./production-catalog.json',import.meta.url)));
const q=s=>'"'+s.replaceAll('"','""')+'"';
const table=(schema,name)=>{
 const cols=c.columns.filter(x=>x.schema===schema&&x.table===name).map(x=>q(x.name)+' '+x.type+(x.identity?' generated always as identity':x.default?' default '+x.default:'')+(x.not_null?' not null':''));
 const constraints=c.constraints.filter(x=>x.schema===schema&&x.table===name).map(x=>'constraint '+q(x.name)+' '+x.definition);
 return 'create table '+q(schema)+'.'+q(name)+' (\n '+[...cols,...constraints].join(',\n ')+ '\n);\n';
};
let base='-- CANDIDATE: new, empty non-production database only. Never run on production.\n';
for(const name of ['admin_users','applications']) {
 base+=table('public',name)+'alter table public.'+q(name)+' enable row level security;\nrevoke all on public.'+q(name)+' from public,anon,authenticated,service_role;\n';
 for(const p of c.policies.filter(x=>x.tablename===name))base+='create policy '+q(p.policyname)+' on public.'+q(name)+' for '+p.cmd+' to '+p.roles.map(q).join(',')+(p.qual?' using ('+p.qual+')':'')+(p.with_check?' with check ('+p.with_check+')':'')+';\n';
}
base+='grant select on public.admin_users to authenticated,service_role;\ngrant insert on public.applications to anon;\ngrant select,insert,update on public.applications to authenticated;\ngrant all on public.applications to service_role;\n';
for(const i of c.indexes.filter(x=>['admin_users','applications'].includes(x.tablename)&&!c.constraints.some(k=>k.name===x.indexname)))base+=i.indexdef+';\n';
fs.writeFileSync(new URL('./00-initial-schema.sql',import.meta.url),base);
let gap='-- Current-catalog recovery of untracked approval prerequisites. Not historical migration text.\n';
gap+=table('nexus_production_private','security_backups');
gap+='revoke all on nexus_production_private.security_backups from public,anon,authenticated,service_role;\n';
gap+='create unique index ai_work_plans_one_per_application on public.ai_work_plans(application_id);\n';
for(const col of c.columns.filter(x=>x.table==='production_jobs'&&x.name.startsWith('production_approved_')))gap+='alter table public.production_jobs add column '+q(col.name)+' '+col.type+';\n';
for(const k of c.constraints.filter(x=>x.table==='production_jobs'&&x.definition.includes('production_approved_')))gap+='alter table public.production_jobs add constraint '+q(k.name)+' '+k.definition+';\n';
for(const f of c.functions.filter(x=>['guard_application','guard_job','approve','solq_approve_production'].includes(x.name)))gap+=f.definition+';\nrevoke all on function '+q(f.schema)+'.'+q(f.name)+'('+f.args+') from public,anon,authenticated,service_role;\n';
gap+='grant usage on schema nexus_production_private to authenticated;\ngrant execute on function nexus_production_private.approve(uuid),public.solq_approve_production(uuid) to authenticated;\n';
for(const t of c.triggers.filter(x=>['solq_application_approval_guard','solq_production_approval_guard'].includes(x.name)))gap+=t.definition+';\n';
fs.writeFileSync(new URL('./10-untracked-approval-prerequisites.sql',import.meta.url),gap);
const files=fs.readdirSync(new URL('./history/',import.meta.url)).sort();
const githubDirectory=new URL('../../supabase/migrations/',import.meta.url),githubFiles=fs.readdirSync(githubDirectory).sort();
const manifest=files.map(file=>{
 const name=file.slice(15),githubFile=githubFiles.find(x=>x.slice(15)===name);
 return {file,sha256:crypto.createHash('sha256').update(fs.readFileSync(new URL('./history/'+file,import.meta.url))).digest('hex'),githubFile:githubFile??null,githubTextMatchesExceptEdgeWhitespace:githubFile?fs.readFileSync(new URL(githubFile,githubDirectory),'utf8').trim()===fs.readFileSync(new URL('./history/'+file,import.meta.url),'utf8').trim():null};
});
fs.writeFileSync(new URL('./source-manifest.json',import.meta.url),JSON.stringify({source:'Supabase migration history read-only 2026-11-05; text files preserve statements with a terminal newline',githubBaseCommit:'045802ebb5bd7cc5813b2857248dbe832cd4bbd7',files:manifest},null,2)+'\n');
