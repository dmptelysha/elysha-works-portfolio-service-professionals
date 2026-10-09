-- Repair the live coupon RPCs: their TABLE return-column names are also PL/pgSQL
-- variables, so unqualified ledger columns can raise SQLSTATE 42702 at runtime.

create or replace function public.preview_proposal_discount(
  p_quiz_session_id uuid,
  p_coupon_code text,
  p_redeemer_digest text,
  p_at timestamptz default now()
)
returns table (campaign_key text, code text, discount_percent integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_campaign private.discount_campaigns%rowtype;
  v_country_code text;
  v_lead_id uuid;
  v_existing private.discount_redemptions%rowtype;
  v_used bigint;
  v_same_existing boolean := false;
begin
  if p_quiz_session_id is null
    or p_coupon_code is null
    or length(btrim(p_coupon_code)) > 64
    or p_redeemer_digest !~ '^[0-9a-f]{64}$'
    or p_at is null then
    raise exception 'coupon_invalid' using errcode = 'P0001';
  end if;

  select dc.* into v_campaign
  from private.discount_campaigns dc
  where dc.code = upper(btrim(p_coupon_code))
  for update;
  if not found or not v_campaign.active then
    raise exception 'coupon_invalid' using errcode = 'P0001';
  end if;

  update private.discount_redemptions as dr
  set status = 'released', released_at = p_at, updated_at = p_at
  where dr.campaign_key = v_campaign.campaign_key
    and dr.status = 'pending'
    and dr.reserved_until <= p_at;

  select qs.country_code, qs.lead_id into v_country_code, v_lead_id
  from public.quiz_sessions qs
  join public.leads l on l.id = qs.lead_id
  where qs.id = p_quiz_session_id
    and l.email_verified_at is not null;
  if not found or v_lead_id is null then
    raise exception 'coupon_temporarily_unavailable' using errcode = 'P0001';
  end if;

  if (v_campaign.eligibility_scope = 'philippines' and v_country_code is distinct from 'PH')
    or (v_campaign.eligibility_scope = 'international' and (v_country_code is null or v_country_code in ('PH','ZZ'))) then
    raise exception 'coupon_ineligible' using errcode = 'P0001';
  end if;

  select dr.* into v_existing
  from private.discount_redemptions dr
  where dr.campaign_key = v_campaign.campaign_key
    and dr.redeemer_digest = p_redeemer_digest;
  if found and v_existing.status = 'redeemed' and v_existing.quiz_session_id <> p_quiz_session_id then
    raise exception 'coupon_already_redeemed' using errcode = 'P0001';
  end if;
  if found and v_existing.status = 'pending' and v_existing.quiz_session_id <> p_quiz_session_id then
    raise exception 'coupon_temporarily_unavailable' using errcode = 'P0001';
  end if;
  v_same_existing := v_existing.id is not null
    and v_existing.status in ('pending','redeemed')
    and v_existing.quiz_session_id = p_quiz_session_id;

  select count(*) into v_used
  from private.discount_redemptions dr
  where dr.campaign_key = v_campaign.campaign_key
    and dr.status in ('pending','redeemed');
  if v_used >= v_campaign.max_redemptions and not v_same_existing then
    raise exception 'coupon_exhausted' using errcode = 'P0001';
  end if;

  return query select v_campaign.campaign_key, v_campaign.code, v_campaign.discount_percent;
end;
$$;

create or replace function public.reserve_proposal_discount(
  p_quiz_session_id uuid,
  p_coupon_code text,
  p_redeemer_digest text,
  p_original_total_usd numeric,
  p_discount_amount_usd numeric,
  p_final_total_usd numeric,
  p_at timestamptz default now()
)
returns table (redemption_id uuid, campaign_key text, code text, discount_percent integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_campaign private.discount_campaigns%rowtype;
  v_country_code text;
  v_lead_id uuid;
  v_existing private.discount_redemptions%rowtype;
  v_used bigint;
  v_redemption_id uuid;
begin
  if p_quiz_session_id is null
    or p_coupon_code is null
    or length(btrim(p_coupon_code)) > 64
    or p_redeemer_digest !~ '^[0-9a-f]{64}$'
    or p_at is null
    or p_original_total_usd is null or p_original_total_usd < 0
    or p_discount_amount_usd is null or p_discount_amount_usd < 0
    or p_final_total_usd is null or p_final_total_usd < 0
    or round(p_original_total_usd - p_discount_amount_usd, 2) <> round(p_final_total_usd, 2) then
    raise exception 'coupon_invalid' using errcode = 'P0001';
  end if;

  select dc.* into v_campaign
  from private.discount_campaigns dc
  where dc.code = upper(btrim(p_coupon_code))
  for update;
  if not found or not v_campaign.active then
    raise exception 'coupon_invalid' using errcode = 'P0001';
  end if;
  if round(p_discount_amount_usd, 2) <>
      round(round(p_original_total_usd, 2) * v_campaign.discount_percent / 100.0, 2)
    or round(p_final_total_usd, 2) <>
      round(round(p_original_total_usd, 2) - round(p_discount_amount_usd, 2), 2) then
    raise exception 'coupon_invalid' using errcode = 'P0001';
  end if;

  update private.discount_redemptions as dr
  set status = 'released', released_at = p_at, updated_at = p_at
  where dr.campaign_key = v_campaign.campaign_key
    and dr.status = 'pending'
    and dr.reserved_until <= p_at;

  select qs.country_code, qs.lead_id into v_country_code, v_lead_id
  from public.quiz_sessions qs
  join public.leads l on l.id = qs.lead_id
  where qs.id = p_quiz_session_id
    and qs.proposal_status = 'not_issued'
    and l.email_verified_at is not null
  for update of qs;
  if not found or v_lead_id is null then
    raise exception 'coupon_temporarily_unavailable' using errcode = 'P0001';
  end if;

  if (v_campaign.eligibility_scope = 'philippines' and v_country_code is distinct from 'PH')
    or (v_campaign.eligibility_scope = 'international' and (v_country_code is null or v_country_code in ('PH','ZZ'))) then
    raise exception 'coupon_ineligible' using errcode = 'P0001';
  end if;

  select dr.* into v_existing
  from private.discount_redemptions dr
  where dr.quiz_session_id = p_quiz_session_id;
  if found then
    if v_existing.campaign_key <> v_campaign.campaign_key
      or v_existing.redeemer_digest <> p_redeemer_digest then
      raise exception 'coupon_already_redeemed' using errcode = 'P0001';
    end if;
    if v_existing.status in ('pending','redeemed') then
      if v_existing.original_total_usd <> round(p_original_total_usd, 2)
        or v_existing.discount_amount_usd <> round(p_discount_amount_usd, 2)
        or v_existing.final_total_usd <> round(p_final_total_usd, 2) then
        raise exception 'coupon_temporarily_unavailable' using errcode = 'P0001';
      end if;
      return query select v_existing.id, v_campaign.campaign_key, v_campaign.code, v_campaign.discount_percent;
      return;
    end if;
  else
    select dr.* into v_existing
    from private.discount_redemptions dr
    where dr.campaign_key = v_campaign.campaign_key
      and dr.redeemer_digest = p_redeemer_digest;
    if found and v_existing.status = 'redeemed' then
      raise exception 'coupon_already_redeemed' using errcode = 'P0001';
    end if;
    if found and v_existing.status = 'pending' then
      raise exception 'coupon_temporarily_unavailable' using errcode = 'P0001';
    end if;
  end if;

  select count(*) into v_used
  from private.discount_redemptions dr
  where dr.campaign_key = v_campaign.campaign_key
    and dr.status in ('pending','redeemed');
  if v_used >= v_campaign.max_redemptions then
    raise exception 'coupon_exhausted' using errcode = 'P0001';
  end if;

  if v_existing.id is not null then
    update private.discount_redemptions
    set quiz_session_id = p_quiz_session_id,
        lead_id = v_lead_id,
        status = 'pending',
        reserved_until = p_at + interval '30 minutes',
        original_total_usd = round(p_original_total_usd, 2),
        discount_amount_usd = round(p_discount_amount_usd, 2),
        final_total_usd = round(p_final_total_usd, 2),
        redeemed_at = null,
        released_at = null,
        updated_at = p_at
    where id = v_existing.id
    returning id into v_redemption_id;
  else
    insert into private.discount_redemptions (
      campaign_key, quiz_session_id, lead_id, redeemer_digest, status,
      reserved_until, original_total_usd, discount_amount_usd, final_total_usd,
      created_at, updated_at
    ) values (
      v_campaign.campaign_key, p_quiz_session_id, v_lead_id, p_redeemer_digest, 'pending',
      p_at + interval '30 minutes', round(p_original_total_usd, 2),
      round(p_discount_amount_usd, 2), round(p_final_total_usd, 2), p_at, p_at
    ) returning id into v_redemption_id;
  end if;

  return query select v_redemption_id, v_campaign.campaign_key, v_campaign.code, v_campaign.discount_percent;
end;
$$;

