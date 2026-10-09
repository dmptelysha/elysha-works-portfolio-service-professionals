-- Activate the two owner-approved launch campaigns only when their immutable
-- pricing, eligibility, and capacity settings match the reviewed release.
do $$
declare
  v_activated integer;
begin
  update private.discount_campaigns
  set active = true,
      updated_at = now()
  where (
      campaign_key = 'pinoyako'
      and code = 'PINOYAKO'
      and discount_percent = 50
      and eligibility_scope = 'philippines'
      and max_redemptions = 50
    ) or (
      campaign_key = 'earlybirdworks'
      and code = 'EARLYBIRDWORKS'
      and discount_percent = 15
      and eligibility_scope = 'international'
      and max_redemptions = 100
    );

  get diagnostics v_activated = row_count;
  if v_activated <> 2 then
    raise exception 'proposal discount campaign configuration mismatch';
  end if;
end;
$$;
