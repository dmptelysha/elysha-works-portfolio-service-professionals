begin;
select no_plan();

select ok(
  not has_table_privilege('authenticated', 'private.discount_campaigns', 'SELECT'),
  'browser roles cannot read campaign capacity'
);
select ok(
  not has_table_privilege('authenticated', 'private.discount_redemptions', 'SELECT'),
  'browser roles cannot read redemption records'
);
select ok(
  not has_function_privilege('authenticated', 'public.reserve_proposal_discount(uuid,text,text,numeric,numeric,numeric,timestamptz)', 'EXECUTE'),
  'browser roles cannot reserve a coupon'
);
select ok(
  has_function_privilege('service_role', 'public.finalize_quiz_proposal_v2(uuid,text,text,text,jsonb,jsonb,uuid,text,uuid)', 'EXECUTE'),
  'service role can call V2 proposal finalization'
);

insert into auth.users (id, aud, role, email, created_at, updated_at)
values (
  '91000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
  'discount-owner@example.test', now(), now()
);

insert into public.site_visitors (id, owner_user_id, landing_path)
values (
  '92000000-0000-4000-8000-000000000001',
  '91000000-0000-4000-8000-000000000001', '/quiz/'
);

insert into public.portfolio_sessions (id, visitor_id, owner_user_id, landing_path)
values (
  '93000000-0000-4000-8000-000000000001',
  '92000000-0000-4000-8000-000000000001',
  '91000000-0000-4000-8000-000000000001', '/quiz/'
);

insert into public.leads (
  id, auth_user_id, email_verified_at, visitor_id, first_name, email,
  business_name, audience_key, acquisition_source
) values
  ('94000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001',now(),'92000000-0000-4000-8000-000000000001','Pinoy One','pinoy-one@example.test','Pinoy One Co','service_businesses','quiz'),
  ('94000000-0000-4000-8000-000000000002','91000000-0000-4000-8000-000000000001',now(),'92000000-0000-4000-8000-000000000001','Pinoy Two','pinoy-two@example.test','Pinoy Two Co','service_businesses','quiz'),
  ('94000000-0000-4000-8000-000000000003','91000000-0000-4000-8000-000000000001',now(),'92000000-0000-4000-8000-000000000001','Global One','global-one@example.test','Global One Co','service_businesses','quiz'),
  ('94000000-0000-4000-8000-000000000004','91000000-0000-4000-8000-000000000001',now(),'92000000-0000-4000-8000-000000000001','Unknown One','unknown-one@example.test','Unknown One Co','service_businesses','quiz');

insert into public.quiz_sessions (
  id, visitor_id, owner_user_id, portfolio_session_id, question_set_id, lead_id,
  audience_key, question_set_version, business_country, country_code,
  display_currency, currency_symbol, fx_rate, fx_rate_timestamp
)
select fixture.quiz_id,
       '92000000-0000-4000-8000-000000000001'::uuid,
       '91000000-0000-4000-8000-000000000001'::uuid,
       '93000000-0000-4000-8000-000000000001'::uuid,
       definition.id, fixture.lead_id, 'service_businesses', definition.version,
       fixture.country_name, fixture.country_code, fixture.currency, fixture.symbol,
       fixture.fx_rate, now()
from (
  values
    ('95000000-0000-4000-8000-000000000001'::uuid,'94000000-0000-4000-8000-000000000001'::uuid,'Philippines','PH','PHP','₱',58::numeric),
    ('95000000-0000-4000-8000-000000000002'::uuid,'94000000-0000-4000-8000-000000000002'::uuid,'Philippines','PH','PHP','₱',58::numeric),
    ('95000000-0000-4000-8000-000000000003'::uuid,'94000000-0000-4000-8000-000000000003'::uuid,'United States','US','USD','$',1::numeric),
    ('95000000-0000-4000-8000-000000000004'::uuid,'94000000-0000-4000-8000-000000000004'::uuid,'Other','ZZ','USD','$',1::numeric)
) as fixture(quiz_id, lead_id, country_name, country_code, currency, symbol, fx_rate)
cross join lateral (
  select qd.id, qd.version
  from public.quiz_definitions qd
  where qd.audience_key = 'service_businesses' and qd.active
  order by qd.version desc
  limit 1
) as definition;

update private.discount_campaigns
set active = true, updated_at = now()
where campaign_key in ('pinoyako','earlybirdworks');

select is(
  (select discount_percent from public.preview_proposal_discount(
    '95000000-0000-4000-8000-000000000001', ' pinoyako ', repeat('a', 64), now()
  )),
  50,
  'PINOYAKO is available to an eligible PH quiz'
);

select throws_ok(
  $$select * from public.preview_proposal_discount(
    '95000000-0000-4000-8000-000000000003', 'PINOYAKO', repeat('b', 64), now()
  )$$,
  'P0001', 'coupon_ineligible',
  'PINOYAKO rejects an international quiz'
);

select is(
  (select discount_percent from public.preview_proposal_discount(
    '95000000-0000-4000-8000-000000000003', 'earlybirdworks', repeat('c', 64), now()
  )),
  15,
  'EARLYBIRDWORKS is available to an eligible international quiz'
);

