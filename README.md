# FCP League Manager

A public, mobile-friendly, multi-workspace FC Mobile league manager with a light UI, built using GitHub Pages and Supabase.

## Public website

- Dashboard: https://frostwraithgaming.github.io/fcp-league-manager/?refresh=20261015i
- Sign-in options: Google OAuth or email one-time verification code.
- CAPTCHA: Cloudflare Turnstile widget hook included.
- **Before public sign-in works:** finish provider configuration in Supabase/Google Cloud/Cloudflare. See docs/PUBLIC_LAUNCH_SETUP.md.

## Working features

- Public user flow with Google OAuth and email OTP verification (provider keys and Turnstile secret must be configured in dashboards).
- A separate league workspace per user, with multiple workspaces available from the selector.
- Row-level security that limits rosters, activity history, alert inboxes, quota rules, snapshots, and review queues by workspace.
- Manual member addition, AP snapshots, and editable OVR values.
- Reviewed browser OCR for up to eight FC Mobile roster screenshots per batch. The screenshots are read on-device and are not uploaded.
- Grouped roster snapshot records and per-row import outcomes.
- Configurable onboarding AP target and deadline hours.
- Configurable weekly, monthly, or custom-hour AP quota.
- Optional minimum-OVR rule.
- Bulk candidate builder using AP or OVR criteria.
- Supabase scheduled monitoring every 30 minutes and a review-and-confirm queue.
- AP history calculations that use saved snapshots and flag missing data instead of inventing a result.

## FC Mobile connection and kicks

No verified official FC Mobile league-member/AP API or supported membership-removal API has been connected. The account-connection card intentionally does not collect EA passwords or OTPs. The manager website must not be given an EA session token.

Current data inputs are reviewed screenshots and manually verified AP/OVR values. The site can create single or bulk removal recommendations, but recommendation approval is not an in-game kick. A manager must perform any permitted in-game action manually and then record completion in the audit queue. Automatic kicking remains disabled until a supported and authorized interface is confirmed.

EA rules and account safety: https://help.ea.com/en/articles/ea-sports-fc/fc-mobile/rules-fc-mobile/

## Infrastructure

- Frontend: GitHub Pages
- Authentication/database: Supabase Auth + PostgreSQL with workspace-scoped RLS
- Scheduled monitoring: Supabase pg_cron
- CAPTCHA: Cloudflare Turnstile (requires site key in app.js and secret in Supabase Auth)
- Screenshot OCR: Tesseract.js, in the browser
- Optional alert channel: Discord webhook in Supabase Vault (not required for in-dashboard alerts)

## Key setup and security

Never commit Google OAuth client secrets, Turnstile secrets, Supabase service-role keys, EA credentials, or session tokens. Public browser code should contain only the Supabase publishable key and the public Turnstile site key.

Start with docs/PUBLIC_LAUNCH_SETUP.md, then review docs/INTEGRATION_STAGES.md.
