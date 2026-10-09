import { Env, json, rpc } from '../../_lib/api';
import { signWebhook } from '../../_lib/signing';

// Sends due webhook events. Safe to call by anyone/any time: it only delivers what is already queued.
// Call it from a 5-minute cron (GitHub Actions) for retries; the app also calls it after each registration.
let lastRun = 0;

export const onRequestPost = async ({ env }: { env: Env }) => {
  if (!env.SUPABASE_SERVICE_ROLE_KEY) return json({ error: 'not_configured' }, 500);
  const now = Date.now();
  if (now - lastRun < 3000) return json({ skipped: true });
  lastRun = now;

  const claim = await rpc(env, 'webhook_claim', { p_limit: 20 }, env.SUPABASE_SERVICE_ROLE_KEY);
  if (!claim.ok || !Array.isArray(claim.data)) return json({ error: 'claim_failed' }, 502);

  let delivered = 0;
  let failed = 0;
  await Promise.all(claim.data.map(async (ev: any) => {
    const body = JSON.stringify({ id: ev.id, event: ev.event, created_at: ev.created_at, data: ev.payload });
    const ts = Math.floor(Date.now() / 1000);
    let ok = false;
    let err = '';
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 8000);
      const res = await fetch(ev.webhook_url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Id': String(ev.id),
          'X-Webhook-Timestamp': String(ts),
          'X-Webhook-Signature': await signWebhook(ev.webhook_secret, ts, body),
        },
        body,
        redirect: 'manual',
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      ok = res.status >= 200 && res.status < 300;
      if (!ok) err = `HTTP ${res.status}`;
    } catch (e: any) {
      err = e?.name === 'AbortError' ? 'timeout' : 'network error';
    }
    await rpc(env, 'webhook_report', { p_id: ev.id, p_ok: ok, p_error: err }, env.SUPABASE_SERVICE_ROLE_KEY);
    ok ? delivered++ : failed++;
  }));
  return json({ delivered, failed });
};
