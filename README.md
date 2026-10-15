# FCP League Manager 27

A GitHub Pages dashboard for tracking league members and activity points.

## Supabase setup

1. In Supabase, open **Authentication → Sign In / Providers** (or Authentication settings) and turn off public sign-ups.
2. Open **Authentication → Users** and create an admin user with your own email and a strong password. Do not put the password in GitHub.
3. Open **SQL Editor**, open the `supabase-setup.sql` file in this repository, copy its contents into the editor, and run it.
4. Open the published GitHub Pages site and sign in using that admin account.
5. Add members and use **Update AP** to save manual point snapshots.

## Current limitations

- Member names and manually entered AP snapshots are saved in Supabase.
- AP is not read automatically from FC Mobile.
- Weekly AP calculations, scheduled alerts, and automatic kicking are not yet implemented.
- Automatic game access requires a verified, supported integration.
- The Supabase publishable key in `app.js` is designed for browser use. Keep Row Level Security enabled, disable public sign-ups, and never expose a service-role/secret key.
