-- Narrow visitor RPCs. Scalar parameters make unexpected-field injection
-- impossible at the SQL function boundary.

create function public.submit_lead(
  p_visitor_id uuid,
  p_portfolio_session_id uuid,
  p_quiz_session_id uuid,
  p_first_name text,
  p_last_name text default null,
  p_email text default null,
  p_phone text default null,
  p_business_name text default null,
  p_business_url text default null,
  p_audience_key text default null,
  p_acquisition_source text default null
)
returns table (lead_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_lead_id uuid;
  v_portfolio_session_id uuid := p_portfolio_session_id;
begin
  if v_uid is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if p_email is null then raise exception 'email is required' using errcode = '22023'; end if;

  perform 1 from public.site_visitors v
  where v.id = p_visitor_id and v.owner_user_id = v_uid;
  if not found then raise exception 'invalid attribution' using errcode = '42501'; end if;

  if p_portfolio_session_id is not null then
    perform 1 from public.portfolio_sessions ps
    where ps.id = p_portfolio_session_id and ps.visitor_id = p_visitor_id and ps.owner_user_id = v_uid;
    if not found then raise exception 'invalid attribution' using errcode = '42501'; end if;
  end if;

  if p_quiz_session_id is not null then
    select qs.lead_id, qs.portfolio_session_id into v_lead_id, v_portfolio_session_id
    from public.quiz_sessions qs
    where qs.id = p_quiz_session_id
      and qs.visitor_id = p_visitor_id
      and qs.owner_user_id = v_uid
      and (p_portfolio_session_id is null or qs.portfolio_session_id = p_portfolio_session_id)
    for update;
    if not found then raise exception 'invalid attribution' using errcode = '42501'; end if;
    if v_lead_id is not null then return query select v_lead_id; return; end if;
  end if;

  insert into public.leads (
    visitor_id, first_name, last_name, email, phone, business_name, business_url,
    audience_key, acquisition_source, source_portfolio_session_id,
    source_quiz_session_id, crm_stage, lead_status
  ) values (
    p_visitor_id, btrim(p_first_name), nullif(btrim(p_last_name), ''), lower(btrim(p_email)),
    nullif(btrim(p_phone), ''), nullif(btrim(p_business_name), ''), nullif(btrim(p_business_url), ''),
    nullif(btrim(p_audience_key), ''), nullif(btrim(p_acquisition_source), ''),
    v_portfolio_session_id, p_quiz_session_id, 'new', 'open'
  ) returning id into v_lead_id;

  if p_quiz_session_id is not null then
    update public.quiz_sessions qs set lead_id = v_lead_id
    where qs.id = p_quiz_session_id and qs.lead_id is null;
  end if;
  if v_portfolio_session_id is not null then
    update public.portfolio_sessions
    set lead_id = v_lead_id, converted_to_lead = true
    where id = v_portfolio_session_id and owner_user_id = v_uid;
  end if;

  return query select v_lead_id;
end;
$$;

create function public.link_quiz_session_to_lead(p_quiz_session_id uuid, p_lead_id uuid)
returns table (quiz_session_id uuid, lead_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_existing uuid;
begin
  if v_uid is null then raise exception 'authentication required' using errcode = '42501'; end if;
  select qs.lead_id into v_existing from public.quiz_sessions qs
  where qs.id = p_quiz_session_id and qs.owner_user_id = v_uid for update;
  if not found then raise exception 'invalid quiz session' using errcode = '42501'; end if;
  if v_existing is not null and v_existing <> p_lead_id then
    raise exception 'quiz session is already linked' using errcode = '23505';
  end if;
  perform 1 from public.leads l
  where l.id = p_lead_id and l.source_quiz_session_id = p_quiz_session_id;
  if not found then raise exception 'invalid lead link' using errcode = '42501'; end if;
  update public.quiz_sessions set lead_id = p_lead_id where id = p_quiz_session_id;
  return query select p_quiz_session_id, p_lead_id;
end;
$$;

create function public.submit_booking(
  p_lead_id uuid,
  p_visitor_id uuid,
  p_portfolio_session_id uuid,
  p_quiz_session_id uuid,
  p_scheduled_start timestamptz,
  p_scheduled_end timestamptz,
  p_time_zone text
)
returns table (booking_id uuid, booking_status text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_booking_id uuid;
  v_status text;
  v_portfolio_session_id uuid;
  v_quiz_session_id uuid;
  v_source_portfolio_session_id uuid;
  v_source_quiz_session_id uuid;
begin
  if v_uid is null then raise exception 'authentication required' using errcode = '42501'; end if;
  perform 1 from public.site_visitors v where v.id = p_visitor_id and v.owner_user_id = v_uid;
  if not found then raise exception 'invalid attribution' using errcode = '42501'; end if;
  select l.source_portfolio_session_id, l.source_quiz_session_id
  into v_source_portfolio_session_id, v_source_quiz_session_id
  from public.leads l where l.id = p_lead_id and l.visitor_id = p_visitor_id;
  if not found then raise exception 'invalid lead' using errcode = '42501'; end if;
  if p_portfolio_session_id is not null and v_source_portfolio_session_id is not null
    and p_portfolio_session_id is distinct from v_source_portfolio_session_id then
    raise exception 'invalid attribution' using errcode = '42501';
  end if;
  if p_quiz_session_id is not null and v_source_quiz_session_id is not null
    and p_quiz_session_id is distinct from v_source_quiz_session_id then
    raise exception 'invalid attribution' using errcode = '42501';
  end if;
  v_portfolio_session_id := coalesce(p_portfolio_session_id, v_source_portfolio_session_id);
  v_quiz_session_id := coalesce(p_quiz_session_id, v_source_quiz_session_id);
  perform 1 from public.portfolio_sessions ps
  where ps.id = v_portfolio_session_id and ps.visitor_id = p_visitor_id and ps.owner_user_id = v_uid;
  if not found then raise exception 'invalid attribution' using errcode = '42501'; end if;
  if v_quiz_session_id is not null then
    perform 1 from public.quiz_sessions qs
    where qs.id = v_quiz_session_id and qs.visitor_id = p_visitor_id
      and qs.portfolio_session_id = v_portfolio_session_id and qs.owner_user_id = v_uid
      and qs.lead_id = p_lead_id;
    if not found then raise exception 'invalid attribution' using errcode = '42501'; end if;
  end if;
  select b.id, b.status into v_booking_id, v_status from public.bookings b
  where b.lead_id = p_lead_id and b.scheduled_start = p_scheduled_start
    and b.status = 'scheduled';
  if found then return query select v_booking_id, v_status; return; end if;

  insert into public.bookings (
    lead_id, visitor_id, portfolio_session_id, quiz_session_id, booking_provider,
    external_booking_id, scheduled_start, scheduled_end, time_zone, status
  ) values (
    p_lead_id, p_visitor_id, v_portfolio_session_id, v_quiz_session_id,
    'portfolio_request', null,
    p_scheduled_start, p_scheduled_end, btrim(p_time_zone), 'scheduled'
  ) returning id, status into v_booking_id, v_status;
  return query select v_booking_id, v_status;
end;
$$;

create function public.record_analytics_event(
  p_event_name text,
  p_visitor_id uuid default null,
  p_portfolio_session_id uuid default null,
  p_quiz_session_id uuid default null,
  p_audience_key text default null,
  p_page_path text default null,
  p_properties jsonb default '{}'::jsonb
)
returns table (event_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_event_id uuid;
  v_allowed constant text[] := array[
    'portfolio_view','audience_selected','quiz_started','quiz_step_completed',
    'quiz_resume_prompt_viewed','quiz_resumed','quiz_restarted','quiz_resume_dismissed',
    'quiz_session_expired','quiz_abandoned','quiz_completed','result_viewed',
    'package_recommended','project_viewed','strategy_call_clicked','contact_submitted','booking_started'
  ];
begin
  if v_uid is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if not (p_event_name = any(v_allowed)) then raise exception 'event is not allowed' using errcode = '22023'; end if;
  if p_properties is null or jsonb_typeof(p_properties) <> 'object' or pg_column_size(p_properties) > 8192 then
    raise exception 'invalid event properties' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_object_keys(p_properties) as k(key)
    where k.key <> all(array['question_key','step','project_slug','offer_key','source','action','component','referrer_kind'])
  ) then
    raise exception 'event property key is not allowed' using errcode = '22023';
  end if;
  if p_visitor_id is not null then
    perform 1 from public.site_visitors v where v.id = p_visitor_id and v.owner_user_id = v_uid;
    if not found then raise exception 'invalid attribution' using errcode = '42501'; end if;
  end if;
  if p_portfolio_session_id is not null then
    perform 1 from public.portfolio_sessions ps
    where ps.id = p_portfolio_session_id and ps.owner_user_id = v_uid
      and (p_visitor_id is null or ps.visitor_id = p_visitor_id);
    if not found then raise exception 'invalid attribution' using errcode = '42501'; end if;
  end if;
  if p_quiz_session_id is not null then
    perform 1 from public.quiz_sessions qs
    where qs.id = p_quiz_session_id and qs.owner_user_id = v_uid
      and (p_visitor_id is null or qs.visitor_id = p_visitor_id)
      and (p_portfolio_session_id is null or qs.portfolio_session_id = p_portfolio_session_id);
    if not found then raise exception 'invalid attribution' using errcode = '42501'; end if;
  end if;
  insert into public.analytics_events (
    owner_user_id, event_name, visitor_id, portfolio_session_id, quiz_session_id,
    audience_key, page_path, properties
  ) values (
    v_uid, p_event_name, p_visitor_id, p_portfolio_session_id, p_quiz_session_id,
    nullif(btrim(p_audience_key), ''), nullif(btrim(p_page_path), ''), p_properties
  ) returning id into v_event_id;
  if p_event_name = 'strategy_call_clicked' and p_visitor_id is not null then
    update public.site_visitors
    set booking_cta_click_count = booking_cta_click_count + 1
    where id = p_visitor_id and owner_user_id = v_uid;
    if p_portfolio_session_id is not null then
      update public.portfolio_sessions set booking_cta_clicked = true
      where id = p_portfolio_session_id and owner_user_id = v_uid;
    end if;
  elsif p_event_name = 'result_viewed' and p_quiz_session_id is not null then
    update public.quiz_sessions set result_viewed_at = coalesce(result_viewed_at, now())
    where id = p_quiz_session_id and owner_user_id = v_uid and status = 'completed';
    if p_portfolio_session_id is not null then
      update public.portfolio_sessions set result_viewed = true
      where id = p_portfolio_session_id and owner_user_id = v_uid;
    end if;
  end if;
  return query select v_event_id;
end;
$$;

create function public.persist_quiz_result(
  p_quiz_session_id uuid,
  p_acquisition_need_score integer,
  p_automation_need_score integer,
  p_system_complexity_score integer,
  p_website_score integer,
  p_funnel_score integer,
  p_automation_score integer,
  p_crm_score integer,
  p_custom_app_score integer,
  p_systeme_fit_score integer,
  p_ghl_fit_score integer,
  p_custom_build_fit_score integer,
  p_readiness_level text,
  p_recommended_build_route text,
  p_recommended_platform text,
  p_recommended_offer_key text,
  p_primary_solution_type text,
  p_supporting_solution_types text[],
  p_selected_addon_keys text[]
)
returns table (quiz_session_id uuid, estimated_project_investment_usd numeric(12,2))
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_base numeric(12,2);
  v_addons numeric(12,2);
  v_priced jsonb;
  v_total numeric(12,2);
  v_snapshot jsonb;
  v_offer_name text;
  v_offer_route text;
  v_supported_platforms text[];
  v_offer_limits jsonb;
  v_included_capability_keys text[];
  v_answers jsonb;
begin
  if v_uid is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if least(p_acquisition_need_score,p_automation_need_score,p_system_complexity_score,p_website_score,
    p_funnel_score,p_automation_score,p_crm_score,p_custom_app_score,p_systeme_fit_score,
    p_ghl_fit_score,p_custom_build_fit_score) < 0 then
    raise exception 'scores cannot be negative' using errcode = '22023';
  end if;
  select qs.answers into v_answers from public.quiz_sessions qs
  where qs.id = p_quiz_session_id and qs.owner_user_id = v_uid and qs.status = 'in_progress'
  for update;
  if not found then raise exception 'invalid quiz session state' using errcode = '42501'; end if;
  select pc.base_price_usd, pc.name, pc.build_route, pc.supported_platforms, pc.limits, pc.included_capability_keys
  into v_base, v_offer_name, v_offer_route, v_supported_platforms, v_offer_limits, v_included_capability_keys
  from public.package_catalog pc
  where pc.offer_key = p_recommended_offer_key and pc.active;
  if v_base is null then raise exception 'invalid offer' using errcode = '22023'; end if;
  if p_recommended_build_route is distinct from v_offer_route
    or not (p_recommended_platform = any(v_supported_platforms)) then
    raise exception 'offer, route, and platform are incompatible' using errcode = '22023';
  end if;
  if cardinality(coalesce(p_selected_addon_keys, '{}'::text[])) <>
     (select count(distinct x) from unnest(coalesce(p_selected_addon_keys, '{}'::text[])) as x) then
    raise exception 'duplicate add-ons are not allowed' using errcode = '22023';
  end if;
  if exists (
    select 1 from unnest(coalesce(p_selected_addon_keys, '{}'::text[])) as selected(addon_key)
    left join public.addon_catalog ac on ac.addon_key = selected.addon_key
    where ac.addon_key is null or not ac.active or not (v_offer_route = any(ac.allowed_build_routes))
  ) then
    raise exception 'unknown, inactive, or incompatible add-on' using errcode = '22023';
  end if;

  select coalesce(sum(ac.starting_price_usd), 0)::numeric(12,2),
         coalesce(jsonb_agg(jsonb_build_object(
           'addon_key', ac.addon_key, 'name', ac.name,
           'unit_price_usd', ac.starting_price_usd, 'pricing_unit', ac.pricing_unit,
           'requires_scope_review', ac.requires_scope_review
         ) order by ac.display_order) filter (where ac.addon_key is not null), '[]'::jsonb)
  into v_addons, v_priced
  from public.addon_catalog ac
  where ac.active and ac.addon_key = any(coalesce(p_selected_addon_keys, '{}'::text[]))
    and not (p_recommended_offer_key = any(ac.included_in_offer_keys));
  v_total := v_base + v_addons;
  v_snapshot := jsonb_build_object(
    'recommended_build_route', p_recommended_build_route,
    'recommended_platform', p_recommended_platform,
    'recommended_offer_key', p_recommended_offer_key,
    'recommended_offer_name', v_offer_name,
    'included_capability_keys', v_included_capability_keys,
    'offer_limits', v_offer_limits,
    'primary_solution_type', p_primary_solution_type,
    'readiness_level', p_readiness_level,
    'answers', v_answers,
    'scores', jsonb_build_object(
      'acquisition_need', p_acquisition_need_score, 'automation_need', p_automation_need_score,
      'system_complexity', p_system_complexity_score, 'website', p_website_score,
      'funnel', p_funnel_score, 'automation', p_automation_score, 'crm', p_crm_score,
      'custom_app', p_custom_app_score, 'systeme_fit', p_systeme_fit_score,
      'ghl_fit', p_ghl_fit_score, 'custom_build_fit', p_custom_build_fit_score
    ),
    'supporting_solution_types', coalesce(p_supporting_solution_types, '{}'::text[]),
    'selected_addon_keys', coalesce(p_selected_addon_keys, '{}'::text[]),
    'priced_addons', v_priced, 'base_price_usd', v_base,
    'addon_total_usd', v_addons, 'adjustment_total_usd', 0,
    'estimated_project_investment_usd', v_total
  );
  update public.quiz_sessions set
    acquisition_need_score=p_acquisition_need_score, automation_need_score=p_automation_need_score,
    system_complexity_score=p_system_complexity_score, website_score=p_website_score,
    funnel_score=p_funnel_score, automation_score=p_automation_score, crm_score=p_crm_score,
    custom_app_score=p_custom_app_score, systeme_fit_score=p_systeme_fit_score,
    ghl_fit_score=p_ghl_fit_score, custom_build_fit_score=p_custom_build_fit_score,
    readiness_level=nullif(btrim(p_readiness_level), ''),
    recommended_build_route=nullif(btrim(p_recommended_build_route), ''),
    recommended_platform=nullif(btrim(p_recommended_platform), ''),
    recommended_offer_key=p_recommended_offer_key,
    primary_solution_type=nullif(btrim(p_primary_solution_type), ''),
    supporting_solution_types=coalesce(p_supporting_solution_types, '{}'::text[]),
    selected_addon_keys=coalesce(p_selected_addon_keys, '{}'::text[]),
    priced_addons=v_priced, base_price_usd=v_base, addon_total_usd=v_addons,
    adjustment_total_usd=0, estimated_project_investment_usd=v_total,
    result_snapshot=v_snapshot, status='completed', completed_at=now(), last_activity_at=now(),
    resume_expires_at=now() + interval '30 days'
  where id = p_quiz_session_id;
  return query select p_quiz_session_id, v_total;
end;
$$;

create function public.update_quiz_lifecycle(p_quiz_session_id uuid, p_action text)
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
  select qs.status into v_status from public.quiz_sessions qs
  where qs.id = p_quiz_session_id and qs.owner_user_id = v_uid for update;
  if not found or v_status <> 'in_progress' then
    raise exception 'invalid quiz session state' using errcode = '42501';
  end if;
  if p_action = 'resume' then
    update public.quiz_sessions set
      resume_count = resume_count + 1, last_resumed_at = now(),
      last_activity_at = now(), resume_expires_at = now() + interval '30 days'
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

revoke execute on function public.submit_lead(uuid,uuid,uuid,text,text,text,text,text,text,text,text) from public, anon, authenticated;
revoke execute on function public.link_quiz_session_to_lead(uuid,uuid) from public, anon, authenticated;
revoke execute on function public.submit_booking(uuid,uuid,uuid,uuid,timestamptz,timestamptz,text) from public, anon, authenticated;
revoke execute on function public.record_analytics_event(text,uuid,uuid,uuid,text,text,jsonb) from public, anon, authenticated;
revoke execute on function public.persist_quiz_result(uuid,integer,integer,integer,integer,integer,integer,integer,integer,integer,integer,integer,text,text,text,text,text,text[],text[]) from public, anon, authenticated;
revoke execute on function public.update_quiz_lifecycle(uuid,text) from public, anon, authenticated;

grant execute on function public.submit_lead(uuid,uuid,uuid,text,text,text,text,text,text,text,text) to authenticated;
grant execute on function public.link_quiz_session_to_lead(uuid,uuid) to authenticated;
grant execute on function public.submit_booking(uuid,uuid,uuid,uuid,timestamptz,timestamptz,text) to authenticated;
grant execute on function public.record_analytics_event(text,uuid,uuid,uuid,text,text,jsonb) to authenticated;
grant execute on function public.persist_quiz_result(uuid,integer,integer,integer,integer,integer,integer,integer,integer,integer,integer,integer,text,text,text,text,text,text[],text[]) to authenticated;
grant execute on function public.update_quiz_lifecycle(uuid,text) to authenticated;
