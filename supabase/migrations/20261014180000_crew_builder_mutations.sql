-- Crew builder writes. Both functions run as the caller (security invoker), so
-- the crew_members RLS policies (office staff only) are the access control.
-- They exist so a multi-row change commits or fails as one.

-- Moves a member into a crew, or out of every crew when p_crew_id is null. A
-- member is in at most one crew, so any other assignment is removed first.
create function public.move_crew_member(p_organization_id uuid, p_member_id uuid, p_crew_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  delete from public.crew_members
  where organization_id = p_organization_id
    and member_id = p_member_id
    and crew_id is distinct from p_crew_id;

  if p_crew_id is not null then
    insert into public.crew_members (organization_id, crew_id, member_id)
    values (p_organization_id, p_crew_id, p_member_id)
    on conflict do nothing;
  end if;
end;
$$;

-- Makes p_member_id the crew's lead, or clears the lead when null. The member
-- must already be in the crew.
create function public.set_crew_lead(p_organization_id uuid, p_crew_id uuid, p_member_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.crew_members
  set is_lead = false
  where organization_id = p_organization_id
    and crew_id = p_crew_id
    and is_lead
    and member_id is distinct from p_member_id;

  if p_member_id is not null then
    update public.crew_members
    set is_lead = true
    where organization_id = p_organization_id
      and crew_id = p_crew_id
      and member_id = p_member_id;
    if not found then
      raise exception 'member is not in this crew' using errcode = 'P0002';
    end if;
  end if;
end;
$$;

revoke execute on function public.move_crew_member(uuid, uuid, uuid) from public;
revoke execute on function public.set_crew_lead(uuid, uuid, uuid) from public;
grant execute on function public.move_crew_member(uuid, uuid, uuid) to authenticated;
grant execute on function public.set_crew_lead(uuid, uuid, uuid) to authenticated;
