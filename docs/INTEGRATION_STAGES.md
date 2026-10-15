# Integration Stages — FCP League Manager 27

**Status:** screenshot-based import and cloud compliance checks are implemented; live FC Mobile data access remains unverified.

## Stage 1 — Data connector

The current intake is a reviewed screenshot batch from FC Mobile's League → Members screen. OCR is run in the browser after the admin explicitly selects images. A preview is shown and the admin must correct names/AP values and select the rows before saving. Raw screenshots are not uploaded; the app saves the reviewed row data and one roster_snapshots record per batch.

I reviewed EA's public league help documentation and public community tools. The official help describes viewing league members through the in-game UI but does not document a public league/AP endpoint. The community tracker I found also extracts rows from screenshots; it is not an official live API. No verified authorized endpoint for live member AP was found. Do not use private endpoint reverse-engineering or scrape hidden game requests as a substitute.

Sources:
- EA Help: https://help.ea.com/en/articles/ea-sports-fc/fc-mobile/leagues-tournaments-championships/
- Community screenshot-based tracker: https://github.com/jasnoorpannu/fc_league_tracker
- EA official support: https://help.ea.com/en/games/ea-sports-fc/fc-mobile/

## Stage 2 — Account connection

The website authenticates with Supabase only. It never asks for the EA password, EA session token, or game cookie. A game account being a League Admin does not by itself grant a web app a data API. Do not paste EA credentials or tokens into browser JavaScript or a settings field.

Do not enable an EA connector until EA provides a supported OAuth/API path (or other documented authorization) and the exact league-member/AP read operation has been tested with the dedicated account. An official membership-management method must separately be verified before enabling any removal action.

## Stage 3 — Cloud processing

- league_roster_snapshots records each reviewed batch, time, source, row counts, and status.
- league_roster_snapshot_rows records each reviewed member/AP value, OCR confidence, and ingestion outcome.
- activity_history receives each AP reading for weekly-change calculations.
- league_alerts contains onboarding shortfalls, weekly shortfalls, and missing-data alerts.
- monitor_league_activity() runs every 30 minutes; weekly evaluation is on Sunday from 20:00 Asia/Kolkata.
- The current app estimates a member's first-seen time from the first tracked record. It cannot confirm the actual in-game join timestamp unless that data becomes available through an authorized source.

## Stage 4 — Review and confirm

Shortfall alerts for onboarding or weekly AP generate a league_action_reviews item. The admin may approve or decline the recommendation. Approval does not kick a member. If the admin removes the member directly inside FC Mobile, they can then confirm completion and add an audit note; Supabase records the reviewer, timestamps, and completion note, and the tracker marks the member removed.

Automatic kicking remains disabled until a supported and authorized game-management interface is found, implemented, and tested. The dashboard never reports a manual confirmation as an automated game action.

## Admin launch checklist

1. Sign out and sign back into the dashboard after the admin metadata role update.
2. Keep Supabase public sign-ups disabled, and assign app_metadata.role = league_admin only through a trusted admin path.
3. Run one real screenshot import and verify the saved snapshot rows and AP history.
4. Review a test action recommendation before using it for a real member; complete only after manual in-game removal.
5. Verify the GitHub Pages deployment of the current commit and test on both desktop and phone.
