-- Trusted proposal Edge Functions use the server-only service role. Grant only
-- the columns those functions read; mutations remain restricted to vetted RPCs.

grant select (id, first_name, business_name, email)
  on public.leads to service_role;

grant select (
  id,
  proposal_status,
  proposal_reference,
  proposal_expires_at,
  selected_roadmap_snapshot
)
  on public.quiz_sessions to service_role;

grant select (id, active, scoring_rules)
  on public.quiz_definitions to service_role;

grant select (
  offer_key,
  base_price_usd,
  build_route,
  supported_platforms,
  active
)
  on public.package_catalog to service_role;

grant select (
  addon_key,
  starting_price_usd,
  allowed_build_routes,
  active
)
  on public.addon_catalog to service_role;
