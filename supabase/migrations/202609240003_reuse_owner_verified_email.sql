-- Reuse mailbox verification only for the same anonymous owner and visitor.
-- The browser cannot call this function directly and no global email lookup is exposed.

create function public.reuse_verified_email_challenge(
  p_challenge_id uuid,
  p_owner_user_id uuid,
  p_visitor_id uuid,
  p_email text,
  p_email_digest bytea,
  p_request_ip_digest bytea,
  p_request_id uuid,
  p_now timestamptz default now()
)
returns table (
  challenge_id uuid,
  expires_at timestamptz,
  resend_available_at timestamptz,
  grant_expires_at timestamptz,
  result_code text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_expires_at timestamptz := p_now + interval '10 minutes';
  v_resend_available_at timestamptz := p_now + interval '60 seconds';
begin
  perform private.assert_email_otp_service_context();
  perform private.cleanup_email_otp_challenges(100);

  if p_challenge_id is null or p_owner_user_id is null or p_visitor_id is null or p_request_id is null
    or coalesce(octet_length(p_email_digest), 0) <> 32
    or coalesce(octet_length(p_request_ip_digest), 0) <> 32
    or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'invalid verification reuse input' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('email-otp-owner:' || p_owner_user_id::text, 0));

  perform 1
  from public.leads l
  join public.site_visitors v on v.id = l.visitor_id
  where l.auth_user_id = p_owner_user_id
    and l.visitor_id = p_visitor_id
    and v.id = p_visitor_id
    and v.owner_user_id = p_owner_user_id
    and lower(btrim(l.email)) = v_email
    and l.email_verified_at is not null
    and l.email_verified_at >= p_now - interval '30 days'
  limit 1;

  if not found then
    return query select null::uuid, null::timestamptz, null::timestamptz,
      null::timestamptz, 'not_found'::text;
    return;
  end if;

  update private.email_otp_challenges c
  set status = 'superseded', otp_digest = null
  where c.owner_user_id = p_owner_user_id
    and c.purpose = 'qualified_quiz'
    and c.status in ('pending_delivery','active','verified');

  insert into private.email_otp_challenges (
    id, owner_user_id, email, email_digest, purpose, otp_digest, status,
    attempt_count, request_ip_digest, make_delivery_id, created_at,
    expires_at, resend_available_at, verified_at, grant_expires_at
  ) values (
    p_challenge_id, p_owner_user_id, v_email, p_email_digest,
    'qualified_quiz', null, 'verified', 0, p_request_ip_digest,
    p_request_id, p_now, v_expires_at, v_resend_available_at,
    p_now, v_expires_at
  );

  return query select p_challenge_id, v_expires_at, v_resend_available_at,
    v_expires_at, 'verified_reused'::text;
end;
$$;

revoke execute on function public.reuse_verified_email_challenge(
  uuid,uuid,uuid,text,bytea,bytea,uuid,timestamptz
) from public, anon, authenticated;
grant execute on function public.reuse_verified_email_challenge(
  uuid,uuid,uuid,text,bytea,bytea,uuid,timestamptz
) to service_role;
