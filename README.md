# FCP League Manager 27

A GitHub Pages dashboard using Supabase for saved member records and activity history.

## Admin and database setup

1. Keep public sign-ups disabled in Supabase Authentication settings.
2. Create only trusted admin users under Authentication → Users.
3. Apply the RLS policies in `supabase-setup.sql` if not already applied.
4. Sign in at the GitHub Pages site.

## Activity intake

The dashboard supports browser-side OCR from screenshots of the FC Mobile League → Members screen. Choose screenshots, scan, review/edit detected rows, and save selected readings to Supabase. OCR is not guaranteed to be accurate; always check the names and AP before saving. For the first import, choose **First scan — existing roster**. For later scans choose **Routine scan — detect new members**.

OCR runs in the browser through Tesseract.js. This is not a live game connection, does not use EA account credentials, and does not keep a phone or PC running in the background. A manual screenshot upload is required for each refresh.

## Current limitations

- No verified official FC Mobile API for live league-member/AP polling was found.
- Newly detected member onboarding time is based on first appearance in a screenshot, not an official game join event.
- Weekly AP-delta summaries and scheduled reminders are not yet implemented.
- The website does not automatically remove/kick anyone. A supported integration would be required for automatic in-game actions.
- Keep Row Level Security enabled and never expose a Supabase service-role/secret key in browser code.
