-- REVIEW TEMPLATE ONLY. DO NOT EXECUTE BEFORE GUARD + SEPARATE OPERATION APPROVAL.
-- Not a migration. Creates no secret values; Vault entries must be protected owner setup.
-- Approval package must specify the capture watermark, recipients, quota and enable flags.
-- Supabase function gateway JWT verification must be disabled only for this endpoint,
-- whose handler independently requires its dedicated 32+ character dispatch credential.
-- Existing cron jobs are not replaced or modified.
select cron.schedule(
 'solq-notification-drain',
 '*/5 * * * *',
 $schedule$
 select net.http_post(
  url:=(select decrypted_secret from vault.decrypted_secrets where name='solq_notification_dispatch_url'),
  headers:=jsonb_build_object(
   'Content-Type','application/json',
   'Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='solq_notification_dispatch_key')
  ),
  body:='{"action":"drain"}'::jsonb,
  timeout_milliseconds:=85000
 );
 $schedule$
);
-- Planned stop is to disable this named job and set dispatcher + delivery flags OFF.
-- Do not print cron commands, Vault decrypted values or pg_net request headers in reports.
