# StrengthBoard

A watchlist for your lifts. Every exercise you track sits on one screen as a dense row:
its trend, its last three sessions, the change since last time, estimated 1RM, and PR flags.
You can read the state of your training in a few seconds.

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # domain logic tests (vitest)
npm run build    # type-check + production build to dist/
```

## What's on a row

| Column | Meaning |
|---|---|
| Trend · 10 | Top-set weight over the last 10 sessions. Sage means up across the window, amber means down, gray means flat. Hover to see each session. |
| Last 3 sessions | Top set of each session, oldest → newest (`225×5 · 230×5 · 235×3`). |
| Δ Top | Latest top set compared with the previous session, with an arrow, sign, and %. |
| e1RM | Best estimated 1RM (Epley) in the latest session. A **PR** badge appears when it beats every earlier session. |
| Last | Time since you last trained it. A clock icon means more than 14 days ago. |

Click a row (its name, sparkline, or history) to open the full history: stats, a chart of top
set and est. 1RM per session, and a table of every set, newest first.

## Logging

Press **+** on a row. Weight and reps are prefilled from your last top set, and the date defaults to today.
Press **Enter** to log. The form stays open with the same values, so a repeat set is one keypress.
Press **Esc** to close it. The sets you've logged that day show as chips, and you can remove any of them.

## Organizing

- **Pin** your main lifts so they stay in the top group. Reorder by dragging the grip, using the keyboard
  (focus the grip, then Space, arrow keys, Space), or choosing Move up / Move down from the ⋯ menu.
- **Add exercise** (or press **N**) has autocomplete. It catches near-duplicates
  (`Bench` → *Bench Press*, `OHP` → *Overhead Press*, `pull-ups` → *Pull Up*, typos like `Sqaut`),
  offers to jump to the existing lift, and blocks exact duplicates.
- **/** focuses the filter. Category chips appear once you use two or more categories.

## Accounts and data

You sign in with email and password, and your lifts, sets and lb/kg choice live in your StrengthBoard account (Supabase). They show up on any device you sign in on. Light/dark theme is per device.

Changes appear instantly and upload in the background. With no signal, they wait on the device and upload when you're back online. The header shows **Saved**, **Saving...**, **Offline - N waiting** or **Couldn't save - retrying**. Other devices' changes appear when you reopen or switch back to the app.

The board starts empty. The menu in the header can export or import a JSON backup, or clear the board. Import uploads the backup into your account. Weights are stored in kg and converted for display, so the lb/kg toggle is lossless.

```ts
Exercise   { id, name, category?, pinned, createdAt }
WorkoutSet { id, exerciseId, date: 'YYYY-MM-DD', weight, reps, rpe?, notes?, createdAt }
```

## Setup

1. **Create a Supabase project** at supabase.com. Name it StrengthBoard.
2. **Create the tables.** In the project's SQL Editor, paste the contents of `supabase/migrations/001_init.sql` and run it.
3. **Allow the app's addresses.** Under Authentication, URL Configuration: set Site URL to your deployed address (for example `https://strengthboard.vercel.app`). Add `http://localhost:5173` and the deployed address to Redirect URLs, so confirmation and reset emails link back to the app.
4. **Keep email confirmation on** under Authentication, Sign In / Providers, Email. The built-in email sender is rate-limited, so add your own SMTP there before inviting many people.
5. **Connect the app.** Copy `.env.example` to `.env.local` and fill in the Project URL and the publishable key (Project Settings, API Keys). A legacy anon key also works. `.env.local` is git-ignored.
6. **Run it:** `npm install`, then `npm run dev`.
7. **Deploy on Vercel:** import the GitHub repo, add `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` under Environment Variables, and deploy. Then put the Vercel address into step 3.

## Design notes

- The colors come from **StrengthAI** (`../StrengthAI/src/index.css`), mapped by what they mean there:
  sage `#A8C9A2` for actions, gains and PRs; amber `#F2B544` for declines; coral `#F2705C` only
  for destructive actions; teal `#4C8E96` for the secondary chart series (est. 1RM). Surfaces are
  `#101211` / `#171A18` / `#141715` / `#1E2220`, borders `#272C29`.
- StrengthAI is dark-only. The light theme is derived from the same hues, with darker steps so the
  text clears WCAG AA and up/down stay distinct for colorblind readers. Direction is also shown by
  an arrow and a +/− sign, so it never relies on color alone.
- Dense, Swiss-minimal "stock watchlist" layout. Fira Sans for labels and Fira Code for numbers,
  so digits line up in columns.
- Visible focus rings, 44px touch targets on mobile, and `prefers-reduced-motion` support.
- Recharts is lazy-loaded the first time you open a history panel. The dashboard itself uses a
  hand-rolled SVG sparkline.

## Layout

```
src/
  App.tsx                 board shell, KPIs, filters, drag & drop, shortcuts, backup
  Root.tsx                setup notice, auth screens or the board
  store.ts                reducer and import validation
  auth/                   sign in, create account, reset password, session state
  sync/                   row mapping, remote ops, upload queue, cache, useSyncedStore
  lib/stats.ts            sessions, top sets, Epley e1RM, PR detection, summary
  lib/similarity.ts       fuzzy name matching and aliases, common-lift catalog
  components/             rows, sparkline, log form, history, add exercise, menus, sync status
supabase/
  migrations/001_init.sql tables, row-level security, reorder and replace functions
  tests/schema.test.ts    runs the migration in PGlite and checks the security rules
```
