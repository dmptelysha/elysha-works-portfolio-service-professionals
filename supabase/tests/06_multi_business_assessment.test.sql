begin;
select no_plan();

insert into auth.users (id, aud, role, email, is_anonymous, created_at, updated_at)
values ('81000000-0000-0000-0000-000000000001','authenticated','authenticated',null,true,now(),now());

insert into public.quiz_definitions (id,audience_key,version,active,questions,scoring_rules)
values ('82000000-0000-0000-0000-000000000001','multi_business_audience',1,true,'[{"key":"q1"}]','{}');

insert into public.site_visitors (id,owner_user_id,landing_path)
values ('83000000-0000-0000-0000-000000000001','81000000-0000-0000-0000-000000000001','/quiz/');

insert into public.portfolio_sessions (id,visitor_id,owner_user_id,landing_path)
values
  ('84000000-0000-0000-0000-000000000001','83000000-0000-0000-0000-000000000001','81000000-0000-0000-0000-000000000001','/quiz/'),
  ('84000000-0000-0000-0000-000000000002','83000000-0000-0000-0000-000000000001','81000000-0000-0000-0000-000000000001','/quiz/'),
  ('84000000-0000-0000-0000-000000000003','83000000-0000-0000-0000-000000000001','81000000-0000-0000-0000-000000000001','/quiz/'),
  ('84000000-0000-0000-0000-000000000004','83000000-0000-0000-0000-000000000001','81000000-0000-0000-0000-000000000001','/quiz/');

insert into public.quiz_sessions (
  id,visitor_id,owner_user_id,portfolio_session_id,question_set_id,
  audience_key,question_set_version
) values
  ('85000000-0000-0000-0000-000000000001','83000000-0000-0000-0000-000000000001','81000000-0000-0000-0000-000000000001','84000000-0000-0000-0000-000000000001','82000000-0000-0000-0000-000000000001','multi_business_audience',1),
  ('85000000-0000-0000-0000-000000000002','83000000-0000-0000-0000-000000000001','81000000-0000-0000-0000-000000000001','84000000-0000-0000-0000-000000000002','82000000-0000-0000-0000-000000000001','multi_business_audience',1),
  ('85000000-0000-0000-0000-000000000003','83000000-0000-0000-0000-000000000001','81000000-0000-0000-0000-000000000001','84000000-0000-0000-0000-000000000003','82000000-0000-0000-0000-000000000001','multi_business_audience',1),
  ('85000000-0000-0000-0000-000000000004','83000000-0000-0000-0000-000000000001','81000000-0000-0000-0000-000000000001','84000000-0000-0000-0000-000000000004','82000000-0000-0000-0000-000000000001','multi_business_audience',1);

insert into public.leads (
  id,auth_user_id,email_verified_at,visitor_id,first_name,last_name,email,
  business_name,audience_key,acquisition_source,updated_at
) values
  ('86000000-0000-0000-0000-000000000001','81000000-0000-0000-0000-000000000001',now(),
   '83000000-0000-0000-0000-000000000001','Mara','Santos','mara@example.test',
   'Mara Consulting','multi_business_audience','quiz',now()),
  ('86000000-0000-0000-0000-000000000099','81000000-0000-0000-0000-000000000001',now(),
   '83000000-0000-0000-0000-000000000001','Mara','Santos','other@example.test',
   'Other Company','multi_business_audience','quiz',now());

insert into private.email_otp_challenges (
  id,owner_user_id,email,email_digest,purpose,otp_digest,status,request_ip_digest,
  make_delivery_id,verified_at,grant_expires_at
) values (
  '87000000-0000-0000-0000-000000000001','81000000-0000-0000-0000-000000000001',
  'mara@example.test',decode(repeat('11',32),'hex'),'qualified_quiz',null,'verified',
  decode(repeat('22',32),'hex'),'88000000-0000-0000-0000-000000000001',now(),now()+interval '1 hour'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"81000000-0000-0000-0000-000000000001","role":"authenticated","is_anonymous":true}', true);

