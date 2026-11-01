# Cairn

A cairn is a stack of stones that marks a trail.

Cairn is a small self-hosted tracker for money in and out toward a savings goal built from
milestones. One user, EUR and DZD with a rate on every record, daily backups to Google Drive.
It runs as two containers on a home server and is reached through a Cloudflare tunnel.

- **cairn-app**: Fastify API + the web app (PWA), SQLite in `./data/cairn.db`.
- **cairn-backup**: daily snapshot to `./backups` and Google Drive via rclone, 30 days kept.

## Setup

Needs Docker with Compose v2, `make`, and a user with uid 1000 (`id -u`); the containers write
`./data` and `./backups` as that user.

```sh
git clone git@github.com:lou-bou/cairn.git && cd cairn
make up       # first run creates .env from .env.example, then builds and starts
make ps       # both containers Up, cairn-app (healthy)
curl -s localhost:8080/api/health    # {"status":"ok"}  (use your PORT)
```

`.env` settings:

| Variable                | Default            | What it does                                                                       |
| ----------------------- | ------------------ | ---------------------------------------------------------------------------------- |
| `PORT`                  | `8080`             | Port the app listens on, inside and outside the container.                         |
| `BIND_ADDR`             | `127.0.0.1`        | Host address the port binds to. Keep it unless the tunnel runs on another machine. |
| `DEFAULT_RATE`          | `275`              | DZD per €1 seeded on first start. Change it later in Settings.                     |
| `TZ`                    | `Africa/Algiers`   | "Today", month boundaries and the backup schedule.                                 |
| `BACKUP_CRON`           | `0 3 * * *`        | When the daily backup runs (cron syntax, in `TZ`).                                 |
| `BACKUP_RETENTION_DAYS` | `30`               | Backups older than this are deleted locally and on Drive.                          |
| `RCLONE_REMOTE`         | `gdrive`           | rclone remote name, as shown by `rclone listremotes` (without `:`).                |
| `RCLONE_PATH`           | `cairn-backups`    | Folder on that remote.                                                             |
| `RCLONE_CONFIG_DIR`     | `~/.config/rclone` | Folder holding `rclone.conf` (`rclone config file` shows it).                      |

After editing `.env`, run `make up` again.

## Commands

```sh
make up             # build and start (or apply changes)
make down           # stop
make ps             # status and health
make logs           # follow logs
make backup         # run a backup now
make test-backup    # self-test backup, prune and restore on a throwaway database
make restore FILE=backups/cairn-<stamp>.db.gz
```

Updating: `git pull && make up`. Database migrations run on start.

## Cloudflare tunnel

Cairn has no login of its own; Cloudflare Access is the lock. Never publish the port directly.

1. Zero Trust dashboard → **Networks → Tunnels** → your tunnel → **Public hostname** → Add:
   subdomain `cairn`, your domain, service **HTTP** `localhost:<PORT>`.
   If `cloudflared` runs on a different machine, set `BIND_ADDR` to this server's LAN IP and use
   `<that IP>:<PORT>` as the service.
2. **Access → Applications** → Add → Self-hosted, application domain = that hostname.
   Policy: Allow, Include → Emails → your address. Login method: **One-time PIN**.
3. Open `https://cairn.<domain>`, sign in with the emailed code, and check the data loads.
4. On the phone: open it in the browser, then **Add to Home Screen** (Safari share menu, or
   Chrome ⋮ menu → Install app). It opens full screen and shows the last data when offline.

## Backups

Every day at `BACKUP_CRON` the backup container:

1. takes a consistent snapshot with SQLite's `.backup` (safe while the app is writing) and checks
   its integrity,
2. gzips it to `./backups/cairn-<date>-<time>.db.gz`,
3. uploads it with `rclone copy` to `RCLONE_REMOTE:RCLONE_PATH`,
4. deletes backups older than `BACKUP_RETENTION_DAYS` in both places,
5. writes `./backups/status.json`, which **Settings → Backups** shows. It warns when the last
   success is older than 36 hours or the last run failed, with the error.

Imports also save `./data/pre-import-<stamp>.db` before changing anything.

