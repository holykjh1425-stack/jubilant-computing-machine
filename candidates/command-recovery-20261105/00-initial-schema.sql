-- CANDIDATE: new, empty non-production database only. Never run on production.
create table "public"."admin_users" (
 "user_id" uuid not null,
 "created_at" timestamp with time zone default now() not null,
 constraint "admin_users_pkey" PRIMARY KEY (user_id),
 constraint "admin_users_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);
alter table public."admin_users" enable row level security;
revoke all on public."admin_users" from public,anon,authenticated,service_role;
create policy "admin reads own record" on public."admin_users" for SELECT to "authenticated" using ((user_id = ( SELECT auth.uid() AS uid)));
create table "public"."applications" (
 "id" uuid default gen_random_uuid() not null,
 "receipt_number" text default ((('NX-'::text || to_char((now() AT TIME ZONE 'utc'::text), 'YYYYMMDD'::text)) || '-'::text) || upper(substr(replace((gen_random_uuid())::text, '-'::text, ''::text), 1, 8))) not null,
 "created_at" timestamp with time zone default now() not null,
 "customer_name" text not null,
 "contact" text not null,
 "service_type" text not null,
 "description" text not null,
 "privacy_consent" boolean not null,
 "status" text default 'received'::text not null,
 "internal_note" text,
 constraint "applications_contact_check" CHECK (((char_length(contact) >= 3) AND (char_length(contact) <= 200))),
 constraint "applications_customer_name_check" CHECK (((char_length(customer_name) >= 1) AND (char_length(customer_name) <= 100))),
 constraint "applications_description_check" CHECK (((char_length(description) >= 1) AND (char_length(description) <= 5000))),
 constraint "applications_pkey" PRIMARY KEY (id),
 constraint "applications_privacy_consent_check" CHECK ((privacy_consent = true)),
 constraint "applications_receipt_number_key" UNIQUE (receipt_number),
 constraint "applications_service_type_check" CHECK ((service_type = ANY (ARRAY['website'::text, 'ai_automation'::text, 'custom_system'::text, 'consulting'::text]))),
 constraint "applications_status_check" CHECK ((status = ANY (ARRAY['received'::text, 'reviewing'::text, 'deposit_confirmed'::text, 'in_progress'::text, 'completed'::text, 'cancelled'::text])))
);
alter table public."applications" enable row level security;
revoke all on public."applications" from public,anon,authenticated,service_role;
create policy "admins read applications" on public."applications" for SELECT to "authenticated" using ((EXISTS ( SELECT 1
   FROM admin_users au
  WHERE (au.user_id = ( SELECT auth.uid() AS uid)))));
create policy "admins update applications" on public."applications" for UPDATE to "authenticated" using ((EXISTS ( SELECT 1
   FROM admin_users au
  WHERE (au.user_id = ( SELECT auth.uid() AS uid))))) with check ((EXISTS ( SELECT 1
   FROM admin_users au
  WHERE (au.user_id = ( SELECT auth.uid() AS uid)))));
create policy "public submits only new applications" on public."applications" for INSERT to "anon","authenticated" with check (((privacy_consent = true) AND (status = 'received'::text) AND (internal_note IS NULL)));
grant select on public.admin_users to authenticated,service_role;
grant insert on public.applications to anon;
grant select,insert,update on public.applications to authenticated;
grant all on public.applications to service_role;
