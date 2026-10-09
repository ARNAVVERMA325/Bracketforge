# How to test properly

Do these in order. Stop at the first failure and fix it before going on. Use a **fresh Supabase project** and a real phone.

## 0. Automated checks (2 minutes)
```bash
npm install
npm run typecheck          # expect no output errors
npm test                   # expect: 45 passed (brackets, correction, TV sections, CSV, signing, link previews)
```
**Do NOT run anything from `supabase/tests/` in the Supabase SQL Editor.** Those files are for a throw-away local Postgres only
(`npm run test:db` needs Linux/macOS/WSL, bash and a local Postgres with a database named `bf_test`; it expects 88 PASS).
On Windows without those, skip it: I already ran it, and your manual checks below cover the same rules.
The only SQL you run on Supabase is `supabase/migrations/*.sql`.

`test:db` proves the rules on a real database: phones never in public data, organizers can't see each other's data,
referees and API keys can only do their one job, disabled organizers are blocked, unpaid tournaments can't go live.

## 1. Setup
1. Supabase → new project. SQL Editor: run `supabase/migrations/*.sql` **in file order, 001 to 014**, one at a time. Any red error = stop and send it to me.
2. Authentication → turn off "Confirm email" while testing.
3. `.env` from `.env.example` (URL + anon key). `npm run dev -- --host`, open the shown `http://192.168.x.x:5173` on your phone (same Wi-Fi).
4. Sign up with your own email, then in SQL Editor: `UPDATE profiles SET role='super_admin' WHERE email='YOU@example.com';` and log in again.
5. Use two browsers (one normal, one private window) for two different organizers later.

Local dev has no `/api/*` (Cloudflare functions). Public pages fall back to the database, so steps 2 to 6 work locally.
Steps 7 to 9 (API, webhook, link previews, caching, frame headers) need the **deployed Cloudflare Pages site** (see README).

## 2. Acceptance checks from your spec
| # | Do | Expect |
|---|---|---|
| 1 | Organizer: create 16-player single elimination, add 16 players (Players tab), check them in, Generate bracket, set Live, enter all results | Winner advances each time; champion shown; podium on public page |
| 2 | Same with 11 players | 5 byes, given to seeds 1 to 5, those players already in round 2 |
| 3 | Open `/t/<slug>` on your phone, logged out | Bracket visible; refreshes by itself every 15 s only while Live |
| 4 | Open `/t/<slug>/register`, register `9876543210` twice (also as `+91 98765 43210`) | Second attempt says already registered |
| 5 | View page source, DevTools → Network on the public page, and run `curl <APP>/api/v1/tournaments/<slug> \| grep -i phone` | No phone number anywhere (grep prints nothing) |
| 6 | `cd docs && python3 -m http.server 8081`, open `http://localhost:8081/embed-test.html?app=<APP>&slug=<slug>` | Bracket + form show inside the page, JSON says "OK: no phone". Test on the deployed site (headers) |
| 7 | Organizer B (private window) | Cannot see A's tournaments. Referee (section 4) can only enter scores |
| 8 | `/admin` as super-admin | List organizers, disable one (they get signed out on next login), mark a tournament Paid, revenue updates |

## 3. Break-it security tests (copy-paste, replace URL and ANON key)
```bash
URL=https://YOURPROJECT.supabase.co; KEY=YOUR_ANON_KEY
curl -s "$URL/rest/v1/players?select=phone"       -H "apikey: $KEY" -H "Authorization: Bearer $KEY"   # expect permission denied
curl -s "$URL/rest/v1/tournaments?select=*"       -H "apikey: $KEY" -H "Authorization: Bearer $KEY"   # expect permission denied
curl -s "$URL/rest/v1/matches?select=*"           -H "apikey: $KEY" -H "Authorization: Bearer $KEY"   # expect permission denied
for i in $(seq 1 12); do curl -s -X POST "$URL/rest/v1/rpc/register_player" -H "apikey: $KEY" -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" -d "{\"p_slug\":\"SLUG\",\"p_name\":\"Spam $i\",\"p_phone\":\"98000000$((10+i))\"}"; echo; done   # expect rate_limited from the 11th
```
Also: as organizer, try to set a tournament Live while unpaid and "free during beta" is OFF (admin page) → message says payment is required.

## 4. Referee, correction, audit
1. Live tournament → Settings tab → Generate referee code. On your phone (private tab): `/referee/<slug>`, enter code, score a match.
2. Wrong code 3 times → "Wrong referee code". Try to re-score the same match → "already entered".
3. As organizer, click the correction (refresh) icon on a completed round-1 match and re-enter a different winner. Later rounds clear and replay correctly.
4. Settings → Result history shows every change with who (referee/organizer), old and new winner and score.

## 5. Stations, café TV, OBS (new)
1. Live tournament, Matches list: type `Station 1` / `Station 2` into the Station box of two ready matches, press the play icon on both (several "On now" at once is allowed).
2. Open `/t/<slug>/tv` on the café TV browser: Now playing (with station), Next up, latest results. Full screen (F11). It should keep the screen awake and refresh every 15 s.
3. Enter a result: the TV updates within ~15 s. Finish the tournament: the TV shows champion, 2nd, 3rd.
4. OBS → Sources → Browser → URL `/t/<slug>/overlay`, size 1280x200: transparent lower-third that cycles through matches on now.

## 6. CSV
Players tab → Import `docs/sample-players.csv`. Expect 3 imported, 2 skipped (bad phone, duplicate). Then export players and results and open in Excel/Sheets.

## 7. Connect a website (deployed site)
1. Settings → Connect your website → Create API key (copy it; shown once).
2. Run the `curl` shown there. Player appears in the tournament. Same phone again → `409 already_registered`. Wrong key → `401`.
3. Revoke the key, repeat → `401`.
4. Webhook: open webhook.site, copy your URL, paste as webhook, Save, **Send test**. A request arrives with headers `X-Webhook-Signature` and `X-Webhook-Timestamp`.
   Verify the signature with the Node snippet in `docs/INTEGRATION.md` using your secret. Register a player: a `player.registered` event arrives.
5. Make the receiver return an error (webhook.site → custom response 500): the dashboard shows "retrying", and it is retried later (GitHub cron).

## 8. Link previews and caching (deployed site)
1. Paste `https://YOUR-APP/t/<slug>` into WhatsApp (message yourself): poster, title, game/date/venue appear. (WhatsApp caches previews, so test with a new slug if you change the poster.)
2. Open the public page on 5 devices at once for 2 minutes during a live tournament. Supabase → Logs → API: you should see about 4 `public_tournament_bundle` calls per minute in total, not 20.

## 9. Bandwidth (requirement J, measured on a 16-player tournament)
- One public data load is about **10 KB** uncompressed (about 2.5 KB gzipped).
- Without caching: 240 refreshes/hour per viewer = about 2.4 MB/hour per viewer.
- With the edge cache: about 2.4 MB/hour per tournament **in total**, however many people watch.
- Check yourself: DevTools → Network on the public page, and Supabase → Reports → Egress before and after a rehearsal.

## 10. Rehearsal before a real event
1. Export players CSV the night before. 2. TV page open and tested on the café TV. 3. Referee code generated and tested on the referee's phone.
4. Phone on mobile data (not café Wi-Fi) opens the public link. 5. Have the paper fallback: you can always export results to CSV.
If anything fails, send me: what you did, what you expected, what happened, and a screenshot of the browser console (F12).
