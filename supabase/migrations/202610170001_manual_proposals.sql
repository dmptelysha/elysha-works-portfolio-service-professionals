-- Private, versioned proposals authored outside the browser.
create table private.manual_proposals (
  id uuid primary key default gen_random_uuid(),
  reference uuid unique,
  supersedes_id uuid references private.manual_proposals(id),
  version integer not null default 1 check (version > 0),
  status text not null default 'draft' check (status in ('draft', 'active', 'revoked', 'expired')),
  snapshot jsonb not null,
  preview_paths jsonb,
  access_hash text check (access_hash is null or access_hash ~ '^[0-9a-f]{64}$'),
  failed_attempts integer not null default 0 check (failed_attempts between 0 and 5),
  locked_until timestamptz,
  issued_at timestamptz,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  preview_cleaned_at timestamptz,
  created_at timestamptz not null default now(),
  constraint manual_proposal_issued_fields check (
    status = 'draft' or
    (reference is not null and access_hash is not null and preview_paths is not null and issued_at is not null)
  ),
  constraint manual_proposal_expiry check (expires_at > created_at)
);
create unique index manual_proposals_one_revision_per_parent_idx
  on private.manual_proposals (supersedes_id) where supersedes_id is not null;
create index manual_proposals_cleanup_idx on private.manual_proposals (expires_at)
  where preview_cleaned_at is null and status <> 'draft';
alter table private.manual_proposals enable row level security;
revoke all on private.manual_proposals from public, anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('manual-proposal-previews', 'manual-proposal-previews', false, 26214400, array['image/png'])
on conflict (id) do update set public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create function private.assert_manual_proposal_service_context()
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if coalesce(auth.role(), '') <> 'service_role'
    and session_user not in ('postgres', 'supabase_admin') then
    raise exception 'service authorization required' using errcode = '42501';
  end if;
end;
$$;

create function private.validate_manual_proposal_snapshot(p_snapshot jsonb)
returns void language plpgsql immutable set search_path = '' as $$
declare
  v_offer jsonb;
  v_keys text[] := array[]::text[];
begin
  if jsonb_typeof(p_snapshot) <> 'object'
    or nullif(btrim(p_snapshot->>'clientName'), '') is null
    or nullif(btrim(p_snapshot->>'businessName'), '') is null
    or jsonb_typeof(p_snapshot->'offers') <> 'array'
    or jsonb_array_length(p_snapshot->'offers') <> 3 then
    raise exception 'invalid manual proposal snapshot' using errcode = '22023';
  end if;
  for v_offer in select value from jsonb_array_elements(p_snapshot->'offers') loop
    if v_offer->>'key' not in ('basic', 'advanced', 'complete')
      or (v_offer->>'priceCents') !~ '^[0-9]+$'
      or (v_offer->>'priceCents')::numeric > 9007199254740991 then
      raise exception 'invalid manual proposal snapshot' using errcode = '22023';
    end if;
    v_keys := array_append(v_keys, v_offer->>'key');
  end loop;
  if array_length(array(select distinct unnest(v_keys)), 1) <> 3 then
    raise exception 'invalid manual proposal snapshot' using errcode = '22023';
  end if;
end;
$$;

create function private.manual_proposal_immutable_snapshot()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.status <> 'draft' and new.snapshot is distinct from old.snapshot then
    raise exception 'issued snapshot is immutable';
  end if;
  return new;
end;
$$;
create trigger manual_proposal_immutable_snapshot
before update on private.manual_proposals
for each row execute function private.manual_proposal_immutable_snapshot();

