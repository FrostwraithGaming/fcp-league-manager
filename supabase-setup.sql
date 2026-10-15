-- FCP League Manager: minimum authenticated access policies
-- Before running this:
-- 1) In Supabase Authentication settings, disable public sign-ups.
-- 2) Create your own admin user under Authentication -> Users -> Add user.
-- 3) Never put a service_role/secret key in this website.

alter table public.league_members enable row level security;
alter table public.activity_history enable row level security;
alter table public.league_settings enable row level security;

drop policy if exists "Authenticated admins can manage league members" on public.league_members;
create policy "Authenticated admins can manage league members"
on public.league_members for all to authenticated
using (true) with check (true);

drop policy if exists "Authenticated admins can manage activity history" on public.activity_history;
create policy "Authenticated admins can manage activity history"
on public.activity_history for all to authenticated
using (true) with check (true);

drop policy if exists "Authenticated admins can read league settings" on public.league_settings;
create policy "Authenticated admins can read league settings"
on public.league_settings for select to authenticated
using (true);

drop policy if exists "Authenticated admins can update league settings" on public.league_settings;
create policy "Authenticated admins can update league settings"
on public.league_settings for update to authenticated
using (true) with check (true);
