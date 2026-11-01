# cairn

A cairn is a stack of stones that marks a trail.

Cairn is a small self-hosted tracker for money in and out toward a savings goal built from milestones. Full docs come with the last build step; see `PLAN.md` for progress.

## Run with Docker

```sh
make up      # creates .env from .env.example on first run, then builds and starts
make ps      # status + health
make logs
make down
```

The app listens on `127.0.0.1:8080` by default (`PORT` and `BIND_ADDR` in `.env`).

## Develop

Requires Node 22+.

```sh
npm install
npm run dev     # API on :8080, web on :5173 (proxies /api)
npm run check   # typecheck, lint, format check, tests
```
