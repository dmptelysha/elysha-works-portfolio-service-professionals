-- Additive custom mailbox-verification challenges for the qualified quiz.
-- Plaintext OTPs never enter PostgreSQL. Only keyed 32-byte digests are stored.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table private.email_otp_challenges (
  id uuid primary key,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  email_digest bytea not null check (octet_length(email_digest) = 32),
  purpose text not null check (purpose = 'qualified_quiz'),
  otp_digest bytea check (otp_digest is null or octet_length(otp_digest) = 32),
  status text not null check (status in (
    'pending_delivery','active','delivery_failed','verified',
    'consumed','superseded','failed','expired'
  )),
  attempt_count integer not null default 0 check (attempt_count between 0 and 5),
  request_ip_digest bytea not null check (octet_length(request_ip_digest) = 32),
  make_delivery_id uuid not null unique,
  created_at timestamptz not null default now(),
  delivered_at timestamptz,
  expires_at timestamptz not null,
  resend_available_at timestamptz not null,
  verified_at timestamptz,
  grant_expires_at timestamptz,
  consumed_at timestamptz,
  consumed_quiz_session_id uuid references public.quiz_sessions(id) on delete set null,
  constraint email_otp_email_check check (
    email = lower(btrim(email))
    and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ),
  constraint email_otp_created_expiry_check check (expires_at > created_at),
  constraint email_otp_resend_check check (resend_available_at > created_at),
  constraint email_otp_terminal_digest_check check (
    status not in ('delivery_failed','consumed','superseded','failed','expired')
    or otp_digest is null
  ),
  constraint email_otp_verified_time_check check (
    status not in ('verified','consumed')
    or (verified_at is not null and grant_expires_at is not null and grant_expires_at > verified_at)
  ),
  constraint email_otp_consumed_check check (
    status <> 'consumed'
    or (consumed_at is not null and consumed_quiz_session_id is not null)
  )
);

alter table private.email_otp_challenges enable row level security;
revoke all on private.email_otp_challenges from public, anon, authenticated;

create unique index email_otp_one_active_owner_purpose_idx
  on private.email_otp_challenges (owner_user_id, purpose)
  where status in ('pending_delivery','active','verified');
create index email_otp_owner_purpose_created_idx
  on private.email_otp_challenges (owner_user_id, purpose, created_at desc);
create index email_otp_email_digest_created_idx
  on private.email_otp_challenges (email_digest, created_at desc);
create index email_otp_ip_digest_created_idx
  on private.email_otp_challenges (request_ip_digest, created_at desc);
create index email_otp_terminal_cleanup_idx
  on private.email_otp_challenges (created_at)
  where status in ('delivery_failed','consumed','superseded','failed','expired');

create function private.assert_email_otp_service_context()
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role'
    and session_user not in ('postgres', 'supabase_admin') then
    raise exception 'service authorization required' using errcode = '42501';
  end if;
end;
$$;

create function private.constant_time_equal_32(p_left bytea, p_right bytea)
returns boolean
language plpgsql
immutable
strict
set search_path = ''
as $$
declare
  v_difference integer := 0;
  v_index integer;
