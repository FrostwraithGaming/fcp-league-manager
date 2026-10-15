create or replace function public.review_league_action(p_action_id bigint, p_decision text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'league_admin', false) then
    raise exception 'League administrator role required';
  end if;
  if p_decision is null or p_decision not in ('approve','decline') then
    raise exception 'Decision must be approve or decline';
  end if;
  update public.league_action_reviews
     set status = case when p_decision = 'approve' then 'approved' else 'declined' end,
         reviewed_at = now(),
         reviewed_by = auth.uid()
   where id = p_action_id and status = 'pending';
  if not found then
    raise exception 'Review item not found or no longer pending';
  end if;
end;
$$;

revoke all on function public.review_league_action(bigint,text) from public, anon;
grant execute on function public.review_league_action(bigint,text) to authenticated;
