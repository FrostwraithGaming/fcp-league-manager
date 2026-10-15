# Integration Stages — FCP League Manager

**Current status:** the public multi-user workspace, customizable rules, screenshot snapshot pipeline, cloud monitoring, and manual-action review workflow are implemented. Live EA integration and final auth-provider configuration remain outstanding.

## Public account flow

The frontend provides Google OAuth and email one-time-code verification. Supabase Auth is the identity/session backend because the same verified user session is used by row-level security for database isolation. This is not the former single administrator email/password screen.

Google OAuth client credentials, Site URL/redirect allow-list, email OTP template, custom SMTP, and Turnstile secret/site key must be configured in provider dashboards before treating the public signup process as launch-ready. Follow docs/PUBLIC_LAUNCH_SETUP.md.

## Stage 1 — Data connector

No verified official EA FC Mobile league-member/AP endpoint was found in EA's public help material. The current intake is reviewed screenshot OCR: the browser reads an image selected by the admin, presents editable AP/name rows, and stores only reviewed values and snapshot metadata. Raw screenshot images are not uploaded.

References:
- EA help: https://help.ea.com/en/articles/ea-sports-fc/fc-mobile/leagues-tournaments-championships/
- Community screenshot tracker: https://github.com/jasnoorpannu/fc_league_tracker
- Official EA Mobile safety rules: https://help.ea.com/en/articles/ea-sports-fc/fc-mobile/rules-fc-mobile/

## Stage 2 — EA account connection

The app intentionally does not collect an EA password, game OTP, cookie, or session token. A player being a league admin does not itself grant a web app access to a documented league/AP API. Do not add a password form or reverse-engineer private game requests. The FC Mobile connection status remains unconnected until an authorized OAuth/API path or other documented interface is confirmed.

## Stage 3 — Public multi-user cloud processing

- Each verified public user gets a separate workspace when they sign in for the first time.
- RLS uses workspace_members to isolate league roster, AP history, snapshots, alerts, rules, and action reviews.
- Users can create additional workspaces without sharing their member data between them.
- league_policy_rules stores onboarding target/deadline, weekly/monthly/custom-hour AP quota, and an optional OVR threshold.
- monitor_league_activity() runs every 30 minutes; weekly checks occur Sunday evening, monthly checks at month-end, custom windows use completed hourly windows.
- The monitor creates alerts and recommendations only. It never executes an in-game kick.

## Stage 4 — Bulk review, approve, and confirm

The dashboard can bulk-generate AP-quota or OVR-threshold recommendations based on stored history and verified OVR values. Each recommendation is stored in the action review queue. Managers approve or decline recommendations, and can record completion only after manually carrying out the action in-game. The database logs the decision and note; confirmation marks the player removed in this tracker, not in FC Mobile.

Automatic kicking remains disabled until a supported, authorized membership-management interface is available and independently tested.

## Remaining launch tests

1. Complete Google provider + email OTP + Turnstile configuration as documented.
2. Sign up with a new email, sign in with Google, and verify both return to the public site correctly.
3. Verify new workspaces, RLS isolation across two separate users, and workspace switching.
4. Import a real roster screenshot and confirm the stored snapshot/AP history.
5. Test rule persistence for weekly, monthly, and custom-hour quotas and the OVR threshold.
6. Verify bulk review queue behavior without executing any in-game action.
7. Test GitHub Pages on mobile and desktop.
