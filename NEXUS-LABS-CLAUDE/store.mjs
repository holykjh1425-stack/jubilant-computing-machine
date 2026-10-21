import {Fault} from './core.mjs';
export class Store {
  constructor(pool) { this.pool=pool; }
  async admin(user) {
    const r=await this.pool.query('select exists(select 1 from public.admin_users where user_id=$1) as ok',[user]);
    return r.rows[0].ok;
  }
  async key(provider) {
    const name=provider==='claude'?'nexus_labs_claude_api_key':'nexus_labs_openai_api_key';
    const r=await this.pool.query('select decrypted_secret from nexus_ai_private.api_keys where name=$1',[name]);
    return r.rows[0]?.decrypted_secret;
  }
  async begin(admin,req,reserved,daily) {
    const c=await this.pool.connect();
    try {
      await c.query('begin');
      // Serialize all budget reservations, including concurrent requests across processes.
      await c.query("select pg_advisory_xact_lock(782191004)");
      const old=await c.query('select * from nexus_ai_private.jobs where request_id=$1',[req.requestId]);
      if (old.rowCount) {
        const row=old.rows[0];
        if(row.admin_id!==admin||row.application_id!==req.applicationId) throw new Fault('IDEMPOTENCY_CONFLICT',409);
        await c.query('commit'); return {existing:true,status:row.status};
      }
      const sum=await c.query("select coalesce(sum(reserved_usd),0) as amount from nexus_ai_private.jobs where created_at >= date_trunc('day',now() at time zone 'UTC') at time zone 'UTC'");
      if(Number(sum.rows[0].amount)+reserved>daily) throw new Fault('DAILY_BUDGET',429);
      const order=await c.query('select service_type,description,privacy_consent,status from public.applications where id=$1',[req.applicationId]);
      if(!order.rowCount) throw new Fault('ORDER_NOT_FOUND',404);
      // Production work starts only after an administrator recorded actual deposit confirmation.
      if(!['deposit_confirmed','in_progress'].includes(order.rows[0].status)) throw new Fault('DEPOSIT_APPROVAL_REQUIRED',403);
      if(!order.rows[0].privacy_consent || !order.rows[0].description.includes('국외 전송·보관 동의')) throw new Fault('TRANSFER_CONSENT_REQUIRED',403);
      await c.query("insert into nexus_ai_private.jobs(request_id,admin_id,application_id,status,reserved_usd) values($1,$2,$3,'running',$4)",[req.requestId,admin,req.applicationId,reserved]);
      await c.query('commit'); return {order:order.rows[0]};
    } catch(e) { await c.query('rollback'); throw e; }
    finally { c.release(); }
  }
  async record(id,stage,provider,model,result) {
    await this.pool.query('insert into nexus_ai_private.calls(request_id,stage,provider,model,input_tokens,output_tokens,status,error_code) values($1,$2,$3,$4,$5,$6,$7,$8) on conflict(request_id,stage) do update set input_tokens=excluded.input_tokens,output_tokens=excluded.output_tokens,status=excluded.status,error_code=excluded.error_code',[id,stage,provider,model,result.inputTokens??null,result.outputTokens??null,result.status,result.errorCode??null]);
  }
  async finish(id,status,error) {
    // Never refund reservations on timeout/error: the provider may have billed the request.
    await this.pool.query('update nexus_ai_private.jobs set status=$2,error_code=$3,finished_at=now() where request_id=$1',[id,status,error]);
  }
}
