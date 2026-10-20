-- Private written support. Random 256-bit client key; only its SHA-256 is stored.
create table public.support_inquiries (
 id uuid primary key default gen_random_uuid(),
 access_hash text not null unique,
 question text not null check (length(btrim(question)) between 5 and 4000),
 language text not null check (length(btrim(language)) between 1 and 40),
 answer text not null default '' check (length(answer)<=8000),
 created_at timestamptz not null default now(),
 answered_at timestamptz,
 consent_version text not null default '2026-10-20-written-support'
);
alter table public.support_inquiries enable row level security;
revoke all on public.support_inquiries from anon, authenticated;
grant select(id,question,language,answer,created_at,answered_at) on public.support_inquiries to authenticated;
grant update(answer,answered_at) on public.support_inquiries to authenticated;
create policy support_admin_read on public.support_inquiries for select to authenticated
 using (exists(select 1 from public.admin_users where user_id=(select auth.uid())));
create policy support_admin_answer on public.support_inquiries for update to authenticated
 using (exists(select 1 from public.admin_users where user_id=(select auth.uid())))
 with check (exists(select 1 from public.admin_users where user_id=(select auth.uid())));
-- Narrow anonymous entry points intentionally bypass table RLS after input/key validation.
create function public.submit_support_inquiry(p_question text,p_language text,p_access_token text,p_consent boolean,p_transfer_consent boolean)
returns uuid language plpgsql security definer set search_path='' as $$
declare result_id uuid; token_hash text;
begin
 if p_consent is distinct from true or p_transfer_consent is distinct from true
 or coalesce(length(btrim(p_question)),0) not between 5 and 4000
 or coalesce(length(btrim(p_language)),0) not between 1 and 40
 or p_access_token is null or p_access_token !~ '^[a-f0-9]{64}$' then
 raise exception 'Invalid inquiry'; end if;
 token_hash:=encode(sha256(convert_to(p_access_token,'UTF8')),'hex');
 insert into public.support_inquiries(access_hash,question,language)
 values(token_hash,btrim(p_question),btrim(p_language))
 on conflict(access_hash) do nothing returning id into result_id;
 if result_id is null then select id into result_id from public.support_inquiries where access_hash=token_hash; end if;
 return result_id;
end; $$;
create function public.read_support_inquiry(p_id uuid,p_access_token text)
returns table(question text,language text,answer text,created_at timestamptz,answered_at timestamptz)
language sql stable security definer set search_path='' as $$
 select s.question,s.language,s.answer,s.created_at,s.answered_at from public.support_inquiries s
 where s.id=p_id and length(p_access_token)=64
 and s.access_hash=encode(sha256(convert_to(p_access_token,'UTF8')),'hex');
$$;
revoke all on function public.submit_support_inquiry(text,text,text,boolean,boolean) from public;
revoke all on function public.read_support_inquiry(uuid,text) from public;
grant execute on function public.submit_support_inquiry(text,text,text,boolean,boolean) to anon,authenticated;
grant execute on function public.read_support_inquiry(uuid,text) to anon,authenticated;
