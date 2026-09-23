-- Additive assessment-v2 metadata. USD remains the source price; local values
-- are stored with their quote timestamp so issued roadmaps remain reproducible.

alter table public.quiz_sessions
  add column business_country text,
  add column country_code text,
  add column display_currency text,
  add column currency_symbol text,
  add column fx_rate numeric(18,8),
  add column fx_rate_timestamp timestamptz,
  add column assessment_profile jsonb,
  add column roadmap_version text;

alter table public.quiz_sessions
  add constraint quiz_sessions_country_code_check check (country_code is null or country_code ~ '^[A-Z]{2}$'),
  add constraint quiz_sessions_display_currency_check check (display_currency is null or display_currency ~ '^[A-Z]{3}$'),
  add constraint quiz_sessions_fx_rate_check check (fx_rate is null or fx_rate > 0),
  add constraint quiz_sessions_assessment_profile_check check (assessment_profile is null or jsonb_typeof(assessment_profile) = 'object');

grant update (
  current_step, last_completed_step, answers, business_country, country_code,
  display_currency, currency_symbol, fx_rate, fx_rate_timestamp
) on public.quiz_sessions to authenticated;

grant select (
  id, owner_user_id, question_set_id, lead_id, audience_key, answers, status,
  business_country, country_code, display_currency, currency_symbol, fx_rate,
  fx_rate_timestamp, proposal_status, proposal_reference, proposal_expires_at,
  selected_roadmap_snapshot
) on public.quiz_sessions to service_role;

update public.quiz_definitions
set scoring_rules = scoring_rules || jsonb_build_object(
      'engineVersion', 'business-systems-cortex-2026.09-v2',
      'questionSetVersion', 'business-systems-assessment-2026.09-v2',
      'catalogVersion', 'business-systems-catalog-2026.09-v2',
      'engine_version', 'business-systems-cortex-2026.09-v2',
      'catalog_version', 'business-systems-catalog-2026.09-v2',
      'server_verified', true
    ),
    updated_at = now()
where active = true;

update public.package_catalog
set limits = limits || case offer_key
  when 'platform_launch' then '{"page_or_screen_limit":5,"automation_limit":3,"payment_setup_limit":1}'::jsonb
  when 'platform_growth' then '{"page_or_screen_limit":8,"automation_limit":7,"payment_setup_limit":2}'::jsonb
  when 'platform_scale' then '{"page_or_screen_limit":12,"automation_limit":12,"payment_setup_limit":3}'::jsonb
  when 'custom_starter' then '{"page_or_screen_limit":6,"automation_limit":3,"payment_setup_limit":1}'::jsonb
  when 'custom_foundation' then '{"page_or_screen_limit":10,"automation_limit":7,"payment_setup_limit":2}'::jsonb
  when 'custom_growth' then '{"page_or_screen_limit":15,"automation_limit":12,"payment_setup_limit":3}'::jsonb
  when 'custom_complete' then '{"page_or_screen_limit":null,"automation_limit":null,"payment_setup_limit":null}'::jsonb
  else '{}'::jsonb
end,
updated_at = now()
where offer_key in (
  'platform_launch','platform_growth','platform_scale','custom_starter',
  'custom_foundation','custom_growth','custom_complete'
);
