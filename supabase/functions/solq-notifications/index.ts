import {createHandler} from './handler.mjs';
Deno.serve(createHandler({
 url:Deno.env.get('SUPABASE_URL')??'',serviceKey:Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')??'',
 workerKey:Deno.env.get('SOLQ_NOTIFICATION_WORKER_KEY')??'',
 enabled:Deno.env.get('SOLQ_NOTIFICATIONS_ENABLED')==='true',
 origins:(Deno.env.get('SOLQ_NOTIFICATION_ORIGINS')??'').split(',').map(x=>x.trim()).filter(Boolean)
}));
