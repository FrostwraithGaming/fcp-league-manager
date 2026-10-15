# Project Completion & Handover Report
**Project:** FCP League Manager 27  
**Date:** 15 October 2026  
**Repository:** https://github.com/FrostwraithGaming/fcp-league-manager  
**Dashboard:** https://frostwraithgaming.github.io/fcp-league-manager/?refresh=20261015d

## Executive status

Core cloud monitoring and dashboard support have been implemented. The remaining hard blocker is a verified, supported FC Mobile source for live league rosters and Activity Points. The project cannot be called fully hands-free until that source is found, connected and validated.

## Completed

- Updated the dashboard to show estimated AP gain this week, unread alert count, a persistent alert inbox, “mark read” actions, and manual refresh.
- Added `public.league_alerts` with unique alert fingerprints and row-level security.
- Deployed `public.monitor_league_activity()` and scheduled it using Supabase pg_cron every 30 minutes.
- Implemented two-hour onboarding review alerts for members still below the 500 AP target.
- Implemented weekly AP shortfall checks for Sunday from 20:00 Asia/Kolkata. Weekly estimates require a recent pre-week baseline and an in-week snapshot. Missing evidence creates a data-coverage alert rather than a guessed result.
- Tightened RLS on `league_members`, `activity_history`, `league_settings`, and `league_alerts` to require `app_metadata.role = league_admin`.
- Assigned that role to the project's one existing Supabase Auth account at migration time.
- Updated README and added a deployment/connection guide.

## Verification performed

- Supabase confirms `fcp-league-monitor` exists and is active on schedule `*/30 * * * *`.
- Manual monitor invocation ran successfully and returned a JSON summary.
- That smoke test left one existing member record in review and created one persistent “Onboarding target missed” alert; no member rows were deleted.
- Supabase confirmed one Auth account and one account with the admin role.
- RLS policy inspection confirmed the role check on all four user-facing tables.
- Updated `app.js` passed JavaScript syntax parsing; HTML audit found no missing/duplicate DOM IDs referenced by the script.
- Weekly estimate sample tests passed for a normal increase (1,600 AP), a counter reset (800 AP) and missing baseline (await snapshot).

## Still connection-dependent / not verified

1. **Live FC Mobile feed:** no verified supported league/member/AP endpoint has been confirmed or connected. Current intake remains manual AP update or admin-uploaded screenshot OCR. A connector must be based on an authorized, tested source.
2. **Real-game OCR tuning:** no live league screenshot was available for final accuracy testing.
3. **Public Pages rendering:** changes are committed to main, but the public URL could not be independently fetched during this verification session.
4. **Discord delivery:** the in-dashboard alert inbox works; external delivery is not connected. If needed, store a private Discord webhook in Supabase Vault under `discord_webhook_url` using the connection guide.
5. **Auth configuration:** sign out/in once to refresh the admin role claim. Confirm public sign-ups remain disabled in Supabase Authentication settings.
6. **Automatic kick:** intentionally not enabled. No verified supported FC Mobile membership-management method is wired in. Shortfalls go to review; any removal remains a human decision.

## Connection / launch checklist

- [ ] Sign out and sign in again; confirm the dashboard loads members and alerts.
- [ ] Confirm Supabase public sign-ups are disabled and only trusted accounts carry `league_admin`.
- [ ] Upload and validate a real member-list screenshot; correct any OCR errors before saving.
- [ ] Continue snapshots so weekly estimation has a baseline and at least one in-week sample.
- [ ] Optionally connect Discord alerts using the Supabase Vault instructions in [DEPLOYMENT_AND_CONNECTION.md](DEPLOYMENT_AND_CONNECTION.md).
- [ ] Identify, connect and validate a legitimate live FC Mobile data source before calling this fully automated.

## Safety and key handling

No EA password, session cookie, or access token was requested or added to website code. The browser continues to use only the Supabase publishable key. No service-role key is exposed in GitHub. No stealth or detection-evasion method was implemented.
