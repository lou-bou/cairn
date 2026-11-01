# Cairn: Build Plan

Source of truth: `cairn_spec.md` (v3). This plan covers how the spec gets built. It does not re-decide anything the spec settles.

## Repo layout

npm workspaces, TypeScript throughout.

```
cairn/
  shared/        money math, types, validation schemas (used by server + web)
  server/        Fastify + better-sqlite3, migrations, routes, recompute logic
  web/           React + Vite, PWA, themes, logo assets
  backup/        Dockerfile + backup.sh + restore.sh (sqlite3, rclone, supercronic)
  design/logo-concepts/   the 3 logo concepts (chosen + 2 alternates)
  docker-compose.yml  Dockerfile  .env.example  Makefile  README.md
```

## Key technical decisions

**Money (no floats, AC 12)**
- Amounts: integer minor units (cents / centimes).
- **Rate: stored as an integer in thousandths** (`rate_milli`, so 275 DZD/EUR = `275000`). Black market rates like 262.5 stay exact. The API and UI accept a decimal string ("262.5") and parse it to an integer without going through `Number` float math.
- DZD→EUR: `eur_cents = roundHalfUp(dzd_centimes × 1000 / rate_milli)`, done with BigInt. Example: 1,000 DZD = 100000 centimes → 100000×1000/275000 = 363.6 → **364 = €3.64** (AC 1).
- EUR→DZD (display only): `eur_cents × rate_milli / 1000`, rounded half up, shown without decimals.
- All of this lives in `shared/money.ts`, with unit tests. A lint rule plus a grep check in CI block `parseFloat`, `toFixed`, and `/ 100` on money paths.

**Recompute**
- One `recompute(db)` function, run inside the same `db.transaction()` as every write that touches transactions, milestones, or the goal. It computes the balance, the cumulative thresholds, and the goal amount (auto or custom). It then sets or clears `achieved_at` and `celebration_seen` as spec §5 describes, and applies the custom-goal auto-raise and the switch from auto to custom when the last milestone is deleted. Each mutating response carries `notices[]` (for example "Goal raised to €X").

**Validation**
- Zod schemas in `shared/`, used by the server (Fastify) and by forms in the web app. Clear error messages.
- Categories are seeded by migration. They have no write routes at all, and DB triggers block UPDATE and DELETE on `categories` (AC 6).

**IDs**
- Transactions, milestones, and reconciliations use UUIDs, not auto-increment integers. The same ID in two exports then really means the same record, which is what makes merge-import safe.

**Import (merge, not replace)**
- `POST /api/import` runs in two phases: `?dryRun=1` returns a preview, then the real call applies it in one DB transaction (with an automatic local backup first).
- Each incoming record is matched by UUID:
  - **New** (ID not in the DB): added.
  - **Identical** (same ID, same content): skipped silently.
  - **Conflict** (same ID, different content): the user chooses, like the Windows copy dialog, **Replace**, **Keep both**, or **Skip**, with "apply to all".
- **Keep both** gives the incoming copy a new UUID. Milestones get a Windows-style suffix: `Car` → `Car (1)`, then `Car (2)`, using the next free number. Transactions have no name, so they're added as a separate entry; the preview flags them as possible duplicates.
- **Goal and settings** are single records, so they can't be merged. The user chooses "keep current" (default) or "use imported".
- **Categories** are fixed, so they're matched by key and never imported.
- Afterwards, `recompute()` runs once. Merged milestones are appended after the existing ones, and any goal auto-raise shows up as a notice.
- Round-trip test (AC 11): export, then import into an empty DB, must give identical data. Importing the same file twice must change nothing.

**Migrations**
- Numbered SQL files run at startup and tracked in `schema_version`. WAL mode, `foreign_keys=ON`. Seed data (§6) goes in a migration that runs once.

**Frontend data**
- TanStack Query with `refetchOnWindowFocus` and `refetchInterval: 60s` while visible (AC 10). The query cache is persisted to IndexedDB so the app can show the last data offline in read-only mode, with an "Offline" pill. Write buttons are disabled while offline.
- PWA via `vite-plugin-pwa`: app shell precached, API calls network-only.
- Display currency and theme are localStorage preferences.

**Theming (AC 13)**
- `web/src/themes/default.css` defines tokens on `[data-theme="default"]`, with a dark variant via `prefers-color-scheme`. `themes/registry.ts` lists the themes. A `useTheme()` hook sets `data-theme` on `<html>`.
- Components use CSS Modules that reference only `var(--…)` tokens. A Stylelint rule bans raw colors, `px` radius and shadow values, and font-family literals outside `themes/`.
- Charts (Recharts) and the progress bar read tokens through `getComputedStyle` and re-read them when the theme changes.
- A deliberately ugly `test` theme (thick borders, square corners, monospace, different accent) is registered in dev builds only, to prove AC 13. The Settings theme picker exists behind a `SHOW_THEME_PICKER` flag that is off.

