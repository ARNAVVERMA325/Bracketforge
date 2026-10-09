# Connecting a café website

Organizers do this in **Settings → Connect your website**. Nobody retypes registrations.

## 1. Send registrations from the café's backend
```bash
curl -X POST https://YOUR-APP/api/v1/players \
  -H "Authorization: Bearer bf_xxx" -H "Content-Type: application/json" \
  -d '{"tournament":"slug","name":"Ravi","phone":"9876543210","team_tag":"RK","character_loadout":"Kazuya","status":"approved"}'
```
`status` is `pending` (default) or `approved`. Success is `201 {"ok":true}`. Errors: `401 invalid_key`, `404 tournament_not_found`,
`409 already_registered | tournament_full | registration_closed`, `422 invalid_phone | invalid_name | invalid_status`, `429 rate_limited`.
A key can only write to its owner's tournaments. Keep it on the server; revoke it any time.

## 2. Receive a copy (webhook)
Set an https URL. Events: `player.registered`, `match.completed`, `webhook.test`. Body:
`{"id":12,"event":"player.registered","created_at":"...","data":{...}}`. Respond with any 2xx. Failures retry (5 min, 30 min, 2 h, 12 h, then stop).

Verify the signature (Node):
```js
const crypto = require('crypto');
function verify(req, rawBody, secret) {
  const ts = req.headers['x-webhook-timestamp'];
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false;           // reject old requests
  const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(`${ts}.${rawBody}`).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(req.headers['x-webhook-signature']));
}
```
Use `X-Webhook-Id` to ignore duplicates (delivery is at-least-once).

## 3. No developer? Embed instead
Dashboard → tournament → Embed gives one-line iframes for the live bracket and the registration form.

## 4. Show the bracket on your own page
`GET /api/v1/tournaments/<slug>` returns tournament, players (names only) and matches as JSON. No phone numbers. CORS open, cached 15 s while live.

## 5. Already have a list?
Players tab → Import players (CSV).