select results_eq(
  $$select submission_status,existing_business_id,existing_business_name
    from public.begin_custom_verified_qualified_quiz_v2(
      '83000000-0000-0000-0000-000000000001','84000000-0000-0000-0000-000000000001',
      '85000000-0000-0000-0000-000000000001','87000000-0000-0000-0000-000000000001',
      'multi_business_audience','Mara','Santos','Mara Consulting',true,
      'proposal_followup_v1',null,null
    )$$,
  $$values ('business_scope_required'::text,'86000000-0000-0000-0000-000000000001'::uuid,'Mara Consulting'::text)$$,
  'the displayed business name and opaque ID come from the same lead row'
);

select throws_ok(
  $$select * from public.begin_custom_verified_qualified_quiz_v2(
      '83000000-0000-0000-0000-000000000001','84000000-0000-0000-0000-000000000001',
      '85000000-0000-0000-0000-000000000001','87000000-0000-0000-0000-000000000001',
      'multi_business_audience','Mara','Santos','Mara Consulting',true,
      'proposal_followup_v1','same_business','86000000-0000-0000-0000-000000000099'
    )$$,
  '42501',null,'a business ID under another verified email cannot be selected'
);

select results_eq(
  $$select submission_status,lead_id from public.begin_custom_verified_qualified_quiz_v2(
      '83000000-0000-0000-0000-000000000001','84000000-0000-0000-0000-000000000001',
      '85000000-0000-0000-0000-000000000001','87000000-0000-0000-0000-000000000001',
      'multi_business_audience','Mara','Santos','Mara Consulting',true,
      'proposal_followup_v1','same_business','86000000-0000-0000-0000-000000000001'
    )$$,
  $$values ('accepted'::text,'86000000-0000-0000-0000-000000000001'::uuid)$$,
  'same business reuses the exact displayed lead'
);

reset role;
insert into private.email_otp_challenges (
  id,owner_user_id,email,email_digest,purpose,otp_digest,status,request_ip_digest,
  make_delivery_id,verified_at,grant_expires_at
) values (
  '87000000-0000-0000-0000-000000000002','81000000-0000-0000-0000-000000000001',
  'mara@example.test',decode(repeat('11',32),'hex'),'qualified_quiz',null,'verified',
  decode(repeat('22',32),'hex'),'88000000-0000-0000-0000-000000000002',now(),now()+interval '1 hour'
);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"81000000-0000-0000-0000-000000000001","role":"authenticated","is_anonymous":true}', true);

select * from public.begin_custom_verified_qualified_quiz_v2(
  '83000000-0000-0000-0000-000000000001','84000000-0000-0000-0000-000000000002',
  '85000000-0000-0000-0000-000000000002','87000000-0000-0000-0000-000000000002',
  'multi_business_audience','Mara','Santos','Mara Academy',true,
  'proposal_followup_v1',null,null
);
select results_eq(
  $$select submission_status from public.begin_custom_verified_qualified_quiz_v2(
      '83000000-0000-0000-0000-000000000001','84000000-0000-0000-0000-000000000002',
      '85000000-0000-0000-0000-000000000002','87000000-0000-0000-0000-000000000002',
      'multi_business_audience','Mara','Santos','Mara Academy',true,
      'proposal_followup_v1','another_business',null
    )$$,
  $$values ('accepted'::text)$$,
  'another business creates a distinct lead under the same verified email'
);
select is(
  (select count(*)::integer from public.leads
    where email='mara@example.test' and lower(btrim(business_name))='mara academy'),
  1,'the new business is stored once'
);