**Logo**
- Three hand-written SVG concepts in `design/logo-concepts/`. The chosen one is turned into `logo-mark.svg`, `logo.svg`, and the monochrome version, all using `currentColor` and CSS variables.
- PNG/ICO icons (192, 512, maskable 512, apple-touch, favicon.ico) are rasterized once by `scripts/gen-icons.mjs` (sharp + png-to-ico) using the default theme colors, and committed. Raster files can't follow tokens; the inline SVGs can.

**Backups**
- `cairn-backup` container: Alpine + sqlite3 + rclone + supercronic, schedule from `BACKUP_CRON` (default `0 3 * * *`).
- It mounts `./data` read-write (see Open items for why) but never modifies the DB: `.backup` is a read-only operation that only touches the `-shm` lock file.
- Each run: `sqlite3 data/cairn.db ".backup /tmp/snap.db"` → gzip → `cairn-YYYYMMDD-HHMMSS.db.gz` in `./backups`. Then `rclone copy` to `${RCLONE_REMOTE}:${RCLONE_PATH}`, prune local with `find -mtime +30 -delete` and the remote with `rclone delete --min-age 30d`, and write `backups/status.json`.
- The app mounts `./backups` read-only to serve `/api/backup/status`.
- `make restore FILE=…` stops the app, gunzips the backup over the DB (keeping a copy of the current DB), removes the old `-wal`/`-shm` files, and starts the app again. It has a scripted test.

## Build steps (each one ends with a working app and a commit)

1. **Scaffold.** Workspaces, TS config, ESLint, Prettier, Stylelint, Vitest. Fastify serves `/api/health` and the built Vite app. Dockerfile, compose (app service only), `.env.example`, Makefile.
2. **Money core.** `shared/money.ts` (parse, convert, format) with thorough tests, including the AC 1 case and half-up edge cases.
3. **DB and seed.** Migrations, schema from §4, fixed categories with their colors, seed goal and milestones (§6), settings.
4. **Transactions API and recompute.** CRUD, `recompute`, celebrations/seen, summary. API tests for AC 1–3, 5–7.
5. **Milestones and goal API.** CRUD, reorder, auto/custom rules, notices. Tests for AC 4 and 5.
6. **Design foundation.** No external references: work from spec §14 (soft fintech + minimal neutral base). Write the token file, theme registry, test theme, and Stylelint guard. Three logo concepts, pick one, generate the icon set.
7. **App shell.** Header with mark and wordmark, EUR/DZD toggle, mobile bottom nav and desktop side nav, offline indicator, PWA manifest and service worker.
8. **Dashboard.** Balance card, progress bar with staggered milestone markers, next and affordable text, quick-add sheet (aiming for under 10 seconds), recent transactions, confetti and toast, and the top-stone bounce on the goal.
9. **Transactions screen.** List, filters, search, edit, delete.
10. **Goal and milestones screen.** Editing, reorder (drag plus up/down buttons), inline validation.
11. **Stats.** Summary cards, balance line with threshold lines, monthly grouped bars, category breakdowns, ranked lists, range selector.
12. **Reconciliation.** Due logic (weekly or monthly, snooze), banner, count flow, adjustment transaction, history. AC 8.
13. **Settings, export and import.** Rate, reminder settings, categories (read-only), JSON and CSV export, JSON merge-import with a preview screen and Replace / Keep both / Skip choices for conflicts. AC 11 round-trip and idempotency tests.
14. **Backups.** Backup service, status endpoint and UI warning (older than 36h), restore command and its test. Run against a real rclone remote, or a local rclone remote in CI. AC 9.
15. **Design pass.** Review each screen against the §14 rules and its "avoid" list at phone and laptop widths, in light and dark and in the test theme, and fix what falls short.
16. **README.** Setup, Cloudflare tunnel pointing at `127.0.0.1:${PORT}`, rclone Google Drive setup, backup and restore, the AC checklist.

## Open items / risks

- **Design references:** there are none (decided). The spec §14 default theme is the only design input.
- **Backup mount (deviation from spec §12):** the backup container mounts `./data` **read-write** but only ever reads from it. A WAL-mode reader must write to the `-shm` lock file, so a read-only mount is fragile. Everything else in §12 stands.
- **Commits** are authored by the user only, with no co-author trailers.
