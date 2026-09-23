begin;
select no_plan();

insert into auth.users (id, aud, role, email, is_anonymous, created_at, updated_at)
values
  ('71000000-0000-0000-0000-000000000001','authenticated','authenticated',null,true,now(),now()),
  ('71000000-0000-0000-0000-000000000002','authenticated','authenticated',null,true,now(),now());

insert into public.quiz_definitions (id,audience_key,version,active,questions,scoring_rules)
values ('72000000-0000-0000-0000-000000000001','otp_audience',1,true,'[{"key":"q1"}]','{}');

insert into public.site_visitors (id,owner_user_id,landing_path)
values
  ('73000000-0000-0000-0000-000000000001','71000000-0000-0000-0000-000000000001','/'),
  ('73000000-0000-0000-0000-000000000002','71000000-0000-0000-0000-000000000002','/');

insert into public.portfolio_sessions (id,visitor_id,owner_user_id,landing_path)
values
  ('74000000-0000-0000-0000-000000000001','73000000-0000-0000-0000-000000000001','71000000-0000-0000-0000-000000000001','/'),
  ('74000000-0000-0000-0000-000000000002','73000000-0000-0000-0000-000000000001','71000000-0000-0000-0000-000000000001','/'),
  ('74000000-0000-0000-0000-000000000003','73000000-0000-0000-0000-000000000002','71000000-0000-0000-0000-000000000002','/');

insert into public.quiz_sessions (
  id,visitor_id,owner_user_id,portfolio_session_id,question_set_id,
  audience_key,question_set_version
) values
  ('75000000-0000-0000-0000-000000000001','73000000-0000-0000-0000-000000000001','71000000-0000-0000-0000-000000000001','74000000-0000-0000-0000-000000000001','72000000-0000-0000-0000-000000000001','otp_audience',1),
  ('75000000-0000-0000-0000-000000000002','73000000-0000-0000-0000-000000000001','71000000-0000-0000-0000-000000000001','74000000-0000-0000-0000-000000000002','72000000-0000-0000-0000-000000000001','otp_audience',1),
  ('75000000-0000-0000-0000-000000000003','73000000-0000-0000-0000-000000000002','71000000-0000-0000-0000-000000000002','74000000-0000-0000-0000-000000000003','72000000-0000-0000-0000-000000000001','otp_audience',1);

select lives_ok(
  $$select * from public.record_email_otp_challenge(
    '76000000-0000-0000-0000-000000000001',
    '71000000-0000-0000-0000-000000000001',
    'person@example.test', decode(repeat('11',32),'hex'),
    decode(repeat('22',32),'hex'), decode(repeat('33',32),'hex'),
    '77000000-0000-0000-0000-000000000001', now()
  )$$,
  'trusted service can record a hash-only challenge'
);

select is(
  (select otp_digest = decode(repeat('22',32),'hex')
   from private.email_otp_challenges
   where id = '76000000-0000-0000-0000-000000000001'),
  true,
  'database stores the digest, not the OTP'
);

select results_eq(
  $$select email,purpose,result_code from public.get_email_otp_challenge_context(
    '76000000-0000-0000-0000-000000000001',
    '71000000-0000-0000-0000-000000000001'
  )$$,
  $$values ('person@example.test'::text,'qualified_quiz'::text,'ok'::text)$$,
  'service context returns only canonical digest inputs'
);

select is(
  public.mark_email_otp_delivery(
    '76000000-0000-0000-0000-000000000001',
    '71000000-0000-0000-0000-000000000001',
    '77000000-0000-0000-0000-000000000001',true,now()
  ),
  'active'::text,
  'matching Make acknowledgement activates the challenge'
);
select is(
  public.mark_email_otp_delivery(
    '76000000-0000-0000-0000-000000000001',
    '71000000-0000-0000-0000-000000000001',
    '77000000-0000-0000-0000-000000000001',true,now()
  ),
  'invalid_state'::text,
  'delivery acknowledgement cannot replay'
);

select is(
  (select count(*)::integer from public.get_email_otp_challenge_context(
    '76000000-0000-0000-0000-000000000001',
    '71000000-0000-0000-0000-000000000002'
  )),
  0,
  'another owner cannot read challenge context'
);

select results_eq(
  $$select verified,result_code from public.verify_email_otp_digest(
    '76000000-0000-0000-0000-000000000001',
    '71000000-0000-0000-0000-000000000001',
    decode(repeat('22',32),'hex'),now()
  )$$,
  $$values (true,'verified'::text)$$,
  'correct fixed-length digest verifies'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"71000000-0000-0000-0000-000000000001","role":"authenticated","is_anonymous":true}', true);
