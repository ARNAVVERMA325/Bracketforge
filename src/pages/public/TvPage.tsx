import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Trophy } from 'lucide-react';
import { fetchBundle } from '@/lib/publicData';
import { getPodium, getTvSections, type MatchData } from '@/lib/bracket';
import { STATUS_LABELS } from '@/config/app';
import type { BracketMatch } from '@/components/BracketView';

interface T { title: string; game: string; status: string; format: string; has_bronze_match: boolean }

function useBundle(slug: string | undefined) {
  const [t, setT] = useState<T | null>(null);
  const [matches, setMatches] = useState<BracketMatch[]>([]);
  const [missing, setMissing] = useState(false);

  const load = useCallback(async () => {
    if (!slug) return;
    const b = await fetchBundle(slug);
    if (!b) { setMissing(true); return; }
    const names = new Map<string, any>((b.players || []).map((p: any) => [p.id, p] as [string, any]));
    setT(b.tournament);
    setMatches((b.matches || []).map((m: any) => ({
      ...m,
      player1_name: names.get(m.player1_id)?.name,
      player2_name: names.get(m.player2_id)?.name,
      player1_tag: names.get(m.player1_id)?.team_tag,
      player2_tag: names.get(m.player2_id)?.team_tag,
    })));
  }, [slug]);

  useEffect(() => { load(); }, [load]);
  // refresh only while the tournament is live
  useEffect(() => {
    if (t?.status !== 'live') return;
    const id = setInterval(load, 15000);
    return () => clearInterval(id);
  }, [t?.status, load]);

  return { t, matches, missing };
}

const Vs = ({ m, big }: { m: BracketMatch; big?: boolean }) => (
  <div className={`${big ? 'text-4xl sm:text-5xl' : 'text-2xl sm:text-3xl'} font-bold text-white leading-tight`}>
    <span className="break-words">{m.player1_name || 'TBD'}</span>
    <span className="text-electric-400 mx-3 text-[0.6em] align-middle">VS</span>
    <span className="break-words">{m.player2_name || 'TBD'}</span>
  </div>
);

const Station = ({ s }: { s?: string | null }) =>
  s ? <span className="inline-block px-3 py-1 rounded-lg bg-electric-600 text-white font-bold text-lg sm:text-2xl mb-2">{s}</span> : null;

export default function TvPage() {
  const { slug } = useParams<{ slug: string }>();
  const { t, matches, missing } = useBundle(slug);
  const [clock, setClock] = useState(new Date());

  useEffect(() => { const id = setInterval(() => setClock(new Date()), 30000); return () => clearInterval(id); }, []);
  // keep the TV screen awake where the browser allows it
  useEffect(() => {
    let lock: any;
    (navigator as any).wakeLock?.request('screen').then((l: any) => (lock = l)).catch(() => {});
    return () => { lock?.release?.(); };
  }, []);

  if (missing) return <div className="min-h-screen bg-ink-950 text-gray-400 flex items-center justify-center text-2xl">Tournament not found</div>;
  if (!t) return <div className="min-h-screen bg-ink-950" />;

  const { now, next, recent } = getTvSections(matches, 5, 4);
  const podium = t.status === 'finished' ? getPodium(matches as unknown as MatchData[], t.has_bronze_match) : null;
  const nameOf = (id?: string | null) => {
    if (!id) return '';
    for (const m of matches) { if (m.player1_id === id) return m.player1_name || ''; if (m.player2_id === id) return m.player2_name || ''; }
    return '';
  };

  return (
    <div className="min-h-screen bg-ink-950 text-white p-5 sm:p-8 flex flex-col gap-6 cursor-none select-none">
      <header className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <Trophy className="text-electric-400 shrink-0" size={36} />
          <div className="min-w-0">
            <h1 className="text-3xl sm:text-5xl font-extrabold truncate">{t.title}</h1>
            <p className="text-lg sm:text-2xl text-gray-400 truncate">{t.game}</p>
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className={`inline-flex items-center gap-2 text-xl sm:text-3xl font-bold ${t.status === 'live' ? 'text-crimson-400' : 'text-gray-400'}`}>
            {t.status === 'live' && <span className="w-3 h-3 rounded-full bg-crimson-500 animate-live-dot" />}
            {STATUS_LABELS[t.status as keyof typeof STATUS_LABELS] || t.status}
          </div>
          <div className="text-gray-500 text-lg">{clock.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' })}</div>
        </div>
      </header>

      {podium ? (
        <section className="flex-1 flex flex-col items-center justify-center gap-4 text-center">
          <div className="text-gray-400 text-2xl">CHAMPION</div>
          <div className="text-6xl sm:text-8xl font-extrabold text-yellow-400">{nameOf(podium.champion)}</div>
          <div className="text-2xl sm:text-4xl text-gray-300 mt-4">2nd: {nameOf(podium.runnerUp)}{podium.thirdPlace ? `   ·   3rd: ${nameOf(podium.thirdPlace)}` : ''}</div>
        </section>
      ) : (
        <div className="flex-1 grid lg:grid-cols-5 gap-6">
          <section className="lg:col-span-3 space-y-4">
            <h2 className="text-2xl sm:text-3xl font-bold text-crimson-400 tracking-wide">NOW PLAYING</h2>
            {now.length === 0 && <p className="text-2xl text-gray-500">{t.status === 'live' ? 'Waiting for the next match…' : 'The tournament has not started yet.'}</p>}
            {now.map((m) => (
              <div key={m.id} className="rounded-2xl border-2 border-crimson-500/60 bg-ink-900 p-5">
                <Station s={m.station} />
                <Vs m={m} big />
              </div>
            ))}
          </section>
          <section className="lg:col-span-2 space-y-3">
            <h2 className="text-2xl sm:text-3xl font-bold text-electric-400 tracking-wide">NEXT UP</h2>
            {next.length === 0 && <p className="text-xl text-gray-500">No matches waiting.</p>}
            {next.map((m) => (
              <div key={m.id} className="rounded-xl bg-ink-900 border border-ink-700 p-4">
                <Station s={m.station} />
                <Vs m={m} />
              </div>
            ))}
          </section>
        </div>
      )}

      {recent.length > 0 && !podium && (
        <footer className="border-t border-ink-700 pt-4">
          <h3 className="text-lg text-gray-500 mb-2 tracking-wide">RESULTS</h3>
          <div className="flex flex-wrap gap-x-8 gap-y-1 text-lg sm:text-xl text-gray-300">
            {recent.map((m) => (
              <span key={m.id}><span className="text-white font-semibold">{nameOf(m.winner_id)}</span> beat {nameOf(m.loser_id)}{m.score ? ` (${m.score})` : ''}</span>
            ))}
          </div>
        </footer>
      )}
    </div>
  );
}
