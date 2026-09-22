begin;
select no_plan();

select is(
  (select count(*)::integer from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and c.relname in (
    'site_visitors','portfolio_sessions','quiz_sessions','leads','bookings','analytics_events',
    'projects','package_catalog','addon_catalog','quiz_definitions','site_content'
  )),
  11,
  'proposal flow retains exactly the eleven Phase 1 tables'
);

select ok(not has_function_privilege('authenticated', 'public.finalize_quiz_proposal(uuid,text,text,text,jsonb,jsonb,uuid,text)', 'EXECUTE'), 'authenticated cannot finalize trusted proposal state');
select ok(not has_function_privilege('authenticated', 'public.verify_proposal_access_state(uuid)', 'EXECUTE'), 'authenticated cannot access proposal verification state directly');
select ok(has_function_privilege('authenticated', 'public.begin_qualified_quiz(uuid,uuid,uuid,text,text,text,text,boolean,text)', 'EXECUTE'), 'authenticated can call the restricted contact RPC');
select ok(has_function_privilege('service_role', 'public.finalize_quiz_proposal(uuid,text,text,text,jsonb,jsonb,uuid,text)', 'EXECUTE'), 'service role can finalize proposal state');
select ok(not has_function_privilege('authenticated', 'public.record_trusted_proposal_event(text,uuid,uuid,jsonb)', 'EXECUTE'), 'browser cannot create trusted proposal events');

insert into auth.users (id, aud, role, email, created_at, updated_at)
values ('12000000-0000-0000-0000-000000000001','authenticated','authenticated','proposal@example.test',now(),now());
insert into public.site_visitors (id,owner_user_id,landing_path)
values ('32000000-0000-0000-0000-000000000001','12000000-0000-0000-0000-000000000001','/');
insert into public.portfolio_sessions (id,visitor_id,owner_user_id,landing_path)
values ('42000000-0000-0000-0000-000000000001','32000000-0000-0000-0000-000000000001','12000000-0000-0000-0000-000000000001','/');
insert into public.quiz_sessions (
  id,visitor_id,owner_user_id,portfolio_session_id,question_set_id,audience_key,question_set_version
) select
  '52000000-0000-0000-0000-000000000001','32000000-0000-0000-0000-000000000001',
  '12000000-0000-0000-0000-000000000001','42000000-0000-0000-0000-000000000001',
  id,audience_key,version
from public.quiz_definitions where audience_key = 'service_businesses' and version = 1;

select throws_ok(
  $$update public.quiz_sessions set selected_tier_key='basic' where id='52000000-0000-0000-0000-000000000001'$$,
  '23514', null, 'selection fields must be all null or all present'
);
select throws_ok(
  $$update public.quiz_sessions set proposal_status='active' where id='52000000-0000-0000-0000-000000000001'$$,
  '23514', null, 'active proposal requires all protected completion fields'
);
select throws_ok(
  $$insert into public.leads (first_name,email,proposal_follow_up_count) values ('Test','proposal-count@example.test',4)$$,
  '23514', null, 'proposal follow-up count cannot exceed three'
);
select throws_ok(
  $$insert into public.leads (first_name,email,proposal_email_consent_at) values ('Test','proposal-consent@example.test',now())$$,
  '23514', null, 'proposal consent timestamp requires the approved consent version'
);

select is(
  (select count(*)::integer from public.quiz_definitions where active and audience_key in ('coaches_educators','service_businesses','custom_order_businesses') and version = 1),
  3,
  'three approved active version-one quiz definitions are seeded'
);

select * from finish();
rollback;
