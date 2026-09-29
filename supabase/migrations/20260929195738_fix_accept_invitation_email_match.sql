-- Fix: accept_invitation compared citext emails with `is distinct from`
-- under `search_path = ''`. citext's case-insensitive operators live in the
-- `extensions` schema, so resolution fell back to case-sensitive text
-- comparison, and 'Bob@x.com' didn't match 'bob@x.com'. Compare lower()
-- explicitly instead. Functions that set search_path = '' must never rely on
-- citext operators.

create or replace function public.accept_invitation(p_token text)
returns public.organization_members
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  user_email extensions.citext;
  user_name text;
  inv public.organization_invitations;
  member public.organization_members;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select u.email, coalesce(nullif(trim(p.full_name), ''), u.email)
  into user_email, user_name
  from auth.users u
  left join public.profiles p on p.id = u.id
  where u.id = uid;

  select * into inv
  from public.organization_invitations
  where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
    and accepted_at is null
    and expires_at > now()
  for update;

  if not found or lower(inv.email::text) is distinct from lower(user_email::text) then
    raise exception 'invitation is invalid or has expired' using errcode = '22023';
  end if;

  if inv.member_id is not null then
    update public.organization_members
    set user_id = uid, status = 'active', role = inv.role
    where organization_id = inv.organization_id and id = inv.member_id and user_id is null
    returning * into member;
  else
    insert into public.organization_members (organization_id, user_id, role, display_name, email)
    values (inv.organization_id, uid, inv.role, user_name, user_email)
    on conflict (organization_id, user_id) do nothing
    returning * into member;
  end if;

  if member.id is null then
    raise exception 'you are already a member of this organization' using errcode = '23505';
  end if;

  update public.organization_invitations set accepted_at = now() where id = inv.id;

  return member;
end;
$$;
