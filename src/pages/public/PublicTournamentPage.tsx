import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  Trophy, Users, Calendar, MapPin, Gamepad2, Award, Eye, Loader2, ExternalLink, Code
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { APP_CONFIG, STATUS_LABELS, STATUS_COLORS, FORMAT_LABELS } from '@/config/app';
import { formatIST, formatINR } from '@/lib/utils';
import { Card, Badge, FullPageLoader } from '@/components/ui';
import BracketView, { type BracketMatch } from '@/components/BracketView';

interface Tournament {
  id: string;
  title: string;
  slug: string;
  game: string;
  description: string;
  venue: string;
  start_datetime: string | null;
  poster_url: string | null;
  rules: string;
  prize: string;
  entry_fee: number;
  max_players: number | null;
  format: string;
  status: string;
  has_bronze_match: boolean;
  registration_open: boolean;
}

export default function PublicTournamentPage() {
  const { slug } = useParams();
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [playerCount, setPlayerCount] = useState(0);
  const [matches, setMatches] = useState<BracketMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showEmbed, setShowEmbed] = useState(false);

  const loadTournament = useCallback(async () => {
    if (!slug) return;
    const { data: t, error } = await supabase
      .from('tournaments')
      .select('id, title, slug, game, description, venue, start_datetime, poster_url, rules, prize, entry_fee, max_players, format, status, has_bronze_match, registration_open')
      .eq('slug', slug)
      .maybeSingle();

    if (error || !t) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    setTournament(t as Tournament);

    const [{ count }, { data: mData }] = await Promise.all([
      supabase.from('players').select('id', { count: 'exact', head: true }).eq('tournament_id', t.id).in('status', ['pending', 'approved', 'checked_in']),
      supabase.from('matches').select('*').eq('tournament_id', t.id).order('round, match_index', { ascending: true }),
    ]);

    setPlayerCount(count || 0);

    if (mData && mData.length > 0) {
      // We can't see player names publicly via direct query due to column-level grants
      // We need a different approach - query public player fields
      const { data: pubPlayers } = await supabase
        .from('players')
        .select('id, name, team_tag')
        .eq('tournament_id', t.id);

      const playerMap = new Map((pubPlayers || []).map((p: any) => [p.id, p]));
      const enriched: BracketMatch[] = (mData as any[]).map((m) => ({
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

  useEffect(() => {
    loadTournament();
  }, [loadTournament]);

  // Auto-refresh every 15 seconds while live
  useEffect(() => {
    if (!tournament || tournament.status !== 'live') return;
    const interval = setInterval(loadTournament, 15000);
    return () => clearInterval(interval);
  }, [tournament, loadTournament]);

  // Set OG meta tags dynamically
  useEffect(() => {
    if (!tournament) return;
    document.title = `${tournament.title} — ${APP_CONFIG.name}`;

    const setMeta = (prop: string, content: string) => {
      let el = document.querySelector(`meta[property="${prop}"]`) || document.querySelector(`meta[name="${prop}"]`);
      if (!el) {
        el = document.createElement('meta');
        el.setAttribute('property', prop);
        document.head.appendChild(el);
      }
      el.setAttribute('content', content);
    };

    setMeta('og:title', `${tournament.title} — ${APP_CONFIG.name}`);
    setMeta('og:description', tournament.description || `${tournament.game} tournament at ${tournament.venue || 'TBD'}`);
    setMeta('og:type', 'website');
    setMeta('og:url', `${window.location.origin}/t/${tournament.slug}`);
    if (tournament.poster_url) {
      setMeta('og:image', tournament.poster_url);
    }
    setMeta('twitter:card', 'summary_large_image');
    setMeta('twitter:title', tournament.title);
    setMeta('twitter:description', tournament.description || `${tournament.game} tournament`);
    if (tournament.poster_url) {
      setMeta('twitter:image', tournament.poster_url);
    }
  }, [tournament]);

  if (loading) return <FullPageLoader message="Loading tournament..." />;

  if (notFound) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center">
        <Trophy size={48} className="text-gray-700 mx-auto mb-4" />
        <h1 className="text-xl font-bold text-white mb-2">Tournament not found</h1>
        <p className="text-gray-500 mb-6">This tournament may have been removed or the link is incorrect.</p>
        <Link to="/" className="btn-primary">Go Home</Link>
      </div>
    );
  }

  if (!tournament) return null;

  const isLive = tournament.status === 'live';
  const completedMatches = matches.filter((m) => m.status === 'completed');

  // Podium
  const finalMatch = completedMatches
    .filter((m) => m.bracket_side === 'winners' || m.bracket_side === 'grand')
    .sort((a, b) => b.round - a.round)[0];
  const champion = finalMatch?.winner_id;
  const championName = finalMatch
    ? (finalMatch.winner_id === finalMatch.player1_id ? finalMatch.player1_name : finalMatch.player2_name)
    : undefined;
  const runnerUpName = finalMatch
    ? (finalMatch.winner_id === finalMatch.player1_id ? finalMatch.player2_name : finalMatch.player1_name)
    : undefined;
  const bronzeMatch = completedMatches.find((m) => m.bracket_side === 'bronze');
  const thirdName = bronzeMatch
    ? (bronzeMatch.winner_id === bronzeMatch.player1_id ? bronzeMatch.player1_name : bronzeMatch.player2_name)
    : undefined;

  return (
    <div className="min-h-screen">
      {/* Hero */}
      {tournament.poster_url ? (
        <div className="relative h-48 sm:h-64 overflow-hidden">
          <img src={tournament.poster_url} alt={tournament.title} className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-ink-950 via-ink-950/60 to-transparent" />
        </div>
      ) : (
        <div className="h-2 bg-gradient-to-r from-electric-600 via-electric-500 to-crimson-600" />
      )}

      <div className="max-w-5xl mx-auto px-4 sm:px-6 -mt-8 relative">
        {/* Title card */}
        <Card className="mb-5 relative z-10">
          <div className="flex items-start gap-4 flex-wrap">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <Badge className={STATUS_COLORS[tournament.status as keyof typeof STATUS_COLORS]}>
                  {isLive && <span className="w-2 h-2 rounded-full bg-crimson-500 animate-live-dot" />}
                  {STATUS_LABELS[tournament.status as keyof typeof STATUS_LABELS]}
                </Badge>
                <Badge className="bg-ink-700 text-gray-400">
                  <Gamepad2 size={12} /> {tournament.game}
                </Badge>
                <Badge className="bg-ink-700 text-gray-400">
                  {FORMAT_LABELS[tournament.format as keyof typeof FORMAT_LABELS]}
                </Badge>
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2">{tournament.title}</h1>
              <div className="flex items-center gap-4 text-sm text-gray-500 flex-wrap">
                {tournament.venue && <span className="flex items-center gap-1"><MapPin size={14} /> {tournament.venue}</span>}
                {tournament.start_datetime && <span className="flex items-center gap-1"><Calendar size={14} /> {formatIST(tournament.start_datetime)}</span>}
                <span className="flex items-center gap-1"><Users size={14} /> {playerCount} registered</span>
                {tournament.entry_fee > 0 && <span>{formatINR(tournament.entry_fee)} entry</span>}
              </div>
            </div>

            {tournament.registration_open && tournament.status !== 'finished' && tournament.status !== 'cancelled' && (
              <Link to={`/t/${tournament.slug}/register`} className="btn-primary text-sm">
                Register Now
              </Link>
            )}
          </div>

          {isLive && (
            <div className="mt-4 flex items-center gap-2 text-xs text-gray-500">
              <Eye size={14} className="text-electric-400" />
              <span>Live bracket auto-refreshes every 15 seconds</span>
            </div>
          )}
        </Card>

        {/* Podium / Results */}
        {champion && (
          <Card className="mb-5">
            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <Award size={20} className="text-electric-400" /> Final Results
            </h2>
            <div className="grid grid-cols-3 gap-3">
              {/* 1st */}
              <div className={`text-center ${thirdName ? 'order-2 sm:scale-110' : 'order-2'}`}>
                <div className="w-16 h-16 mx-auto rounded-full bg-gradient-to-br from-yellow-400 to-yellow-600 flex items-center justify-center mb-2">
                  <Trophy size={28} className="text-yellow-900" />
                </div>
                <p className="text-xs text-yellow-400 font-semibold mb-1">CHAMPION</p>
                <p className="text-sm text-white font-medium truncate">{championName || 'TBD'}</p>
              </div>
              {/* 2nd */}
              <div className="text-center order-1 sm:order-1 mt-4">
                <div className="w-14 h-14 mx-auto rounded-full bg-gradient-to-br from-gray-300 to-gray-500 flex items-center justify-center mb-2">
                  <span className="text-xl font-bold text-gray-700">2</span>
                </div>
                <p className="text-xs text-gray-400 font-semibold mb-1">RUNNER-UP</p>
                <p className="text-sm text-gray-300 truncate">{runnerUpName || 'TBD'}</p>
              </div>
              {/* 3rd */}
              <div className="text-center order-3 mt-6">
                <div className="w-12 h-12 mx-auto rounded-full bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center mb-2">
                  <span className="text-lg font-bold text-orange-900">3</span>
                </div>
                <p className="text-xs text-orange-400 font-semibold mb-1">3RD PLACE</p>
                <p className="text-sm text-gray-300 truncate">{thirdName || (tournament.has_bronze_match ? 'TBD' : '—')}</p>
              </div>
            </div>
          </Card>
        )}

        {/* Description */}
        {tournament.description && (
          <Card className="mb-5">
            <h2 className="font-semibold text-white mb-2">About this tournament</h2>
            <p className="text-sm text-gray-400 whitespace-pre-wrap">{tournament.description}</p>
          </Card>
        )}

        {/* Bracket */}
        {matches.length > 0 ? (
          <Card className="mb-5">
            <h2 className="font-semibold text-white mb-4 flex items-center gap-2">
              <Trophy size={18} className="text-electric-400" /> Live Bracket
            </h2>
            <BracketView matches={matches} format={tournament.format} />
          </Card>
        ) : (
          <Card className="mb-5">
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Trophy size={40} className="text-gray-700 mb-3" />
              <p className="text-gray-400 text-sm">
                {tournament.status === 'draft'
                  ? 'Bracket will appear here once the tournament goes live.'
                  : 'Bracket is being prepared. Check back soon!'}
              </p>
            </div>
          </Card>
        )}

        {/* Rules & Prizes */}
        <div className="grid sm:grid-cols-2 gap-4 mb-5">
          {tournament.rules && (
            <Card>
              <h2 className="font-semibold text-white mb-2">Rules</h2>
              <p className="text-sm text-gray-400 whitespace-pre-wrap">{tournament.rules}</p>
            </Card>
          )}
          {tournament.prize && (
            <Card>
              <h2 className="font-semibold text-white mb-2">Prizes</h2>
              <p className="text-sm text-gray-400 whitespace-pre-wrap">{tournament.prize}</p>
            </Card>
          )}
        </div>

        {/* Embed */}
        <Card className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-white flex items-center gap-2"><Code size={16} /> Embed this bracket</h2>
              <p className="text-xs text-gray-500 mt-1">Add this bracket to your own website.</p>
            </div>
            <button
              onClick={() => {
                setShowEmbed(!showEmbed);
                navigator.clipboard.writeText(`<iframe src="${window.location.origin}/t/${tournament.slug}/embed" width="100%" height="600" frameborder="0" style="border-radius:12px;border:none;background:#0a0a0f;" title="${tournament.title}"></iframe>`);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
              className="btn-ghost text-sm"
            >
              {copied ? 'Copied!' : 'Copy Embed Code'}
            </button>
          </div>
          {showEmbed && (
            <pre className="mt-3 bg-ink-950 border border-ink-700 rounded-xl p-4 text-xs text-gray-300 overflow-x-auto font-mono">
{`<iframe src="${window.location.origin}/t/${tournament.slug}/embed" width="100%" height="600" frameborder="0" style="border-radius:12px;border:none;background:#0a0a0f;" title="${tournament.title}"></iframe>`}
            </pre>
          )}
        </Card>

        <p className="text-center text-xs text-gray-600 pb-8">
          Powered by {APP_CONFIG.name}
        </p>
      </div>
    </div>
  );
}
