import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { Trophy, Loader2, Eye } from 'lucide-react';
import { fetchBundle } from '@/lib/publicData';
import { APP_CONFIG, STATUS_LABELS, STATUS_COLORS } from '@/config/app';
import BracketView, { type BracketMatch } from '@/components/BracketView';

interface Tournament {
  id: string;
  title: string;
  slug: string;
  game: string;
  format: string;
  status: string;
}

export default function EmbedPage() {
  const { slug } = useParams();
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [matches, setMatches] = useState<BracketMatch[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!slug) return;
    const bundle = await fetchBundle(slug!);

    if (!bundle) { setLoading(false); return; }
    setTournament(bundle.tournament as Tournament);

    const mData: any[] = bundle.matches || [];
    if (mData.length > 0) {
      const playerMap = new Map<string, any>((bundle.players || []).map((p: any) => [p.id, p] as [string, any]));
      const enriched: BracketMatch[] = mData.map((m) => ({
        ...m,
        player1_name: m.player1_id ? playerMap.get(m.player1_id)?.name : undefined,
        player2_name: m.player2_id ? playerMap.get(m.player2_id)?.name : undefined,
        player1_tag: m.player1_id ? playerMap.get(m.player1_id)?.team_tag : undefined,
        player2_tag: m.player2_id ? playerMap.get(m.player2_id)?.team_tag : undefined,
      }));
      setMatches(enriched);
    } else {
      setMatches([]);
    }
    setLoading(false);
  }, [slug]);

  useEffect(() => { load(); }, [load]);

  // Auto-refresh while live
  useEffect(() => {
    if (!tournament || tournament.status !== 'live') return;
    const interval = setInterval(load, 15000);
    return () => clearInterval(interval);
  }, [tournament, load]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-ink-950">
        <Loader2 size={24} className="animate-spin text-electric-500" />
      </div>
    );
  }

  if (!tournament) {
    return (
      <div className="flex items-center justify-center h-screen bg-ink-950">
        <p className="text-gray-500 text-sm">Tournament not found</p>
      </div>
    );
  }

  return (
    <div className="bg-ink-950 min-h-screen p-3 sm:p-4 rounded-xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-3 pb-3 border-b border-ink-700">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-electric-500 to-electric-700 flex items-center justify-center shrink-0">
            <Trophy size={14} className="text-white" />
          </div>
          <div className="min-w-0">
            <h1 className="text-sm font-bold text-white truncate">{tournament.title}</h1>
            <p className="text-xs text-gray-500 truncate">{tournament.game}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`badge ${STATUS_COLORS[tournament.status as keyof typeof STATUS_COLORS]}`}>
            {tournament.status === 'live' && <span className="w-1.5 h-1.5 rounded-full bg-crimson-500 animate-live-dot" />}
            {STATUS_LABELS[tournament.status as keyof typeof STATUS_LABELS]}
          </span>
        </div>
      </div>

      {/* Bracket */}
      {matches.length > 0 ? (
        <BracketView matches={matches} format={tournament.format} compact showNextUp={tournament.status === 'live'} />
      ) : (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Trophy size={36} className="text-gray-700 mb-2" />
          <p className="text-gray-500 text-sm">Bracket will appear here once matches begin.</p>
        </div>
      )}

      {/* Footer */}
      <div className="mt-3 pt-3 border-t border-ink-700 flex items-center justify-between">
        <span className="text-xs text-gray-600">Powered by {APP_CONFIG.name}</span>
        {tournament.status === 'live' && (
          <span className="text-xs text-gray-600 flex items-center gap-1">
            <Eye size={11} /> Auto-refreshing
          </span>
        )}
      </div>
    </div>
  );
}
