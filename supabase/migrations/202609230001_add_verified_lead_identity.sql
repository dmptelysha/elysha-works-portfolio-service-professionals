-- Additive verified-identity rollout. The existing v2 RPC remains executable
-- during the measured cached-client compatibility window and is not replaced
-- or revoked by this migration.

alter table public.leads
  add column auth_user_id uuid,
  add column email_verified_at timestamptz,
  add constraint leads_auth_user_id_fkey foreign key (auth_user_id)
    references auth.users(id) on delete set null,
  add constraint leads_last_name_check check (
    last_name is null or length(btrim(last_name)) between 1 and 120
  );

create index leads_auth_user_updated_idx
  on public.leads (auth_user_id, updated_at desc)
  where auth_user_id is not null;

create function public.begin_verified_qualified_quiz(
  p_visitor_id uuid,
  p_portfolio_session_id uuid,
  p_quiz_session_id uuid,
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
  v_verified_email text;
  v_email_verified_at timestamptz;
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
  if coalesce(auth.jwt() ->> 'is_anonymous', 'true') <> 'false' then
    raise exception 'verified authentication required' using errcode = '42501';
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

  select lower(btrim(u.email)), u.email_confirmed_at
  into v_verified_email, v_email_verified_at
  from auth.users u
  where u.id = v_uid
    and u.email_confirmed_at is not null
    and length(btrim(coalesce(u.email, ''))) > 0
  for update;
  if not found then
    raise exception 'verified authentication required' using errcode = '42501';
  end if;

  perform 1
  from public.site_visitors v
  where v.id = p_visitor_id
    and v.owner_user_id = v_uid;
  if not found then
    raise exception 'invalid attribution' using errcode = '42501';
  end if;

  perform 1
  from public.portfolio_sessions ps
  where ps.id = p_portfolio_session_id
    and ps.visitor_id = p_visitor_id
    and ps.owner_user_id = v_uid;
  if not found then
    raise exception 'invalid attribution' using errcode = '42501';
  end if;

  select qs.lead_id
  into v_lead_id
  from public.quiz_sessions qs
  where qs.id = p_quiz_session_id
    and qs.visitor_id = p_visitor_id
    and qs.portfolio_session_id = p_portfolio_session_id
    and qs.owner_user_id = v_uid
    and qs.audience_key = p_audience_key
    and qs.status = 'in_progress'
  for update;
  if not found then
    raise exception 'invalid quiz session' using errcode = '42501';
  end if;

  if v_lead_id is not null then
    perform 1
    from public.leads l
    where l.id = v_lead_id
      and l.auth_user_id = v_uid;
    if not found then
      raise exception 'invalid lead link' using errcode = '42501';
    end if;
    return query select 'accepted'::text, v_lead_id, p_quiz_session_id, null::text;
    return;
  end if;

  select l.id, l.business_name
  into v_existing_lead_id, v_existing_business_name
  from public.leads l
  where l.auth_user_id = v_uid
  order by l.updated_at desc, l.id desc
  limit 1
  for update;

  select l.id
  into v_matching_business_lead_id
  from public.leads l
  where l.auth_user_id = v_uid
    and lower(btrim(coalesce(l.business_name, ''))) = lower(v_business_name)
  order by l.updated_at desc, l.id desc
  limit 1
  for update;

  if v_existing_lead_id is not null and v_business_scope is null then
    return query
      select 'business_scope_required'::text, null::uuid, p_quiz_session_id, v_existing_business_name;
    return;
  end if;

  if v_business_scope = 'same_business' then
    if v_matching_business_lead_id is null then
      raise exception 'business scope changed; retry submission' using errcode = '40001';
    end if;
    v_lead_id := v_matching_business_lead_id;
    update public.leads
    set first_name = v_first_name,
        last_name = v_last_name,
        email = v_verified_email,
        email_verified_at = v_email_verified_at,
        proposal_email_consent_at = now(),
        proposal_email_consent_version = p_consent_version,
        last_contact_at = now()
    where id = v_lead_id
      and auth_user_id = v_uid;
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
      v_uid, v_email_verified_at, p_visitor_id, v_first_name, v_last_name,
      v_verified_email, v_business_name, p_audience_key, 'quiz',
      p_portfolio_session_id, p_quiz_session_id,
      'new', 'open', 'pending', now(), p_consent_version
    ) returning id into v_lead_id;
  end if;

  update public.quiz_sessions
  set lead_id = v_lead_id
  where id = p_quiz_session_id
    and owner_user_id = v_uid;

  update public.portfolio_sessions
  set lead_id = v_lead_id,
      converted_to_lead = true
  where id = p_portfolio_session_id
    and owner_user_id = v_uid;

  update public.site_visitors
  set consent_status = 'granted',
      last_seen_at = now()
  where id = p_visitor_id
    and owner_user_id = v_uid;

  insert into public.analytics_events (
    owner_user_id, event_name, visitor_id, portfolio_session_id, quiz_session_id,
    lead_id, audience_key, page_path, properties
  ) values (
    v_uid, 'verified_lead_contact_submitted', p_visitor_id, p_portfolio_session_id,
    p_quiz_session_id, v_lead_id, p_audience_key, '/quiz/',
    jsonb_build_object(
      'consent_version', p_consent_version,
      'business_scope', coalesce(v_business_scope, 'first_business'),
      'rpc_version', 'verified_v1'
    )
  );

  return query select 'accepted'::text, v_lead_id, p_quiz_session_id, null::text;
end;
$$;

revoke execute on function public.begin_verified_qualified_quiz(uuid,uuid,uuid,text,text,text,text,boolean,text,text)
  from public, anon, authenticated;
grant execute on function public.begin_verified_qualified_quiz(uuid,uuid,uuid,text,text,text,text,boolean,text,text)
  to authenticated;
