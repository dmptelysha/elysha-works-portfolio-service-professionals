import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();
const supabase = join(root, 'supabase');
const migrationsDir = join(supabase, 'migrations');

const expectedMigrations = [
  '202609210001_create_core_tables.sql',
  '202609210002_create_catalog_content_tables.sql',
  '202609210003_add_constraints_indexes_triggers.sql',
  '202609210004_add_rls_grants_policies.sql',
  '202609210005_create_portfolio_rpc_functions.sql',
  '202609210006_add_retention_helpers.sql',
  '202609220001_add_expiring_proposal_flow.sql',
  '202609220002_qualify_proposal_reference_update.sql',
  '202609220003_grant_edge_function_table_access.sql',
  '202609220004_add_repeat_assessment_business_scope.sql',
  '202609230001_add_verified_lead_identity.sql',
  '202609230002_add_custom_email_otp.sql',
  '202609230003_add_assessment_location_and_roadmap_metadata.sql',
  '202609240001_grant_quiz_location_read.sql',
];

const phaseOneTables = [
  'site_visitors', 'portfolio_sessions', 'quiz_sessions', 'leads', 'bookings',
  'analytics_events', 'projects', 'package_catalog', 'addon_catalog',
  'quiz_definitions', 'site_content',
];

const reservedTables = [
  'profiles', 'clients', 'client_members', 'pipeline_stages', 'lead_stage_history',
  'tasks', 'follow_ups', 'projects_workspace', 'project_members', 'deliverables',
  'annotations', 'annotation_threads', 'revision_rounds', 'crm_activities',
  'proposals', 'contracts', 'payments', 'notifications', 'audit_logs',
];

const requiredFunctions = [
  'is_portfolio_admin', 'submit_lead', 'submit_booking', 'record_analytics_event',
  'link_quiz_session_to_lead', 'persist_quiz_result', 'mark_expired_quiz_sessions',
  'begin_qualified_quiz', 'finalize_quiz_proposal', 'mark_proposal_delivered',
  'verify_proposal_access_state', 'claim_due_proposal_work',
  'acknowledge_proposal_work', 'stop_proposal_followups',
  'record_trusted_proposal_event',
];

function read(path) {
  return readFileSync(join(root, path), 'utf8');
}

function allMigrations() {
  return expectedMigrations.map((name) => read(`supabase/migrations/${name}`)).join('\n');
}

test('Supabase scaffold has the ordered reproducible assets', () => {
  assert.deepEqual(readdirSync(migrationsDir).sort(), expectedMigrations);
  assert.match(read('supabase/config.toml'), /\[auth\]/);
  assert.match(read('supabase/config.toml'), /enable_anonymous_sign_ins\s*=\s*true/);
  assert.ok(read('supabase/seed.sql').length > 0);
  assert.ok(read('supabase/tests/01_schema_and_security.test.sql').length > 0);
  assert.ok(read('supabase/tests/02_rls_ownership.test.sql').length > 0);
  assert.ok(read('supabase/tests/03_rpc_and_integrity.test.sql').length > 0);
  assert.ok(read('supabase/tests/04_proposal_flow.test.sql').length > 0);
  assert.ok(read('supabase/tests/05_custom_email_otp.test.sql').length > 0);
  const config = read('supabase/config.toml');
  assert.match(config, /\[auth\.email\]/);
  assert.match(config, /otp_expiry\s*=\s*600/);
  assert.match(config, /\[auth\.email\.template\.confirmation\]/);
  assert.match(config, /\[auth\.email\.template\.magic_link\]/);
  for (const template of ['confirmation.html', 'magic-link.html']) {
    const html = read(`supabase/templates/${template}`);
    assert.match(html, /\{\{\s*\.Token\s*\}\}/, `${template} renders the six-digit OTP`);
    assert.doesNotMatch(html, /\.ConfirmationURL/, `${template} must not render a sign-in link`);
    assert.doesNotMatch(html, /supabase/i, `${template} must remain Elysha Works branded`);
  }
});

