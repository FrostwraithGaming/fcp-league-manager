# FCP League Manager 27 — Deployment and Connection Guide

## After this update

1. Open the [dashboard](https://frostwraithgaming.github.io/fcp-league-manager/?refresh=20261015d).
2. Sign out and sign back in once to refresh the `league_admin` app-metadata role.
3. Check **Alerts & review queue**. Alerts are recorded in Supabase, even if no external alert channel is configured.
4. Upload a clear FC Mobile League → Members screenshot, carefully review every detected name and AP, and then save.

## Optional Discord notifications

Scheduled checks already run in Supabase. For external notifications, create a private Discord webhook for a channel you control. Do not put the URL in browser code or commit it to GitHub.

In the Supabase SQL Editor, run the following command after replacing the placeholder with your webhook URL:

```sql
select vault.create_secret(
  'PASTE_YOUR_DISCORD_WEBHOOK_URL_HERE',
  'discord_webhook_url',
  'FCP League Manager alert delivery'
);
```

Keep the resulting secret private. If you replace a webhook later, update the existing Vault secret using Supabase Vault tools rather than exposing it in a public file. In-dashboard alerts work without Discord.

## FC Mobile live connection

No verified supported data source for current league members and AP has been confirmed. Do not supply your EA password, session cookies, or access tokens to unofficial tools. The current screenshot/manual intake is intentionally review-before-save. A true live connector must be based on an authorized, tested source and should write snapshots into the existing `league_members` and `activity_history` tables.

## What is not automated

The system flags shortfalls but does not kick members in-game. There is no verified supported in-game membership-management interface wired to this project. Review alerts and take any removal action manually.
