# Public Launch Setup — FCP League Manager

## What is in the repository now

- Public light-theme site, email one-time-code authentication flow, Google OAuth flow, and a Cloudflare Turnstile widget hook.
- Multi-user league workspaces with tenant-scoped roster, activity history, alerts, snapshot history, rules, and review queue.
- Configurable onboarding AP target + hours, an AP quota measured weekly/monthly/custom hours, and an optional minimum-OVR review rule.
- Bulk candidate builder for AP/OVR criteria; recommendations require manual review. There is no supported live EA connector or automatic in-game kick.

**Provider setup is still required before public authentication can work.** Provider client secrets must be entered into provider dashboards, never into GitHub or browser JavaScript.

## 0. Enable public email sign-up

Open Supabase Dashboard → Authentication → Sign In / Providers or User Signups settings and enable new user sign-ups for Email OTP. This must be enabled for public people to create their own accounts. Do not grant existing users workspace ownership or admin rights across other users' workspaces; the workspace creation flow grants ownership only to the current signed-in user. Enable rate limits and CAPTCHA before sharing the site publicly.

## 1. Supabase Auth URLs

Open Supabase Dashboard → Authentication → URL Configuration.

Set Site URL to:
https://frostwraithgaming.github.io/fcp-league-manager/

Add this exact redirect URL to the Redirect URLs allow-list:
https://frostwraithgaming.github.io/fcp-league-manager/

After the domain/path changes, update the redirect URL accordingly.

## 2. Google sign-in

1. In Google Cloud Console, create/select a project and create an OAuth Client ID of type **Web application**.
2. Add this authorized JavaScript origin: https://frostwraithgaming.github.io
3. Add this authorized redirect URI: https://ekfziidavohcdzbypocn.supabase.co/auth/v1/callback
4. In Supabase Dashboard → Authentication → Providers → Google, enable Google and enter the Google Client ID and Client Secret.
5. Do not place the Client Secret in app.js. Supabase handles the OAuth exchange.

Supabase documentation: https://supabase.com/docs/guides/auth/social-login/auth-google

## 3. Email verification codes

1. In Supabase Dashboard → Authentication → Email Templates, configure the sign-in/confirmation template to include the one-time code variable {{ .Token }}. A template using {{ .ConfirmationURL }} sends a magic link instead of the numeric-code experience this site displays.
2. Confirm email OTP sign-in is enabled and the code can be redeemed using verifyOtp.
3. For public launch, configure a reliable custom SMTP provider and set appropriate auth rate limits. Supabase's default mail service is not intended to be a high-volume production email service.

References:
- OTP API: https://supabase.com/docs/reference/javascript/auth-signinwithotp
- Email templates: https://supabase.com/docs/guides/auth/auth-email-templates

## 4. CAPTCHA / Turnstile

The UI is deliberately blocked from email sign-up until the site key is set. To enable it:

1. In Cloudflare, create a Turnstile widget and allow the GitHub Pages hostname frostwraithgaming.github.io.
2. Copy the public site key into the TURNSTILE_SITE_KEY constant in app.js in place of SET_CLOUDFLARE_TURNSTILE_SITE_KEY.
3. In Supabase Dashboard → Authentication → Bot and Abuse Protection, enable CAPTCHA and select Cloudflare Turnstile. Enter the Turnstile secret key there, not in the repository.
4. Test a new email login with a valid CAPTCHA in the actual public browser. If CAPTCHA validation fails, do not disable it to ship; correct the site/secret configuration.

Official guide: https://supabase.com/docs/guides/auth/auth-captcha

The browser only contains the Turnstile site key, which is public by design. The Turnstile secret belongs in Supabase Auth settings. The email OTP request sends the returned CAPTCHA token to Supabase. The Google button is gated by the widget client-side; do not assume the browser-only gate alone provides server-side Google CAPTCHA enforcement. Verify Google sign-in, bot protection, rate limits, and provider settings in the real project before treating the whole auth surface as production-protected.

## 5. Public access and data isolation

- New verified users receive their own My League workspace when they first sign in.
- Users may create additional league workspaces from the dashboard.
- Row-level security checks workspace membership; members do not share a global roster by default.
- create_league_workspace only creates workspace memberships for the signed-in user.
- Never expose the Supabase service-role key, Google client secret, Turnstile secret, EA password, or session tokens in frontend code.

## 6. FC Mobile data and action limitations

No verified official FC Mobile league/AP endpoint is currently connected. The “FC Mobile connection” card is intentionally a truthful status/error action instead of a credential form. Do not ask users to put their EA password or OTP into this website.

The current fallback is reviewed screenshot OCR. Users can update AP and OVR from verified in-game values. AP/OVR criteria generate auditable recommendations, including bulk candidate creation. Approving a recommendation does not kick a player; the admin must carry out any supported in-game action manually and then confirm completion in the site. Automatic kicks should remain disabled until EA documents and authorizes a membership-management interface and it is tested end-to-end.

EA account safety rules: https://help.ea.com/en/articles/ea-sports-fc/fc-mobile/rules-fc-mobile/

## 7. Smoke-test checklist

- [ ] Google sign-in redirects to Google and returns to the GitHub Pages URL.
- [ ] Email sends a numeric OTP and verifies successfully.
- [ ] CAPTCHA rejects invalid/expired tokens.
- [ ] New user gets one isolated workspace with default 500 AP / 2-hour onboarding and 1,500 AP weekly quota.
- [ ] Create a second workspace and confirm members/rules are isolated.
- [ ] Save a reviewed screenshot and verify a snapshot plus activity history were created.
- [ ] Change weekly → monthly → custom quota, save, refresh, and confirm values persist.
- [ ] Set OVR for a member and generate bulk AP/OVR recommendations; confirm no game action is executed.
- [ ] Complete only a review that was manually actioned inside the game.
- [ ] Verify GitHub Pages serves the latest assets on mobile and desktop.