select throws_ok(
  $$select * from private.email_otp_challenges$$,
  '42501', null, 'browser cannot read private challenges'
);
select results_eq(
  $$select submission_status,lead_id is not null from public.begin_custom_verified_qualified_quiz(
    '73000000-0000-0000-0000-000000000001',
    '74000000-0000-0000-0000-000000000001',
    '75000000-0000-0000-0000-000000000001',
    '76000000-0000-0000-0000-000000000001',
    'otp_audience','Elysha','Corpuz','Elysha Works',true,
    'proposal_followup_v1',null
  )$$,
  $$values ('accepted'::text,true)$$,
  'anonymous owner consumes a verified challenge and creates the lead'
);
select results_eq(
  $$select email,email_verified_at is not null,last_name from public.leads
    where source_quiz_session_id='75000000-0000-0000-0000-000000000001'$$,
  $$values ('person@example.test'::text,true,'Corpuz'::text)$$,
  'lead email and verification time come from the consumed challenge'
);
select lives_ok(
  $$select * from public.begin_custom_verified_qualified_quiz(
    '73000000-0000-0000-0000-000000000001',
    '74000000-0000-0000-0000-000000000001',
    '75000000-0000-0000-0000-000000000001',
    '76000000-0000-0000-0000-000000000001',
    'otp_audience','Elysha','Corpuz','Elysha Works',true,
    'proposal_followup_v1',null
  )$$,
  'same quiz retry is idempotent after challenge consumption'
);

select set_config('request.jwt.claims', '{"sub":"71000000-0000-0000-0000-000000000002","role":"authenticated","is_anonymous":true}', true);
select throws_ok(
  $$select * from public.begin_custom_verified_qualified_quiz(
    '73000000-0000-0000-0000-000000000001',
    '74000000-0000-0000-0000-000000000001',
    '75000000-0000-0000-0000-000000000001',
    '76000000-0000-0000-0000-000000000001',
    'otp_audience','Other','Owner','Other Business',true,
    'proposal_followup_v1',null
  )$$,
  '42501',null,'another owner cannot consume a verified challenge'
);
reset role;

select lives_ok(
  $$select * from public.record_email_otp_challenge(
    '76000000-0000-0000-0000-000000000002',
    '71000000-0000-0000-0000-000000000001',
    'person@example.test', decode(repeat('11',32),'hex'),
    decode(repeat('44',32),'hex'), decode(repeat('33',32),'hex'),
    '77000000-0000-0000-0000-000000000002', now()+interval '61 seconds'
  )$$,
  'cooldown permits a replacement challenge'
);
select is(
  (select status from private.email_otp_challenges where id='76000000-0000-0000-0000-000000000001'),
  'consumed'::text,
  'consumed challenge stays terminal when a replacement is issued'
);
select is(
  public.mark_email_otp_delivery(
    '76000000-0000-0000-0000-000000000002',
    '71000000-0000-0000-0000-000000000001',
    '77000000-0000-0000-0000-000000000002',true,now()+interval '61 seconds'
  ),
  'active'::text,
  'replacement challenge becomes active'
);

select results_eq(
  $$select verified,result_code from public.verify_email_otp_digest(
    '76000000-0000-0000-0000-000000000002',
    '71000000-0000-0000-0000-000000000001',
    decode(repeat('55',32),'hex'),now()+interval '62 seconds'
  )$$,
  $$values (false,'invalid'::text)$$,
  'wrong digest fails generically'
);
select * from public.verify_email_otp_digest('76000000-0000-0000-0000-000000000002','71000000-0000-0000-0000-000000000001',decode(repeat('55',32),'hex'),now()+interval '63 seconds');
select * from public.verify_email_otp_digest('76000000-0000-0000-0000-000000000002','71000000-0000-0000-0000-000000000001',decode(repeat('55',32),'hex'),now()+interval '64 seconds');
select * from public.verify_email_otp_digest('76000000-0000-0000-0000-000000000002','71000000-0000-0000-0000-000000000001',decode(repeat('55',32),'hex'),now()+interval '65 seconds');
select * from public.verify_email_otp_digest('76000000-0000-0000-0000-000000000002','71000000-0000-0000-0000-000000000001',decode(repeat('55',32),'hex'),now()+interval '66 seconds');
select results_eq(
  $$select status,attempt_count,otp_digest is null from private.email_otp_challenges
    where id='76000000-0000-0000-0000-000000000002'$$,
  $$values ('failed'::text,5,true)$$,
  'fifth failed attempt makes the challenge terminal and clears its digest'
);

update private.email_otp_challenges
set created_at=now()-interval '25 hours',
    expires_at=now()-interval '24 hours',
    resend_available_at=now()-interval '24 hours 59 minutes'
where id='76000000-0000-0000-0000-000000000002';
select ok(private.cleanup_email_otp_challenges(100) >= 1,'bounded cleanup removes old terminal OTP metadata');
select is(
  (select count(*)::integer from private.email_otp_challenges where id='76000000-0000-0000-0000-000000000002'),
  0,
  'terminal challenge metadata is deleted after 24 hours'
);

select * from finish();
rollback;