### Google Drive (rclone) setup

Once per server. If a Drive remote already exists, reuse it: put its name in `RCLONE_REMOTE`.

```sh
sudo apt install rclone
rclone config
```

`n` (new remote) → name `gdrive` → storage `drive` → client id and secret blank → scope `1`
(full access) → root folder and service account blank → advanced config `n` → auto config `n`
(the server has no browser). Run the `rclone authorize "drive" "…"` command it prints on any
computer with a browser and rclone, sign in, and paste the token back. Shared drive `n`, then
confirm.

Configure rclone as your normal user, not with sudo: the container runs as uid 1000 and reads
the config from `RCLONE_CONFIG_DIR` (read-write, so the Drive token can refresh). Check with:

```sh
rclone lsd gdrive:
make test-backup    # ends with "All backup checks passed."
make backup         # ok cairn-....db.gz -> /backups and gdrive:cairn-backups
```

### Restore

```sh
ls backups/                                       # pick a file
make restore FILE=backups/cairn-2026-11-02-030000.db.gz
```

`make restore` stops the app, checks the backup's integrity, keeps the current database as
`./data/before-restore-<stamp>.db`, puts the backup in place and starts the app again. A corrupt
file is refused without touching anything. It also accepts a plain `.db` file, such as a
`pre-import-*.db` or `before-restore-*.db`.

From Google Drive (server lost, or local copies gone):

```sh
rclone ls gdrive:cairn-backups
rclone copy gdrive:cairn-backups/cairn-2026-11-02-030000.db.gz backups/
make restore FILE=backups/cairn-2026-11-02-030000.db.gz
```

On a new server: clone, set up `.env` and rclone, `make up` once (creates the folders), then
restore as above.

## Develop

Needs Node 22 or newer (the image uses 24). No Docker required.

```sh
npm install
npm run dev     # API on :8080 (PORT), web on :5173 with /api proxied
npm run check   # typecheck, lint (ESLint + Stylelint), format check, tests
npm run brand   # regenerate logo, favicon and PWA icons from scripts/gen-brand.mjs
```

Code layout: `shared/` (money math, schemas, types), `server/` (Fastify, SQLite, migrations,
recompute), `web/` (React, Vite, PWA, themes), `backup/` (backup image and scripts). Design notes
and decisions are in `PLAN.md`.

- **Money** is stored as integer minor units (cents, centimes) and rates as integer thousandths;
  conversions use BigInt with round-half-up. `parseFloat` and `toFixed` are lint errors.
- **Themes**: every visual value is a CSS custom property in `web/src/themes/default.css`
  (light and dark). Lint rejects raw colors, fonts, radii and shadows in components. Open the app
  with `?theme=test` to see every component restyled by a deliberately loud test theme.

## Acceptance checklist

1. Add 1,000 DZD at rate 275: the row shows 1,000 DA, €3.64 is stored, the balance updates; the
   EUR/DZD toggle switches the display.
2. An IN that passes the Phase 1 threshold shows confetti and "You can afford Phase 1" once, not
   again after a reload.
3. An OUT below the threshold un-achieves it; going back above celebrates again.
4. Reordering milestones (Goal page, drag handle) recalculates thresholds and the progress trail.
5. A custom goal below the milestone total is rejected (or auto-raised with a notice after a
   milestone change); with no milestones any goal above 0 works.
6. Categories can't be added, renamed or deleted (no UI, no API, blocked in the database).
7. Changing the default rate leaves existing entries' rates as they were.
8. The count banner appears when due; a mismatch can create an adjustment entry.
9. `make backup` writes a local file and a Drive copy; files older than 30 days are removed from
   both (`make test-backup` proves it); Settings shows backup status.
10. Phone and laptop show the same data within about a minute (refetch on focus and every 60s).
11. Export JSON, then import it: nothing to import. Into an empty install: identical data.
12. No floats for money (integer storage, BigInt conversion, lint bans).
13. `?theme=test` restyles the whole app, charts and progress trail included.
14. Logo as SVG (mark, full, mono), favicon and PWA icons, legible at 16px, light and dark.
