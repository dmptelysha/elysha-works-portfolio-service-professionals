-- Deferred relationships, documented query indexes, and shared timestamps.

alter table public.quiz_sessions
  add constraint quiz_sessions_question_set_id_fkey
  foreign key (question_set_id) references public.quiz_definitions(id) on delete restrict;

alter table public.quiz_sessions
  add constraint quiz_sessions_recommended_offer_key_fkey
  foreign key (recommended_offer_key) references public.package_catalog(offer_key) on delete set null;

alter table public.quiz_sessions
  add constraint quiz_sessions_lead_id_fkey
  foreign key (lead_id) references public.leads(id) on delete set null;

alter table public.portfolio_sessions
  add constraint portfolio_sessions_lead_id_fkey
  foreign key (lead_id) references public.leads(id) on delete set null;

alter table public.site_visitors
  add constraint site_visitors_latest_quiz_session_id_fkey
  foreign key (latest_quiz_session_id) references public.quiz_sessions(id) on delete set null;

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke execute on function public.set_updated_at() from public, anon, authenticated;

create function public.touch_quiz_activity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'in_progress' and (
    new.current_step is distinct from old.current_step
    or new.last_completed_step is distinct from old.last_completed_step
    or new.answers is distinct from old.answers
  ) then
    new.last_activity_at := now();
    new.resume_expires_at := now() + interval '30 days';
  end if;
  return new;
end;
$$;

revoke execute on function public.touch_quiz_activity() from public, anon, authenticated;

create function public.maintain_quiz_rollups()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.site_visitors
    set quiz_started_count = quiz_started_count + 1,
        latest_quiz_session_id = new.id,
        last_seen_at = greatest(last_seen_at, new.started_at)
    where id = new.visitor_id;
  elsif old.status <> 'completed' and new.status = 'completed' then
    update public.site_visitors
    set quiz_completed_count = quiz_completed_count + 1,
        latest_quiz_session_id = new.id,
        last_seen_at = greatest(last_seen_at, new.completed_at)
    where id = new.visitor_id;
  end if;
  return new;
end;
$$;

revoke execute on function public.maintain_quiz_rollups() from public, anon, authenticated;

create trigger site_visitors_set_updated_at before update on public.site_visitors
for each row execute function public.set_updated_at();
create trigger portfolio_sessions_set_updated_at before update on public.portfolio_sessions
for each row execute function public.set_updated_at();
create trigger quiz_sessions_set_updated_at before update on public.quiz_sessions
for each row execute function public.set_updated_at();
create trigger quiz_sessions_touch_activity before update on public.quiz_sessions
for each row execute function public.touch_quiz_activity();
create trigger quiz_sessions_maintain_rollups after insert or update of status on public.quiz_sessions
for each row execute function public.maintain_quiz_rollups();
create trigger leads_set_updated_at before update on public.leads
for each row execute function public.set_updated_at();
create trigger bookings_set_updated_at before update on public.bookings
for each row execute function public.set_updated_at();
create trigger projects_set_updated_at before update on public.projects
for each row execute function public.set_updated_at();
create trigger package_catalog_set_updated_at before update on public.package_catalog
for each row execute function public.set_updated_at();
create trigger addon_catalog_set_updated_at before update on public.addon_catalog
for each row execute function public.set_updated_at();
create trigger quiz_definitions_set_updated_at before update on public.quiz_definitions
for each row execute function public.set_updated_at();
create trigger site_content_set_updated_at before update on public.site_content
for each row execute function public.set_updated_at();

create index site_visitors_last_seen_at_idx on public.site_visitors (last_seen_at desc);
create index site_visitors_latest_quiz_session_id_idx on public.site_visitors (latest_quiz_session_id);

create index portfolio_sessions_visitor_id_idx on public.portfolio_sessions (visitor_id);
create index portfolio_sessions_owner_user_id_idx on public.portfolio_sessions (owner_user_id);
create index portfolio_sessions_last_activity_at_idx on public.portfolio_sessions (last_activity_at desc);
create index portfolio_sessions_audience_started_at_idx on public.portfolio_sessions (audience_key, started_at desc);
create index portfolio_sessions_lead_id_idx on public.portfolio_sessions (lead_id);

create index quiz_sessions_visitor_id_idx on public.quiz_sessions (visitor_id);
create index quiz_sessions_owner_user_id_idx on public.quiz_sessions (owner_user_id);
create index quiz_sessions_portfolio_session_id_idx on public.quiz_sessions (portfolio_session_id);
create index quiz_sessions_question_set_id_idx on public.quiz_sessions (question_set_id);
create index quiz_sessions_lead_id_idx on public.quiz_sessions (lead_id);
create index quiz_sessions_status_resume_expires_at_idx on public.quiz_sessions (status, resume_expires_at);
create index quiz_sessions_owner_activity_idx on public.quiz_sessions (owner_user_id, last_activity_at desc);
create index quiz_sessions_recommended_offer_key_idx on public.quiz_sessions (recommended_offer_key);

create index leads_visitor_id_idx on public.leads (visitor_id);
create index leads_source_portfolio_session_id_idx on public.leads (source_portfolio_session_id);
create index leads_crm_stage_status_idx on public.leads (crm_stage, lead_status);
create index leads_created_at_idx on public.leads (created_at desc);
create index leads_assigned_to_user_id_idx on public.leads (assigned_to_user_id);

create index bookings_lead_id_idx on public.bookings (lead_id);
create index bookings_visitor_id_idx on public.bookings (visitor_id);
create index bookings_portfolio_session_id_idx on public.bookings (portfolio_session_id);
create index bookings_quiz_session_id_idx on public.bookings (quiz_session_id);
create index bookings_rescheduled_from_booking_id_idx on public.bookings (rescheduled_from_booking_id);
create index bookings_scheduled_start_status_idx on public.bookings (scheduled_start, status);
create unique index bookings_provider_external_id_uidx
  on public.bookings (booking_provider, external_booking_id)
  where external_booking_id is not null;

create index analytics_events_owner_user_id_idx on public.analytics_events (owner_user_id);
create index analytics_events_visitor_id_idx on public.analytics_events (visitor_id);
create index analytics_events_portfolio_session_id_idx on public.analytics_events (portfolio_session_id);
create index analytics_events_quiz_session_id_idx on public.analytics_events (quiz_session_id);
create index analytics_events_lead_id_idx on public.analytics_events (lead_id);
create index analytics_events_name_occurred_at_idx on public.analytics_events (event_name, occurred_at desc);
create index analytics_events_occurred_at_idx on public.analytics_events (occurred_at desc);

create index projects_published_display_order_idx on public.projects (published, display_order);
create index projects_featured_display_order_idx on public.projects (featured, display_order) where published;
create index package_catalog_active_display_order_idx on public.package_catalog (active, display_order);
create index package_catalog_build_route_level_idx on public.package_catalog (build_route, level);
create index addon_catalog_active_display_order_idx on public.addon_catalog (active, display_order);
create index quiz_definitions_audience_active_version_idx on public.quiz_definitions (audience_key, active, version desc);
create unique index quiz_definitions_one_active_audience_uidx on public.quiz_definitions (audience_key) where active;
create index site_content_published_document_key_idx on public.site_content (published, document_key);
create index site_content_updated_by_user_id_idx on public.site_content (updated_by_user_id);