begin
  if octet_length(p_left) <> 32 or octet_length(p_right) <> 32 then
    return false;
  end if;
  for v_index in 0..31 loop
    v_difference := v_difference | (get_byte(p_left, v_index) # get_byte(p_right, v_index));
  end loop;
  return v_difference = 0;
end;
$$;

create function private.cleanup_email_otp_challenges(p_batch_size integer default 500)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_changed integer := 0;
  v_count integer := 0;
begin
  perform private.assert_email_otp_service_context();
  if p_batch_size not between 1 and 5000 then
    raise exception 'invalid cleanup batch' using errcode = '22023';
  end if;

  with stale as (
    select c.id
    from private.email_otp_challenges c
    where (
      c.status in ('pending_delivery','active') and c.expires_at <= now()
    ) or (
      c.status = 'verified' and c.grant_expires_at <= now()
    )
    order by c.created_at
    limit p_batch_size
    for update skip locked
  )
  update private.email_otp_challenges c
  set status = 'expired', otp_digest = null
  from stale s
  where c.id = s.id;
  get diagnostics v_count = row_count;
  v_changed := v_changed + v_count;

  with terminal as (
    select c.id
    from private.email_otp_challenges c
    where c.status in ('delivery_failed','consumed','superseded','failed','expired')
      and c.otp_digest is not null
    order by c.created_at
    limit p_batch_size
    for update skip locked
  )
  update private.email_otp_challenges c
  set otp_digest = null
  from terminal t
  where c.id = t.id;
  get diagnostics v_count = row_count;
  v_changed := v_changed + v_count;

  with removable as (
    select c.id
    from private.email_otp_challenges c
    where c.status in ('delivery_failed','consumed','superseded','failed','expired')
      and c.created_at < now() - interval '24 hours'
    order by c.created_at
    limit p_batch_size
    for update skip locked
  )
  delete from private.email_otp_challenges c
  using removable r
  where c.id = r.id;
  get diagnostics v_count = row_count;
  return v_changed + v_count;
end;
$$;

create function public.record_email_otp_challenge(
  p_challenge_id uuid,
  p_owner_user_id uuid,
  p_email text,
  p_email_digest bytea,
  p_otp_digest bytea,
  p_request_ip_digest bytea,
  p_make_delivery_id uuid,
  p_now timestamptz default now()
)
returns table (
  challenge_id uuid,
  expires_at timestamptz,
  resend_available_at timestamptz,
  result_code text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
begin
  perform private.assert_email_otp_service_context();
  perform private.cleanup_email_otp_challenges(100);
  if p_challenge_id is null or p_owner_user_id is null or p_make_delivery_id is null
    or coalesce(octet_length(p_email_digest), 0) <> 32
    or coalesce(octet_length(p_otp_digest), 0) <> 32
    or coalesce(octet_length(p_request_ip_digest), 0) <> 32
    or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'invalid OTP challenge input' using errcode = '22023';
  end if;
  if not exists (select 1 from auth.users u where u.id = p_owner_user_id) then
    raise exception 'invalid OTP challenge input' using errcode = '22023';
  end if;

  -- Deterministic lock order serializes concurrent first requests for each
  -- rate-limit dimension without retaining raw IP data.
  perform pg_advisory_xact_lock(hashtextextended('email-otp-email:' || encode(p_email_digest,'hex'), 0));
  perform pg_advisory_xact_lock(hashtextextended('email-otp-ip:' || encode(p_request_ip_digest,'hex'), 0));
  perform pg_advisory_xact_lock(hashtextextended('email-otp-owner:' || p_owner_user_id::text, 0));

  if exists (
    select 1 from private.email_otp_challenges c
    where c.owner_user_id = p_owner_user_id
      and c.purpose = 'qualified_quiz'
      and c.created_at > p_now - interval '60 seconds'
  ) then
    raise exception 'otp_cooldown' using errcode = 'P0001';
  end if;
  if (select count(*) from private.email_otp_challenges c
      where c.email_digest = p_email_digest
        and c.created_at > p_now - interval '15 minutes') >= 3 then
    raise exception 'otp_rate_limited' using errcode = 'P0001';
  end if;
  if (select count(*) from private.email_otp_challenges c
      where c.owner_user_id = p_owner_user_id
        and c.created_at > p_now - interval '15 minutes') >= 5 then
    raise exception 'otp_rate_limited' using errcode = 'P0001';
  end if;
  if (select count(*) from private.email_otp_challenges c
      where c.request_ip_digest = p_request_ip_digest
        and c.created_at > p_now - interval '15 minutes') >= 10 then
    raise exception 'otp_rate_limited' using errcode = 'P0001';
  end if;

  update private.email_otp_challenges c
  set status = 'superseded', otp_digest = null
  where c.owner_user_id = p_owner_user_id
    and c.purpose = 'qualified_quiz'
    and c.status in ('pending_delivery','active','verified');

  insert into private.email_otp_challenges (
    id, owner_user_id, email, email_digest, purpose, otp_digest, status,
    request_ip_digest, make_delivery_id, created_at, expires_at, resend_available_at
  ) values (
    p_challenge_id, p_owner_user_id, v_email, p_email_digest, 'qualified_quiz',
    p_otp_digest, 'pending_delivery', p_request_ip_digest, p_make_delivery_id,
    p_now, p_now + interval '10 minutes', p_now + interval '60 seconds'
  );

  return query select p_challenge_id, p_now + interval '10 minutes',
    p_now + interval '60 seconds', 'pending_delivery'::text;
end;
$$;

create function public.get_email_otp_challenge_context(
  p_challenge_id uuid,
  p_owner_user_id uuid
)
returns table (email text, purpose text, result_code text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.assert_email_otp_service_context();
  return query
    select c.email, c.purpose, 'ok'::text
    from private.email_otp_challenges c
    where c.id = p_challenge_id
      and c.owner_user_id = p_owner_user_id
      and c.status = 'active'
      and c.expires_at > now();
end;
$$;

create function public.mark_email_otp_delivery(
  p_challenge_id uuid,
  p_owner_user_id uuid,
  p_make_delivery_id uuid,
  p_delivered boolean,
  p_at timestamptz default now()
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row private.email_otp_challenges%rowtype;
begin
  perform private.assert_email_otp_service_context();
  select c.* into v_row
  from private.email_otp_challenges c
  where c.id = p_challenge_id
    and c.owner_user_id = p_owner_user_id
    and c.make_delivery_id = p_make_delivery_id
  for update;
  if not found or v_row.status <> 'pending_delivery' then
    return 'invalid_state';
  end if;
  if v_row.expires_at <= p_at then
    update private.email_otp_challenges
    set status = 'expired', otp_digest = null
    where id = p_challenge_id;
    return 'expired';
  end if;
  if p_delivered then
    update private.email_otp_challenges
    set status = 'active', delivered_at = p_at
    where id = p_challenge_id;
    return 'active';
  end if;
  update private.email_otp_challenges
  set status = 'delivery_failed', otp_digest = null
  where id = p_challenge_id;
  return 'delivery_failed';
end;
$$;

create function public.verify_email_otp_digest(
  p_challenge_id uuid,
  p_owner_user_id uuid,
  p_candidate_digest bytea,
  p_now timestamptz default now()
)
returns table (verified boolean, grant_expires_at timestamptz, result_code text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row private.email_otp_challenges%rowtype;
  v_attempts integer;
begin
  perform private.assert_email_otp_service_context();
  perform private.cleanup_email_otp_challenges(100);
  if coalesce(octet_length(p_candidate_digest), 0) <> 32 then
    return query select false, null::timestamptz, 'invalid'::text;
    return;
  end if;
  select c.* into v_row
  from private.email_otp_challenges c
  where c.id = p_challenge_id
    and c.owner_user_id = p_owner_user_id
  for update;
  if not found or v_row.status <> 'active' then
    return query select false, null::timestamptz, 'invalid'::text;
    return;
  end if;
  if v_row.expires_at <= p_now then
    update private.email_otp_challenges
    set status = 'expired', otp_digest = null
    where id = p_challenge_id;
    return query select false, null::timestamptz, 'invalid'::text;
    return;
  end if;
  if private.constant_time_equal_32(v_row.otp_digest, p_candidate_digest) then
    update private.email_otp_challenges
    set status = 'verified', verified_at = p_now,
        grant_expires_at = p_now + interval '10 minutes'
    where id = p_challenge_id;
    return query select true, p_now + interval '10 minutes', 'verified'::text;
    return;
  end if;
  v_attempts := v_row.attempt_count + 1;
  update private.email_otp_challenges
  set attempt_count = v_attempts,
      status = case when v_attempts >= 5 then 'failed' else status end,
      otp_digest = case when v_attempts >= 5 then null else otp_digest end
  where id = p_challenge_id;
  return query select false, null::timestamptz, 'invalid'::text;
end;
$$;

create function public.begin_custom_verified_qualified_quiz(
  p_visitor_id uuid,
  p_portfolio_session_id uuid,
  p_quiz_session_id uuid,
  p_challenge_id uuid,
  p_audience_key text,
  p_first_name text,
  p_last_name text,
  p_business_name text,
  p_consent boolean,
  p_consent_version text default 'proposal_followup_v1',
  p_business_scope text default null
)
returns table (
  submission_status text,
  lead_id uuid,
  quiz_session_id uuid,
  existing_business_name text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_challenge private.email_otp_challenges%rowtype;
  v_lead_id uuid;
  v_existing_lead_id uuid;
  v_existing_business_name text;
  v_matching_business_lead_id uuid;
  v_business_scope text := nullif(btrim(coalesce(p_business_scope, '')), '');
  v_first_name text := btrim(coalesce(p_first_name, ''));
  v_last_name text := btrim(coalesce(p_last_name, ''));
  v_business_name text := btrim(coalesce(p_business_name, ''));
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if coalesce(auth.jwt() ->> 'is_anonymous', 'false') <> 'true' then
    raise exception 'anonymous assessment required' using errcode = '42501';
  end if;
  if p_consent is not true or p_consent_version <> 'proposal_followup_v1' then
    raise exception 'valid consent is required' using errcode = '22023';
  end if;
  if length(v_first_name) not between 1 and 120
    or length(v_last_name) not between 1 and 120
    or length(v_business_name) not between 1 and 200 then
    raise exception 'invalid contact details' using errcode = '22023';
  end if;
  if v_business_scope is not null
    and v_business_scope not in ('same_business', 'another_business') then
    raise exception 'invalid business scope' using errcode = '22023';
  end if;

  perform 1 from public.site_visitors v
  where v.id = p_visitor_id and v.owner_user_id = v_uid;
  if not found then
    raise exception 'invalid attribution' using errcode = '42501';
  end if;
  perform 1 from public.portfolio_sessions ps
  where ps.id = p_portfolio_session_id and ps.visitor_id = p_visitor_id
    and ps.owner_user_id = v_uid;
  if not found then
    raise exception 'invalid attribution' using errcode = '42501';
  end if;
  select qs.lead_id into v_lead_id
  from public.quiz_sessions qs
  where qs.id = p_quiz_session_id and qs.visitor_id = p_visitor_id
    and qs.portfolio_session_id = p_portfolio_session_id
    and qs.owner_user_id = v_uid and qs.audience_key = p_audience_key
    and qs.status = 'in_progress'
  for update;
  if not found then
    raise exception 'invalid quiz session' using errcode = '42501';
  end if;

  select c.* into v_challenge
  from private.email_otp_challenges c
  where c.id = p_challenge_id and c.owner_user_id = v_uid
    and c.purpose = 'qualified_quiz'
  for update;
  if not found then
    raise exception 'verified challenge required' using errcode = '42501';
  end if;
  if v_challenge.status = 'consumed'
    and v_challenge.consumed_quiz_session_id = p_quiz_session_id
    and v_lead_id is not null then
    return query select 'accepted'::text, v_lead_id, p_quiz_session_id, null::text;
    return;
  end if;
  if v_challenge.status <> 'verified'
    or v_challenge.grant_expires_at is null
    or v_challenge.grant_expires_at <= now() then
    raise exception 'verified challenge required' using errcode = '42501';
  end if;
  if v_lead_id is not null then
    raise exception 'invalid lead link' using errcode = '42501';
  end if;

  select l.id, l.business_name
  into v_existing_lead_id, v_existing_business_name
  from public.leads l
  where lower(btrim(l.email)) = v_challenge.email
    and l.email_verified_at is not null
  order by l.updated_at desc, l.id desc
  limit 1
  for update;

  select l.id into v_matching_business_lead_id
  from public.leads l
  where lower(btrim(l.email)) = v_challenge.email
    and l.email_verified_at is not null
    and lower(btrim(coalesce(l.business_name, ''))) = lower(v_business_name)
  order by l.updated_at desc, l.id desc
  limit 1
  for update;

  if v_existing_lead_id is not null and v_business_scope is null then
    return query select 'business_scope_required'::text, null::uuid,
      p_quiz_session_id, v_existing_business_name;
    return;
  end if;

  if v_business_scope = 'same_business' then
    if v_matching_business_lead_id is null then
      raise exception 'business scope changed; retry submission' using errcode = '40001';
    end if;
    v_lead_id := v_matching_business_lead_id;
    update public.leads
    set first_name = v_first_name, last_name = v_last_name,
        email_verified_at = v_challenge.verified_at,
        proposal_email_consent_at = now(),
        proposal_email_consent_version = p_consent_version,
        last_contact_at = now()
    where id = v_lead_id;
  else
    if v_business_scope = 'another_business'
      and v_matching_business_lead_id is not null then
      raise exception 'another business requires a different business name' using errcode = '22023';
    end if;
    insert into public.leads (
      auth_user_id, email_verified_at, visitor_id, first_name, last_name, email,
      business_name, audience_key, acquisition_source,
      source_portfolio_session_id, source_quiz_session_id,
      crm_stage, lead_status, proposal_delivery_status,
      proposal_email_consent_at, proposal_email_consent_version
    ) values (
      v_uid, v_challenge.verified_at, p_visitor_id, v_first_name, v_last_name,
      v_challenge.email, v_business_name, p_audience_key, 'quiz',
      p_portfolio_session_id, p_quiz_session_id,
      'new', 'open', 'pending', now(), p_consent_version
    ) returning id into v_lead_id;
  end if;

  update public.quiz_sessions set lead_id = v_lead_id
  where id = p_quiz_session_id and owner_user_id = v_uid;
  update public.portfolio_sessions
  set lead_id = v_lead_id, converted_to_lead = true
  where id = p_portfolio_session_id and owner_user_id = v_uid;
  update public.site_visitors
  set consent_status = 'granted', last_seen_at = now()
  where id = p_visitor_id and owner_user_id = v_uid;
  update private.email_otp_challenges
  set status = 'consumed', otp_digest = null, consumed_at = now(),
      consumed_quiz_session_id = p_quiz_session_id
  where id = p_challenge_id and status = 'verified';
  if not found then
    raise exception 'verified challenge already consumed' using errcode = '40001';
  end if;

  insert into public.analytics_events (
    owner_user_id,event_name,visitor_id,portfolio_session_id,quiz_session_id,
    lead_id,audience_key,page_path,properties
  ) values (
    v_uid,'custom_verified_lead_contact_submitted',p_visitor_id,
    p_portfolio_session_id,p_quiz_session_id,v_lead_id,p_audience_key,'/quiz/',
    jsonb_build_object(
      'consent_version',p_consent_version,
      'business_scope',coalesce(v_business_scope,'first_business'),
      'rpc_version','custom_otp_v1'
    )
  );
  return query select 'accepted'::text, v_lead_id, p_quiz_session_id, null::text;
end;
$$;

revoke execute on function private.assert_email_otp_service_context() from public, anon, authenticated;
revoke execute on function private.constant_time_equal_32(bytea,bytea) from public, anon, authenticated;
revoke execute on function private.cleanup_email_otp_challenges(integer) from public, anon, authenticated;

revoke execute on function public.record_email_otp_challenge(uuid,uuid,text,bytea,bytea,bytea,uuid,timestamptz)
  from public, anon, authenticated;
grant execute on function public.record_email_otp_challenge(uuid,uuid,text,bytea,bytea,bytea,uuid,timestamptz)
  to service_role;
revoke execute on function public.get_email_otp_challenge_context(uuid,uuid)
  from public, anon, authenticated;
grant execute on function public.get_email_otp_challenge_context(uuid,uuid)
  to service_role;
revoke execute on function public.mark_email_otp_delivery(uuid,uuid,uuid,boolean,timestamptz)
  from public, anon, authenticated;
grant execute on function public.mark_email_otp_delivery(uuid,uuid,uuid,boolean,timestamptz)
  to service_role;
revoke execute on function public.verify_email_otp_digest(uuid,uuid,bytea,timestamptz)
  from public, anon, authenticated;
grant execute on function public.verify_email_otp_digest(uuid,uuid,bytea,timestamptz)
  to service_role;
revoke execute on function public.begin_custom_verified_qualified_quiz(uuid,uuid,uuid,uuid,text,text,text,text,boolean,text,text)
  from public, anon, authenticated;
grant execute on function public.begin_custom_verified_qualified_quiz(uuid,uuid,uuid,uuid,text,text,text,text,boolean,text,text)
  to authenticated;

-- Install the bounded cleanup schedule only where pg_cron is available.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    execute 'create extension if not exists pg_cron with schema pg_catalog';
    if not exists (select 1 from cron.job where jobname = 'elysha-email-otp-cleanup-hourly') then
      perform cron.schedule(
        'elysha-email-otp-cleanup-hourly',
        '17 * * * *',
        'select private.cleanup_email_otp_challenges(500)'
      );
    end if;
  end if;
end;
$$;

-- Reversible operational rollback for only this ephemeral cleanup job:
-- select cron.unschedule('elysha-email-otp-cleanup-hourly');
