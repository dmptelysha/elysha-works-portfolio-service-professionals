begin;
select no_plan();

insert into auth.users (id, aud, role, email, created_at, updated_at)
values
  ('10000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'owner1@example.test', now(), now()),
  ('10000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'owner2@example.test', now(), now()),
  ('10000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'owner3@example.test', now(), now());

insert into public.quiz_definitions (id, audience_key, version, active, questions, scoring_rules)
values ('20000000-0000-0000-0000-000000000001', 'service_business', 1, true, '[{"key":"q1"}]', '{}');

insert into public.site_visitors (id, owner_user_id, landing_path)
values ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '/fixture');
insert into public.portfolio_sessions (id, visitor_id, owner_user_id, landing_path)
values ('40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '/fixture');
insert into public.quiz_sessions (id, visitor_id, owner_user_id, portfolio_session_id, question_set_id, audience_key, question_set_version)
values ('50000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'service_business', 1);

insert into public.projects (slug,title,summary,problem,solution,published) values
  ('published-project','Published','summary','problem','solution',true),
  ('draft-project','Draft','summary','problem','solution',false);
insert into public.package_catalog (offer_key,name,build_route,supported_platforms,base_price_usd,level,active,description)
values ('inactive_test','Inactive','platform',array['systeme_io'],1,99,false,'test');
insert into public.addon_catalog (addon_key,name,description,starting_price_usd,pricing_unit,active)
values ('inactive_test','Inactive','test',1,'test',false);
insert into public.quiz_definitions (audience_key,version,active,questions,scoring_rules)
values ('service_business',2,false,'[{"key":"q1"}]','{}');
insert into public.site_content (document_key,content,published) values
  ('published_test','{"title":"Published"}',true),
  ('draft_test','{"title":"Draft"}',false);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000003","role":"authenticated","is_anonymous":true}', true);
select lives_ok($$insert into public.site_visitors (owner_user_id, landing_path) values ('10000000-0000-0000-0000-000000000003', '/browser')$$, 'owner can insert visitor with database-generated id');

select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated","is_anonymous":true}', true);

select is((select count(*)::integer from public.site_visitors), 1, 'owner reads own visitor');
select is((select count(*)::integer from public.portfolio_sessions), 1, 'owner reads own session');
select is((select count(*)::integer from public.quiz_sessions), 1, 'owner reads own quiz');
select is((select count(*)::integer from public.projects), 1, 'published project visible and draft hidden');
select ok(not exists(select 1 from public.package_catalog where offer_key='inactive_test'), 'inactive package hidden');
select ok(not exists(select 1 from public.addon_catalog where addon_key='inactive_test'), 'inactive add-on hidden');
select is((select count(*)::integer from public.quiz_definitions where audience_key='service_business'), 1, 'inactive quiz definition hidden');
select is((select count(*)::integer from public.site_content), 1, 'published content visible and draft hidden');

select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000002","role":"authenticated","is_anonymous":true}', true);
select is((select count(*)::integer from public.site_visitors), 0, 'other owner cannot read visitor');
select is((select count(*)::integer from public.portfolio_sessions), 0, 'other owner cannot read session');
select is((select count(*)::integer from public.quiz_sessions), 0, 'other owner cannot read quiz');
select throws_ok(
  $$insert into public.portfolio_sessions (visitor_id, owner_user_id, landing_path) values ('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002','/')$$,
  '42501', null, 'cannot attach another owner visitor'
);

select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated","is_anonymous":true}', true);
select lives_ok($$update public.quiz_sessions set answers='{"q1":"answer"}' where id='50000000-0000-0000-0000-000000000001'$$, 'owner updates allowed progress');
select throws_ok(
  $$select proposal_access_key_hash from public.quiz_sessions where id='50000000-0000-0000-0000-000000000001'$$,
  '42501', null, 'owner cannot read the proposal access-key hash'
);
select throws_ok(
  $$update public.quiz_sessions set selected_tier_key='basic', selected_platform='systeme_io', selected_offer_key='platform_launch' where id='50000000-0000-0000-0000-000000000001'$$,
  '42501', null, 'owner cannot directly write protected proposal selection fields'
);
select throws_ok(
  $$insert into public.quiz_sessions (visitor_id,owner_user_id,portfolio_session_id,question_set_id,audience_key,question_set_version) values ('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','wrong_audience',1)$$,
  '42501', null, 'quiz definition audience must match the new quiz'
);
select throws_ok($$update public.quiz_sessions set owner_user_id='10000000-0000-0000-0000-000000000002' where id='50000000-0000-0000-0000-000000000001'$$, '42501', null, 'owner cannot change ownership');
select throws_ok($$delete from public.quiz_sessions where id='50000000-0000-0000-0000-000000000001'$$, '42501', null, 'owner cannot delete quiz');

select is((select count(*)::integer from public.leads), 0, 'leads cannot be enumerated');
select is((select count(*)::integer from public.bookings), 0, 'bookings cannot be enumerated');
select is((select count(*)::integer from public.analytics_events), 0, 'events cannot be enumerated');

reset role;
select * from finish();
rollback;
