revoke all on function public.is_workspace_member(uuid) from public,anon;
revoke all on function public.can_manage_workspace(uuid) from public,anon;
grant execute on function public.is_workspace_member(uuid) to authenticated;
grant execute on function public.can_manage_workspace(uuid) to authenticated;

grant select on public.league_workspaces,public.workspace_members to authenticated;
grant select,insert,update,delete on public.league_policy_rules to authenticated;
grant select,insert,update,delete on public.league_members,public.activity_history,public.league_alerts to authenticated;
grant select,insert,update,delete on public.league_roster_snapshots,public.league_roster_snapshot_rows to authenticated;
grant select on public.league_action_reviews to authenticated;
grant usage,select on all sequences in schema public to authenticated;

do $$
begin
  if not exists(select 1 from cron.job where jobname='fcp-league-monitor' and active) then
    perform cron.schedule('fcp-league-monitor','*/30 * * * *','select public.monitor_league_activity();');
  end if;
end $$;