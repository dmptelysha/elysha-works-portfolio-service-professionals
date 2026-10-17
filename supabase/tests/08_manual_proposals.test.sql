begin;
select no_plan();

select ok(
  not has_table_privilege('anon', 'private.manual_proposals', 'SELECT')
  and not has_table_privilege('authenticated', 'private.manual_proposals', 'SELECT'),
  'browser roles cannot read manual proposals'
);
select ok(
  not has_function_privilege('anon', 'public.verify_manual_proposal_access(uuid,text,timestamptz)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.verify_manual_proposal_access(uuid,text,timestamptz)', 'EXECUTE'),
  'browser roles cannot verify codes directly'
);
select ok(
  has_function_privilege('service_role', 'public.verify_manual_proposal_access(uuid,text,timestamptz)', 'EXECUTE'),
  'service role can verify access'
);
select is(
  (select public from storage.buckets where id = 'manual-proposal-previews'),
  false,
  'preview bucket is private'
);

select is(
  (select count(*) from public.verify_manual_proposal_access(
    '11111111-1111-4111-8111-111111111111', repeat('a', 64), now()
  )),
  0::bigint,
  'unknown reference does not disclose a proposal'
);

with created as (
  select public.create_manual_proposal_draft(
    '{"clientName":"Meghan","businessName":"The Emotional Anchor","offers":[{"key":"basic","priceCents":150000},{"key":"advanced","priceCents":250000},{"key":"complete","priceCents":400000}]}'::jsonb,
    now() + interval '7 days', null
  ) as id
)
select ok((select id is not null from created), 'draft can be created');

select throws_ok(
  $$select public.create_manual_proposal_draft('{}'::jsonb, now() + interval '7 days', null)$$,
  '22023', 'invalid manual proposal snapshot',
  'malformed draft is rejected'
);

select ok(
  (select count(*) = 1 from private.manual_proposals where status = 'draft' and version = 1),
  'draft starts at version one'
);

select public.issue_manual_proposal(
  (select id from private.manual_proposals where status = 'draft' limit 1),
  '22222222-2222-4222-8222-222222222222',
  repeat('a', 64),
  '{"desktop":"manual/one/desktop.png","tablet":"manual/one/tablet.png","mobile":"manual/one/mobile.png"}'::jsonb,
  now()
);

select is(
  (select status from private.manual_proposals where reference = '22222222-2222-4222-8222-222222222222'),
  'active',
  'issue activates the snapshot'
);
select throws_ok(
  $$update private.manual_proposals set snapshot = '{}'::jsonb where reference = '22222222-2222-4222-8222-222222222222'$$,
  'P0001', 'issued snapshot is immutable',
  'issued content cannot change in place'
);
select is(
  (select count(*) from public.verify_manual_proposal_access(
    '22222222-2222-4222-8222-222222222222', repeat('b', 64), now()
  )),
  0::bigint,
  'wrong code does not release content'
);
select is(
  (select failed_attempts from private.manual_proposals where reference = '22222222-2222-4222-8222-222222222222'),
  1,
  'wrong code records an attempt'
);
select public.verify_manual_proposal_access(
  '22222222-2222-4222-8222-222222222222', repeat('b', 64), now()
);
select public.verify_manual_proposal_access(
  '22222222-2222-4222-8222-222222222222', repeat('b', 64), now()
);
select public.verify_manual_proposal_access(
  '22222222-2222-4222-8222-222222222222', repeat('b', 64), now()
);
select public.verify_manual_proposal_access(
  '22222222-2222-4222-8222-222222222222', repeat('b', 64), now()
);
select ok(
  (select locked_until > now() from private.manual_proposals where reference = '22222222-2222-4222-8222-222222222222'),
  'fifth failure locks access'
);
select is(
  (select count(*) from public.verify_manual_proposal_access(
    '22222222-2222-4222-8222-222222222222', repeat('a', 64), now()
  )),
  0::bigint,
  'correct code cannot bypass lockout'
);
select is(
  (select failed_attempts from private.manual_proposals where reference = '22222222-2222-4222-8222-222222222222'),
  5,
  'attempts during lockout do not increment'
);
select ok(
  (select count(*) = 1 from public.verify_manual_proposal_access(
    '22222222-2222-4222-8222-222222222222', repeat('a', 64), now() + interval '16 minutes'
  )),
  'correct code works after lockout'
);
select is(
  (select failed_attempts from private.manual_proposals where reference = '22222222-2222-4222-8222-222222222222'),
  0,
  'successful access resets attempts'
);

select ok(
  public.create_manual_proposal_draft(
    '{"clientName":"Meghan","businessName":"The Emotional Anchor","offers":[{"key":"basic","priceCents":150000},{"key":"advanced","priceCents":250000},{"key":"complete","priceCents":400000}]}'::jsonb,
    now() + interval '7 days',
    (select id from private.manual_proposals where reference = '22222222-2222-4222-8222-222222222222')
  ) is not null,
  'revision draft can be created'
);
select is(
  (select max(version) from private.manual_proposals),
  2,
  'revision increments version'
);

select throws_ok(
  $$select public.issue_manual_proposal(
    (select id from private.manual_proposals where version = 2),
    '33333333-3333-4333-8333-333333333333', 'not-a-hash',
    '{"desktop":"manual/two/desktop.png","tablet":"manual/two/tablet.png","mobile":"manual/two/mobile.png"}'::jsonb,
    now()
  )$$,
  '22023', 'invalid manual proposal issue',
  'malformed hash cannot issue a proposal'
);
select public.issue_manual_proposal(
  (select id from private.manual_proposals where version = 2),
  '33333333-3333-4333-8333-333333333333',
  repeat('c', 64),
  '{"desktop":"manual/two/desktop.png","tablet":"manual/two/tablet.png","mobile":"manual/two/mobile.png"}'::jsonb,
  now()
);
select is(
  (select status from private.manual_proposals where version = 1),
  'revoked',
  'new issue revokes superseded access'
);
select ok(
  (select count(*) = 1 from public.list_expired_manual_preview_objects()),
  'only old version is eligible for cleanup'
);
select public.rotate_manual_proposal_code(
  (select id from private.manual_proposals where version = 2), repeat('d', 64)
);
select is(
  (select count(*) from public.verify_manual_proposal_access(
    '33333333-3333-4333-8333-333333333333', repeat('c', 64), now()
  )),
  0::bigint,
  'rotated code rejects the old hash'
);
select ok(
  (select count(*) = 1 from public.verify_manual_proposal_access(
    '33333333-3333-4333-8333-333333333333', repeat('d', 64), now()
  )),
  'rotated code unlocks the new version'
);
select throws_ok(
  $$select public.mark_manual_preview_cleaned(
    (select id from private.manual_proposals where version = 2)
  )$$,
  '22023', 'preview still in use',
  'active preview cannot be marked cleaned'
);
select public.mark_manual_preview_cleaned(
  (select id from private.manual_proposals where version = 1)
);
select ok(
  (select preview_cleaned_at is not null from private.manual_proposals where version = 1),
  'old version cleanup can be recorded'
);
select public.revoke_manual_proposal(
  (select id from private.manual_proposals where version = 2)
);
select is(
  (select count(*) from public.verify_manual_proposal_access(
    '33333333-3333-4333-8333-333333333333', repeat('d', 64), now()
  )),
  0::bigint,
  'revocation blocks the correct code'
);

select * from finish();
rollback;
