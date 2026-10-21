// Read-only local readiness check. No login, model request, or credential contents are printed.
import {spawnSync} from 'node:child_process';
export function preflight(run=spawnSync){
 const version=run('codex',['--version'],{encoding:'utf8',timeout:5000});
 if(version.error||version.status!==0)return {installed:false,authenticated:false,execution_started:false,reason:'codex_cli_unavailable'};
 const auth=run('codex',['login','status'],{encoding:'utf8',timeout:5000});
 const status=(auth.stdout||'')+(auth.stderr||'');
 return {installed:true,authenticated:auth.status===0&&/chatgpt/i.test(status),execution_started:false,
  reason:auth.status===0&&/chatgpt/i.test(status)?'chatgpt_session_available_runner_not_connected':'chatgpt_auth_required_no_api_fallback'};
}
if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href)console.log(JSON.stringify(preflight()));
