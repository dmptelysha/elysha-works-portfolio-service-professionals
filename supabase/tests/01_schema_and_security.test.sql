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
select has_table('private', 'email_otp_challenges');

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
select has_column('public', 'quiz_sessions', 'selected_tier_key');
select has_column('public', 'quiz_sessions', 'selected_platform');
select has_column('public', 'quiz_sessions', 'selected_offer_key');
select has_column('public', 'quiz_sessions', 'selected_roadmap_snapshot');
select has_column('public', 'quiz_sessions', 'proposal_reference');
select has_column('public', 'quiz_sessions', 'proposal_access_key_hash');
select has_column('public', 'quiz_sessions', 'proposal_status');
select has_column('public', 'quiz_sessions', 'proposal_issued_at');
select has_column('public', 'quiz_sessions', 'proposal_expires_at');
select has_column('public', 'quiz_sessions', 'proposal_last_viewed_at');
select has_column('public', 'quiz_sessions', 'proposal_failed_attempts');
select has_column('public', 'quiz_sessions', 'proposal_locked_until');
select has_column('public', 'leads', 'source_portfolio_session_id');
select has_column('public', 'leads', 'source_quiz_session_id');
select has_column('public', 'leads', 'proposal_delivery_status');
select has_column('public', 'leads', 'proposal_email_consent_at');
select has_column('public', 'leads', 'proposal_email_consent_version');
select has_column('public', 'leads', 'proposal_sent_at');
select has_column('public', 'leads', 'proposal_follow_up_count');
select has_column('public', 'leads', 'next_proposal_follow_up_at');
select has_column('public', 'leads', 'proposal_follow_up_claim_id');
select has_column('public', 'leads', 'proposal_follow_up_claimed_at');
select has_column('public', 'leads', 'proposal_follow_up_stopped_at');
select has_column('public', 'leads', 'cold_at');
select has_column('public', 'leads', 'auth_user_id');
select has_column('public', 'leads', 'email_verified_at');

select has_function('public', 'is_portfolio_admin');
select has_function('public', 'submit_lead');
select has_function('public', 'submit_booking');
select has_function('public', 'record_analytics_event');
select has_function('public', 'link_quiz_session_to_lead');
select has_function('public', 'persist_quiz_result');
select has_function('public', 'mark_expired_quiz_sessions');
select has_function('public', 'begin_qualified_quiz');
select has_function('public', 'finalize_quiz_proposal');
select has_function('public', 'mark_proposal_delivered');
select has_function('public', 'verify_proposal_access_state');
select has_function('public', 'claim_due_proposal_work');
select has_function('public', 'acknowledge_proposal_work');
select has_function('public', 'stop_proposal_followups');
select has_function('public', 'record_trusted_proposal_event');
select has_function('public', 'begin_verified_qualified_quiz');
select has_function('public', 'record_email_otp_challenge');
select has_function('public', 'get_email_otp_challenge_context');
select has_function('public', 'mark_email_otp_delivery');
select has_function('public', 'verify_email_otp_digest');
select has_function('public', 'begin_custom_verified_qualified_quiz');
select has_function('private', 'constant_time_equal_32');
select has_function('private', 'cleanup_email_otp_challenges');

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
select ok((select relrowsecurity from pg_class where oid = 'private.email_otp_challenges'::regclass), 'private OTP challenges RLS enabled');
select is(
  (select count(*)::integer from pg_policies where schemaname = 'private' and tablename = 'email_otp_challenges'),
  0,
  'private OTP table exposes no browser policy'
);

select has_index('public', 'quiz_sessions', 'quiz_sessions_status_resume_expires_at_idx');
select has_index('public', 'leads', 'leads_crm_stage_status_idx');
select has_index('public', 'bookings', 'bookings_scheduled_start_status_idx');
select has_index('public', 'analytics_events', 'analytics_events_name_occurred_at_idx');
select has_index('public', 'projects', 'projects_published_display_order_idx');
select has_index('public', 'quiz_definitions', 'quiz_definitions_audience_active_version_idx');
select has_index('public', 'quiz_sessions', 'quiz_sessions_proposal_reference_uidx');
select has_index('public', 'quiz_sessions', 'quiz_sessions_active_proposal_expiry_idx');
select has_index('public', 'leads', 'leads_due_proposal_follow_up_idx');
select has_index('public', 'leads', 'leads_auth_user_updated_idx');
select has_index('private', 'email_otp_challenges', 'email_otp_one_active_owner_purpose_idx');
select has_index('private', 'email_otp_challenges', 'email_otp_owner_purpose_created_idx');
select has_index('private', 'email_otp_challenges', 'email_otp_email_digest_created_idx');
select has_index('private', 'email_otp_challenges', 'email_otp_ip_digest_created_idx');
select has_index('private', 'email_otp_challenges', 'email_otp_terminal_cleanup_idx');

select * from finish();
rollback;
