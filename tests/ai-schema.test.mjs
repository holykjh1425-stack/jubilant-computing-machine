import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('additive AI migration and role permissions on disposable PostgreSQL', async t => {
  const db = new PGlite();
  const admin = '11111111-1111-4111-8111-111111111111';
  const other = '33333333-3333-4333-8333-333333333333';
  try {
    // Minimal stand-ins for Supabase-owned schemas, never a remote database.
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; grant usage on schema auth to public;
      create function auth.jwt() returns jsonb language sql as $$
        select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb;
      $$;
      create function auth.uid() returns uuid language sql as $$ select (auth.jwt()->>'sub')::uuid; $$;
      create table public.admin_users(user_id uuid primary key);
      alter table public.admin_users enable row level security;
      grant select on public.admin_users to authenticated,service_role;
      create policy own_admin on public.admin_users for select to authenticated using (user_id = auth.uid());
      insert into public.admin_users values ('${admin}');
      create table public.applications(id int primary key, status text, description text);
      insert into public.applications values (1,'received','fictional one'),(2,'reviewing','fictional two'),(3,'received','fictional three');
      create schema vault;
      create table vault.decrypted_secrets(name text, decrypted_secret text);
      insert into vault.decrypted_secrets values ('nexus_labs_claude_api_key','sk-ant-schema-test-placeholder');
    `);
    const before = await db.query('select * from applications order by id');
    const migration = await readFile(new URL('../supabase/migrations/20261021121716_nexus_ai_server.sql', import.meta.url), 'utf8');
    await db.exec(migration);
    await t.test('migration leaves all three existing customer rows unchanged', async () => {
      assert.deepEqual((await db.query('select * from applications order by id')).rows, before.rows);
      assert.equal((await db.query("select count(*)::int n from pg_trigger where tgrelid='public.applications'::regclass and not tgisinternal")).rows[0].n, 0);
    });
    async function role(name, sub = null) {
      await db.exec('reset role');
      await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({ role: name, ...(sub ? { sub } : {}) })]);
      await db.exec(`set role ${name}`);
    }
    await t.test('anon cannot read audit, plans, or the Vault bridge', async () => {
      await role('anon');
      for (const sql of ['select * from ai_connection_runs', 'select * from ai_work_plans', 'select nexus_ai_key()', `select nexus_ai_claim_test('${admin}')`]) {
        await assert.rejects(db.query(sql), /permission denied/);
      }
    });
    await t.test('authenticated non-admin cannot read audit or plans, or execute secret RPC', async () => {
      await role('authenticated', other);
      assert.equal((await db.query('select * from ai_connection_runs')).rows.length, 0);
      assert.equal((await db.query('select * from ai_work_plans')).rows.length, 0);
      await assert.rejects(db.query('select nexus_ai_key()'), /permission denied/);
      await assert.rejects(db.query(`select nexus_ai_claim_test('${other}')`), /permission denied/);
    });
    await t.test('server reads existing Vault key and reserves exactly one global test', async () => {
      await role('service_role');
      assert.equal((await db.query('select nexus_ai_key() as k')).rows[0].k, 'sk-ant-schema-test-placeholder');
      await assert.rejects(db.query(`select nexus_ai_claim_test('${other}')`), /admin required/);
      assert.equal((await db.query(`select nexus_ai_claim_test('${admin}') as claimed`)).rows[0].claimed, true);
      assert.equal((await db.query(`select nexus_ai_claim_test('${admin}') as claimed`)).rows[0].claimed, false);
      await db.query(`update ai_connection_runs set status='failed'`);
      assert.equal((await db.query(`select nexus_ai_claim_test('${admin}') as claimed`)).rows[0].claimed, false);
      await assert.rejects(db.query(`insert into ai_connection_runs(run_key,requested_by) values('another-test','${admin}')`), /check constraint/);
    });
    await t.test('admin can read audit but cannot modify it or access decrypted keys', async () => {
      await role('authenticated', admin);
      assert.equal((await db.query('select * from ai_connection_runs')).rows.length, 1);
      await assert.rejects(db.query("update ai_connection_runs set status='reserved'"), /permission denied/);
      await assert.rejects(db.query('delete from ai_connection_runs'), /permission denied/);
      await assert.rejects(db.query('select nexus_ai_key()'), /permission denied/);
      await assert.rejects(db.query('select nexus_ai_private.claude_key()'), /permission denied/);
    });
    await t.test('non-admin RLS still hides the audit after server creates it', async () => {
      await role('authenticated', other);
      assert.equal((await db.query('select * from ai_connection_runs')).rows.length, 0);
      await role('postgres');
      assert.deepEqual((await db.query('select * from applications order by id')).rows, before.rows);
    });
  } finally { await db.close(); }
});
