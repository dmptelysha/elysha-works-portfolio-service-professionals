begin;
select no_plan();

insert into auth.users (id, aud, role, email, created_at, updated_at)
values
  ('11000000-0000-0000-0000-000000000001','authenticated','authenticated','rpc1@example.test',now(),now()),
  ('11000000-0000-0000-0000-000000000002','authenticated','authenticated','rpc2@example.test',now(),now());
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
  $$select * from public.submit_lead('31000000-0000-0000-0000-000000000001','41000000-0000-0000-0000-000000000001','51000000-0000-0000-0000-000000000001','RPC',null,'rpc@example.test',null,null,null,'rpc_audience','quiz')$$,
  'owned quiz can create and link a lead'
);
select lives_ok(
  $$select * from public.submit_lead('31000000-0000-0000-0000-000000000001',null,'51000000-0000-0000-0000-000000000001','RPC',null,'rpc@example.test',null,null,null,'rpc_audience','quiz')$$,
  'lead submission replay returns canonical lead and derives portfolio attribution'
);
select lives_ok(
  $$select * from public.persist_quiz_result('51000000-0000-0000-0000-000000000001',1,1,1,1,1,1,1,1,1,1,1,'ready','platform','systeme_io','platform_launch','website','{}','{}')$$,
  'owned quiz result persists with compatible package and platform'
);
select set_config('request.jwt.claims', '{"sub":"11000000-0000-0000-0000-000000000002","role":"authenticated","is_anonymous":true}', true);
select throws_ok(
  $$select * from public.submit_lead('31000000-0000-0000-0000-000000000001',null,'51000000-0000-0000-0000-000000000001','Other',null,'other@example.test',null,null,null,null,null)$$,
  '42501', null, 'RPC rejects another owner identifiers'
);

reset role;
select * from finish();
rollback;
