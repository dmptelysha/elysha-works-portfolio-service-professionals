-- Manual, non-destructive retention helper. No cron schedule is installed.
create function public.mark_expired_quiz_sessions(p_before timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if not public.is_portfolio_admin() then
    raise exception 'admin authorization required' using errcode = '42501';
  end if;
  update public.quiz_sessions qs
  set status = 'expired'
  where qs.status = 'in_progress'
    and qs.resume_expires_at < p_before
    and qs.lead_id is null
    and not exists (select 1 from public.leads l where l.source_quiz_session_id = qs.id)
    and not exists (select 1 from public.bookings b where b.quiz_session_id = qs.id);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function public.mark_expired_quiz_sessions(timestamptz) from public, anon, authenticated;
grant execute on function public.mark_expired_quiz_sessions(timestamptz) to authenticated;
