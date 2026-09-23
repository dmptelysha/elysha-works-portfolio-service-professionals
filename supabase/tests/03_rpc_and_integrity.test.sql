begin;
select no_plan();

insert into auth.users (id, aud, role, email, created_at, updated_at)
values
  ('11000000-0000-0000-0000-000000000001','authenticated','authenticated','rpc1@example.test',now(),now()),
  ('11000000-0000-0000-0000-000000000002','authenticated','authenticated','rpc2@example.test',now(),now()),
  ('11000000-0000-0000-0000-000000000003','authenticated','authenticated','verified@example.test',now(),now()),
  ('11000000-0000-0000-0000-000000000004','authenticated','authenticated','other-verified@example.test',now(),now());
update auth.users
set email_confirmed_at = now()
where id in (
  '11000000-0000-0000-0000-000000000003',
  '11000000-0000-0000-0000-000000000004'
);
insert into public.quiz_definitions (id,audience_key,version,active,questions,scoring_rules)
values ('21000000-0000-0000-0000-000000000001','rpc_audience',1,true,'[{"key":"q1"}]','{}');
insert into public.site_visitors (id,owner_user_id,landing_path)
values ('31000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000001','/');
insert into public.portfolio_sessions (id,visitor_id,owner_user_id,landing_path)
values ('41000000-0000-0000-0000-000000000001','31000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000001','/');
insert into public.quiz_sessions (id,visitor_id,owner_user_id,portfolio_session_id,question_set_id,audience_key,question_set_version)
values ('51000000-0000-0000-0000-000000000001','31000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000001','41000000-0000-0000-0000-000000000001','21000000-0000-0000-0000-000000000001','rpc_audience',1);

select throws_ok(
  $$insert into public.quiz_sessions (visitor_id,owner_user_id,portfolio_session_id,question_set_id,audience_key,question_set_version,status) values ('31000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000001','41000000-0000-0000-0000-000000000001','21000000-0000-0000-0000-000000000001','rpc_audience',1,'invalid')$$,
  '23514', null, 'invalid quiz status rejected'
);
select throws_ok(
  $$insert into public.projects (slug,title,summary,problem,solution,project_status) values ('bad-status','Bad','x','x','x','invalid')$$,
  '23514', null, 'invalid project status rejected'
);

insert into public.leads (id, first_name, email)
values ('60000000-0000-0000-0000-000000000001', 'Test', 'test@example.test');
select throws_ok(
  $$insert into public.bookings (lead_id,booking_provider,scheduled_start,scheduled_end,time_zone) values ('60000000-0000-0000-0000-000000000001','test',now(),now()-interval '1 hour','UTC')$$,
  '23514', null, 'invalid booking date order rejected'
);

insert into public.projects (slug,title,summary,problem,solution) values ('duplicate-slug','One','x','x','x');
select throws_ok(
  $$insert into public.projects (slug,title,summary,problem,solution) values ('duplicate-slug','Two','x','x','x')$$,
  '23505', null, 'duplicate project slug rejected'
);

insert into public.quiz_definitions (audience_key,version,questions,scoring_rules)
values ('duplicate-audience',1,'[{"key":"q1"}]','{}');
select throws_ok(
  $$insert into public.quiz_definitions (audience_key,version,questions,scoring_rules) values ('duplicate-audience',1,'[{"key":"q1"}]','{}')$$,
  '23505', null, 'duplicate quiz audience/version rejected'
);

select throws_ok($$select * from public.record_analytics_event('client_won')$$, '42501', null, 'unauthenticated analytics rejected');
select throws_ok($$select * from public.submit_lead(null,null,null,'Name',null,'person@example.test')$$, '42501', null, 'unauthenticated lead submission rejected');
select throws_ok($$select public.mark_expired_quiz_sessions(now())$$, '42501', null, 'cleanup defaults to deny');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11000000-0000-0000-0000-000000000001","role":"authenticated","is_anonymous":true}', true);
select lives_ok(
  $$select * from public.begin_qualified_quiz('31000000-0000-0000-0000-000000000001','41000000-0000-0000-0000-000000000001','51000000-0000-0000-0000-000000000001','rpc_audience','RPC','RPC Business','rpc@example.test',true,'proposal_followup_v1')$$,
  'owned quiz can create and link a consented lead'
);
select lives_ok(
  $$select * from public.begin_qualified_quiz('31000000-0000-0000-0000-000000000001','41000000-0000-0000-0000-000000000001','51000000-0000-0000-0000-000000000001','rpc_audience','RPC','RPC Business','rpc@example.test',true,'proposal_followup_v1')$$,
  'qualified quiz replay returns the canonical lead'
);

