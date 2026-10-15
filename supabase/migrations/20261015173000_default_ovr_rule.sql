update public.league_policy_rules
set minimum_ovr=80,updated_at=now()
where rule_type='ovr_threshold' and minimum_ovr=1;

create or replace function public.create_league_workspace(p_name text default 'My League')
returns uuid language plpgsql security definer set search_path=''
as $$
declare v_user uuid:=auth.uid(); v_workspace uuid; v_name text:=left(trim(coalesce(p_name,'My League')),80);
begin
 if v_user is null then raise exception 'Sign in is required'; end if;
 if length(v_name)<2 then v_name:='My League'; end if;
 insert into public.league_workspaces(name,owner_id) values(v_name,v_user) returning id into v_workspace;
 insert into public.workspace_members(workspace_id,user_id,role) values(v_workspace,v_user,'owner');
 insert into public.league_policy_rules(workspace_id,rule_type,name,period_type,target_ap,duration_hours,minimum_ovr,enabled)
 values (v_workspace,'onboarding','New member onboarding','onboarding',500,2,null,true),
        (v_workspace,'activity_quota','Weekly AP quota','weekly',1500,null,null,true),
        (v_workspace,'ovr_threshold','Minimum OVR review','none',null,null,80,false);
 return v_workspace;
end;
$$;
revoke all on function public.create_league_workspace(text) from public,anon;
grant execute on function public.create_league_workspace(text) to authenticated;