test('proposal migration is additive, keeps eleven tables, and locks trusted functions down', () => {
  const sql = read('supabase/migrations/202609220001_add_expiring_proposal_flow.sql');
  assert.doesNotMatch(sql, /drop\s+(?:table|schema)\b|truncate\b/i);
  assert.doesNotMatch(sql, /create\s+table\s+public\./i);
  for (const fn of [
    'begin_qualified_quiz', 'finalize_quiz_proposal', 'mark_proposal_delivered',
    'verify_proposal_access_state', 'claim_due_proposal_work',
    'acknowledge_proposal_work', 'stop_proposal_followups',
  ]) assert.match(sql, new RegExp(`function\\s+public\\.${fn}\\s*\\(`, 'i'), fn);
  assert.match(sql, /revoke\s+execute\s+on\s+function\s+public\.persist_quiz_result\s*\([^;]+from\s+authenticated/is);
  assert.match(sql, /revoke\s+execute\s+on\s+function\s+public\.submit_lead\s*\([^;]+from\s+authenticated/is);
  assert.match(sql, /resume_expires_at\s*=\s*now\(\)\s*\+\s*interval\s*'72 hours'/i);
});

test('proposal finalization qualifies the existing proposal reference column', () => {
  const sql = read('supabase/migrations/202609220002_qualify_proposal_reference_update.sql');
  assert.match(
    sql,
    /proposal_reference\s*=\s*coalesce\(qs\.proposal_reference,\s*p_proposal_reference\)/i,
  );
  assert.doesNotMatch(
    sql,
    /proposal_reference\s*=\s*coalesce\(proposal_reference,\s*p_proposal_reference\)/i,
  );
});

test('trusted Edge Functions can read only the Phase 1 records required to build proposals', () => {
  const sql = read('supabase/migrations/202609220003_grant_edge_function_table_access.sql');
  assert.doesNotMatch(sql, /drop\s+(?:table|schema)\b|truncate\b|delete\s+from\b/i);
  for (const table of ['leads', 'quiz_sessions', 'quiz_definitions', 'package_catalog', 'addon_catalog']) {
    assert.match(sql, new RegExp(`grant\\s+select\\s*\\([^;]+\\)\\s+on\\s+public\\.${table}\\s+to\\s+service_role`, 'is'), table);
  }
  assert.doesNotMatch(sql, /grant\s+(?:all|insert|update|delete)[^;]*to\s+service_role/i);
  assert.doesNotMatch(sql, /\b(?:anon|authenticated)\b/i);
});

test('repeat-assessment migration is additive and privacy-scopes email recognition', () => {
  const sql = read('supabase/migrations/202609220004_add_repeat_assessment_business_scope.sql');
  assert.doesNotMatch(sql, /drop\s+(?:table|schema|function)\b|truncate\b|delete\s+from\b/i);
  assert.match(sql, /function\s+public\.begin_qualified_quiz_v2\s*\(/i);
  assert.match(sql, /l\.visitor_id\s*=\s*p_visitor_id/i);
  assert.match(sql, /submission_status/i);
  assert.match(sql, /business_scope_required/i);
  assert.match(sql, /same_business/i);
  assert.match(sql, /another_business/i);
  assert.match(sql, /leads_visitor_email_updated_idx/i);
  assert.match(sql, /revoke\s+execute\s+on\s+function\s+public\.begin_qualified_quiz\s*\([^;]+from[^;]*authenticated/is);
  assert.match(sql, /grant\s+execute\s+on\s+function\s+public\.begin_qualified_quiz_v2\s*\([^;]+to\s+authenticated/is);
});

test('verified lead migration derives identity from Auth and remains additive', () => {
  const sql = read('supabase/migrations/202609230001_add_verified_lead_identity.sql');
  assert.doesNotMatch(sql, /drop\s+(?:table|schema|function)\b|truncate\b|delete\s+from\b/i);
  assert.match(sql, /add\s+column\s+auth_user_id\s+uuid/i);
  assert.match(sql, /add\s+column\s+email_verified_at\s+timestamptz/i);
  assert.match(sql, /leads_auth_user_id_fkey/i);
  assert.match(sql, /leads_auth_user_updated_idx/i);
  assert.match(sql, /function\s+public\.begin_verified_qualified_quiz\s*\(/i);
  assert.match(sql, /from\s+auth\.users/i);
  assert.match(sql, /email_confirmed_at/i);
  assert.match(sql, /auth\.jwt\(\)\s*->>\s*'is_anonymous'/i);
  assert.match(sql, /set\s+search_path\s*=\s*''/i);
  assert.match(sql, /revoke\s+execute\s+on\s+function\s+public\.begin_verified_qualified_quiz\s*\([^;]+from\s+public,\s*anon,\s*authenticated/is);
  assert.match(sql, /grant\s+execute\s+on\s+function\s+public\.begin_verified_qualified_quiz\s*\([^;]+to\s+authenticated/is);
  assert.doesNotMatch(sql, /revoke\s+execute\s+on\s+function\s+public\.begin_qualified_quiz_v2/i);
});

test('custom OTP migration keeps challenge state private and atomic', () => {
  const sql = read('supabase/migrations/202609230002_add_custom_email_otp.sql');
  assert.match(sql, /create\s+schema\s+if\s+not\s+exists\s+private/i);
  assert.match(sql, /create\s+table\s+private\.email_otp_challenges/i);
  assert.match(sql, /alter\s+table\s+private\.email_otp_challenges\s+enable\s+row\s+level\s+security/i);
  assert.match(sql, /revoke\s+all\s+on\s+private\.email_otp_challenges\s+from\s+public,\s*anon,\s*authenticated/i);
  assert.match(sql, /octet_length\(email_digest\)\s*=\s*32/i);
  assert.match(sql, /octet_length\(otp_digest\)\s*=\s*32/i);
  assert.match(sql, /octet_length\(request_ip_digest\)\s*=\s*32/i);
  assert.match(sql, /function\s+private\.constant_time_equal_32\s*\(/i);
  assert.match(sql, /for\s+v_index\s+in\s+0\.\.31/i);
  assert.match(sql, /function\s+public\.record_email_otp_challenge\s*\(/i);
  assert.match(sql, /function\s+public\.get_email_otp_challenge_context\s*\(/i);
  assert.match(sql, /function\s+public\.mark_email_otp_delivery\s*\(/i);
  assert.match(sql, /function\s+public\.verify_email_otp_digest\s*\(/i);
  assert.match(sql, /function\s+public\.begin_custom_verified_qualified_quiz\s*\(/i);
  assert.match(sql, /function\s+private\.cleanup_email_otp_challenges\s*\(/i);
  assert.match(sql, /pg_advisory_xact_lock/gi);
  assert.match(sql, /email-otp-email.*email-otp-ip.*email-otp-owner/is);
  assert.match(sql, /elysha-email-otp-cleanup-hourly/i);
  assert.match(sql, /cron\.schedule/i);
  assert.match(sql, /cron\.unschedule/i);
  assert.match(sql, /set\s+search_path\s*=\s*''/i);
  assert.match(sql, /grant\s+execute\s+on\s+function\s+public\.begin_custom_verified_qualified_quiz\s*\([^;]+to\s+authenticated/is);
  assert.doesNotMatch(sql, /drop\s+(?:table|schema)\b|truncate\s+(?!table\s+private\.email_otp_challenges)/i);
  assert.doesNotMatch(sql, /delete\s+from\s+public\./i);
});

test('assessment owners can read the location metadata required by proposal preview', () => {
  const sql = allMigrations();
  assert.match(
    sql,
    /grant\s+select\s*\([^;]*business_country[^;]*country_code[^;]*display_currency[^;]*currency_symbol[^;]*fx_rate[^;]*fx_rate_timestamp[^;]*\)\s+on\s+public\.quiz_sessions\s+to\s+authenticated/is,
  );
});

test('migrations create exactly the Phase 1 public tables', () => {
  const sql = allMigrations();
  for (const table of phaseOneTables) {
    assert.match(sql, new RegExp(`create\\s+table\\s+public\\.${table}\\b`, 'i'), table);
    assert.match(sql, new RegExp(`alter\\s+table\\s+public\\.${table}\\s+enable\\s+row\\s+level\\s+security`, 'i'), `${table} RLS`);
  }
  for (const table of reservedTables) {
    assert.doesNotMatch(sql, new RegExp(`create\\s+table\\s+public\\.${table}\\b`, 'i'), table);
  }
  assert.equal(
    (sql.match(/create\s+table\s+(?:public|private)\.[a-z_]+/gi) ?? []).length,
    12,
    'the custom OTP challenge is the only twelfth runtime table',
  );
});

test('migrations define required relationships, status constraints, indexes, and RPCs', () => {
  const sql = allMigrations();
  for (const relation of [
    'portfolio_sessions_visitor_id_fkey', 'quiz_sessions_visitor_id_fkey',
    'quiz_sessions_portfolio_session_id_fkey', 'quiz_sessions_question_set_id_fkey',
    'quiz_sessions_lead_id_fkey', 'leads_visitor_id_fkey',
    'leads_source_portfolio_session_id_fkey', 'leads_source_quiz_session_id_fkey',
    'bookings_lead_id_fkey', 'bookings_visitor_id_fkey',
    'bookings_portfolio_session_id_fkey', 'bookings_quiz_session_id_fkey',
    'analytics_events_visitor_id_fkey', 'analytics_events_portfolio_session_id_fkey',
    'analytics_events_quiz_session_id_fkey', 'analytics_events_lead_id_fkey',
  ]) assert.match(sql, new RegExp(relation, 'i'), relation);

  assert.match(sql, /in_progress.*completed.*restarted.*expired.*abandoned/is);
  assert.match(sql, /scheduled.*completed.*cancelled.*no_show/is);
  assert.match(sql, /concept.*beta.*live/is);
  for (const fn of requiredFunctions) {
    assert.match(sql, new RegExp(`function\\s+public\\.${fn}\\s*\\(`, 'i'), fn);
  }
  assert.match(sql, /revoke\s+execute\s+on\s+function/is);
  assert.match(sql, /set\s+search_path\s*=\s*''/i);
});

test('seed is configuration-only, idempotent, and has the seven approved packages', () => {
  const seed = read('supabase/seed.sql');
  for (const key of [
    'platform_launch', 'platform_growth', 'platform_scale', 'custom_starter',
    'custom_foundation', 'custom_growth', 'custom_complete',
  ]) assert.match(seed, new RegExp(`'${key}'`), key);
  assert.match(seed, /on\s+conflict/is);
  for (const audience of ['coaches_educators', 'service_businesses', 'custom_order_businesses']) {
    assert.match(seed, new RegExp(`'${audience}'`), audience);
  }
  for (const metadata of ['cortex-local-v0.1', 'portfolio-catalog-v0.1', 'server_verified']) {
    assert.match(seed, new RegExp(metadata), metadata);
  }
  for (const transactional of ['site_visitors', 'portfolio_sessions', 'quiz_sessions', 'leads', 'bookings', 'analytics_events']) {
    assert.doesNotMatch(seed, new RegExp(`insert\\s+into\\s+public\\.${transactional}\\b`, 'i'), transactional);
  }
});

test('database operations and deferred production decisions are documented', () => {
  const doc = read('docs/supabase-database.md');
  for (const phrase of [
    'SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY', 'supabase db reset',
    'supabase test db', 'app_metadata.role', 'Anonymous Auth', 'Turnstile',
    'retention', 'booking provider', 'supabase gen types typescript',
  ]) assert.match(doc, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), phrase);
  assert.match(doc, /finalize-proposal/i);
  assert.match(doc, /verify-proposal/i);
});

test('Edge Functions use an explicit Deno-compatible Supabase client import', () => {
  const client = read('supabase/functions/_shared/supabase.ts');
  assert.match(client, /from\s+["']npm:@supabase\/supabase-js@2\.116\.0["']/);
  assert.doesNotMatch(client, /from\s+["']@supabase\/supabase-js["']/);
});