insert into public.portfolio_sessions (id,visitor_id,owner_user_id,landing_path)
values
  ('41000000-0000-0000-0000-000000000002','31000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000001','/'),
  ('41000000-0000-0000-0000-000000000003','31000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000001','/');
insert into public.quiz_sessions (id,visitor_id,owner_user_id,portfolio_session_id,question_set_id,audience_key,question_set_version)
values
  ('51000000-0000-0000-0000-000000000002','31000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000001','41000000-0000-0000-0000-000000000002','21000000-0000-0000-0000-000000000001','rpc_audience',1),
  ('51000000-0000-0000-0000-000000000003','31000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000001','41000000-0000-0000-0000-000000000003','21000000-0000-0000-0000-000000000001','rpc_audience',1);

select results_eq(
  $$select submission_status, lead_id is null, existing_business_name from public.begin_qualified_quiz_v2('31000000-0000-0000-0000-000000000001','41000000-0000-0000-0000-000000000002','51000000-0000-0000-0000-000000000002','rpc_audience','RPC','RPC Business','RPC@EXAMPLE.TEST',true,'proposal_followup_v1',null)$$,
  $$values ('business_scope_required'::text, true, 'RPC Business'::text)$$,
  'same-owner saved email requires an explicit business-scope decision'
);
select results_eq(
  $$select submission_status, lead_id = (select lead_id from public.quiz_sessions where id = '51000000-0000-0000-0000-000000000001') from public.begin_qualified_quiz_v2('31000000-0000-0000-0000-000000000001','41000000-0000-0000-0000-000000000002','51000000-0000-0000-0000-000000000002','rpc_audience','RPC','RPC Business','rpc@example.test',true,'proposal_followup_v1','same_business')$$,
  $$values ('accepted'::text, true)$$,
  'same-business retake links the existing stable lead'
);
select results_eq(
  $$select submission_status, lead_id is not null from public.begin_qualified_quiz_v2('31000000-0000-0000-0000-000000000001','41000000-0000-0000-0000-000000000003','51000000-0000-0000-0000-000000000003','rpc_audience','RPC','Another Business','rpc@example.test',true,'proposal_followup_v1','another_business')$$,
  $$values ('accepted'::text, true)$$,
  'another-business retake creates and links a separate lead'
);
select throws_ok(
  $$select * from public.persist_quiz_result('51000000-0000-0000-0000-000000000001',1,1,1,1,1,1,1,1,1,1,1,'ready','platform','systeme_io','platform_launch','website','{}','{}')$$,
  '42501', null, 'browser cannot persist protected result fields directly'
);
select throws_ok(
  $$select * from public.submit_lead('31000000-0000-0000-0000-000000000001','41000000-0000-0000-0000-000000000001','51000000-0000-0000-0000-000000000001','RPC',null,'rpc@example.test',null,null,null,'rpc_audience','quiz')$$,
  '42501', null, 'legacy lead submission is revoked from browser callers'
);
select set_config('request.jwt.claims', '{"sub":"11000000-0000-0000-0000-000000000002","role":"authenticated","is_anonymous":true}', true);
select throws_ok(
  $$select * from public.begin_qualified_quiz('31000000-0000-0000-0000-000000000001','41000000-0000-0000-0000-000000000001','51000000-0000-0000-0000-000000000001','rpc_audience','Other','Other Business','other@example.test',true,'proposal_followup_v1')$$,
  '42501', null, 'RPC rejects another owner identifiers'
);

reset role;
insert into public.site_visitors (id,owner_user_id,landing_path)
values
  ('31000000-0000-0000-0000-000000000003','11000000-0000-0000-0000-000000000003','/'),
  ('31000000-0000-0000-0000-000000000004','11000000-0000-0000-0000-000000000004','/');
insert into public.portfolio_sessions (id,visitor_id,owner_user_id,landing_path)
values
  ('41000000-0000-0000-0000-000000000004','31000000-0000-0000-0000-000000000003','11000000-0000-0000-0000-000000000003','/'),
  ('41000000-0000-0000-0000-000000000005','31000000-0000-0000-0000-000000000003','11000000-0000-0000-0000-000000000003','/'),
  ('41000000-0000-0000-0000-000000000006','31000000-0000-0000-0000-000000000003','11000000-0000-0000-0000-000000000003','/'),
  ('41000000-0000-0000-0000-000000000007','31000000-0000-0000-0000-000000000004','11000000-0000-0000-0000-000000000004','/');
