# FCP League Manager 27

A private, mobile-friendly FC Mobile league tracking dashboard built with GitHub Pages and Supabase.

## Current capabilities

- Supabase email/password authentication for the admin workspace.
- Admin-only row-level security for member records, AP history, settings, and alerts.
- Manual member entry and AP updates.
- Browser-based OCR for up to eight league-member screenshots per scan, with review/edit before saving.
- AP history snapshots stored in Supabase.
- Onboarding target: 500 AP earned after first tracking, with a two-hour review deadline.
- Weekly target: 1,500 AP, estimated from saved history snapshots.
- Supabase scheduled monitoring every 30 minutes.
- Persistent in-dashboard alert inbox for onboarding shortfalls, weekly shortfalls, and missing snapshot coverage.
- Optional Discord notifications via a Supabase Vault secret named `discord_webhook_url`.

## Live game connection status

This project does **not** currently have a verified live FC Mobile league/AP data source. Screenshot OCR and manual updates are the supported intake methods for now. Each screenshot must be uploaded by an admin; it is not background monitoring. A live feed still needs to be connected and tested before the project can claim hands-free AP ingestion.

The tracker timestamps a newly detected member from the first screenshot where they appear, not the official in-game join time. The two-hour target therefore measures activity gained after first tracking unless the admin enters the member at join time.

## Monitoring schedule and logic

- The database monitor runs every 30 minutes.
- Pending members who reach the configured onboarding threshold are cleared automatically in the tracker.
- Members still below the onboarding target after the stored deadline receive a one-time alert and are flagged for review.
- Weekly review runs on Sunday from 8:00 PM Asia/Kolkata time.
- Weekly AP is estimated from the latest snapshot before the week starts plus in-week snapshots. A counter drop is treated as a weekly reset. If the baseline or in-week snapshot is missing, a data-coverage alert is created rather than presenting a false precision.
- Alerts are stored in `public.league_alerts`. Optional Discord delivery requires a webhook URL to be saved in Supabase Vault as `discord_webhook_url`. Until that is connected, alerts remain in the dashboard inbox.
- The monitor never kicks or removes players. Any in-game removal remains a manual administrator decision.

## Admin and database security

1. Keep public sign-ups disabled in Supabase Authentication settings.
2. The current existing Auth account was marked with the app metadata role `league_admin` by the monitoring migration. Sign out and back in to refresh the role in your session.
3. Row-level security checks that app metadata role for every user-facing table. Only trusted admins should have that role.
4. Keep Row Level Security enabled. Never expose a Supabase service-role/secret key in browser code.
5. If adding another admin later, assign the `league_admin` app metadata role through a trusted Supabase admin path; do not use public sign-up.

## Infrastructure

- Frontend: GitHub Pages
- Database/Auth/Scheduled checks: Supabase
- Screenshot OCR: Tesseract.js in the browser
- Optional alerts channel: Discord webhook stored server-side in Supabase Vault

## Verification checklist

- [ ] Sign out and sign back in after the admin-role migration.
- [ ] Upload a clear member-list screenshot and verify all detected names/AP values before saving.
- [ ] Capture snapshots often enough to support a weekly baseline and in-week comparison.
- [ ] Connect a Discord webhook in Supabase Vault if external notifications are wanted.
- [ ] Connect and validate a legitimate live FC Mobile data source before enabling any live-ingestion claim or automatic in-game action.


## Staged integration and management workflow

- **Data connector:** no verified official FC Mobile endpoint for league rosters or AP was found in the official help material. The current connector is reviewed screenshot OCR; the screenshot is processed locally and is not uploaded as an image. Only reviewed/extracted roster values and snapshot metadata are saved.
- **Account connection:** the website asks only for its Supabase admin login. Do not enter EA credentials or session tokens in this site; there is no EA account connection in this build.
- **Cloud processing:** Supabase stores grouped roster snapshots and individual AP history, and the scheduled monitor generates onboarding/weekly shortfall or data-gap alerts.
- **Management actions:** shortfall alerts produce review recommendations. An admin must approve the recommendation, perform any removal manually in FC Mobile, then confirm completion and enter an audit note. Approval does not execute an in-game action.
- **Automatic removal:** disabled until a supported, authorized membership-management interface can be verified and tested.
