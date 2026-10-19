# Vercel cron (demo heartbeat)

## Hobby plan

Vercel **Hobby** allows **one cron invocation per day** per project. `vercel.json` uses:

- `0 5 * * *` UTC (~08:00 EAT) → `/api/cron/demo-heartbeat`

Set **`CRON_SECRET`** in the project env. Vercel sends `Authorization: Bearer <CRON_SECRET>` on cron requests.

Do **not** run full catchup on Gantt page load (serverless timeout). Manual catch-up: `npm run demo:lab-allied:catchup` (local, with `DATABASE_URL`).

## Pro plan

To run every 30 minutes, upgrade to **Pro** and change the schedule in `vercel.json` to:

```json
"schedule": "*/30 * * * *"
```

Redeploy after changing.
