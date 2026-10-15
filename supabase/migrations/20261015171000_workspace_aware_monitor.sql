create or replace function public.monitor_league_activity()
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
 v_now timestamptz:=now(); v_local timestamp:=now() at time zone 'Asia/Kolkata';
 v_period_start timestamptz; v_period_end timestamptz; v_window_hours integer; v_target integer;
 v_baseline integer; v_previous integer; v_points integer; v_baseline_at timestamptz; v_seen integer;
 v_onboarding integer:=0; v_quotas integer:=0; v_ovr integer:=0; v_gaps integer:=0;
 v_workspace record; v_rule record; v_member record; v_snap record;
 v_title text; v_message text; v_type text; v_period_key text; v_max_baseline_age integer;
begin
 for v_workspace in select id from public.league_workspaces loop
  select target_ap,coalesce(duration_hours,2) into v_target,v_window_hours from public.league_policy_rules
   where workspace_id=v_workspace.id and rule_type='onboarding' and enabled order by id limit 1;
  v_target:=coalesce(v_target,500); v_window_hours:=coalesce(v_window_hours,2);

  update public.league_members set status='active'
   where workspace_id=v_workspace.id and status in ('pending','review')
    and greatest(coalesce(last_points,0)-coalesce(initial_points,0),0)>=v_target;

  for v_member in select id,player_name,joined_at,initial_points,last_points from public.league_members
   where workspace_id=v_workspace.id and status in ('pending','review')
    and v_now>=joined_at+make_interval(hours=>v_window_hours)
    and greatest(coalesce(last_points,0)-coalesce(initial_points,0),0)<v_target loop
   update public.league_members set status='review' where id=v_member.id and status<>'review';
   v_message:=format('%s has not reached %s AP within %s hours of first tracking. Tracked gain: %s AP. Review manually before any in-game action.',
    left(coalesce(v_member.player_name,'Member'),100),v_target,v_window_hours,
    greatest(coalesce(v_member.last_points,0)-coalesce(v_member.initial_points,0),0));
   insert into public.league_alerts(workspace_id,member_id,alert_type,period_start,fingerprint,title,message,severity)
    values(v_workspace.id,v_member.id,'onboarding_shortfall',v_member.joined_at+make_interval(hours=>v_window_hours),
     'onboarding:'||v_workspace.id||':'||v_member.id||':'||v_window_hours,'Onboarding target missed',v_message,'warning')
    on conflict(fingerprint) do nothing;
   if found then v_onboarding:=v_onboarding+1; end if;
  end loop;

  for v_rule in select * from public.league_policy_rules where workspace_id=v_workspace.id and enabled and rule_type='ovr_threshold' loop
   for v_member in select id,player_name,ovr from public.league_members
    where workspace_id=v_workspace.id and status<>'removed' and ovr is not null and ovr<v_rule.minimum_ovr loop
    v_message:=format('%s has OVR %s, below the configured minimum %s. Confirm this value and review manually.',
     left(coalesce(v_member.player_name,'Member'),100),v_member.ovr,v_rule.minimum_ovr);
    insert into public.league_alerts(workspace_id,member_id,rule_id,alert_type,period_start,fingerprint,title,message,severity)
     values(v_workspace.id,v_member.id,v_rule.id,'ovr_shortfall',date_trunc('day',v_now),
      'ovr:'||v_workspace.id||':'||v_rule.id||':'||v_member.id||':'||to_char(v_now at time zone 'Asia/Kolkata','YYYY-MM-DD'),
      'Below OVR threshold',v_message,'warning') on conflict(fingerprint) do nothing;
    if found then v_ovr:=v_ovr+1; end if;
   end loop;
  end loop;

  for v_rule in select * from public.league_policy_rules where workspace_id=v_workspace.id and enabled and rule_type='activity_quota' loop
   v_period_start:=null; v_period_end:=null; v_window_hours:=null; v_period_key:=null;
   if v_rule.period_type='weekly' then
    v_period_start:=date_trunc('week',v_local) at time zone 'Asia/Kolkata';
    v_period_end:=v_period_start+interval '7 days';
    v_period_key:=to_char(v_period_start at time zone 'Asia/Kolkata','YYYY-MM-DD');
    if not (v_local::date=(v_period_start at time zone 'Asia/Kolkata')::date+6 and v_local::time>=time '20:00') then continue; end if;
    v_type:='weekly_shortfall'; v_title:='Weekly AP target missed'; v_window_hours:=168;
   elsif v_rule.period_type='monthly' then
    v_period_start:=date_trunc('month',v_local) at time zone 'Asia/Kolkata';
    v_period_end:=v_period_start+interval '1 month';
    v_period_key:=to_char(v_period_start at time zone 'Asia/Kolkata','YYYY-MM');
    if not (v_local::date=(date_trunc('month',v_local)+interval '1 month - 1 day')::date and v_local::time>=time '20:00') then continue; end if;
    v_type:='monthly_shortfall'; v_title:='Monthly AP target missed'; v_window_hours:=744;
   else
    v_window_hours:=coalesce(v_rule.duration_hours,24);
    v_period_start:=to_timestamp(floor(extract(epoch from v_now)/(v_window_hours*3600))*v_window_hours*3600-v_window_hours*3600);
    v_period_end:=v_period_start+make_interval(hours=>v_window_hours);
    v_period_key:=to_char(v_period_start at time zone 'Asia/Kolkata','YYYY-MM-DD-HH24');
    v_type:='custom_shortfall'; v_title:='Custom-window AP target missed';
   end if;
   v_max_baseline_age:=v_window_hours+48;

   for v_member in select id,player_name from public.league_members where workspace_id=v_workspace.id and status<>'removed' loop
    v_baseline:=null; v_baseline_at:=null; v_previous:=null; v_points:=0; v_seen:=0;
    select activity_points,recorded_at into v_baseline,v_baseline_at from public.activity_history
     where member_id=v_member.id and recorded_at<=v_period_start order by recorded_at desc,id desc limit 1;
    select count(*) into v_seen from public.activity_history where member_id=v_member.id
     and recorded_at>v_period_start and recorded_at<=least(v_now,v_period_end);
    if v_baseline_at is null or v_baseline_at<v_period_start-make_interval(hours=>v_max_baseline_age) or v_seen=0 then
     v_message:=format('%s quota needs a recent baseline and at least one snapshot within the %s period.',
      left(coalesce(v_member.player_name,'Member'),100),v_rule.period_type);
     insert into public.league_alerts(workspace_id,member_id,rule_id,alert_type,period_start,fingerprint,title,message,severity)
      values(v_workspace.id,v_member.id,v_rule.id,'quota_data_gap',v_period_start,
       'gap:'||v_workspace.id||':'||v_rule.id||':'||v_member.id||':'||v_period_key,
       'AP quota needs more data',v_message,'info') on conflict(fingerprint) do nothing;
     if found then v_gaps:=v_gaps+1; end if;
     continue;
    end if;

    v_previous:=v_baseline;
    for v_snap in select activity_points from public.activity_history
     where member_id=v_member.id and recorded_at>v_period_start and recorded_at<=least(v_now,v_period_end)
     order by recorded_at,id loop
     if v_snap.activity_points>=coalesce(v_previous,0) then v_points:=v_points+v_snap.activity_points-coalesce(v_previous,0);
     else v_points:=v_points+v_snap.activity_points; end if;
     v_previous:=v_snap.activity_points;
    end loop;
    if v_points<coalesce(v_rule.target_ap,1500) then
     v_message:=format('%s has an estimated %s / %s AP for the %s quota. Review snapshot evidence before any removal.',
      left(coalesce(v_member.player_name,'Member'),100),v_points,coalesce(v_rule.target_ap,1500),v_rule.period_type);
     insert into public.league_alerts(workspace_id,member_id,rule_id,alert_type,period_start,fingerprint,title,message,severity)
      values(v_workspace.id,v_member.id,v_rule.id,v_type,v_period_start,
       'quota:'||v_workspace.id||':'||v_rule.id||':'||v_member.id||':'||v_period_key,
       v_title,v_message,'warning') on conflict(fingerprint) do nothing;
     if found then v_quotas:=v_quotas+1; end if;
    end if;
   end loop;
  end loop;
 end loop;
 return jsonb_build_object('checked_at',v_now,'onboarding_alerts_created',v_onboarding,
  'quota_alerts_created',v_quotas,'ovr_alerts_created',v_ovr,'data_gap_alerts_created',v_gaps,'game_actions_executed',false);
end;
$$;
revoke all on function public.monitor_league_activity() from public,anon,authenticated;
grant execute on function public.monitor_league_activity() to service_role;
