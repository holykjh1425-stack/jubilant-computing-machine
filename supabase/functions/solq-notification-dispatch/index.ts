import {createDispatchHandler} from './handler.mjs';
Deno.serve(createDispatchHandler({
 enabled:Deno.env.get('SOLQ_NOTIFICATION_DISPATCH_ENABLED')==='true',
 url:Deno.env.get('SUPABASE_URL')??'',serviceKey:Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')??'',
 dispatchKey:Deno.env.get('SOLQ_NOTIFICATION_DISPATCH_KEY')??'',
 config:{liveSend:Deno.env.get('SOLQ_NOTIFY_LIVE_SEND'),approvalId:Deno.env.get('SOLQ_NOTIFY_APPROVAL_ID'),sender:Deno.env.get('SOLQ_NOTIFY_SENDER'),adminEmail:Deno.env.get('SOLQ_NOTIFY_ADMIN_EMAIL')},
 oauth:{clientId:Deno.env.get('SOLQ_GMAIL_CLIENT_ID'),clientSecret:Deno.env.get('SOLQ_GMAIL_CLIENT_SECRET'),refreshToken:Deno.env.get('SOLQ_GMAIL_REFRESH_TOKEN')}
}));
