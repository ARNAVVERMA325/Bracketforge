import { useCallback, useEffect, useState } from 'react';
import { Copy, KeyRound, Webhook, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Card } from '@/components/ui';

interface ApiKeyRow { id: string; label: string; key_prefix: string; created_at: string; last_used_at: string | null; revoked_at: string | null }
interface OutboxRow { id: number; event: string; attempts: number; delivered_at: string | null; last_error: string | null; created_at: string }

const copy = (t: string) => navigator.clipboard.writeText(t);
const btn = 'px-3 py-2.5 rounded-lg bg-ink-700 text-white text-sm font-semibold disabled:opacity-40';
const input = 'w-full px-3 py-3 rounded-lg bg-ink-800 border border-ink-600 text-white text-base';

export default function IntegrationsCard() {
  const [keys, setKeys] = useState<ApiKeyRow[]>([]);
  const [label, setLabel] = useState('');
  const [newKey, setNewKey] = useState<string | null>(null);
  const [url, setUrl] = useState('');
  const [secret, setSecret] = useState('');
  const [events, setEvents] = useState<OutboxRow[]>([]);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [k, i, o] = await Promise.all([
      supabase.from('api_keys').select('id,label,key_prefix,created_at,last_used_at,revoked_at').order('created_at', { ascending: false }).limit(20),
      supabase.from('integrations').select('webhook_url,webhook_secret').maybeSingle(),
      supabase.from('webhook_outbox').select('id,event,attempts,delivered_at,last_error,created_at').order('id', { ascending: false }).limit(5),
    ]);
    setKeys((k.data || []) as ApiKeyRow[]);
    setUrl(i.data?.webhook_url || '');
    setSecret(i.data?.webhook_secret || '');
    setEvents((o.data || []) as OutboxRow[]);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function createKey() {
    setMsg(null);
    const { data, error } = await supabase.rpc('create_api_key', { p_label: label });
    if (error) { setMsg(error.message.includes('too_many_keys') ? 'You can have at most 5 active keys. Revoke one first.' : 'Could not create key.'); return; }
    setNewKey(data as string); setLabel(''); load();
  }
  async function revoke(id: string) {
    await supabase.rpc('revoke_api_key', { p_id: id });
    load();
  }
  async function saveWebhook(rotate = false) {
    setMsg(null);
    const { data, error } = await supabase.rpc('set_webhook', { p_url: url, p_rotate_secret: rotate });
    if (error) { setMsg(error.message.includes('invalid_url') ? 'Webhook URL must be a public https:// address.' : 'Could not save webhook.'); return; }
    setSecret((data as any).webhook_secret); setMsg(url ? 'Webhook saved.' : 'Webhook removed.'); load();
  }
  async function sendTest() {
    setMsg(null);
    const { error } = await supabase.rpc('send_test_webhook');
    if (error) { setMsg('Save a webhook URL first.'); return; }
    await fetch('/api/webhooks/flush', { method: 'POST' }).catch(() => {});
    setTimeout(load, 1500);
    setMsg('Test event sent. Check the status below in a moment.');
  }

  const origin = window.location.origin;
  const curl = `curl -X POST ${origin}/api/v1/players \\\n  -H "Authorization: Bearer YOUR_API_KEY" -H "Content-Type: application/json" \\\n  -d '{"tournament":"your-tournament-slug","name":"Player Name","phone":"9876543210"}'`;

  return (
    <Card>
      <h3 className="font-semibold text-white mb-1">Connect your website</h3>
      <p className="text-xs text-gray-500 mb-4">Let your own website send registrations here and receive a copy of every registration and result. Nobody has to type anything twice.</p>

      <div className="flex items-center gap-2 text-sm font-semibold text-white mb-2"><KeyRound size={16} /> API keys</div>
      <p className="text-xs text-gray-500 mb-2">Use a key on your website's <b>server</b> only. Never put it in page code.</p>
      <div className="flex gap-2 mb-2">
        <input className={input} placeholder="Label, e.g. Café website" value={label} maxLength={40} onChange={(e) => setLabel(e.target.value)} />
        <button className={btn} onClick={createKey}>Create</button>
      </div>
      {newKey && (
        <div className="rounded-lg border border-electric-600/40 p-3 mb-2 text-xs text-gray-300">
          Copy it now, it won't be shown again:
          <div className="font-mono break-all text-white my-1">{newKey}</div>
          <button className={btn} onClick={() => copy(newKey)}><Copy size={14} className="inline mr-1" />Copy key</button>
        </div>
      )}
      <ul className="space-y-1 mb-4">
        {keys.map((k) => (
          <li key={k.id} className="flex items-center justify-between text-xs text-gray-400 border-b border-ink-700 py-1.5">
            <span>{k.label || 'Untitled'} · <span className="font-mono">{k.key_prefix}…</span>{k.revoked_at ? ' · revoked' : k.last_used_at ? ` · last used ${new Date(k.last_used_at).toLocaleDateString('en-IN')}` : ' · never used'}</span>
            {!k.revoked_at && <button onClick={() => revoke(k.id)} className="text-crimson-400 p-1" aria-label="Revoke key"><Trash2 size={16} /></button>}
          </li>
        ))}
      </ul>
      <pre className="text-[11px] text-gray-300 bg-ink-900 rounded-lg p-3 overflow-x-auto mb-5">{curl}</pre>

      <div className="flex items-center gap-2 text-sm font-semibold text-white mb-2"><Webhook size={16} /> Webhook (copy of every registration and result)</div>
      <input className={input + ' mb-2'} placeholder="https://your-site.com/hooks/tournament" value={url} onChange={(e) => setUrl(e.target.value)} />
      <div className="flex flex-wrap gap-2 mb-2">
        <button className={btn} onClick={() => saveWebhook(false)}>Save</button>
        <button className={btn} onClick={sendTest} disabled={!url}>Send test</button>
        {secret && <button className={btn} onClick={() => saveWebhook(true)}>New secret</button>}
      </div>
      {secret && (
        <div className="text-xs text-gray-400 mb-2">Signing secret: <span className="font-mono text-white break-all">{secret}</span>{' '}
          <button className="text-electric-400" onClick={() => copy(secret)}>copy</button>
          <div className="mt-1">Each request has <span className="font-mono">X-Webhook-Signature</span> = sha256 HMAC of <span className="font-mono">timestamp.body</span>. Verify it before trusting the data.</div>
        </div>
      )}
      {events.length > 0 && (
        <ul className="text-xs text-gray-500 space-y-0.5">
          {events.map((e) => (
            <li key={e.id}>{new Date(e.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} · {e.event} · {e.delivered_at ? 'delivered' : e.last_error ? `retrying (${e.last_error})` : 'queued'}</li>
          ))}
        </ul>
      )}
      {msg && <p className="text-xs text-electric-400 mt-2">{msg}</p>}
    </Card>
  );
}
