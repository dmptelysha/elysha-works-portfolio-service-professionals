-- Additive client-proposal workflow. This migration keeps the original eleven
-- Phase 1 tables and moves protected proposal state behind service-only RPCs.

alter table public.quiz_sessions
  alter column resume_expires_at set default (now() + interval '72 hours'),
  add column selected_tier_key text,
  add column selected_platform text,
  add column selected_offer_key text,
  add column selected_roadmap_snapshot jsonb,
  add column proposal_reference uuid,
  add column proposal_access_key_hash text,
  add column proposal_status text not null default 'not_issued',
  add column proposal_issued_at timestamptz,
  add column proposal_expires_at timestamptz,
  add column proposal_last_viewed_at timestamptz,
  add column proposal_failed_attempts integer not null default 0,
  add column proposal_locked_until timestamptz,
  add constraint quiz_sessions_selected_offer_key_fkey
    foreign key (selected_offer_key) references public.package_catalog(offer_key) on delete restrict,
  add constraint quiz_sessions_selection_check check (
    (selected_tier_key is null and selected_platform is null and selected_offer_key is null)
    or
    (selected_tier_key in ('basic','advanced','complete')
      and selected_platform in ('systeme_io','gohighlevel','custom_app')
      and selected_offer_key is not null)
  ),
  add constraint quiz_sessions_selected_roadmap_snapshot_check check (
    selected_roadmap_snapshot is null
    or (jsonb_typeof(selected_roadmap_snapshot) = 'object' and pg_column_size(selected_roadmap_snapshot) <= 262144)
  ),
  add constraint quiz_sessions_proposal_status_check check (
    proposal_status in ('not_issued','active','expired','revoked')
  ),
  add constraint quiz_sessions_proposal_hash_check check (
    proposal_access_key_hash is null or proposal_access_key_hash ~ '^[0-9a-f]{64}$'
  ),
  add constraint quiz_sessions_proposal_failed_attempts_check check (proposal_failed_attempts >= 0),
  add constraint quiz_sessions_proposal_expiry_check check (
    proposal_expires_at is null
    or (proposal_issued_at is not null and proposal_expires_at = proposal_issued_at + interval '72 hours')
  ),
  add constraint quiz_sessions_active_proposal_check check (
    proposal_status <> 'active'
    or (
      status = 'completed'
      and lead_id is not null
      and result_snapshot is not null
      and selected_roadmap_snapshot is not null
      and selected_tier_key is not null
      and selected_platform is not null
      and selected_offer_key is not null
      and proposal_reference is not null
      and proposal_access_key_hash is not null
      and proposal_issued_at is not null
      and proposal_expires_at is not null
    )
  );

alter table public.leads
  add column proposal_delivery_status text not null default 'pending',
  add column proposal_email_consent_at timestamptz,
  add column proposal_email_consent_version text,
  add column proposal_sent_at timestamptz,
  add column proposal_follow_up_count integer not null default 0,
  add column next_proposal_follow_up_at timestamptz,
  add column proposal_follow_up_claim_id uuid,
  add column proposal_follow_up_claimed_at timestamptz,
  add column proposal_follow_up_stopped_at timestamptz,
  add column cold_at timestamptz,
  add constraint leads_proposal_delivery_status_check check (
    proposal_delivery_status in ('pending','sent','failed','stopped','cold')
  ),
  add constraint leads_proposal_consent_check check (
    (proposal_email_consent_at is null and proposal_email_consent_version is null)
    or
    (proposal_email_consent_at is not null and proposal_email_consent_version = 'proposal_followup_v1')
  ),
  add constraint leads_proposal_follow_up_count_check check (proposal_follow_up_count between 0 and 3),
  add constraint leads_proposal_claim_check check (
    (proposal_follow_up_claim_id is null and proposal_follow_up_claimed_at is null)
    or
    (proposal_follow_up_claim_id is not null and proposal_follow_up_claimed_at is not null)
  );

create unique index quiz_sessions_proposal_reference_uidx
  on public.quiz_sessions (proposal_reference)
  where proposal_reference is not null;
create index quiz_sessions_active_proposal_expiry_idx
  on public.quiz_sessions (proposal_expires_at)
  where proposal_status = 'active';
