# Demo-golden Neon branch

A full Lab & Allied reseed can take ~29 minutes. After the plant data looks right, snapshot it so you can restore in about a minute.

## Once data is good

1. In the [Neon console](https://console.neon.tech), open the project that `DATABASE_URL` uses.
2. **Branches → Create branch**.
3. Name it `demo-golden`.
4. Parent = the current demo / production branch (the one the app uses).

Or with CLI (`npm i -g neonctl`):

```bash
export NEON_API_KEY=...
export NEON_PROJECT_ID=...
npm run demo:snapshot
```

## Before a meeting (if something breaks)

In Neon: open the live demo branch → **Reset from parent** / restore from `demo-golden`.

Or:

```bash
export NEON_API_KEY=...
export NEON_PROJECT_ID=...
export NEON_PARENT_BRANCH=production   # live demo branch name
npm run demo:restore
```

Then restart `npm run dev` (or redeploy) so Prisma reconnects.

Do **not** reseed unless you intend to rebuild history, packing WIP, and the schedule from scratch.
