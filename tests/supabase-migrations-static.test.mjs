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
});
