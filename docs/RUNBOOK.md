# Runbook — IJHC Heritage Portal

For whoever is holding this at 02:00. No context assumed.

| | |
|---|---|
| Live site | https://heritage-portal-snowy.vercel.app |
| Hosting | Vercel, project `heritage-portal`, org `e-m1` |
| Database + files | Supabase project `llfwnitakmhuyexvqvft` (`ijhc-heritage-portal`), eu-central-1 |
| Code | `heritage-portal/` in this repository. `../project/` is the old demo — **never deploy it** |
| Secrets | `.env.local`, not in git. Vercel holds its own copy in project settings |

---

## Is it actually broken?

Run these before changing anything. All four should answer as shown.

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://heritage-portal-snowy.vercel.app/
curl -s -o /dev/null -w '%{http_code}\n' https://heritage-portal-snowy.vercel.app/portal
curl -s https://heritage-portal-snowy.vercel.app/portal | grep -oE 'href="/portal/[0-9a-f-]{36}"' | sort -u | wc -l
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://heritage-portal-snowy.vercel.app/api/analyze -H 'content-type: application/json' -d '{"path":"x"}'
```

Expected: `200`, `200`, `9` or more, `400`. A `500` on the first two, or
anything other than `400` on the last, is a real fault.

The third check counts links to record pages rather than grepping for the
"records published" line. React splits that line across text nodes in the
server-rendered HTML, so a grep for it matches nothing however the site is
behaving — a check that always fails is worse than no check. Counting links
also measures the thing that matters: records a visitor can actually open.

**Most likely cause, in order:** an expired or rotated Supabase key; Gemini
returning 503 (this is common and only breaks the analysis step, not the site);
Supabase paused for inactivity on the free plan.

---

## Roll the code back

The safest action and almost always the right first one. It does not touch data.

```bash
npx vercel rollback --yes
```

That promotes the previous production deployment. To pick a specific one:

```bash
npx vercel ls heritage-portal
npx vercel promote <deployment-url>
```

**Verify after:** re-run the four checks above. The site should serve the
previous build within about a minute.

### If you need to rebuild from source instead

```bash
cd heritage-portal
git log --oneline -10            # find the commit you want
git checkout <sha>
npm ci                           # the lockfile is the pinned set — do not npm install
npm run verify                   # typecheck + lint + 139 tests, all must pass
npx vercel --prod --yes
```

---

## Roll the database back

**A code rollback does not undo a migration.** Migrations are in
`supabase/migrations/`, applied in order. The recent ones and what undoes each:

| Migration | What it did | To undo |
|---|---|---|
| 0022 | `items.contributor_id` → `ON DELETE SET NULL` | Re-add the constraint without `on delete set null`. Safe to leave in place |
| 0021 | Vocabulary gained `branch_key`, `preferred_id`, `external_id` + a trigger | Columns are additive. `drop trigger keywords_variant_flat on keywords;` disables the variant rule without data loss |
| 0020 | `contributors` + `contributor_families` created; `items.contributor_key` dropped | **Not reversible without the backup.** `contributor_key` held HMACs that cannot be recomputed for deleted rows |
| 0018/0019 | The bin: `deleted_at`, `deleted_by`, `deleted_reason` | Additive. Clearing `deleted_at` on every row restores the pre-bin behaviour |
| 0017 | `items.contributor_email` dropped, moved to a table | **Not reversible without the backup** |
| 0015 | Published-record policies widened to `authenticated` | `alter policy items_public_select on items to anon;` and the two siblings |

**0017 and 0020 dropped columns. Those are the ones the backup exists for.**

## Restore data

```bash
cd heritage-portal
ls backups/                            # newest directory is the most recent run
npx tsx scripts/backup.ts --verify     # confirms the newest run is readable and complete
```

Each `backups/<timestamp>/` holds one JSON file per table and a `files/`
directory with every stored object, its storage path flattened with `__` in
place of `/`. `manifest.json` holds the expected row and byte counts.

Restoring is deliberately manual — there is no one-command restore, because a
restore is never routine and should be done by someone reading the data first.
Load a table with the service-role key and the JSON for that table, in the
order they appear in `TABLES` in `scripts/backup.ts` (parents before children).

**Take a fresh backup before restoring anything.** A restore over live data is
itself destructive.

---

## Rollback triggers

Roll back if any of these is true:

| Trigger | Measured how |
|---|---|
| `/` or `/portal` returns 5xx | the checks above |
| The portal shows fewer published records than the day before | the third check above |
| Any file on a published record 404s or 403s | open a record page, check the image loads |
| A contributor's upload fails at submit | the browser console on `/upload` |
| The review screen is reachable without signing in | `curl -o /dev/null -w '%{http_code}' …/review` must be `307` |

Gemini returning 503 is **not** a rollback trigger. It breaks the analysis step
only; contribution still works and the archive still serves.

---

## Who to call

Inon. There is no on-call rota and no second maintainer — which is itself worth
fixing and is recorded in the go-live report.

---

## What has no rollback

- **Purging a record from the bin** destroys the row and its file in storage.
  Only the backup brings it back, and only as far as the last run.
- **Erasing a contributor** is permanent. Their records survive and are
  unlinked; the person's name and address are gone.
- **Removing a vocabulary term** leaves the word on records already catalogued
  but makes it unchoosable, so the next review saved on one of those records
  drops it.

Each of these asks for confirmation and names what will be lost before it acts.
