import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Trophy, Users, Eye, Calendar, Gamepad2, MapPin, MoreVertical, Trash2, ExternalLink, Copy } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { STATUS_LABELS, STATUS_COLORS, FORMAT_SHORT, PAYMENT_STATUS_LABELS, PAYMENT_STATUS_COLORS } from '@/config/app';
import { formatDateIST, formatINR } from '@/lib/utils';
import { Card, EmptyState, ConfirmDialog, Badge } from '@/components/ui';

interface Tournament {
  id: string;
  title: string;
  slug: string;
  game: string;
  venue: string;
  start_datetime: string | null;
  status: string;
  format: string;
  visibility: string;
  entry_fee: number;
  payment_status: string;
  max_players: number | null;
  player_count: number;
}

export default function DashboardPage() {
  const { profile } = useAuth();
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);

  useEffect(() => {
    loadTournaments();
  }, []);

  async function loadTournaments() {
    setLoading(true);
    const { data, error } = await supabase
      .from('tournaments')
      .select(`
        id, title, slug, game, venue, start_datetime, status, format, visibility, entry_fee, payment_status, max_players,
        players(count)
      `)
      .eq('organizer_id', profile!.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error loading tournaments:', error);
    } else if (data) {
      const mapped = data.map((t: any) => ({
        ...t,
        player_count: t.players?.[0]?.count ?? 0,
      }));
      setTournaments(mapped);
    }
    setLoading(false);
  }

  async function handleDelete() {
    if (!deleteId) return;
    const { error } = await supabase.from('tournaments').delete().eq('id', deleteId);
    if (error) {
      console.error('Delete error:', error);
    } else {
      setTournaments(tournaments.filter((t) => t.id !== deleteId));
    }
    setDeleteId(null);
  }

  function copyLink(slug: string) {
    const url = `${window.location.origin}/t/${slug}`;
    navigator.clipboard.writeText(url);
    setMenuOpen(null);
  }

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <div className="skeleton h-12 w-64 mb-6" />
        <div className="grid gap-4">
          <div className="skeleton h-32" />
          <div className="skeleton h-32" />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">
            Welcome, {profile?.display_name || 'Organizer'}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {profile?.organization && `${profile.organization} · `}
            {tournaments.length} tournament{tournaments.length !== 1 ? 's' : ''}
          </p>
        </div>
        <Link to="/dashboard/new" className="btn-primary">
          <Plus size={18} /> New Tournament
        </Link>
      </div>

      {tournaments.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Trophy size={48} />}
            title="No tournaments yet"
            description="Create your first tournament and share the registration link with your gaming community."
            action={<Link to="/dashboard/new" className="btn-primary"><Plus size={18} /> Create Tournament</Link>}
          />
        </Card>
      ) : (
        <div className="grid gap-4">
          {tournaments.map((t) => (
            <div
              key={t.id}
              className="card p-5 hover:border-electric-600/30 transition-colors group"
            >
              <div className="flex items-start justify-between gap-3">
                <Link to={`/dashboard/t/${t.slug}`} className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <Badge className={STATUS_COLORS[t.status as keyof typeof STATUS_COLORS]}>
                      {STATUS_LABELS[t.status as keyof typeof STATUS_LABELS]}
                    </Badge>
                    <Badge className="bg-ink-700 text-gray-400">
                      {FORMAT_SHORT[t.format as keyof typeof FORMAT_SHORT]}
                    </Badge>
                    <Badge className={PAYMENT_STATUS_COLORS[t.payment_status as keyof typeof PAYMENT_STATUS_COLORS]}>
                      {PAYMENT_STATUS_LABELS[t.payment_status as keyof typeof PAYMENT_STATUS_LABELS]}
                    </Badge>
                    {t.visibility === 'unlisted' && (
                      <Badge className="bg-gray-700 text-gray-400">Unlisted</Badge>
                    )}
                  </div>
                  <h3 className="text-lg font-semibold text-white group-hover:text-electric-400 transition-colors truncate">
                    {t.title}
                  </h3>
                  <div className="flex items-center gap-4 mt-2 text-sm text-gray-500 flex-wrap">
                    <span className="flex items-center gap-1"><Gamepad2 size={14} /> {t.game}</span>
                    {t.venue && <span className="flex items-center gap-1"><MapPin size={14} /> {t.venue}</span>}
                    {t.start_datetime && (
                      <span className="flex items-center gap-1"><Calendar size={14} /> {formatDateIST(t.start_datetime)}</span>
                    )}
                    <span className="flex items-center gap-1"><Users size={14} /> {t.player_count}{t.max_players ? `/${t.max_players}` : ''}</span>
                    {t.entry_fee > 0 && <span className="flex items-center gap-1">{formatINR(t.entry_fee)}</span>}
                  </div>
                </Link>

                <div className="relative">
                  <button
                    onClick={() => setMenuOpen(menuOpen === t.id ? null : t.id)}
                    className="p-2 rounded-lg text-gray-500 hover:bg-ink-700 hover:text-gray-300 transition-colors"
                  >
                    <MoreVertical size={18} />
                  </button>
                  {menuOpen === t.id && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(null)} />
                      <div className="absolute right-0 top-full mt-1 z-20 w-48 card p-1.5 animate-scale-in">
                        <Link
                          to={`/dashboard/t/${t.slug}`}
                          onClick={() => setMenuOpen(null)}
                          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-300 hover:bg-ink-700"
                        >
                          <Trophy size={14} /> Manage
                        </Link>
                        <Link
                          to={`/t/${t.slug}`}
                          target="_blank"
                          onClick={() => setMenuOpen(null)}
                          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-300 hover:bg-ink-700"
                        >
                          <ExternalLink size={14} /> View Public Page
                        </Link>
                        <button
                          onClick={() => copyLink(t.slug)}
                          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-300 hover:bg-ink-700"
                        >
                          <Copy size={14} /> Copy Share Link
                        </button>
                        <button
                          onClick={() => { setDeleteId(t.id); setMenuOpen(null); }}
                          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-crimson-400 hover:bg-crimson-600/10"
                        >
                          <Trash2 size={14} /> Delete
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!deleteId}
        title="Delete tournament?"
        message="This will permanently delete the tournament, all players, and all match data. This cannot be undone."
        confirmLabel="Delete"
        danger
        onConfirm={handleDelete}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  );
}
