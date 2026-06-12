# Salernidex

Relationship & context database for people, organizations, and connections across
professional (PACE Technologies), civic (MNA, Tucson Compass, Pima County), and
personal contexts. Built for instant context under time pressure: search a name,
get clarity in 2 seconds.

**Stack:** React (Vite) · Supabase (PostgreSQL + Auth + Realtime)

## Setup

### 1. Supabase (one time)

1. Create a project at [supabase.com](https://supabase.com) (free tier is fine).
2. In the dashboard, open **SQL Editor**, paste the contents of
   [`supabase/schema.sql`](supabase/schema.sql), and run it.
3. In **Authentication → Users**, click **Add user** and create the shared
   account (email + password) for you and your wife. Disable public signups in
   **Authentication → Sign In / Up** if you want it locked down.
4. In **Project Settings → API**, copy the **Project URL** and **anon public key**.

### 2. Local app

```sh
cp .env.example .env    # then paste your URL + anon key into .env
npm install
npm run dev
```

Open http://localhost:5173 and sign in with the account from step 3.

## Demo mode

With no `.env`, the app runs entirely in-memory: any login works, sample data is
loaded, and nothing persists. Adding real Supabase credentials switches it to live
mode automatically.

## Features

- **Search** — live fuzzy search across name, org, role, email, notes, tags;
  inline filters by organization, tag, and privacy level. `Ctrl/Cmd+K` focuses
  search anywhere.
- **Person pages** — every person has their own page (`#/person/<id>`, so
  back/forward and bookmarks work) with contact info (email, phone, address,
  birthday), notes, and the relationship web ("Also knows: …"), each connection
  one click away.
- **People** — add (`Ctrl/Cmd+N`), edit, soft-delete with restore (switch the
  Active/Deleted filter to find and restore).
- **Organizations** — typed orgs with descriptions, tags, and member lists.
- **Groups** — saved smart groups built from tag logic (ALL of / ANY of /
  NONE of); membership stays in sync automatically as tags change.
- **Relationships** — "A — knows → B" list, filterable to one person
  ("show me everyone X knows"), add/remove from any person's detail.
- **Import/Export** — CSV import with a column-mapping step; export CSV
  (people) or JSON (everything) anytime.
- **Multi-device** — Supabase Realtime keeps every open device in sync.
- Light + dark mode — follows the system by default, with a System / Light /
  Dark toggle in the sidebar (persisted per device).

## Deploy (Vercel or Netlify)

1. Push this folder to a Git repo.
2. Import the repo in Vercel/Netlify. Build command `npm run build`,
   output directory `dist`.
3. Add environment variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.

The anon key is safe to expose in the client; data access is protected by
Supabase Auth + Row Level Security (only authenticated users can read/write).
