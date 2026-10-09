import { Env, rpc } from '../_lib/api';
import { injectOg } from '../_lib/og';

// Serves the SPA shell with per-tournament Open Graph tags so WhatsApp/Instagram previews show the poster and title.
export const onRequestGet = async ({ request, env, params }: { request: Request; env: Env; params: { slug: string } }) => {
  const url = new URL(request.url);
  const shell = await env.ASSETS.fetch(new URL('/index.html', url));
  const html = await shell.text();
  const headers = { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=60' };

  const r = await rpc(env, 'public_tournament_bundle', { p_slug: String(params.slug) });
  const t = r.data?.tournament;
  if (!t) return new Response(html, { headers });

  const when = t.start_datetime
    ? new Date(t.start_datetime).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })
    : '';
  const description = [t.game, when, t.venue, t.prize ? `Prize: ${t.prize}` : '']
    .filter(Boolean).join(' · ').slice(0, 200) || 'Tournament bracket and registration';
  const out = injectOg(html, {
    title: String(t.title),
    description,
    image: t.poster_url || `${url.origin}/og-default.png`,
    url: `${url.origin}/t/${t.slug}`,
    siteName: env.APP_NAME || 'BracketForge',
  });
  return new Response(out, { headers });
};