create index leads_due_proposal_follow_up_idx
  on public.leads (next_proposal_follow_up_at, proposal_follow_up_count)
  where proposal_delivery_status = 'sent'
    and proposal_follow_up_stopped_at is null
    and next_proposal_follow_up_at is not null;

create or replace function public.touch_quiz_activity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'in_progress' and (
    new.current_step is distinct from old.current_step
    or new.last_completed_step is distinct from old.last_completed_step
    or new.answers is distinct from old.answers
  ) then
    new.last_activity_at := now();
    new.resume_expires_at := now() + interval '72 hours';
  end if;
  return new;
end;
$$;

create or replace function public.update_quiz_lifecycle(p_quiz_session_id uuid, p_action text)
returns table (quiz_session_id uuid, quiz_status text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_status text;
begin
  if v_uid is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if p_action not in ('resume','restart','abandon') then
    raise exception 'invalid lifecycle action' using errcode = '22023';
  end if;
  select qs.status into v_status
  from public.quiz_sessions qs
  where qs.id = p_quiz_session_id and qs.owner_user_id = v_uid
  for update;
  if not found or v_status <> 'in_progress' then
    raise exception 'invalid quiz session state' using errcode = '42501';
  end if;
  if p_action = 'resume' then
    update public.quiz_sessions
    set resume_count = resume_count + 1,
        last_resumed_at = now(),
        last_activity_at = now(),
        resume_expires_at = now() + interval '72 hours'
    where id = p_quiz_session_id;
    v_status := 'in_progress';
  elsif p_action = 'restart' then
    update public.quiz_sessions set status = 'restarted', last_activity_at = now()
    where id = p_quiz_session_id;
    v_status := 'restarted';
  else
    update public.quiz_sessions set status = 'abandoned', last_activity_at = now()
    where id = p_quiz_session_id;
    v_status := 'abandoned';
  end if;
  return query select p_quiz_session_id, v_status;
end;
$$;

create function public.begin_qualified_quiz(
  p_visitor_id uuid,
  p_portfolio_session_id uuid,
  p_quiz_session_id uuid,
  p_audience_key text,
  p_first_name text,
  p_business_name text,
  p_email text,
  p_consent boolean,
  p_consent_version text default 'proposal_followup_v1'
)
returns table (lead_id uuid, quiz_session_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_lead_id uuid;
  v_normalized_email text := lower(btrim(coalesce(p_email, '')));
begin
  if v_uid is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if p_consent is not true or p_consent_version <> 'proposal_followup_v1' then
    raise exception 'valid consent is required' using errcode = '22023';
  end if;
  if length(btrim(coalesce(p_first_name, ''))) not between 1 and 120
    or length(btrim(coalesce(p_business_name, ''))) not between 1 and 200
    or v_normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'invalid contact details' using errcode = '22023';
  end if;

  perform 1 from public.site_visitors v
  where v.id = p_visitor_id and v.owner_user_id = v_uid;
  if not found then raise exception 'invalid attribution' using errcode = '42501'; end if;

  perform 1 from public.portfolio_sessions ps
  where ps.id = p_portfolio_session_id
    and ps.visitor_id = p_visitor_id
    and ps.owner_user_id = v_uid;
  if not found then raise exception 'invalid attribution' using errcode = '42501'; end if;

  select qs.lead_id into v_lead_id
  from public.quiz_sessions qs
  where qs.id = p_quiz_session_id
    and qs.visitor_id = p_visitor_id
    and qs.portfolio_session_id = p_portfolio_session_id
    and qs.owner_user_id = v_uid
    and qs.audience_key = p_audience_key
    and qs.status = 'in_progress'
  for update;
  if not found then raise exception 'invalid quiz session' using errcode = '42501'; end if;

  if v_lead_id is null then
    insert into public.leads (
      visitor_id, first_name, email, business_name, audience_key,
      acquisition_source, source_portfolio_session_id, source_quiz_session_id,
      crm_stage, lead_status, proposal_delivery_status,
      proposal_email_consent_at, proposal_email_consent_version
    ) values (
      p_visitor_id, btrim(p_first_name), v_normalized_email, btrim(p_business_name), p_audience_key,
      'quiz', p_portfolio_session_id, p_quiz_session_id,
      'new', 'open', 'pending', now(), p_consent_version
    ) returning id into v_lead_id;

    update public.quiz_sessions set lead_id = v_lead_id where id = p_quiz_session_id;
    update public.portfolio_sessions
      set lead_id = v_lead_id, converted_to_lead = true
      where id = p_portfolio_session_id and owner_user_id = v_uid;
    update public.site_visitors
      set consent_status = 'granted', last_seen_at = now()
      where id = p_visitor_id and owner_user_id = v_uid;
    insert into public.analytics_events (
      owner_user_id,event_name,visitor_id,portfolio_session_id,quiz_session_id,
      lead_id,audience_key,page_path,properties
    ) values (
      v_uid,'lead_contact_submitted',p_visitor_id,p_portfolio_session_id,p_quiz_session_id,
      v_lead_id,p_audience_key,'/quiz/',jsonb_build_object('consent_version',p_consent_version)
    );
  else
    perform 1 from public.leads l
    where l.id = v_lead_id
      and l.visitor_id = p_visitor_id
      and l.source_quiz_session_id = p_quiz_session_id
      and l.email = v_normalized_email
      and l.first_name = btrim(p_first_name)
      and l.business_name = btrim(p_business_name)
      and l.proposal_email_consent_at is not null
      and l.proposal_email_consent_version = p_consent_version;
    if not found then raise exception 'invalid lead link' using errcode = '42501'; end if;
  end if;

  return query select v_lead_id, p_quiz_session_id;
end;
$$;

create function public.finalize_quiz_proposal(
  p_quiz_session_id uuid,
  p_selected_tier_key text,
  p_selected_platform text,
  p_selected_offer_key text,
  p_result_snapshot jsonb,
  p_selected_roadmap_snapshot jsonb,
  p_proposal_reference uuid,
  p_proposal_access_key_hash text
)
returns table (quiz_session_id uuid, lead_id uuid, proposal_reference uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lead_id uuid;
  v_existing_reference uuid;
  v_offer_route text;
  v_supported_platforms text[];
  v_recommended_offer_key text;
  v_supporting_solution_types text[];
  v_selected_addon_keys text[];
begin
  if p_selected_tier_key not in ('basic','advanced','complete')
    or p_selected_platform not in ('systeme_io','gohighlevel','custom_app') then
    raise exception 'invalid proposal selection' using errcode = '22023';
  end if;
  if p_result_snapshot is null or jsonb_typeof(p_result_snapshot) <> 'object'
    or pg_column_size(p_result_snapshot) > 262144
    or p_selected_roadmap_snapshot is null or jsonb_typeof(p_selected_roadmap_snapshot) <> 'object'
    or pg_column_size(p_selected_roadmap_snapshot) > 262144 then
    raise exception 'invalid proposal snapshot' using errcode = '22023';
  end if;
  if p_proposal_reference is null or p_proposal_access_key_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid proposal credentials' using errcode = '22023';
  end if;
  if p_result_snapshot ->> 'cortexVersion' <> 'cortex-local-v0.1'
    or p_result_snapshot ->> 'questionSetVersion' <> 'portfolio-qualifier-v0.1'
    or p_result_snapshot ->> 'catalogVersion' <> 'portfolio-catalog-v0.1'
    or p_selected_roadmap_snapshot #>> '{selection,tierKey}' <> p_selected_tier_key
    or p_selected_roadmap_snapshot #>> '{selection,platform}' <> p_selected_platform
    or p_selected_roadmap_snapshot #>> '{selection,offerKey}' <> p_selected_offer_key then
    raise exception 'proposal snapshot version or selection mismatch' using errcode = '22023';
  end if;

  v_recommended_offer_key := p_result_snapshot ->> 'recommendedOfferKey';
  if not exists (
    select 1 from public.package_catalog pc
    where pc.offer_key = v_recommended_offer_key and pc.active
  ) then
    raise exception 'invalid recommended offer' using errcode = '22023';
  end if;

  select coalesce(array_agg(value), '{}'::text[])
    into v_supporting_solution_types
  from jsonb_array_elements_text(coalesce(p_result_snapshot -> 'supportingSolutionTypes', '[]'::jsonb));
  select coalesce(array_agg(value), '{}'::text[])
    into v_selected_addon_keys
  from jsonb_array_elements_text(coalesce(p_result_snapshot -> 'selectedAddons', '[]'::jsonb));

  if least(
      (p_result_snapshot #>> '{scores,acquisitionNeed}')::integer,
      (p_result_snapshot #>> '{scores,automationNeed}')::integer,
      (p_result_snapshot #>> '{scores,systemComplexity}')::integer,
      (p_result_snapshot #>> '{scores,website}')::integer,
      (p_result_snapshot #>> '{scores,funnel}')::integer,
      (p_result_snapshot #>> '{scores,automation}')::integer,
      (p_result_snapshot #>> '{scores,crm}')::integer,
      (p_result_snapshot #>> '{scores,customApp}')::integer,
      (p_result_snapshot #>> '{scores,systeme}')::integer,
      (p_result_snapshot #>> '{scores,ghl}')::integer,
      (p_result_snapshot #>> '{scores,customBuild}')::integer,
      (p_result_snapshot ->> 'basePriceUsd')::numeric,
      (p_result_snapshot ->> 'addonTotalUsd')::numeric,
      (p_result_snapshot ->> 'estimatedProjectInvestmentUsd')::numeric
    ) < 0
    or (p_result_snapshot ->> 'adjustmentTotalUsd')::numeric <> 0 then
    raise exception 'invalid proposal scores or totals' using errcode = '22023';
  end if;

  select qs.lead_id, qs.proposal_reference into v_lead_id, v_existing_reference
  from public.quiz_sessions qs
  where qs.id = p_quiz_session_id
    and qs.status in ('in_progress','completed')
    and qs.proposal_status = 'not_issued'
  for update;
  if not found or v_lead_id is null then
    raise exception 'invalid quiz proposal state' using errcode = '22023';
  end if;
  if v_existing_reference is not null and v_existing_reference <> p_proposal_reference then
    raise exception 'proposal already initialized' using errcode = '23505';
  end if;

  select pc.build_route, pc.supported_platforms into v_offer_route, v_supported_platforms
  from public.package_catalog pc
  where pc.offer_key = p_selected_offer_key and pc.active;
  if not found
    or not (p_selected_platform = any(v_supported_platforms))
    or (p_selected_platform = 'custom_app' and v_offer_route <> 'custom')
    or (p_selected_platform <> 'custom_app' and v_offer_route <> 'platform')
    or not (
      (p_selected_tier_key = 'basic' and p_selected_platform <> 'custom_app' and p_selected_offer_key = 'platform_launch')
      or (p_selected_tier_key = 'basic' and p_selected_platform = 'custom_app' and p_selected_offer_key = 'custom_starter')
      or (p_selected_tier_key = 'advanced' and p_selected_platform <> 'custom_app' and p_selected_offer_key = 'platform_growth')
      or (p_selected_tier_key = 'advanced' and p_selected_platform = 'custom_app' and p_selected_offer_key = 'custom_foundation')
      or (p_selected_tier_key = 'complete' and p_selected_platform <> 'custom_app' and p_selected_offer_key = 'platform_scale')
      or (p_selected_tier_key = 'complete' and p_selected_platform = 'custom_app' and p_selected_offer_key = 'custom_growth')
      or (p_selected_tier_key = 'complete' and p_selected_platform = 'custom_app'
          and p_selected_offer_key = 'custom_complete'
          and p_result_snapshot ->> 'recommendedOfferKey' = 'custom_complete')
    ) then
    raise exception 'incompatible proposal offer' using errcode = '22023';
  end if;

  update public.quiz_sessions
  set selected_tier_key = p_selected_tier_key,
      selected_platform = p_selected_platform,
      selected_offer_key = p_selected_offer_key,
      acquisition_need_score = (p_result_snapshot #>> '{scores,acquisitionNeed}')::integer,
      automation_need_score = (p_result_snapshot #>> '{scores,automationNeed}')::integer,
      system_complexity_score = (p_result_snapshot #>> '{scores,systemComplexity}')::integer,
      website_score = (p_result_snapshot #>> '{scores,website}')::integer,
      funnel_score = (p_result_snapshot #>> '{scores,funnel}')::integer,
      automation_score = (p_result_snapshot #>> '{scores,automation}')::integer,
      crm_score = (p_result_snapshot #>> '{scores,crm}')::integer,
      custom_app_score = (p_result_snapshot #>> '{scores,customApp}')::integer,
      systeme_fit_score = (p_result_snapshot #>> '{scores,systeme}')::integer,
      ghl_fit_score = (p_result_snapshot #>> '{scores,ghl}')::integer,
      custom_build_fit_score = (p_result_snapshot #>> '{scores,customBuild}')::integer,
      readiness_level = nullif(btrim(p_result_snapshot ->> 'readinessLevel'), ''),
      recommended_build_route = nullif(btrim(p_result_snapshot ->> 'recommendedBuildRoute'), ''),
      recommended_platform = nullif(btrim(p_result_snapshot ->> 'recommendedPlatform'), ''),
      recommended_offer_key = v_recommended_offer_key,
      primary_solution_type = nullif(btrim(p_result_snapshot ->> 'primarySolutionType'), ''),
      supporting_solution_types = v_supporting_solution_types,
      selected_addon_keys = v_selected_addon_keys,
      priced_addons = coalesce(p_result_snapshot -> 'pricedAddons', '[]'::jsonb),
      base_price_usd = (p_result_snapshot ->> 'basePriceUsd')::numeric(12,2),
      addon_total_usd = (p_result_snapshot ->> 'addonTotalUsd')::numeric(12,2),
      adjustment_total_usd = (p_result_snapshot ->> 'adjustmentTotalUsd')::numeric(12,2),
      estimated_project_investment_usd = (p_result_snapshot ->> 'estimatedProjectInvestmentUsd')::numeric(12,2),
      result_snapshot = p_result_snapshot,
      selected_roadmap_snapshot = p_selected_roadmap_snapshot,
      proposal_reference = coalesce(proposal_reference, p_proposal_reference),
      proposal_access_key_hash = p_proposal_access_key_hash,
      status = 'completed',
      completed_at = coalesce(completed_at, now()),
      last_activity_at = now(),
      resume_expires_at = now() + interval '72 hours'
  where id = p_quiz_session_id;

  return query select p_quiz_session_id, v_lead_id, p_proposal_reference;
end;
$$;

create function public.mark_proposal_delivered(
  p_quiz_session_id uuid,
  p_proposal_reference uuid,
  p_delivered_at timestamptz default now()
)
returns table (lead_id uuid, proposal_expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lead_id uuid;
  v_status text;
  v_expiry timestamptz;
begin
  select qs.lead_id, qs.proposal_status, qs.proposal_expires_at
    into v_lead_id, v_status, v_expiry
  from public.quiz_sessions qs
  where qs.id = p_quiz_session_id and qs.proposal_reference = p_proposal_reference
  for update;
  if not found or v_lead_id is null then raise exception 'invalid delivery state' using errcode = '22023'; end if;
  if v_status = 'active' then return query select v_lead_id, v_expiry; return; end if;
  if v_status <> 'not_issued' then raise exception 'invalid delivery state' using errcode = '22023'; end if;

  v_expiry := p_delivered_at + interval '72 hours';
  update public.quiz_sessions
  set proposal_status = 'active', proposal_issued_at = p_delivered_at, proposal_expires_at = v_expiry
  where id = p_quiz_session_id;
  update public.leads
  set proposal_delivery_status = 'sent', proposal_sent_at = p_delivered_at,
      proposal_follow_up_count = 0,
      next_proposal_follow_up_at = p_delivered_at + interval '24 hours',
      proposal_follow_up_claim_id = null, proposal_follow_up_claimed_at = null,
      last_contact_at = p_delivered_at
  where id = v_lead_id;
  return query select v_lead_id, v_expiry;
end;
$$;

create function public.verify_proposal_access_state(p_proposal_reference uuid)
returns table (
  quiz_session_id uuid,
  proposal_status text,
  proposal_expires_at timestamptz,
  proposal_access_key_hash text,
  proposal_failed_attempts integer,
  proposal_locked_until timestamptz,
  result_snapshot jsonb,
  selected_roadmap_snapshot jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.quiz_sessions qs
  set proposal_status = 'expired'
  where qs.proposal_reference = p_proposal_reference
    and qs.proposal_status = 'active'
    and qs.proposal_expires_at <= now();

  return query
  select qs.id, qs.proposal_status, qs.proposal_expires_at,
         qs.proposal_access_key_hash, qs.proposal_failed_attempts,
         qs.proposal_locked_until, qs.result_snapshot, qs.selected_roadmap_snapshot
  from public.quiz_sessions qs
  where qs.proposal_reference = p_proposal_reference;
end;
$$;

create function public.record_proposal_access_attempt(
  p_proposal_reference uuid,
  p_access_granted boolean,
  p_attempted_at timestamptz default now()
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_access_granted then
    update public.quiz_sessions
    set proposal_last_viewed_at = p_attempted_at,
        proposal_failed_attempts = 0,
        proposal_locked_until = null
    where proposal_reference = p_proposal_reference and proposal_status = 'active';
  else
    update public.quiz_sessions
    set proposal_failed_attempts = case
          when proposal_locked_until is not null and proposal_locked_until <= p_attempted_at then 1
          else proposal_failed_attempts + 1
        end,
        proposal_locked_until = case
          when (case when proposal_locked_until is not null and proposal_locked_until <= p_attempted_at then 1 else proposal_failed_attempts + 1 end) >= 5
          then p_attempted_at + interval '15 minutes'
          else proposal_locked_until
        end
    where proposal_reference = p_proposal_reference and proposal_status = 'active';
  end if;
end;
$$;

create function public.claim_due_proposal_work(
  p_now timestamptz default now(),
  p_limit integer default 10
)
returns table (
  work_kind text,
  lead_id uuid,
  claim_id uuid,
  sequence_number integer,
  recipient_email text,
  first_name text,
  business_name text,
  proposal_reference uuid,
  proposal_expires_at timestamptz,
  result_snapshot jsonb,
  selected_roadmap_snapshot jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lead record;
  v_claim_id uuid;
begin
  if p_limit not between 1 and 50 then raise exception 'invalid claim limit' using errcode = '22023'; end if;
  for v_lead in
    select l.id, l.email, l.first_name, l.business_name, l.proposal_sent_at,
           l.proposal_follow_up_count, qs.proposal_reference, qs.proposal_expires_at,
           qs.result_snapshot, qs.selected_roadmap_snapshot
    from public.leads l
    join public.quiz_sessions qs on qs.lead_id = l.id and qs.proposal_reference is not null
    where l.proposal_delivery_status = 'sent'
      and l.proposal_follow_up_stopped_at is null
      and l.next_proposal_follow_up_at <= p_now
      and (l.proposal_follow_up_claimed_at is null or l.proposal_follow_up_claimed_at < p_now - interval '20 minutes')
    order by l.next_proposal_follow_up_at
    limit p_limit
    for update of l skip locked
  loop
    if exists (select 1 from public.bookings b where b.lead_id = v_lead.id) then
      update public.leads set proposal_delivery_status = 'stopped',
        proposal_follow_up_stopped_at = p_now, next_proposal_follow_up_at = null,
        proposal_follow_up_claim_id = null, proposal_follow_up_claimed_at = null
      where id = v_lead.id;
      continue;
    end if;

    if v_lead.proposal_follow_up_count >= 3 and p_now >= v_lead.proposal_sent_at + interval '96 hours' then
      update public.leads set crm_stage = 'cold', lead_status = 'cold',
        proposal_delivery_status = 'cold', cold_at = p_now,
        next_proposal_follow_up_at = null,
        proposal_follow_up_claim_id = null, proposal_follow_up_claimed_at = null
      where id = v_lead.id;
      return query select 'cold'::text, v_lead.id, null::uuid, 0,
        null::text, null::text, null::text, null::uuid, null::timestamptz,
        null::jsonb, null::jsonb;
    elsif v_lead.proposal_follow_up_count < 3 then
      v_claim_id := gen_random_uuid();
      update public.leads set proposal_follow_up_claim_id = v_claim_id,
        proposal_follow_up_claimed_at = p_now where id = v_lead.id;
      return query select 'follow_up'::text, v_lead.id, v_claim_id,
        v_lead.proposal_follow_up_count + 1, v_lead.email, v_lead.first_name,
        v_lead.business_name, v_lead.proposal_reference, v_lead.proposal_expires_at,
        v_lead.result_snapshot, v_lead.selected_roadmap_snapshot;
    end if;
  end loop;
end;
$$;

create function public.revalidate_proposal_work(p_lead_id uuid, p_claim_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_valid boolean;
begin
  select l.proposal_delivery_status = 'sent'
    and l.proposal_follow_up_stopped_at is null
    and l.proposal_follow_up_claim_id = p_claim_id
    and not exists (select 1 from public.bookings b where b.lead_id = l.id)
  into v_valid
  from public.leads l where l.id = p_lead_id for update;
  if coalesce(v_valid, false) is false and exists (select 1 from public.leads where id = p_lead_id) then
    update public.leads set proposal_delivery_status = 'stopped',
      proposal_follow_up_stopped_at = coalesce(proposal_follow_up_stopped_at, now()),
      next_proposal_follow_up_at = null,
      proposal_follow_up_claim_id = null, proposal_follow_up_claimed_at = null
    where id = p_lead_id and exists (select 1 from public.bookings b where b.lead_id = p_lead_id);
  end if;
  return coalesce(v_valid, false);
end;
$$;

create function public.acknowledge_proposal_work(
  p_lead_id uuid,
  p_claim_id uuid,
  p_delivered boolean,
  p_acknowledged_at timestamptz default now()
)
returns table (follow_up_count integer, next_follow_up_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lead public.leads%rowtype;
  v_count integer;
  v_next timestamptz;
begin
  select * into v_lead from public.leads l
  where l.id = p_lead_id and l.proposal_follow_up_claim_id = p_claim_id
  for update;
  if not found then raise exception 'invalid proposal work claim' using errcode = '22023'; end if;
  if exists (select 1 from public.bookings b where b.lead_id = p_lead_id) then
    update public.leads set proposal_delivery_status = 'stopped',
      proposal_follow_up_stopped_at = p_acknowledged_at, next_proposal_follow_up_at = null,
      proposal_follow_up_claim_id = null, proposal_follow_up_claimed_at = null
    where id = p_lead_id;
    return query select v_lead.proposal_follow_up_count, null::timestamptz;
    return;
  end if;
  if not p_delivered then
    v_next := p_acknowledged_at + interval '15 minutes';
    update public.leads set next_proposal_follow_up_at = v_next,
      proposal_follow_up_claim_id = null, proposal_follow_up_claimed_at = null
    where id = p_lead_id;
    return query select v_lead.proposal_follow_up_count, v_next;
    return;
  end if;

  v_count := v_lead.proposal_follow_up_count + 1;
  v_next := case v_count
    when 1 then v_lead.proposal_sent_at + interval '48 hours'
    when 2 then v_lead.proposal_sent_at + interval '72 hours'
    else v_lead.proposal_sent_at + interval '96 hours'
  end;
  update public.leads set proposal_follow_up_count = v_count,
    next_proposal_follow_up_at = v_next,
    proposal_follow_up_claim_id = null, proposal_follow_up_claimed_at = null,
    last_contact_at = p_acknowledged_at
  where id = p_lead_id;
  return query select v_count, v_next;
end;
$$;

create function public.stop_proposal_followups(p_lead_id uuid, p_stopped_at timestamptz default now())
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.leads set proposal_delivery_status = 'stopped',
    proposal_follow_up_stopped_at = coalesce(proposal_follow_up_stopped_at, p_stopped_at),
    next_proposal_follow_up_at = null,
    proposal_follow_up_claim_id = null, proposal_follow_up_claimed_at = null
  where id = p_lead_id and proposal_delivery_status not in ('cold','stopped');
  return found;
end;
$$;

create function public.record_trusted_proposal_event(
  p_event_name text,
  p_quiz_session_id uuid,
  p_lead_id uuid,
  p_properties jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event_id uuid;
  v_owner_user_id uuid;
  v_visitor_id uuid;
  v_portfolio_session_id uuid;
  v_audience_key text;
  v_allowed constant text[] := array[
    'proposal_created','proposal_email_sent','proposal_email_failed',
    'proposal_access_succeeded','proposal_access_failed',
    'proposal_follow_up_sent','proposal_follow_up_stopped','lead_marked_cold'
  ];
begin
  if not (p_event_name = any(v_allowed)) then
    raise exception 'event is not allowed' using errcode = '22023';
  end if;
  if p_properties is null or jsonb_typeof(p_properties) <> 'object' or pg_column_size(p_properties) > 8192 then
    raise exception 'invalid event properties' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_object_keys(p_properties) as k(key)
    where k.key <> all(array['sequence_number','delivery_status','reason_code','offer_key','platform','tier_key'])
  ) then
    raise exception 'event property key is not allowed' using errcode = '22023';
  end if;
  select qs.owner_user_id, qs.visitor_id, qs.portfolio_session_id, qs.audience_key
    into v_owner_user_id, v_visitor_id, v_portfolio_session_id, v_audience_key
  from public.quiz_sessions qs
  where qs.id = p_quiz_session_id and qs.lead_id = p_lead_id;
  if not found then raise exception 'invalid event attribution' using errcode = '22023'; end if;
  insert into public.analytics_events (
    owner_user_id,event_name,visitor_id,portfolio_session_id,quiz_session_id,
    lead_id,audience_key,page_path,properties
  ) values (
    v_owner_user_id,p_event_name,v_visitor_id,v_portfolio_session_id,p_quiz_session_id,
    p_lead_id,v_audience_key,'/proposal/',p_properties
  ) returning id into v_event_id;
  return v_event_id;
end;
$$;

create function public.stop_proposal_followups_on_booking()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.stop_proposal_followups(new.lead_id, now());
  return new;
end;
$$;

create trigger bookings_stop_proposal_followups
after insert on public.bookings
for each row execute function public.stop_proposal_followups_on_booking();

revoke execute on function public.touch_quiz_activity() from public, anon, authenticated;
revoke execute on function public.submit_lead(uuid,uuid,uuid,text,text,text,text,text,text,text,text) from authenticated;
revoke execute on function public.persist_quiz_result(uuid,integer,integer,integer,integer,integer,integer,integer,integer,integer,integer,integer,text,text,text,text,text,text[],text[]) from authenticated;

-- Owners can resume their own progress, but the browser cannot select the
-- proposal key hash, immutable result snapshots, or delivery orchestration.
revoke select on table public.quiz_sessions from authenticated;
grant select (
  id, visitor_id, owner_user_id, portfolio_session_id, question_set_id, lead_id,
  audience_key, question_set_version, status, current_step, last_completed_step,
  started_at, completed_at, last_activity_at, resume_expires_at, resume_count,
  last_resumed_at, answers, created_at, updated_at
) on public.quiz_sessions to authenticated;

revoke execute on function public.begin_qualified_quiz(uuid,uuid,uuid,text,text,text,text,boolean,text) from public, anon, authenticated;
grant execute on function public.begin_qualified_quiz(uuid,uuid,uuid,text,text,text,text,boolean,text) to authenticated;

revoke execute on function public.finalize_quiz_proposal(uuid,text,text,text,jsonb,jsonb,uuid,text) from public, anon, authenticated;
revoke execute on function public.mark_proposal_delivered(uuid,uuid,timestamptz) from public, anon, authenticated;
revoke execute on function public.verify_proposal_access_state(uuid) from public, anon, authenticated;
revoke execute on function public.record_proposal_access_attempt(uuid,boolean,timestamptz) from public, anon, authenticated;
revoke execute on function public.claim_due_proposal_work(timestamptz,integer) from public, anon, authenticated;
revoke execute on function public.revalidate_proposal_work(uuid,uuid) from public, anon, authenticated;
revoke execute on function public.acknowledge_proposal_work(uuid,uuid,boolean,timestamptz) from public, anon, authenticated;
revoke execute on function public.stop_proposal_followups(uuid,timestamptz) from public, anon, authenticated;
revoke execute on function public.record_trusted_proposal_event(text,uuid,uuid,jsonb) from public, anon, authenticated;
revoke execute on function public.stop_proposal_followups_on_booking() from public, anon, authenticated;

grant execute on function public.finalize_quiz_proposal(uuid,text,text,text,jsonb,jsonb,uuid,text) to service_role;
grant execute on function public.mark_proposal_delivered(uuid,uuid,timestamptz) to service_role;
grant execute on function public.verify_proposal_access_state(uuid) to service_role;
grant execute on function public.record_proposal_access_attempt(uuid,boolean,timestamptz) to service_role;
grant execute on function public.claim_due_proposal_work(timestamptz,integer) to service_role;
grant execute on function public.revalidate_proposal_work(uuid,uuid) to service_role;
grant execute on function public.acknowledge_proposal_work(uuid,uuid,boolean,timestamptz) to service_role;
grant execute on function public.stop_proposal_followups(uuid,timestamptz) to service_role;
grant execute on function public.record_trusted_proposal_event(text,uuid,uuid,jsonb) to service_role;
