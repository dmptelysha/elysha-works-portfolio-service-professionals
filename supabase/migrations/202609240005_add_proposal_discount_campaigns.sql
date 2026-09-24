-- Add a private, service-only coupon ledger and V2 proposal lifecycle RPCs.
-- Campaigns are seeded inactive; activation is a separately approved release action.

create schema if not exists private;

create table private.discount_campaigns (
  campaign_key text primary key,
  code text not null unique,
  discount_percent integer not null,
  eligibility_scope text not null,
  max_redemptions integer not null,
  active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint discount_campaigns_key_check check (campaign_key in ('pinoyako','earlybirdworks')),
  constraint discount_campaigns_code_check check (code = upper(btrim(code)) and length(code) between 4 and 64),
  constraint discount_campaigns_percent_check check (discount_percent between 1 and 99),
  constraint discount_campaigns_scope_check check (eligibility_scope in ('philippines','international')),
  constraint discount_campaigns_capacity_check check (max_redemptions > 0)
);

create table private.discount_redemptions (
  id uuid primary key default gen_random_uuid(),
  campaign_key text not null,
  quiz_session_id uuid not null,
  lead_id uuid not null,
  redeemer_digest text not null,
  status text not null default 'pending',
  reserved_until timestamptz not null,
  original_total_usd numeric(12,2) not null,
  discount_amount_usd numeric(12,2) not null,
  final_total_usd numeric(12,2) not null,
  redeemed_at timestamptz,
  released_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint discount_redemptions_campaign_key_fkey foreign key (campaign_key)
    references private.discount_campaigns(campaign_key) on delete restrict,
  constraint discount_redemptions_quiz_session_id_fkey foreign key (quiz_session_id)
    references public.quiz_sessions(id) on delete restrict,
  constraint discount_redemptions_lead_id_fkey foreign key (lead_id)
    references public.leads(id) on delete restrict,
  constraint discount_redemptions_digest_check check (redeemer_digest ~ '^[0-9a-f]{64}$'),
  constraint discount_redemptions_status_check check (status in ('pending','redeemed','released')),
  constraint discount_redemptions_money_check check (
    original_total_usd >= 0
    and discount_amount_usd >= 0
    and final_total_usd >= 0
    and round(original_total_usd - discount_amount_usd, 2) = final_total_usd
  ),
  constraint discount_redemptions_lifecycle_check check (
    (status = 'pending' and redeemed_at is null and released_at is null)
    or (status = 'redeemed' and redeemed_at is not null and released_at is null)
    or (status = 'released' and redeemed_at is null and released_at is not null)
  ),
  constraint discount_redemptions_campaign_digest_key unique (campaign_key, redeemer_digest),
  constraint discount_redemptions_quiz_session_id_key unique (quiz_session_id)
);

create index discount_redemptions_capacity_idx
  on private.discount_redemptions (campaign_key, status, reserved_until);

alter table private.discount_campaigns enable row level security;
alter table private.discount_redemptions enable row level security;

revoke all on private.discount_campaigns from public, anon, authenticated;
revoke all on private.discount_redemptions from public, anon, authenticated;
revoke all on private.discount_campaigns from service_role;
revoke all on private.discount_redemptions from service_role;

grant select (email_verified_at) on public.leads to service_role;

insert into private.discount_campaigns (
  campaign_key, code, discount_percent, eligibility_scope, max_redemptions, active
) values
  ('pinoyako', 'PINOYAKO', 50, 'philippines', 50, false),
  ('earlybirdworks', 'EARLYBIRDWORKS', 15, 'international', 100, false)
on conflict (campaign_key) do update
set code = excluded.code,
    discount_percent = excluded.discount_percent,
    eligibility_scope = excluded.eligibility_scope,
    max_redemptions = excluded.max_redemptions,
    active = false,
    updated_at = now();

