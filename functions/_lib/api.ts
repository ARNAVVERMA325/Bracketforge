export interface Env {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  APP_NAME?: string;
  ASSETS: { fetch: (req: Request | string | URL) => Promise<Response> };
}

/** Maps database error codes (returned by the RPC functions) to HTTP statuses. */
export function statusForError(code: string | undefined): number {
  switch (code) {
    case 'invalid_key': return 401;
    case 'tournament_not_found': return 404;
    case 'already_registered':
    case 'tournament_full':
    case 'registration_closed': return 409;
    case 'invalid_phone':
    case 'invalid_name':
    case 'invalid_status': return 422;
    case 'rate_limited': return 429;
    default: return 400;
  }
}

export async function rpc(env: Env, fn: string, args: Record<string, unknown>, key = env.SUPABASE_ANON_KEY, forwardedFor?: string) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}`,
  };
  if (forwardedFor) headers['x-forwarded-for'] = forwardedFor;
  const base = env.SUPABASE_URL.trim().replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');
  const res = await fetch(`${base}/rest/v1/rpc/${fn}`, { method: 'POST', headers, body: JSON.stringify(args) });
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* non-JSON error body */ }
  return { ok: res.ok, status: res.status, data };
}

export function json(body: unknown, status = 200, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...extra },
  });
}
