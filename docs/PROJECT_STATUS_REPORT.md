# Project Status Report — FCP League Manager 27
**Date:** 15 October 2026  
**Repository:** https://github.com/FrostwraithGaming/fcp-league-manager  
**Dashboard:** https://frostwraithgaming.github.io/fcp-league-manager/?refresh=20261015f  
**Supabase project:** ekfziidavohcdzbypocn

## What is implemented

- Supabase-authenticated admin dashboard. Browser code contains only the Supabase publishable key; it does not contain an EA password, EA session token, service-role key, or game cookie.
- Reviewed screenshot OCR intake. The admin selects up to eight images, reviews/edits names and AP, and explicitly selects rows before saving.
- New grouped roster snapshot tables: a snapshot header for each screenshot batch plus one row per reviewed member/AP and its import result. The screenshot image itself remains on the user's device and is not uploaded.
- Existing per-member AP history remains the input to AP calculations.
- Scheduled cloud monitoring remains active every 30 minutes, including onboarding (500 AP within two hours of first tracking) and weekly (1,500 AP) target alerts. Weekly checks produce a data-gap alert if snapshots are insufficient.
- Added a manual-action review queue. Onboarding/weekly shortfall alerts generate a removal recommendation. Admin approval is an audited decision only; it does not call the game. After an admin removes the player manually in FC Mobile, they can confirm completion with an audit note, and the tracker then marks that member removed.
- Added row-level security to the snapshot tables and a read-only RLS policy for action reviews. Approve/decline/complete operations run through server-side database functions that check the league_admin app-metadata role and enforce allowed status transitions.
- Added integration-stage and migration documentation to the repository.

## Verification performed

- Browser JavaScript syntax parsed successfully using a JavaScript parser.
- DOM audit found no missing or duplicate element IDs used by app.js.
- Supabase confirms all seven data tables relevant to this dashboard have RLS enabled.
- Supabase confirms the new snapshot tables and action-review table exist, and one existing shortfall review item was backfilled.
- Supabase confirms one active fcp-league-monitor cron job remains scheduled every 30 minutes.
- Existing security-advisor warning about leaked-password protection being disabled remains. The advisor also flags two SECURITY DEFINER RPCs as generally callable by authenticated users; those calls are intentional for this workflow and explicitly check the app_metadata league_admin claim before changing review status. Keep the admin claim restricted to trusted accounts.
- No real FC Mobile screenshot was available in this session, so OCR accuracy on the user's actual display remains unverified.

## Not implemented / not verified

1. **Live game data API:** No documented official FC Mobile league-member/AP endpoint was found in EA's public help/support materials. The community tracker found is screenshot/OCR-based, not a live API. The current fallback is screenshot review, not live ingestion.
2. **EA account connection:** Not implemented because no safe, documented authentication and data-access path has been verified. Do not enter EA credentials or session tokens into this website.
3. **Automatic kicking:** Not implemented. The workflow only tracks the human decision and manual completion; no game action is executed.
4. **Public Pages deployment:** The code is committed to main with cache-busted assets, but a real authenticated end-to-end test still requires signing into the dashboard and importing an actual roster screenshot. Do not regard this as a tested live data connector.
5. **Discord notifications:** Optional webhook delivery is not connected unless a secret has been configured in Supabase Vault.

## Next validation steps

- Sign out and sign back in to refresh the Supabase admin metadata claim.
- Import one real league member screenshot, check every value, save it, and confirm both the snapshot history table and AP history.
- Review a shortfall recommendation in the dashboard. Do not click "Confirm removed in game" until a real manual removal has occurred in FC Mobile.
- Keep public sign-ups disabled and only assign app_metadata.role = league_admin via a trusted admin path.
- Reassess a live connector only if EA publishes or confirms an authorized API/interface for league rosters and Activity Points.