create function public.preview_proposal_discount(
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
  if round(p_discount_amount_usd, 2) <>
      round(round(p_original_total_usd, 2) * v_campaign.discount_percent / 100.0, 2)
    or round(p_final_total_usd, 2) <>
      round(round(p_original_total_usd, 2) - round(p_discount_amount_usd, 2), 2) then
    raise exception 'coupon_invalid' using errcode = 'P0001';
  end if;

  update private.discount_redemptions
  set status = 'released', released_at = p_at, updated_at = p_at
  where campaign_key = v_campaign.campaign_key
    and status = 'pending'
    and reserved_until <= p_at;

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

create function public.reserve_proposal_discount(
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

  update private.discount_redemptions
  set status = 'released', released_at = p_at, updated_at = p_at
  where campaign_key = v_campaign.campaign_key
    and status = 'pending'
    and reserved_until <= p_at;

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

create function public.release_proposal_discount(
  p_quiz_session_id uuid,
  p_redemption_id uuid,
  p_at timestamptz default now()
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_quiz_session_id is null or p_redemption_id is null or p_at is null then
    raise exception 'coupon_temporarily_unavailable' using errcode = 'P0001';
  end if;
  update private.discount_redemptions
  set status = 'released', released_at = p_at, reserved_until = p_at, updated_at = p_at
  where id = p_redemption_id
    and quiz_session_id = p_quiz_session_id
    and status = 'pending';
  if found then return true; end if;
  return exists (
    select 1 from private.discount_redemptions dr
    where dr.id = p_redemption_id
      and dr.quiz_session_id = p_quiz_session_id
      and dr.status = 'released'
  );
end;
$$;

create function public.finalize_quiz_proposal_v2(
  p_quiz_session_id uuid,
  p_selected_tier_key text,
  p_selected_platform text,
  p_selected_offer_key text,
  p_result_snapshot jsonb,
  p_selected_roadmap_snapshot jsonb,
  p_proposal_reference uuid,
  p_proposal_access_key_hash text,
  p_redemption_id uuid
)
returns table (quiz_session_id uuid, lead_id uuid, proposal_reference uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_original numeric(12,2);
  v_discount numeric(12,2);
  v_final numeric(12,2);
  v_redemption private.discount_redemptions%rowtype;
  v_campaign private.discount_campaigns%rowtype;
  v_quiz_lead_id uuid;
  v_lead_id uuid;
begin
  if p_selected_roadmap_snapshot is null
    or p_selected_roadmap_snapshot ->> 'proposalSnapshotVersion' <> 'proposal-snapshot-2026.09-v2'
    or jsonb_typeof(p_selected_roadmap_snapshot -> 'investment') <> 'object'
    or coalesce(p_selected_roadmap_snapshot #>> '{investment,originalTotalUsd}', '') !~ '^\d+(\.\d{1,2})?$'
    or coalesce(p_selected_roadmap_snapshot #>> '{investment,discountAmountUsd}', '') !~ '^\d+(\.\d{1,2})?$'
    or coalesce(p_selected_roadmap_snapshot #>> '{investment,finalTotalUsd}', '') !~ '^\d+(\.\d{1,2})?$' then
    raise exception 'invalid proposal snapshot' using errcode = '22023';
  end if;

  v_original := (p_selected_roadmap_snapshot #>> '{investment,originalTotalUsd}')::numeric(12,2);
  v_discount := (p_selected_roadmap_snapshot #>> '{investment,discountAmountUsd}')::numeric(12,2);
  v_final := (p_selected_roadmap_snapshot #>> '{investment,finalTotalUsd}')::numeric(12,2);
  if v_original < 0 or v_discount < 0 or v_final < 0
    or round(v_original - v_discount, 2) <> v_final then
    raise exception 'invalid proposal totals' using errcode = '22023';
  end if;

  select qs.lead_id into v_quiz_lead_id
  from public.quiz_sessions qs
  where qs.id = p_quiz_session_id
    and qs.proposal_status = 'not_issued'
  for update;
  if not found or v_quiz_lead_id is null then
    raise exception 'invalid quiz proposal state' using errcode = '22023';
  end if;

  if p_redemption_id is null then
    if v_discount <> 0
      or v_original <> v_final
      or p_selected_roadmap_snapshot #> '{investment,campaign}' is distinct from 'null'::jsonb then
      raise exception 'proposal discount mismatch' using errcode = '22023';
    end if;
  else
    select dr.* into v_redemption
    from private.discount_redemptions dr
    where dr.id = p_redemption_id
      and dr.quiz_session_id = p_quiz_session_id
    for update;
    if not found or v_redemption.status <> 'pending' then
      raise exception 'coupon_temporarily_unavailable' using errcode = 'P0001';
    end if;
    select dc.* into v_campaign
    from private.discount_campaigns dc
    where dc.campaign_key = v_redemption.campaign_key;
    if not found or not v_campaign.active
      or v_original <> v_redemption.original_total_usd
      or v_discount <> v_redemption.discount_amount_usd
      or v_final <> v_redemption.final_total_usd
      or v_discount <> round(v_original * v_campaign.discount_percent / 100.0, 2)
      or p_selected_roadmap_snapshot #>> '{investment,campaign,campaignKey}' <> v_campaign.campaign_key
      or p_selected_roadmap_snapshot #>> '{investment,campaign,code}' <> v_campaign.code
      or p_selected_roadmap_snapshot #>> '{investment,campaign,percentage}' <> v_campaign.discount_percent::text then
      raise exception 'proposal discount mismatch' using errcode = '22023';
    end if;
  end if;

  select finalized.lead_id into v_lead_id
  from public.finalize_quiz_proposal(
    p_quiz_session_id, p_selected_tier_key, p_selected_platform, p_selected_offer_key,
    p_result_snapshot, p_selected_roadmap_snapshot, p_proposal_reference,
    p_proposal_access_key_hash
  ) as finalized;

  update public.quiz_sessions
  set estimated_project_investment_usd = v_final
  where id = p_quiz_session_id;

  return query select p_quiz_session_id, v_lead_id, p_proposal_reference;
end;
$$;

create function public.mark_proposal_delivered_v2(
  p_quiz_session_id uuid,
  p_proposal_reference uuid,
  p_redemption_id uuid,
  p_delivered_at timestamptz default now()
)
returns table (lead_id uuid, proposal_expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quiz_lead_id uuid;
  v_quiz_status text;
  v_redemption private.discount_redemptions%rowtype;
  v_lead_id uuid;
  v_expiry timestamptz;
begin
  if p_delivered_at is null then
    raise exception 'invalid delivery state' using errcode = '22023';
  end if;
  select qs.lead_id, qs.proposal_status into v_quiz_lead_id, v_quiz_status
  from public.quiz_sessions qs
  where qs.id = p_quiz_session_id
    and qs.proposal_reference = p_proposal_reference
  for update;
  if not found or v_quiz_lead_id is null then
    raise exception 'invalid delivery state' using errcode = '22023';
  end if;

  if p_redemption_id is null then
    if exists (
      select 1 from private.discount_redemptions dr
      where dr.quiz_session_id = p_quiz_session_id
        and dr.status in ('pending','redeemed')
    ) then
      raise exception 'proposal discount mismatch' using errcode = '22023';
    end if;
  else
    select dr.* into v_redemption
    from private.discount_redemptions dr
    where dr.id = p_redemption_id
      and dr.quiz_session_id = p_quiz_session_id
      and dr.lead_id = v_quiz_lead_id
    for update;
    if not found or v_redemption.status not in ('pending','redeemed') then
      raise exception 'coupon_temporarily_unavailable' using errcode = 'P0001';
    end if;
  end if;

  select delivered.lead_id, delivered.proposal_expires_at
    into v_lead_id, v_expiry
  from public.mark_proposal_delivered(
    p_quiz_session_id, p_proposal_reference, p_delivered_at
  ) as delivered;

  if p_redemption_id is not null and v_redemption.status = 'pending' then
    update private.discount_redemptions
    set status = 'redeemed', redeemed_at = p_delivered_at,
        released_at = null, updated_at = p_delivered_at
    where id = p_redemption_id;
  end if;

  return query select v_lead_id, v_expiry;
end;
$$;

revoke execute on function public.preview_proposal_discount(uuid,text,text,timestamptz) from public, anon, authenticated;
revoke execute on function public.reserve_proposal_discount(uuid,text,text,numeric,numeric,numeric,timestamptz) from public, anon, authenticated;
revoke execute on function public.release_proposal_discount(uuid,uuid,timestamptz) from public, anon, authenticated;
revoke execute on function public.finalize_quiz_proposal_v2(uuid,text,text,text,jsonb,jsonb,uuid,text,uuid) from public, anon, authenticated;
revoke execute on function public.mark_proposal_delivered_v2(uuid,uuid,uuid,timestamptz) from public, anon, authenticated;

grant execute on function public.preview_proposal_discount(uuid,text,text,timestamptz) to service_role;
grant execute on function public.reserve_proposal_discount(uuid,text,text,numeric,numeric,numeric,timestamptz) to service_role;
grant execute on function public.release_proposal_discount(uuid,uuid,timestamptz) to service_role;
grant execute on function public.finalize_quiz_proposal_v2(uuid,text,text,text,jsonb,jsonb,uuid,text,uuid) to service_role;
grant execute on function public.mark_proposal_delivered_v2(uuid,uuid,uuid,timestamptz) to service_role;