select throws_ok(
  $$select * from public.preview_proposal_discount(
    '95000000-0000-4000-8000-000000000004', 'EARLYBIRDWORKS', repeat('d', 64), now()
  )$$,
  'P0001', 'coupon_ineligible',
  'the catch-all ZZ country is not eligible'
);

select throws_ok(
  $$select * from public.reserve_proposal_discount(
    '95000000-0000-4000-8000-000000000001', 'PINOYAKO', repeat('1',64),
    1500, 100, 1400, now()
  )$$,
  'P0001', 'coupon_invalid',
  'reservation rejects internally consistent totals that do not match the campaign percentage'
);

select lives_ok(
  $$select * from public.reserve_proposal_discount(
    '95000000-0000-4000-8000-000000000001', 'PINOYAKO', repeat('1',64),
    1500, 750, 750, now()
  )$$,
  'an eligible client can reserve PINOYAKO'
);

select is(
  (select redemption_id from public.reserve_proposal_discount(
    '95000000-0000-4000-8000-000000000001', 'PINOYAKO', repeat('1',64),
    1500, 750, 750, now()
  )),
  (select id from private.discount_redemptions where quiz_session_id = '95000000-0000-4000-8000-000000000001'),
  'same-session reservation retries are idempotent'
);

select throws_ok(
  $$select * from public.reserve_proposal_discount(
    '95000000-0000-4000-8000-000000000001', 'PINOYAKO', repeat('1',64),
    1600, 800, 800, now()
  )$$,
  'P0001', 'coupon_temporarily_unavailable',
  'an initialized reservation cannot be retried with different totals'
);

select throws_ok(
  $$select * from public.reserve_proposal_discount(
    '95000000-0000-4000-8000-000000000002', 'PINOYAKO', repeat('1',64),
    1500, 750, 750, now()
  )$$,
  'P0001', 'coupon_temporarily_unavailable',
  'the same verified-email digest cannot hold two pending reservations'
);

update private.discount_redemptions
set status = 'redeemed', redeemed_at = now(), updated_at = now()
where quiz_session_id = '95000000-0000-4000-8000-000000000001';

select throws_ok(
  $$select * from public.reserve_proposal_discount(
    '95000000-0000-4000-8000-000000000002', 'PINOYAKO', repeat('1',64),
    1500, 750, 750, now()
  )$$,
  'P0001', 'coupon_already_redeemed',
  'a redeemed digest cannot use the campaign through another business'
);

select lives_ok(
  $$select * from public.reserve_proposal_discount(
    '95000000-0000-4000-8000-000000000002', 'PINOYAKO', repeat('2',64),
    1500, 750, 750, now()
  )$$,
  'a second PH quiz can reserve with a different digest'
);
select ok(
  public.release_proposal_discount(
    '95000000-0000-4000-8000-000000000002',
    (select id from private.discount_redemptions where quiz_session_id = '95000000-0000-4000-8000-000000000002'),
    now()
  ),
  'a failed delivery releases its reservation'
);

update public.quiz_sessions
set proposal_reference = '96000000-0000-4000-8000-000000000002'
where id = '95000000-0000-4000-8000-000000000002';

select throws_ok(
  format(
    $$select * from public.mark_proposal_delivered_v2(
      '95000000-0000-4000-8000-000000000002',
      '96000000-0000-4000-8000-000000000002', %L, now()
    )$$,
    (select id from private.discount_redemptions where quiz_session_id = '95000000-0000-4000-8000-000000000002')
  ),
  'P0001', 'coupon_temporarily_unavailable',
  'a released discounted proposal cannot be delivered before re-reserving capacity'
);

select lives_ok(
  $$select * from public.reserve_proposal_discount(
    '95000000-0000-4000-8000-000000000002', 'PINOYAKO', repeat('2',64),
    1500, 750, 750, now()
  )$$,
  'a released reservation can be reused idempotently'
);

delete from private.discount_redemptions;

create temporary table discount_capacity_fixture (
  campaign_key text not null,
  ordinal integer not null,
  quiz_id uuid not null,
  lead_id uuid not null,
  redeemer_digest text not null,
  country_name text not null,
  country_code text not null,
  currency text not null,
  symbol text not null
) on commit drop;

insert into discount_capacity_fixture
select 'pinoyako', n, gen_random_uuid(), gen_random_uuid(),
       md5('pinoyako-' || n::text) || md5('pinoyako-b-' || n::text),
       'Philippines', 'PH', 'PHP', '₱'
from generate_series(1, 51) as n
union all
select 'earlybirdworks', n, gen_random_uuid(), gen_random_uuid(),
       md5('earlybird-' || n::text) || md5('earlybird-b-' || n::text),
       'United States', 'US', 'USD', '$'
from generate_series(1, 101) as n;

