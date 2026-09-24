-- Bind the business confirmation shown in the browser to an exact lead row.
-- The selected UUID is a selector only; the verified challenge email remains
-- the authorization boundary for every lookup.

create function public.begin_custom_verified_qualified_quiz_v2(
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
  p_business_scope text default null,
  p_selected_business_id uuid default null
)
returns table (
  submission_status text,
  lead_id uuid,
  quiz_session_id uuid,
  existing_business_id uuid,
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
  if p_selected_business_id is not null
    and v_business_scope is distinct from 'same_business' then
    raise exception 'invalid business selection' using errcode = '22023';
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
    return query select 'accepted'::text, v_lead_id, p_quiz_session_id,
      null::uuid, null::text;
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

  -- Serialize the lookup-or-insert decision for one verified mailbox and
  -- normalized business name so concurrent submissions cannot create twins.
  perform pg_advisory_xact_lock(hashtextextended(
    'verified-business:' || v_challenge.email || ':' || lower(v_business_name), 0
  ));

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
      p_quiz_session_id, v_existing_lead_id, v_existing_business_name;
    return;
  end if;

  if v_business_scope = 'same_business' then
    if p_selected_business_id is null then
      raise exception 'business selection required' using errcode = '22023';
    end if;
    select l.id into v_lead_id
    from public.leads l
    where l.id = p_selected_business_id
      and lower(btrim(l.email)) = v_challenge.email
      and l.email_verified_at is not null
    for update;
    if not found then
      raise exception 'invalid business selection' using errcode = '42501';
    end if;
  elsif v_business_scope = 'another_business' then
    if v_matching_business_lead_id = v_existing_lead_id then
      return query select 'different_business_name_required'::text, null::uuid,
        p_quiz_session_id, v_existing_lead_id, v_existing_business_name;
      return;
    elsif v_matching_business_lead_id is not null then
      v_lead_id := v_matching_business_lead_id;
    else
      v_lead_id := null;
    end if;
  end if;

  if v_lead_id is not null then
    update public.leads
    set first_name = v_first_name, last_name = v_last_name,
        email_verified_at = v_challenge.verified_at,
        proposal_email_consent_at = now(),
        proposal_email_consent_version = p_consent_version,
        last_contact_at = now()
    where id = v_lead_id;
  else
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
      'rpc_version','custom_otp_v2'
    )
  );
  return query select 'accepted'::text, v_lead_id, p_quiz_session_id,
    null::uuid, null::text;
end;
$$;

revoke execute on function public.begin_custom_verified_qualified_quiz_v2(
  uuid,uuid,uuid,uuid,text,text,text,text,boolean,text,text,uuid
) from public, anon, authenticated;
grant execute on function public.begin_custom_verified_qualified_quiz_v2(
  uuid,uuid,uuid,uuid,text,text,text,text,boolean,text,text,uuid
) to authenticated;
