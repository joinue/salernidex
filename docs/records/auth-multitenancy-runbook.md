# Auth + multitenancy go-live runbook

> **Record** — historical. Written and executed June 2026.
> **This cutover already happened.** Auth, create-or-join-by-code onboarding,
> household switching, and per-household RLS isolation are all live; migrations
> through `0033` are applied. The "apply the SQL migration and flip the Auth
> settings" instructions below are **not** work to be done.
> Kept as the record of how the live project was configured — the Supabase Auth
> dashboard settings in §1 are still the settings in force, so this is the place
> to look when reproducing the project or debugging a redirect-URL problem.

What ships in this change: a real auth flow (sign-in / sign-up / password-reset),
a desktop landing page, an onboarding step that **creates or joins a household by
invite code**, a **Demo** button that opens the in-memory sample app, and full
**per-household data isolation** at the database.

The app code is done. The one thing only you can do is apply the SQL migration to
the live project and flip a couple of Supabase Auth settings. App + SQL must land
**together** — once the migration runs, RLS rejects any insert without a
`household_id`, and before it runs the app's `household_id` column doesn't exist.
You control both, and you're the only live user, so a coordinated cutover is safe.

---

## 1. Supabase Auth settings (Dashboard → Authentication)

- **Email confirmation** (Providers → Email → "Confirm email"): either setting
  works — the sign-up screen detects it. ON → new users see "Confirm your email";
  OFF → they go straight to onboarding. Pick what you want; no code change.
- **URL configuration → Redirect URLs**: add your site origin(s) (e.g.
  `http://localhost:5173`, your production URL). The password-reset email links
  back to the origin (`resetPasswordForEmail(..., { redirectTo: window.location.origin })`).
- **Email templates** (optional polish): tweak the Confirm-signup and Reset-password
  templates to say "Salernidex".

> Completing a password reset from the emailed link (setting a new password) is not
> built in this pass — the reset email currently lands the user back on the sign-in
> screen. Add a `type=recovery` handler later if you want in-app password change.

## 2. Apply the migration

Run `supabase/migrations/0001_multitenancy.sql` once (SQL editor or
`supabase db push`). It:

1. Adds `household_id` to every data table (people, organizations, relationships,
   interactions, families, key_dates, groups, tasks, task_completions, task_links,
   lists, list_items), backfills existing rows to the first household, makes it
   `not null` + FK + index.
2. Replaces the open `"authenticated full access"` policies with
   `"household members"` policies (`is_member(household_id)`), keeping the
   "Private — only me" clause on the four tables that have `privacy_level`.
3. Makes `organizations.name` unique **per household** instead of globally.
4. Converts `tasks.assignee` and `task_completions.completed_by` from label text
   to `uuid` FKs into `household_members` (legacy non-uuid values → null = "Anyone").

**Order matters / backfill:** the migration has a preflight that stops with a clear
message if you have data rows but **no** `households` row. If your live project is
empty (just the schema + a verified login, no contacts yet) it runs clean. If you
already created contacts on the old build, create a household first (sign up +
onboarding once on the new build, or insert a `households` row) so the backfill has
somewhere to put them.

## 2b. Confirm RLS is actually ON (SQL — do not skip)

The behavioral checks in §4 prove a policy *works*; they do **not** prove RLS is
*enabled* on every table. A single table left with `rowsecurity = false` leaks
across households silently and a happy-path test won't catch it. Run this in the
SQL editor — **both result sets must be empty / zero:**

```sql
-- (a) Any public data table with RLS disabled? Expect ZERO rows.
select c.relname as table_without_rls
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relrowsecurity = false
  and c.relname in (
    'people','organizations','relationships','interactions','families',
    'key_dates','groups','tasks','task_completions','task_links',
    'lists','list_items','households','household_members','member_preferences'
  );

-- (b) Any of those tables with ZERO policies? Expect ZERO rows.
select t.relname as table_without_policy
from pg_class t
join pg_namespace n on n.oid = t.relnamespace
left join pg_policy p on p.polrelid = t.oid
where n.nspname = 'public' and t.relkind = 'r'
  and t.relname in (
    'people','organizations','relationships','interactions','families',
    'key_dates','groups','tasks','task_completions','task_links',
    'lists','list_items','households','household_members','member_preferences'
  )
group by t.relname
having count(p.polname) = 0;
```

If either returns rows, fix before deploying: `alter table public.<name> enable row level security;` and/or add the missing policy from the migration.

## 3. Deploy the new build

Deploy the app build that matches this migration. From here the flow is:

- Logged-out users hit the **landing/sign-in** page (desktop: hero + auth card;
  mobile: a single card). "Explore the demo" opens the sample app on fictional data.
- **Sign up** → (confirm email if enabled) → **Onboarding**: enter your name, then
  **Create a household** (`create_household` RPC) or **Join with a code**
  (`join_household` RPC).
- The join code lives in **Settings → Invite** — share it; the other person signs
  up and joins with it. Regenerate it there after they're in (the code is the
  credential).
- Settings also has the member list (rename yourself; owners can rename/remove
  others), a **household switcher** if you belong to more than one, and **Leave
  household**.

## 4. Verify live (quick pass)

1. Sign up account A → create "Our Household" → land in the app, add a contact.
2. Settings → Invite → copy the code. Sign up account B (separate browser) → join
   with the code → both see the shared household; A's contact is visible to B.
3. A third household (account C, create) must **not** see A/B's data (RLS isolation).
4. Mark a contact "Private — only me" as A → invisible to B (client filter + RLS).
5. Assign a task to a member and check it off → completion shows the right name;
   rename a member → the label updates everywhere (member ids are uuid-stable).

## Out of scope (still demo-first localStorage; revisit at the push go-live)

- `notification_prefs` and `push_subscriptions` are not yet DB-backed — prefs/snoozes
  live in localStorage and round-trip through the JSON backup. Push delivery itself
  is the separate Phase 6b runbook (`docs/phase6-reminders.md`).
- The `privacy_level` enum value `'marc_only'` is kept (the app and the new policies
  both use it). Renaming it to a generic `'private'` is an optional follow-up — do
  the enum rename and the `lib/privacy.js` / migration edits together.
