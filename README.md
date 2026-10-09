# BracketForge

Tournament organizer for small gaming events (cafés, college clubs, local esports groups).
Organizers run brackets, players register, spectators follow a live bracket without logging in.

The app name, tagline, URL and support email come from one config file: `src/config/app.ts`
(overridable with `VITE_APP_*` environment variables).

## Stack
Vite + React + TypeScript + Tailwind. Backend: Postgres via Supabase (Auth, Storage, RLS).

## Setup
1. `npm install`
2. Copy `.env.example` to `.env` and fill in your Supabase URL and anon key.
3. Apply `supabase/migrations/*.sql` in order.
4. `npm run dev`

## Scripts
- `npm run dev` / `npm run build` / `npm run typecheck`
- `npm test` runs the bracket and result-engine tests.

More documentation (all environment variables, deployment guide, schema notes) is added as the project progresses.

## Hosting on Cloudflare Pages (recommended, free)
Build command `npm run build`, output `dist`. The `functions/` folder is picked up automatically. Environment variables:

| Variable | Where | Purpose |
|---|---|---|
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | build | browser client (anon key is public by design) |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | Pages runtime | used by `/api/v1/*` and WhatsApp preview tags |
| `SUPABASE_SERVICE_ROLE_KEY` | Pages runtime, **secret** | only used to claim/report webhook deliveries. Never expose in the browser |
| `APP_NAME` | Pages runtime | site name in link previews |

For webhook retries, add the GitHub repository secret `APP_URL` (see `.github/workflows/webhook-retry.yml`).

## Tests
- `npm test`: bracket engine, CSV, signing, link previews.
- `npm run test:db`: applies every migration to a scratch Postgres and runs the permission/privacy tests in `supabase/tests`.
  Needs a local Postgres and a database named `bf_test` (set `DB=name` to change).

Integration guide for cafés: `docs/INTEGRATION.md`.
