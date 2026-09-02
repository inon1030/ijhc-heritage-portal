# IJHC Global Heritage Portal — Stage 1

A digital archive for the Indian Jewish Heritage Center, covering the Bene Israel, Cochin, Baghdadi and Bnei Menashe communities.

> **The Bolt demo in `../project/` is reference material only.** It is never modified, never deployed, and shares no database with this app. It exists so the original can be compared against, not built on. Anything you read there about wide-open RLS or a hardcoded editor password describes the demo, not this codebase.

## What Stage 1 does

The complete lifecycle the product outline calls for — **contribute → analyse → verify → publish → discover** — for the three item types the demo covered.

| Screen | Who can reach it |
|---|---|
| `/portal` — search and browse published records | Everyone |
| `/portal/[id]` — permanent record page | Everyone |
| `/upload` — contribute an item | Everyone |
| `/review` — the queue | Volunteers only |
| `/review/[id]` — verification workbench | Volunteers only |

Stage 2 adds contributor accounts and dashboards, category-specific forms, structured provenance, the Archivist/Expert split, the clarification loop, collections, access levels, and natural-language search. See `../PILOT WITH EREZ/06 — Roadmap.md`.

## Setup

**1. Create a Supabase project.** A new one — do not reuse the demo project.

**2. Configure the environment.**

```bash
cp .env.example .env.local
```

Fill in the project URL, anon key, and service role key. Add a free Gemini key from [aistudio.google.com/apikey](https://aistudio.google.com/apikey); without one the app runs a simulator that labels every value it produces as `DEMO — SIMULATED`.

**3. Apply the migrations,** in order, either through the Supabase SQL editor or the CLI:

```bash
supabase db push
```

**4. Create a volunteer account.** In the Supabase dashboard, Authentication → Users → Add user, with a confirmed email. A `profiles` row is created automatically by trigger, which is what grants review access.

**5. Seed the archive** (recommended before a demo):

```bash
npx tsx scripts/analyze-assets.ts
```

```bash
npm run db:seed
```

The first command runs Gemini over the images in `scripts/seed-assets/` and caches the results; it costs API calls, so it is separate and its output is committed. The second creates the records. Six are published and three wait in the review queue, so both screens have something real in them.

**6. Run it.**

```bash
npm run dev
```

## Verifying

```bash
npm run verify
```

Runs typecheck, lint, and the unit tests together. For the end-to-end permission suite:

```bash
npm run test:e2e
```

To check what the database says about each stored file against what the file's
own bytes say — recorded type and pixel dimensions — and correct any drift:

```bash
npm run db:reconcile
```

It reports and writes nothing. Add `-- --apply` to make the corrections.

## How it is put together

```
src/lib/ai/          AI providers behind one interface. Swapping vendors is one file.
src/lib/supabase/    browser / server / admin clients
src/lib/items/       every query and mutation in the app
src/lib/files/       storage paths, validation, real metadata extraction
src/app/api/         the HTTP surface, and the seed of the future public API
src/components/      presentational; data arrives as props
supabase/migrations/ schema, RLS, storage
```

Three rules hold the design together:

**AI suggests, humans verify.** Model output is written to `ai_analyses` and never to `items`. The public portal reads `items`. A suggestion becomes part of the record only when a reviewer adopts it, field by field, in the workbench.

**Nothing is invented.** File size, dimensions, and duration are measured from the bytes. When they cannot be determined the interface says "not measured" rather than showing a plausible number.

**Permission is enforced three times.** In RLS, in the route handler, and in what gets rendered. Hiding a button is not access control.

## Deploying

Vercel plus Supabase cloud. Set the same four environment variables in the Vercel project; `SUPABASE_SERVICE_ROLE_KEY` and `GEMINI_API_KEY` must never carry the `NEXT_PUBLIC_` prefix.
