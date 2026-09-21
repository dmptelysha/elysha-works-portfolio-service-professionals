begin;
select no_plan();

select has_table('public', 'site_visitors');
select has_table('public', 'portfolio_sessions');
select has_table('public', 'quiz_sessions');
select has_table('public', 'leads');
select has_table('public', 'bookings');
select has_table('public', 'analytics_events');
select has_table('public', 'projects');
select has_table('public', 'package_catalog');
select has_table('public', 'addon_catalog');
select has_table('public', 'quiz_definitions');
select has_table('public', 'site_content');

select has_pk('public', 'site_visitors');
select has_pk('public', 'portfolio_sessions');
select has_pk('public', 'quiz_sessions');
select has_pk('public', 'leads');
select has_pk('public', 'bookings');
select has_pk('public', 'analytics_events');
select has_pk('public', 'projects');
select has_pk('public', 'package_catalog');
select has_pk('public', 'addon_catalog');
select has_pk('public', 'quiz_definitions');
select has_pk('public', 'site_content');

select has_column('public', 'site_visitors', 'owner_user_id');
select has_column('public', 'portfolio_sessions', 'owner_user_id');
select has_column('public', 'quiz_sessions', 'owner_user_id');
select has_column('public', 'quiz_sessions', 'result_snapshot');
select has_column('public', 'leads', 'source_portfolio_session_id');
select has_column('public', 'leads', 'source_quiz_session_id');

select has_function('public', 'is_portfolio_admin');
select has_function('public', 'submit_lead');
select has_function('public', 'submit_booking');
select has_function('public', 'record_analytics_event');
select has_function('public', 'link_quiz_session_to_lead');
select has_function('public', 'persist_quiz_result');
select has_function('public', 'mark_expired_quiz_sessions');

select ok((select relrowsecurity from pg_class where oid = 'public.site_visitors'::regclass), 'site_visitors RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.portfolio_sessions'::regclass), 'portfolio_sessions RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.quiz_sessions'::regclass), 'quiz_sessions RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.leads'::regclass), 'leads RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.bookings'::regclass), 'bookings RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.analytics_events'::regclass), 'analytics_events RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.projects'::regclass), 'projects RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.package_catalog'::regclass), 'package_catalog RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.addon_catalog'::regclass), 'addon_catalog RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.quiz_definitions'::regclass), 'quiz_definitions RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.site_content'::regclass), 'site_content RLS enabled');

select has_index('public', 'quiz_sessions', 'quiz_sessions_status_resume_expires_at_idx');
select has_index('public', 'leads', 'leads_crm_stage_status_idx');
select has_index('public', 'bookings', 'bookings_scheduled_start_status_idx');
select has_index('public', 'analytics_events', 'analytics_events_name_occurred_at_idx');
select has_index('public', 'projects', 'projects_published_display_order_idx');
select has_index('public', 'quiz_definitions', 'quiz_definitions_audience_active_version_idx');

select * from finish();
rollback;
