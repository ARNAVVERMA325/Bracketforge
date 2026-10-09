import { supabase } from '@/lib/supabase';

/**
 * Loads a tournament's public data. Prefers the cached edge endpoint (/api/v1/tournaments/:slug),
 * so many viewers cost the database one read per ~15 s. Falls back to the database function
 * (used in local dev, where the edge function does not exist).
 */
export async function fetchBundle(slug: string): Promise<any | null> {
  try {
    const r = await fetch(`/api/v1/tournaments/${encodeURIComponent(slug)}`);
    const isJson = r.headers.get('content-type')?.includes('application/json');
    if (isJson && r.ok) return await r.json();
    if (isJson && r.status === 404) return null;
  } catch {
    /* fall through to the database */
  }
  const { data, error } = await supabase.rpc('public_tournament_bundle', { p_slug: slug });
  return error ? null : data;
}
