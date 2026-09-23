-- The proposal preview loads location metadata through the owning user's
-- RLS-scoped client. Preserve the existing column-level privacy boundary while
-- allowing owners to read the six location fields required by that request.

grant select (
  business_country,
  country_code,
  display_currency,
  currency_symbol,
  fx_rate,
  fx_rate_timestamp
) on public.quiz_sessions to authenticated;
