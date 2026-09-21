-- Admin claim assumption: auth.jwt().app_metadata.role = 'admin'. This claim
-- must be assigned only by trusted server-side administration. user_metadata
-- and email addresses are never authorization sources.

create function public.is_portfolio_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
    and coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false);
$$;

revoke execute on function public.is_portfolio_admin() from public, anon, authenticated;
grant execute on function public.is_portfolio_admin() to authenticated;

alter table public.site_visitors enable row level security;
alter table public.portfolio_sessions enable row level security;
alter table public.quiz_sessions enable row level security;
alter table public.leads enable row level security;
alter table public.bookings enable row level security;
alter table public.analytics_events enable row level security;
alter table public.projects enable row level security;
alter table public.package_catalog enable row level security;
alter table public.addon_catalog enable row level security;
alter table public.quiz_definitions enable row level security;
alter table public.site_content enable row level security;

revoke all on table public.site_visitors from public, anon, authenticated;
revoke all on table public.portfolio_sessions from public, anon, authenticated;
revoke all on table public.quiz_sessions from public, anon, authenticated;
revoke all on table public.leads from public, anon, authenticated;
revoke all on table public.bookings from public, anon, authenticated;
revoke all on table public.analytics_events from public, anon, authenticated;
revoke all on table public.projects from public, anon, authenticated;
revoke all on table public.package_catalog from public, anon, authenticated;
revoke all on table public.addon_catalog from public, anon, authenticated;
revoke all on table public.quiz_definitions from public, anon, authenticated;
revoke all on table public.site_content from public, anon, authenticated;

-- Anonymous Auth users have the authenticated database role.
grant select on table public.site_visitors, public.portfolio_sessions, public.quiz_sessions to authenticated;
grant insert (owner_user_id, landing_path, first_touch_source, first_touch_medium, first_touch_campaign, referrer_domain, consent_status)
  on public.site_visitors to authenticated;
grant update (last_seen_at, consent_status) on public.site_visitors to authenticated;

grant insert (visitor_id, owner_user_id, landing_path, audience_key, utm_source, utm_medium, utm_campaign, referrer_domain, device_category)
  on public.portfolio_sessions to authenticated;
grant update (last_activity_at, audience_key, result_viewed, booking_cta_clicked)
  on public.portfolio_sessions to authenticated;

grant insert (visitor_id, owner_user_id, portfolio_session_id, question_set_id, audience_key, question_set_version, current_step, last_completed_step, answers)
  on public.quiz_sessions to authenticated;
grant update (current_step, last_completed_step, answers)
  on public.quiz_sessions to authenticated;

grant select on table public.projects, public.package_catalog, public.addon_catalog, public.quiz_definitions, public.site_content to authenticated;

-- Admins still use authenticated, so table privileges exist while RLS requires
-- the server-controlled claim. RPCs are the only visitor paths to sensitive tables.
grant select, insert, update, delete on table
  public.leads, public.bookings, public.analytics_events,
  public.projects, public.package_catalog, public.addon_catalog,
  public.quiz_definitions, public.site_content
to authenticated;

create policy site_visitors_owner_insert on public.site_visitors
for insert to authenticated
with check (auth.uid() = owner_user_id);
create policy site_visitors_owner_select on public.site_visitors
for select to authenticated
using (auth.uid() = owner_user_id);
create policy site_visitors_owner_update on public.site_visitors
for update to authenticated
using (auth.uid() = owner_user_id)
with check (auth.uid() = owner_user_id);
create policy site_visitors_admin_all on public.site_visitors
for all to authenticated
using (public.is_portfolio_admin())
with check (public.is_portfolio_admin());

create policy portfolio_sessions_owner_insert on public.portfolio_sessions
for insert to authenticated
with check (
  auth.uid() = owner_user_id
  and exists (
    select 1 from public.site_visitors v
    where v.id = portfolio_sessions.visitor_id and v.owner_user_id = auth.uid()
  )
);
create policy portfolio_sessions_owner_select on public.portfolio_sessions
for select to authenticated
using (auth.uid() = owner_user_id);
create policy portfolio_sessions_owner_update on public.portfolio_sessions
for update to authenticated
using (auth.uid() = owner_user_id)
with check (
  auth.uid() = owner_user_id
  and exists (
    select 1 from public.site_visitors v
    where v.id = portfolio_sessions.visitor_id and v.owner_user_id = auth.uid()
  )
);
create policy portfolio_sessions_admin_all on public.portfolio_sessions
for all to authenticated
using (public.is_portfolio_admin())
with check (public.is_portfolio_admin());