reset role;
update public.leads set updated_at=now()+interval '1 minute'
where id='86000000-0000-0000-0000-000000000001';
insert into private.email_otp_challenges (
  id,owner_user_id,email,email_digest,purpose,otp_digest,status,request_ip_digest,
  make_delivery_id,verified_at,grant_expires_at
) values (
  '87000000-0000-0000-0000-000000000003','81000000-0000-0000-0000-000000000001',
  'mara@example.test',decode(repeat('11',32),'hex'),'qualified_quiz',null,'verified',
  decode(repeat('22',32),'hex'),'88000000-0000-0000-0000-000000000003',now(),now()+interval '1 hour'
);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"81000000-0000-0000-0000-000000000001","role":"authenticated","is_anonymous":true}', true);

select * from public.begin_custom_verified_qualified_quiz_v2(
  '83000000-0000-0000-0000-000000000001','84000000-0000-0000-0000-000000000003',
  '85000000-0000-0000-0000-000000000003','87000000-0000-0000-0000-000000000003',
  'multi_business_audience','Mara','Santos','Mara Academy',true,
  'proposal_followup_v1',null,null
);
select results_eq(
  $$select r.submission_status,r.lead_id=(select l.id from public.leads l
      where l.email='mara@example.test' and lower(btrim(l.business_name))='mara academy')
    from public.begin_custom_verified_qualified_quiz_v2(
      '83000000-0000-0000-0000-000000000001','84000000-0000-0000-0000-000000000003',
      '85000000-0000-0000-0000-000000000003','87000000-0000-0000-0000-000000000003',
      'multi_business_audience','Mara','Santos','Mara Academy',true,
      'proposal_followup_v1','another_business',null
    ) r$$,
  $$values ('accepted'::text,true)$$,
  'another business reuses an existing second business instead of failing or duplicating it'
);
select is(
  (select count(*)::integer from public.leads
    where email='mara@example.test' and lower(btrim(business_name))='mara academy'),
  1,'existing second business reuse does not create a duplicate'
);

reset role;
update public.leads set updated_at=now()+interval '2 minutes'
where id='86000000-0000-0000-0000-000000000001';
insert into private.email_otp_challenges (
  id,owner_user_id,email,email_digest,purpose,otp_digest,status,request_ip_digest,
  make_delivery_id,verified_at,grant_expires_at
) values (
  '87000000-0000-0000-0000-000000000004','81000000-0000-0000-0000-000000000001',
  'mara@example.test',decode(repeat('11',32),'hex'),'qualified_quiz',null,'verified',
  decode(repeat('22',32),'hex'),'88000000-0000-0000-0000-000000000004',now(),now()+interval '1 hour'
);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"81000000-0000-0000-0000-000000000001","role":"authenticated","is_anonymous":true}', true);

select * from public.begin_custom_verified_qualified_quiz_v2(
  '83000000-0000-0000-0000-000000000001','84000000-0000-0000-0000-000000000004',
  '85000000-0000-0000-0000-000000000004','87000000-0000-0000-0000-000000000004',
  'multi_business_audience','Mara','Santos','Mara Consulting',true,
  'proposal_followup_v1',null,null
);
select results_eq(
  $$select submission_status from public.begin_custom_verified_qualified_quiz_v2(
      '83000000-0000-0000-0000-000000000001','84000000-0000-0000-0000-000000000004',
      '85000000-0000-0000-0000-000000000004','87000000-0000-0000-0000-000000000004',
      'multi_business_audience','Mara','Santos','Mara Consulting',true,
      'proposal_followup_v1','another_business',null
    )$$,
  $$values ('different_business_name_required'::text)$$,
  'another business requests a distinct name instead of throwing a generic error'
);
select results_eq(
  $$select c.status,qs.lead_id is null
    from private.email_otp_challenges c
    join public.quiz_sessions qs on qs.id='85000000-0000-0000-0000-000000000004'
    where c.id='87000000-0000-0000-0000-000000000004'$$,
  $$values ('verified'::text,true)$$,
  'a distinct-name prompt preserves the verification grant and unlinked quiz'
);

select * from finish();
rollback;