insert into public.quiz_sessions (id,visitor_id,owner_user_id,portfolio_session_id,question_set_id,audience_key,question_set_version)
values
  ('51000000-0000-0000-0000-000000000004','31000000-0000-0000-0000-000000000003','11000000-0000-0000-0000-000000000003','41000000-0000-0000-0000-000000000004','21000000-0000-0000-0000-000000000001','rpc_audience',1),
  ('51000000-0000-0000-0000-000000000005','31000000-0000-0000-0000-000000000003','11000000-0000-0000-0000-000000000003','41000000-0000-0000-0000-000000000005','21000000-0000-0000-0000-000000000001','rpc_audience',1),
  ('51000000-0000-0000-0000-000000000006','31000000-0000-0000-0000-000000000003','11000000-0000-0000-0000-000000000003','41000000-0000-0000-0000-000000000006','21000000-0000-0000-0000-000000000001','rpc_audience',1),
  ('51000000-0000-0000-0000-000000000007','31000000-0000-0000-0000-000000000004','11000000-0000-0000-0000-000000000004','41000000-0000-0000-0000-000000000007','21000000-0000-0000-0000-000000000001','rpc_audience',1);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11000000-0000-0000-0000-000000000003","role":"authenticated","is_anonymous":true}', true);
select throws_ok(
  $$select * from public.begin_verified_qualified_quiz('31000000-0000-0000-0000-000000000003','41000000-0000-0000-0000-000000000004','51000000-0000-0000-0000-000000000004','rpc_audience','Elysha','Corpuz','Elysha Works',true,'proposal_followup_v1',null)$$,
  '42501', null, 'anonymous authenticated user cannot create a verified lead'
);

select set_config('request.jwt.claims', '{"sub":"11000000-0000-0000-0000-000000000003","role":"authenticated","is_anonymous":false}', true);
select results_eq(
  $$select submission_status, lead_id is not null from public.begin_verified_qualified_quiz('31000000-0000-0000-0000-000000000003','41000000-0000-0000-0000-000000000004','51000000-0000-0000-0000-000000000004','rpc_audience','Elysha','Corpuz','Elysha Works',true,'proposal_followup_v1',null)$$,
  $$values ('accepted'::text, true)$$,
  'verified owner creates a qualified lead'
);
select results_eq(
  $$select email, auth_user_id, email_verified_at is not null, last_name from public.leads where source_quiz_session_id = '51000000-0000-0000-0000-000000000004'$$,
  $$values ('verified@example.test'::text, '11000000-0000-0000-0000-000000000003'::uuid, true, 'Corpuz'::text)$$,
  'verified lead identity is derived from Auth'
);
select results_eq(
  $$select submission_status, lead_id is null, existing_business_name from public.begin_verified_qualified_quiz('31000000-0000-0000-0000-000000000003','41000000-0000-0000-0000-000000000005','51000000-0000-0000-0000-000000000005','rpc_audience','Elysha','Corpuz','Elysha Works',true,'proposal_followup_v1',null)$$,
  $$values ('business_scope_required'::text, true, 'Elysha Works'::text)$$,
  'repeat verified identity requires a business-scope decision'
);
select results_eq(
  $$select submission_status, lead_id = (select lead_id from public.quiz_sessions where id = '51000000-0000-0000-0000-000000000004') from public.begin_verified_qualified_quiz('31000000-0000-0000-0000-000000000003','41000000-0000-0000-0000-000000000005','51000000-0000-0000-0000-000000000005','rpc_audience','Elysha','Corpuz','Elysha Works',true,'proposal_followup_v1','same_business')$$,
  $$values ('accepted'::text, true)$$,
  'same-business replay reuses the verified stable lead'
);
select results_eq(
  $$select submission_status, lead_id is not null from public.begin_verified_qualified_quiz('31000000-0000-0000-0000-000000000003','41000000-0000-0000-0000-000000000006','51000000-0000-0000-0000-000000000006','rpc_audience','Elysha','Corpuz','Second Business',true,'proposal_followup_v1','another_business')$$,
  $$values ('accepted'::text, true)$$,
  'another-business choice creates a separate verified lead'
);
select set_config('request.jwt.claims', '{"sub":"11000000-0000-0000-0000-000000000004","role":"authenticated","is_anonymous":false}', true);
select throws_ok(
  $$select * from public.begin_verified_qualified_quiz('31000000-0000-0000-0000-000000000003','41000000-0000-0000-0000-000000000006','51000000-0000-0000-0000-000000000006','rpc_audience','Other','Person','Other Business',true,'proposal_followup_v1',null)$$,
  '42501', null, 'verified RPC rejects another owner identifiers'
);

reset role;
select * from finish();
rollback;
