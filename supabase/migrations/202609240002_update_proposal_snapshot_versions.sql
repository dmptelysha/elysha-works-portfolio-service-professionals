-- Accept the approved V2 recommendation-engine snapshots while retaining
-- compatibility with proposals created against the original V1 catalog.
-- Version triplets must match exactly; mixed or unknown versions stay rejected.

create or replace function public.finalize_quiz_proposal(
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
  if not (
      (
        p_result_snapshot ->> 'cortexVersion' = 'business-systems-cortex-2026.09-v2'
        and p_result_snapshot ->> 'questionSetVersion' = 'business-systems-assessment-2026.09-v2'
        and p_result_snapshot ->> 'catalogVersion' = 'business-systems-catalog-2026.09-v2'
      )
      or (
        p_result_snapshot ->> 'cortexVersion' = 'cortex-local-v0.1'
        and p_result_snapshot ->> 'questionSetVersion' = 'portfolio-qualifier-v0.1'
        and p_result_snapshot ->> 'catalogVersion' = 'portfolio-catalog-v0.1'
      )
    )
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

  update public.quiz_sessions as qs
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
      proposal_reference = coalesce(qs.proposal_reference, p_proposal_reference),
      proposal_access_key_hash = p_proposal_access_key_hash,
      status = 'completed',
      completed_at = coalesce(completed_at, now()),
      last_activity_at = now(),
      resume_expires_at = now() + interval '72 hours'
  where qs.id = p_quiz_session_id;

  return query select p_quiz_session_id, v_lead_id, p_proposal_reference;
end;
$$;