create policy quiz_sessions_owner_insert on public.quiz_sessions
for insert to authenticated
with check (
  auth.uid() = owner_user_id
  and exists (
    select 1 from public.site_visitors v
    where v.id = quiz_sessions.visitor_id and v.owner_user_id = auth.uid()
  )
  and exists (
    select 1 from public.portfolio_sessions ps
    where ps.id = quiz_sessions.portfolio_session_id
      and ps.visitor_id = quiz_sessions.visitor_id
      and ps.owner_user_id = auth.uid()
  )
  and exists (
    select 1 from public.quiz_definitions qd
    where qd.id = quiz_sessions.question_set_id
      and qd.audience_key = quiz_sessions.audience_key
      and qd.version = quiz_sessions.question_set_version
      and qd.active
  )
);
create policy quiz_sessions_owner_select on public.quiz_sessions
for select to authenticated
using (auth.uid() = owner_user_id);
create policy quiz_sessions_owner_update on public.quiz_sessions
for update to authenticated
using (auth.uid() = owner_user_id and status = 'in_progress')
with check (
  auth.uid() = owner_user_id
  and exists (
    select 1 from public.site_visitors v
    where v.id = quiz_sessions.visitor_id and v.owner_user_id = auth.uid()
  )
  and exists (
    select 1 from public.portfolio_sessions ps
    where ps.id = quiz_sessions.portfolio_session_id
      and ps.visitor_id = quiz_sessions.visitor_id
      and ps.owner_user_id = auth.uid()
  )
);
create policy quiz_sessions_admin_all on public.quiz_sessions
for all to authenticated
using (public.is_portfolio_admin())
with check (public.is_portfolio_admin());

create policy leads_admin_all on public.leads
for all to authenticated
using (public.is_portfolio_admin())
with check (public.is_portfolio_admin());
create policy bookings_admin_all on public.bookings
for all to authenticated
using (public.is_portfolio_admin())
with check (public.is_portfolio_admin());
create policy analytics_events_admin_all on public.analytics_events
for all to authenticated
using (public.is_portfolio_admin())
with check (public.is_portfolio_admin());

create policy projects_published_select on public.projects
for select to authenticated
using (published or public.is_portfolio_admin());
create policy projects_admin_insert on public.projects for insert to authenticated with check (public.is_portfolio_admin());
create policy projects_admin_update on public.projects for update to authenticated using (public.is_portfolio_admin()) with check (public.is_portfolio_admin());
create policy projects_admin_delete on public.projects for delete to authenticated using (public.is_portfolio_admin());

create policy package_catalog_active_select on public.package_catalog
for select to authenticated
using (active or public.is_portfolio_admin());
create policy package_catalog_admin_insert on public.package_catalog for insert to authenticated with check (public.is_portfolio_admin());
create policy package_catalog_admin_update on public.package_catalog for update to authenticated using (public.is_portfolio_admin()) with check (public.is_portfolio_admin());
create policy package_catalog_admin_delete on public.package_catalog for delete to authenticated using (public.is_portfolio_admin());

create policy addon_catalog_active_select on public.addon_catalog
for select to authenticated
using (active or public.is_portfolio_admin());
create policy addon_catalog_admin_insert on public.addon_catalog for insert to authenticated with check (public.is_portfolio_admin());
create policy addon_catalog_admin_update on public.addon_catalog for update to authenticated using (public.is_portfolio_admin()) with check (public.is_portfolio_admin());
create policy addon_catalog_admin_delete on public.addon_catalog for delete to authenticated using (public.is_portfolio_admin());

create policy quiz_definitions_active_select on public.quiz_definitions
for select to authenticated
using (active or public.is_portfolio_admin());
create policy quiz_definitions_admin_insert on public.quiz_definitions for insert to authenticated with check (public.is_portfolio_admin());
create policy quiz_definitions_admin_update on public.quiz_definitions for update to authenticated using (public.is_portfolio_admin()) with check (public.is_portfolio_admin());
create policy quiz_definitions_admin_delete on public.quiz_definitions for delete to authenticated using (public.is_portfolio_admin());

create policy site_content_published_select on public.site_content
for select to authenticated
using (published or public.is_portfolio_admin());
create policy site_content_admin_insert on public.site_content for insert to authenticated with check (public.is_portfolio_admin());
create policy site_content_admin_update on public.site_content for update to authenticated using (public.is_portfolio_admin()) with check (public.is_portfolio_admin());
create policy site_content_admin_delete on public.site_content for delete to authenticated using (public.is_portfolio_admin());
