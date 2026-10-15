# Public Website Update — FCP League Manager
**Date:** 15 October 2026  
**Repository:** https://github.com/FrostwraithGaming/fcp-league-manager  
**Dashboard:** https://frostwraithgaming.github.io/fcp-league-manager/?refresh=20261015i  
**Supabase project:** ekfziidavohcdzbypocn

## Implemented

- Replaced the dark single-admin dashboard with a responsive light-theme public website.
- Added Google OAuth and email OTP verification flows, plus Cloudflare Turnstile frontend integration hooks.
- Added separate workspaces for multiple users and additional workspaces per user.
- Added workspace-scoped row-level security and tenant-aware database reads/writes.
- Added configurable onboarding AP target + time limit, weekly/monthly/custom-hour quota, and optional minimum OVR policy.
- Added roster import review, grouped snapshots, AP history, manual AP/OVR updates, alerts, bulk recommendation creation, and the action-review queue.
- Updated the cloud monitor to evaluate workspace rules every 30 minutes.
- Committed new Supabase migrations to the repository for workspace isolation, rule configuration, monitoring, and access grants.

## Verified in this session

- Supabase migrations for multi-user workspace/RLS schema, custom rules, monitor updates, and default OVR threshold applied successfully.
- Workspace-aware monitor migration applied and monitor_league_activity() ran successfully.
- Database returned one new onboarding alert from the existing member record when the monitor was smoke-tested.
- Final `app.js` passed JavaScript syntax parsing after the latest change; DOM audit found no missing or duplicate IDs, and both CSS/JS cache-busters are aligned at `20261015i`.
- Schema inspection confirmed workspace, membership and policy-rule tables exist and have RLS enabled.
- The workspace-aware monitor reports game_actions_executed: false.
- No EA password, game OTP, cookie or session token was requested or stored.

## Required before public authentication is production-ready

1. Configure the Google OAuth client in Google Cloud and Supabase Auth.
2. Configure the public Site URL/redirect allow-list in Supabase.
3. Configure the Supabase email template for numeric OTP ({{ .Token }}) and production SMTP/rate limits.
4. Create a Cloudflare Turnstile widget, replace the public site key placeholder in app.js, and place the secret key in Supabase Auth CAPTCHA settings.
5. Test both signup methods and CAPTCHA from the real public URL. These credentials cannot be set from the repository alone.

## Still not implemented / not verified

- **Live EA connection:** no verified, supported public FC Mobile league/AP endpoint has been connected. The website deliberately does not accept an EA password or OTP.
- **Actual game kicks/mass kicks:** unavailable because no authorized FC Mobile membership-management interface has been verified. The site bulk-creates reviewed recommendations; an admin must act manually and then confirm.
- **Real roster screenshot:** OCR has not yet been validated on a real in-game screenshot.
- **GitHub Pages runtime:** web tooling could not fetch the public Pages URL for a visual/functional check, so the final deployed rendering and sign-in redirects still need a browser test.
- **External notifications:** Discord delivery remains optional and unconfigured unless a Vault webhook secret is added.

## Security follow-up

- Auth provider client secrets and Turnstile secret belong in provider dashboards, not app.js or GitHub.
- Browser code contains the Supabase publishable key only.
- Supabase security advisor may flag SECURITY DEFINER workspace/RPC functions because authenticated users must call them; each exposed function is restricted to the current user's workspace or to creating that user's own workspace.
- Enable Supabase leaked-password protection and configure email rate limits/SMTP before public launch.
