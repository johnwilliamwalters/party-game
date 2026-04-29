# Fresh start (local app + Supabase)

Use this when things feel out of sync with the database or you want a clean reinstall.

## A. Reset only data (keep tables & keys)

Best for “clear the game” without touching schema.

1. Supabase → **SQL Editor** → paste and run **`supabase-reset-data.sql`**.
2. On each phone, clear site data for your app URL (or use a private window) so old `session_id` values don’t confuse join.

Your `.env.local` and deployed keys stay the same.

---

## B. Full database reinstall (drop tables, recreate)

Use when schema drift, broken constraints, or you want to match the repo exactly.

1. Supabase → **SQL Editor** → run **`supabase-teardown.sql`** (drops all party-game tables).
2. Run **`supabase-schema.sql`** end-to-end (greenfield schema: tables with inline FKs, RLS, realtime).

`supabase-schema.sql` is written for a **clean install** (after teardown or a new project). Do not rely on it alone to migrate an old DB in place—use teardown first.

RLS policies were renamed to `party_game_all_*`; old `allow full access *` policies are dropped if present.

---

## C. Local Next.js app clean install

From the project root:

```bash
rm -rf .next node_modules
npm install
npm run build
```

Restart dev server:

```bash
npm run dev
```

---

## D. Environment variables

1. Supabase → **Project Settings** → **API**.
2. Copy **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`.
3. Copy **anon public** key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
4. Put both in **`.env.local`** (same folder as `package.json`).
5. Restart `npm run dev` after any `.env` change.

Never commit `.env.local` to git.

---

## E. Quick health check

After B + D, open **Admin** and confirm **Live Session Stats** loads without console `[party-game]` errors. Push **Save Setup** with 2+ options and 1+ question, then **Push Next Queued Question**.