insert into public.leads (
  id, auth_user_id, email_verified_at, visitor_id, first_name, email,
  business_name, audience_key, acquisition_source
)
select lead_id, '91000000-0000-4000-8000-000000000001', now(),
       '92000000-0000-4000-8000-000000000001', 'Capacity Client',
       campaign_key || '-' || ordinal || '@example.test',
       campaign_key || ' client ' || ordinal, 'service_businesses', 'quiz'
from discount_capacity_fixture;

insert into public.quiz_sessions (
  id, visitor_id, owner_user_id, portfolio_session_id, question_set_id, lead_id,
  audience_key, question_set_version, business_country, country_code,
  display_currency, currency_symbol, fx_rate, fx_rate_timestamp
)
select fixture.quiz_id,
       '92000000-0000-4000-8000-000000000001',
       '91000000-0000-4000-8000-000000000001',
       '93000000-0000-4000-8000-000000000001',
       definition.id, fixture.lead_id, 'service_businesses', definition.version,
       fixture.country_name, fixture.country_code, fixture.currency, fixture.symbol,
       case when fixture.country_code = 'PH' then 58 else 1 end, now()
from discount_capacity_fixture fixture
cross join lateral (
  select qd.id, qd.version
  from public.quiz_definitions qd
  where qd.audience_key = 'service_businesses' and qd.active
  order by qd.version desc
  limit 1
) as definition;

do $$
declare fixture record;
begin
  for fixture in
    select * from discount_capacity_fixture
    where campaign_key = 'pinoyako' and ordinal <= 50
    order by ordinal
  loop
    perform * from public.reserve_proposal_discount(
      fixture.quiz_id, 'PINOYAKO', fixture.redeemer_digest,
      1500, 750, 750, now()
    );
  end loop;
end;
$$;

select is(
  (select count(*)::integer from private.discount_redemptions
   where campaign_key = 'pinoyako' and status in ('pending','redeemed')),
  50,
  'the fiftieth PINOYAKO reservation succeeds'
);

select throws_ok(
  format(
    $$select * from public.reserve_proposal_discount(%L, 'PINOYAKO', %L, 1500, 750, 750, now())$$,
    (select quiz_id from discount_capacity_fixture where campaign_key = 'pinoyako' and ordinal = 51),
    (select redeemer_digest from discount_capacity_fixture where campaign_key = 'pinoyako' and ordinal = 51)
  ),
  'P0001', 'coupon_exhausted',
  'the fifty-first PINOYAKO reservation is rejected'
);

update private.discount_redemptions
set status = 'released', released_at = now(), reserved_until = now(), updated_at = now()
where id = (
  select id from private.discount_redemptions
  where campaign_key = 'pinoyako' order by created_at limit 1
);

select lives_ok(
  format(
    $$select * from public.reserve_proposal_discount(%L, 'PINOYAKO', %L, 1500, 750, 750, now())$$,
    (select quiz_id from discount_capacity_fixture where campaign_key = 'pinoyako' and ordinal = 51),
    (select redeemer_digest from discount_capacity_fixture where campaign_key = 'pinoyako' and ordinal = 51)
  ),
  'released PINOYAKO capacity becomes available again'
);

do $$
declare fixture record;
begin
  for fixture in
    select * from discount_capacity_fixture
    where campaign_key = 'earlybirdworks' and ordinal <= 100
    order by ordinal
  loop
    perform * from public.reserve_proposal_discount(
      fixture.quiz_id, 'EARLYBIRDWORKS', fixture.redeemer_digest,
      2500, 375, 2125, now()
    );
  end loop;
end;
$$;

select is(
  (select count(*)::integer from private.discount_redemptions
   where campaign_key = 'earlybirdworks' and status in ('pending','redeemed')),
  100,
  'the one-hundredth EARLYBIRDWORKS reservation succeeds'
);

select throws_ok(
  format(
    $$select * from public.reserve_proposal_discount(%L, 'EARLYBIRDWORKS', %L, 2500, 375, 2125, now())$$,
    (select quiz_id from discount_capacity_fixture where campaign_key = 'earlybirdworks' and ordinal = 101),
    (select redeemer_digest from discount_capacity_fixture where campaign_key = 'earlybirdworks' and ordinal = 101)
  ),
  'P0001', 'coupon_exhausted',
  'the one-hundred-first EARLYBIRDWORKS reservation is rejected'
);

update private.discount_redemptions
set reserved_until = now() - interval '1 second'
where id = (
  select id from private.discount_redemptions
  where campaign_key = 'earlybirdworks' order by created_at limit 1
);

select lives_ok(
  format(
    $$select * from public.reserve_proposal_discount(%L, 'EARLYBIRDWORKS', %L, 2500, 375, 2125, now())$$,
    (select quiz_id from discount_capacity_fixture where campaign_key = 'earlybirdworks' and ordinal = 101),
    (select redeemer_digest from discount_capacity_fixture where campaign_key = 'earlybirdworks' and ordinal = 101)
  ),
  'expired pending capacity is released before the next reservation'
);

set local role authenticated;
select throws_ok(
  $$select count(*) from private.discount_redemptions$$,
  '42501', null,
  'authenticated users cannot inspect private redemptions'
);
reset role;

select * from finish();
rollback;
