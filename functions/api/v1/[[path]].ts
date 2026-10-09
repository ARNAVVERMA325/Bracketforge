import { Env, json, rpc, statusForError } from '../../_lib/api';

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' };

export const onRequest = async ({ request, env, params }: { request: Request; env: Env; params: { path?: string | string[] } }) => {
  const path = ([] as string[]).concat(params.path ?? []);
  const ip = request.headers.get('cf-connecting-ip') ?? undefined;

  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

  // GET /api/v1/tournaments/:slug  (public, read-only, no phone numbers)
  if (request.method === 'GET' && path[0] === 'tournaments' && path.length === 2) {
    const cache = (globalThis as any).caches?.default as Cache | undefined;
    const cacheKey = new Request(new URL(request.url).origin + '/api/v1/tournaments/' + encodeURIComponent(path[1]));
    const hit = await cache?.match(cacheKey);
    if (hit) return new Response(hit.body, { status: hit.status, headers: { ...Object.fromEntries(hit.headers), ...CORS } });

    const r = await rpc(env, 'public_tournament_bundle', { p_slug: path[1] });
    if (!r.ok) return json({ error: 'server_error' }, 502, CORS);
    if (!r.data) return json({ error: 'not_found' }, 404, CORS);
    const live = r.data.tournament?.status === 'live';
    const res = json(r.data, 200, { ...CORS, 'Cache-Control': `public, max-age=${live ? 15 : 60}` });
    // store a copy so 100 viewers cost the database one read per 15 s
    if (cache) await cache.put(cacheKey, res.clone());
    return res;
  }

  // POST /api/v1/players   Authorization: Bearer <api key>
  if (request.method === 'POST' && path[0] === 'players' && path.length === 1) {
    const auth = request.headers.get('Authorization') ?? '';
    const key = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
    let body: any;
    try { body = await request.json(); } catch { return json({ error: 'invalid_json' }, 400); }
    if (!key) return json({ error: 'invalid_key' }, 401);

    const r = await rpc(env, 'api_register_player', {
      p_key: key,
      p_slug: String(body?.tournament ?? ''),
      p_name: String(body?.name ?? ''),
      p_phone: String(body?.phone ?? ''),
      p_team_tag: String(body?.team_tag ?? ''),
      p_character_loadout: String(body?.character_loadout ?? ''),
      p_status: String(body?.status ?? 'pending'),
    }, env.SUPABASE_ANON_KEY, ip);

    if (!r.ok) return json({ error: r.data?.message === 'rate_limited' ? 'rate_limited' : 'server_error' }, r.data?.message === 'rate_limited' ? 429 : 502);
    if (r.data?.ok) return json({ ok: true }, 201);
    return json({ ok: false, error: r.data?.error }, statusForError(r.data?.error));
  }

  return json({ error: 'not_found' }, 404);
};
