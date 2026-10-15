# Deployment & Connection Guide — FCP League Manager

## Public sign-in setup

Follow docs/PUBLIC_LAUNCH_SETUP.md for Google OAuth, email one-time codes, Turnstile CAPTCHA, public redirects, SMTP, and pre-launch smoke tests.

Dashboard: https://frostwraithgaming.github.io/fcp-league-manager/?refresh=20261015h

## Current user workflow

1. Sign in with Google or request a verification code by email.
2. The first sign-in creates an isolated personal league workspace.
3. Add members manually or import reviewed screenshots.
4. Edit the onboarding AP target/time, AP quota period (weekly/monthly/custom hours), and optional minimum OVR rule.
5. Generate AP/OVR candidates in bulk and review recommendations.
6. If you carry out an action manually in FC Mobile, record completion and an audit note in the site.

## Google + email provider configuration

Do not put the Google Client Secret or Turnstile secret in frontend code. Use the provider dashboards to configure these. The current frontend placeholder SET_CLOUDFLARE_TURNSTILE_SITE_KEY intentionally blocks email sign-up until replaced with a real public site key. Supabase Auth must also have CAPTCHA enabled with the corresponding secret.

Email OTP uses Supabase Auth; configure the email template to send {{ .Token }} and test it from the public domain. Configure custom SMTP before expecting production-volume verification emails.

## FC Mobile connection

No verified official FC Mobile league/AP endpoint or supported membership-removal interface has been connected. The FC Mobile connection card is a status explainer; it intentionally does not collect EA credentials or OTPs. The available data path is reviewed screenshot OCR and manual AP/OVR readings.

## Kicks / mass review

Bulk criteria can create AP/OVR recommendation records. Approving a recommendation does not perform an in-game action. Automatic kicking stays disabled until a supported, authorized interface is documented and tested.

## Optional Discord notifications

Scheduled dashboard alerts are stored in Supabase. Optional webhook delivery can use a secret in Supabase Vault named discord_webhook_url. Never put the webhook URL in browser code or commit it to GitHub.
