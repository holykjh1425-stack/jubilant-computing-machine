import {createQuoteHandler} from './handler.mjs';
Deno.serve(createQuoteHandler({url:Deno.env.get('SUPABASE_URL')??'',publishableKey:Deno.env.get('SUPABASE_ANON_KEY')??''}));
