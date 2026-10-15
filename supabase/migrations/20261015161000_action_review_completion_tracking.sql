create or replace function public.complete_league_action(p_action_id bigint, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member_id bigint;
begin
  if not coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'league_admin', false) then
    raise exception 'League administrator role required';
  end if;
  if nullif(trim(coalesce(p_note,'')), '') is null then
    raise exception 'A completion note is required';
  end if;
  update public.league_action_reviews
     set status = 'completed',
         completed_at = now(),
         completed_by = auth.uid(),
         completion_note = left(trim(p_note),500)
   where id = p_action_id and status = 'approved'
   returning member_id into v_member_id;
  if not found then
    raise exception 'Action must be approved before it can be marked completed';
  end if;
  -- This records the administrator's confirmation that the manual in-game removal already happened.
  if v_member_id is not null then
    update public.league_members set status = 'removed' where id = v_member_id;
  end if;
end;
$$;

revoke all on function public.complete_league_action(bigint,text) from public, anon;
grant execute on function public.complete_league_action(bigint,text) to authenticated;
