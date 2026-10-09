import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { fetchBundle } from '@/lib/publicData';
import { getTvSections } from '@/lib/bracket';
import type { BracketMatch } from '@/components/BracketView';

/** Transparent lower-third for OBS (Browser Source). URL: /t/<slug>/overlay  (suggested size 1280x200) */
export default function OverlayPage() {
  const { slug } = useParams<{ slug: string }>();
  const [status, setStatus] = useState('');
  const [matches, setMatches] = useState<BracketMatch[]>([]);
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    const prevBody = document.body.style.background;
    const prevHtml = document.documentElement.style.background;
    document.body.style.background = 'transparent';
    document.documentElement.style.background = 'transparent';
    return () => { document.body.style.background = prevBody; document.documentElement.style.background = prevHtml; };
  }, []);

  const load = useCallback(async () => {
    if (!slug) return;
    const b = await fetchBundle(slug);
    if (!b) return;
    const names = new Map<string, any>((b.players || []).map((p: any) => [p.id, p] as [string, any]));
    setStatus(b.tournament.status);
    setMatches((b.matches || []).map((m: any) => ({
      ...m, player1_name: names.get(m.player1_id)?.name, player2_name: names.get(m.player2_id)?.name,
    })));
  }, [slug]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (status !== 'live') return;
    const id = setInterval(load, 15000);
    return () => clearInterval(id);
  }, [status, load]);
  useEffect(() => { const id = setInterval(() => setIdx((i) => i + 1), 6000); return () => clearInterval(id); }, []);

  const { now } = getTvSections(matches);
  if (now.length === 0) return null;
  const m = now[idx % now.length];

  return (
    <div className="p-4">
      <div className="inline-flex items-center gap-4 rounded-xl bg-black/80 border-l-8 border-electric-500 px-6 py-3 text-white shadow-2xl">
        {m.station && <span className="bg-electric-600 rounded-lg px-3 py-1 font-bold text-xl">{m.station}</span>}
        <span className="text-3xl font-extrabold">{m.player1_name || 'TBD'}</span>
        <span className="text-electric-400 font-bold">VS</span>
        <span className="text-3xl font-extrabold">{m.player2_name || 'TBD'}</span>
      </div>
    </div>
  );
}