create function public.create_manual_proposal_draft(
  p_snapshot jsonb,
  p_expires_at timestamptz,
  p_supersedes_id uuid default null
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_version integer := 1;
begin
  perform private.assert_manual_proposal_service_context();
  perform private.validate_manual_proposal_snapshot(p_snapshot);
  if p_expires_at is null or p_expires_at <= now() then
    raise exception 'invalid manual proposal expiry' using errcode = '22023';
  end if;
  if p_supersedes_id is not null then
    select m.version + 1 into v_version
    from private.manual_proposals m where m.id = p_supersedes_id and m.status <> 'draft'
    for update;
    if v_version is null then
      raise exception 'proposal to supersede does not exist' using errcode = '22023';
    end if;
  end if;
  insert into private.manual_proposals (snapshot, expires_at, supersedes_id, version)
  values (p_snapshot, p_expires_at, p_supersedes_id, v_version) returning id into v_id;
  return v_id;
end;
$$;

create function public.issue_manual_proposal(
  p_id uuid,
  p_reference uuid,
  p_access_hash text,
  p_preview_paths jsonb,
  p_issued_at timestamptz
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_parent uuid;
  v_path text;
  v_key text;
begin
  perform private.assert_manual_proposal_service_context();
  if p_reference is null or p_access_hash !~ '^[0-9a-f]{64}$'
    or p_issued_at is null or jsonb_typeof(p_preview_paths) <> 'object'
    or (select count(*) from jsonb_object_keys(p_preview_paths)) <> 3 then
    raise exception 'invalid manual proposal issue' using errcode = '22023';
  end if;
  foreach v_key in array array['desktop','tablet','mobile'] loop
    v_path := p_preview_paths->>v_key;
    if v_path is null or v_path !~ '^manual/[A-Za-z0-9/_-]+[.]png$'
      or position('..' in v_path) > 0 then
      raise exception 'invalid manual preview path' using errcode = '22023';
    end if;
  end loop;
  select m.supersedes_id into v_parent
  from private.manual_proposals m
  where m.id = p_id and m.status = 'draft' and m.expires_at > p_issued_at
  for update;
  if not found then raise exception 'proposal draft unavailable' using errcode = '22023'; end if;
  update private.manual_proposals m
  set reference = p_reference, access_hash = p_access_hash,
      preview_paths = p_preview_paths, issued_at = p_issued_at,
      status = 'active', failed_attempts = 0, locked_until = null
  where m.id = p_id;
  if v_parent is not null then
    update private.manual_proposals m
    set status = 'revoked', revoked_at = p_issued_at
    where m.id = v_parent and m.status = 'active';
  end if;
  return p_reference;
end;
$$;

create function public.verify_manual_proposal_access(
  p_reference uuid,
  p_candidate_hash text,
  p_attempted_at timestamptz default now()
)
returns table (proposal_snapshot jsonb, preview_paths jsonb, proposal_expires_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  v_row private.manual_proposals%rowtype;
  v_granted boolean;
begin
  perform private.assert_manual_proposal_service_context();
  if p_reference is null or p_candidate_hash !~ '^[0-9a-f]{64}$'
    or p_attempted_at is null then return; end if;
  select * into v_row from private.manual_proposals m
  where m.reference = p_reference for update;
  if not found or v_row.status <> 'active' or v_row.expires_at <= p_attempted_at then
    return;
  end if;
  if v_row.locked_until is not null and v_row.locked_until > p_attempted_at then
    return;
  end if;
  v_granted := private.constant_time_equal_32(
    decode(v_row.access_hash, 'hex'), decode(p_candidate_hash, 'hex')
  );
  if v_granted then
    update private.manual_proposals m
    set failed_attempts = 0, locked_until = null
    where m.id = v_row.id;
    return query select v_row.snapshot, v_row.preview_paths, v_row.expires_at;
  else
    update private.manual_proposals m
    set failed_attempts = case when v_row.locked_until <= p_attempted_at then 1
                               else least(5, v_row.failed_attempts + 1) end,
        locked_until = case when
          (case when v_row.locked_until <= p_attempted_at then 1
                else v_row.failed_attempts + 1 end) >= 5
          then p_attempted_at + interval '15 minutes' else null end
    where m.id = v_row.id;
  end if;
end;
$$;

create function public.rotate_manual_proposal_code(p_id uuid, p_access_hash text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.assert_manual_proposal_service_context();
  if p_access_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid access hash' using errcode = '22023';
  end if;
  update private.manual_proposals m
  set access_hash = p_access_hash, failed_attempts = 0, locked_until = null
  where m.id = p_id and m.status = 'active' and m.expires_at > now();
  if not found then raise exception 'active proposal unavailable' using errcode = '22023'; end if;
end;
$$;

create function public.revoke_manual_proposal(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.assert_manual_proposal_service_context();
  update private.manual_proposals m set status = 'revoked', revoked_at = now()
  where m.id = p_id and m.status = 'active';
  if not found then raise exception 'active proposal unavailable' using errcode = '22023'; end if;
end;
$$;

create function public.list_expired_manual_preview_objects()
returns table (id uuid, preview_paths jsonb)
language plpgsql security definer set search_path = '' as $$
begin
  perform private.assert_manual_proposal_service_context();
  return query
  select m.id, m.preview_paths
  from private.manual_proposals m
  where m.preview_paths is not null and m.preview_cleaned_at is null
    and (m.status in ('revoked','expired') or m.expires_at <= now())
    and not exists (
      select 1 from private.manual_proposals live
      cross join lateral jsonb_each_text(live.preview_paths) live_path
      cross join lateral jsonb_each_text(m.preview_paths) stale_path
      where live.id <> m.id and live.status = 'active' and live.expires_at > now()
        and live_path.value = stale_path.value
    );
end;
$$;

create function public.mark_manual_preview_cleaned(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.assert_manual_proposal_service_context();
  if not exists (select 1 from public.list_expired_manual_preview_objects() due where due.id = p_id) then
    raise exception 'preview still in use' using errcode = '22023';
  end if;
  update private.manual_proposals m set preview_cleaned_at = now() where m.id = p_id;
end;
$$;

revoke execute on function private.assert_manual_proposal_service_context() from public, anon, authenticated;
revoke execute on function private.validate_manual_proposal_snapshot(jsonb) from public, anon, authenticated;
revoke execute on function private.manual_proposal_immutable_snapshot() from public, anon, authenticated;
revoke execute on function public.create_manual_proposal_draft(jsonb,timestamptz,uuid) from public, anon, authenticated;
revoke execute on function public.issue_manual_proposal(uuid,uuid,text,jsonb,timestamptz) from public, anon, authenticated;
revoke execute on function public.verify_manual_proposal_access(uuid,text,timestamptz) from public, anon, authenticated;
revoke execute on function public.rotate_manual_proposal_code(uuid,text) from public, anon, authenticated;
revoke execute on function public.revoke_manual_proposal(uuid) from public, anon, authenticated;
revoke execute on function public.list_expired_manual_preview_objects() from public, anon, authenticated;
revoke execute on function public.mark_manual_preview_cleaned(uuid) from public, anon, authenticated;

grant execute on function public.create_manual_proposal_draft(jsonb,timestamptz,uuid) to service_role;
grant execute on function public.issue_manual_proposal(uuid,uuid,text,jsonb,timestamptz) to service_role;
grant execute on function public.verify_manual_proposal_access(uuid,text,timestamptz) to service_role;
grant execute on function public.rotate_manual_proposal_code(uuid,text) to service_role;
grant execute on function public.revoke_manual_proposal(uuid) to service_role;
grant execute on function public.list_expired_manual_preview_objects() to service_role;
grant execute on function public.mark_manual_preview_cleaned(uuid) to service_role;
