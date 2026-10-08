import { useEffect, useState, useCallback } from 'react';
import {
  Shield, Users, Trophy, TrendingUp, DollarSign, Ban, Check, Loader2,
  ExternalLink, AlertCircle,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import {
  STATUS_LABELS, STATUS_COLORS, PAYMENT_STATUS_LABELS, PAYMENT_STATUS_COLORS,
} from '@/config/app';
import { formatDateIST, formatINR } from '@/lib/utils';
import { Card, Badge, ErrorBanner, ConfirmDialog } from '@/components/ui';
import { Link } from 'react-router-dom';

interface Organizer {
  id: string;
  email: string;
  display_name: string;
  organization: string;
  city: string;
  logo_url: string | null;
  is_disabled: boolean;
  created_at: string;
  tournament_count: number;
}

interface AdminTournament {
  id: string;
  title: string;
  slug: string;
  game: string;
  organizer_name: string;
  organizer_email: string;
  status: string;
  payment_status: string;
  plan: string;
  player_count: number;
  created_at: string;
}

interface Stats {
  total_organizers: number;
  active_organizers: number;
  total_tournaments: number;
  live_tournaments: number;
  total_players: number;
  paid_tournaments: number;
  free_during_beta: boolean;
  plan_fee_inr: number;
}

type Tab = 'stats' | 'organizers' | 'tournaments';

export default function AdminPage() {
  const { profile } = useAuth();
  const [tab, setTab] = useState<Tab>('stats');
  const [organizers, setOrganizers] = useState<Organizer[]>([]);
  const [tournaments, setTournaments] = useState<AdminTournament[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toggleId, setToggleId] = useState<{ id: string; disable: boolean } | null>(null);
  const [payTournament, setPayTournament] = useState<{ id: string; status: string } | null>(null);
  const [betaSetting, setBetaSetting] = useState(true);

  const loadAll = useCallback(async () => {
    setLoading(true);
    const [
      { data: orgData, error: orgErr },
      { data: tourData, error: tourErr },
      { data: statsData, error: statsErr },
    ] = await Promise.all([
      supabase.rpc('admin_list_organizers'),
      supabase.rpc('admin_list_tournaments'),
      supabase.rpc('admin_get_stats'),
    ]);

    if (orgErr || tourErr || statsErr) {
      setError('Could not load admin data. Make sure you have super-admin access.');
      setLoading(false);
      return;
    }

    setOrganizers((orgData || []) as Organizer[]);
    setTournaments((tourData || []) as AdminTournament[]);
    setStats(statsData as any as Stats);
    setBetaSetting((statsData as any)?.free_during_beta ?? true);
    setLoading(false);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  async function handleToggleOrganizer() {
    if (!toggleId) return;
    const { error } = await supabase.rpc('admin_toggle_organizer', {
      p_user_id: toggleId.id,
      p_disabled: toggleId.disable,
    });
    if (error) {
      setError('Could not update organizer status.');
      return;
    }
    setOrganizers(organizers.map((o) =>
      o.id === toggleId.id ? { ...o, is_disabled: toggleId.disable } : o
    ));
    setToggleId(null);
  }

  async function handleSetPayment() {
    if (!payTournament) return;
    const { error } = await supabase.rpc('admin_set_tournament_payment', {
      p_tournament_id: payTournament.id,
      p_payment_status: payTournament.status,
      p_payment_mode: 'manual',
    });
    if (error) {
      setError('Could not update payment status.');
      return;
    }
    setTournaments(tournaments.map((t) =>
      t.id === payTournament.id ? { ...t, payment_status: payTournament.status } : t
    ));
    setPayTournament(null);
  }

  async function handleToggleBeta() {
    const newVal = !betaSetting;
    const { error } = await supabase.rpc('admin_update_beta_setting', { p_free: newVal });
    if (error) {
      setError('Could not update beta setting.');
      return;
    }
    setBetaSetting(newVal);
  }

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="skeleton h-8 w-48 mb-6" />
        <div className="skeleton h-32 mb-4" />
      </div>
    );
  }

  const tabs: { key: Tab; label: string; icon: any }[] = [
    { key: 'stats', label: 'Overview', icon: TrendingUp },
    { key: 'organizers', label: `Organizers (${organizers.length})`, icon: Users },
    { key: 'tournaments', label: `Tournaments (${tournaments.length})`, icon: Trophy },
  ];

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex items-center gap-2 mb-6">
        <Shield size={24} className="text-crimson-400" />
        <h1 className="text-2xl font-bold text-white">Super Admin</h1>
      </div>

      {error && <div className="mb-4"><ErrorBanner message={error} onDismiss={() => setError(null)} /></div>}

      {/* Beta Setting */}
      <Card className="mb-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-white text-sm">Free During Beta</h3>
            <p className="text-xs text-gray-500 mt-1">
              When ON, unpaid tournaments can go live. When OFF, organizers must pay {formatINR(stats?.plan_fee_inr || 300)} per tournament.
            </p>
          </div>
          <button
            onClick={handleToggleBeta}
            className={`relative w-12 h-7 rounded-full transition-colors ${betaSetting ? 'bg-green-600' : 'bg-ink-600'}`}
          >
            <span className={`absolute top-1 left-1 w-5 h-5 rounded-full bg-white transition-transform ${betaSetting ? 'translate-x-5' : ''}`} />
          </button>
        </div>
      </Card>

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-5 border-b border-ink-700">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              tab === t.key ? 'border-crimson-500 text-crimson-400' : 'border-transparent text-gray-500 hover:text-gray-300'
            }`}
          >
            <t.icon size={16} /> {t.label}
          </button>
        ))}
      </div>

      {/* Stats Tab */}
      {tab === 'stats' && stats && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <Card className="text-center py-6">
            <Users size={24} className="text-electric-400 mx-auto mb-2" />
            <p className="text-3xl font-bold text-white">{stats.total_organizers}</p>
            <p className="text-xs text-gray-500 mt-1">Total Organizers</p>
            <p className="text-xs text-green-400 mt-1">{stats.active_organizers} active</p>
          </Card>
          <Card className="text-center py-6">
            <Trophy size={24} className="text-electric-400 mx-auto mb-2" />
            <p className="text-3xl font-bold text-white">{stats.total_tournaments}</p>
            <p className="text-xs text-gray-500 mt-1">Total Tournaments</p>
            <p className="text-xs text-crimson-400 mt-1">{stats.live_tournaments} live now</p>
          </Card>
          <Card className="text-center py-6">
            <Users size={24} className="text-electric-400 mx-auto mb-2" />
            <p className="text-3xl font-bold text-white">{stats.total_players}</p>
            <p className="text-xs text-gray-500 mt-1">Total Players</p>
          </Card>
          <Card className="text-center py-6">
            <DollarSign size={24} className="text-green-400 mx-auto mb-2" />
            <p className="text-3xl font-bold text-white">{stats.paid_tournaments}</p>
            <p className="text-xs text-gray-500 mt-1">Paid Tournaments</p>
          </Card>
          <Card className="text-center py-6">
            <TrendingUp size={24} className="text-electric-400 mx-auto mb-2" />
            <p className="text-3xl font-bold text-white">{formatINR(stats.paid_tournaments * stats.plan_fee_inr)}</p>
            <p className="text-xs text-gray-500 mt-1">Revenue (at {formatINR(stats.plan_fee_inr)}/tournament)</p>
          </Card>
          <Card className="text-center py-6">
            <Shield size={24} className="text-crimson-400 mx-auto mb-2" />
            <p className="text-3xl font-bold text-white">{betaSetting ? 'Beta' : 'Paid'}</p>
            <p className="text-xs text-gray-500 mt-1">Current Mode</p>
          </Card>
        </div>
      )}

      {/* Organizers Tab */}
      {tab === 'organizers' && (
        <div className="space-y-2">
          {organizers.length === 0 ? (
            <Card><p className="text-center text-gray-500 py-8">No organizers yet.</p></Card>
          ) : (
            organizers.map((o) => (
              <div key={o.id} className="card p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-ink-700 flex items-center justify-center text-sm font-bold text-electric-400 shrink-0">
                  {(o.display_name || o.email)[0]?.toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-white truncate">{o.display_name || 'Unnamed'}</span>
                    {o.is_disabled && <Badge className="bg-crimson-600/20 text-crimson-400 border border-crimson-600/40">Disabled</Badge>}
                  </div>
                  <div className="text-xs text-gray-500 flex items-center gap-3 mt-0.5 flex-wrap">
                    <span>{o.email}</span>
                    {o.organization && <span>· {o.organization}</span>}
                    {o.city && <span>· {o.city}</span>}
                    <span>· {o.tournament_count} tournament{o.tournament_count !== 1 ? 's' : ''}</span>
                  </div>
                </div>
                <button
                  onClick={() => setToggleId({ id: o.id, disable: !o.is_disabled })}
                  className={o.is_disabled ? 'btn-primary text-xs px-3 py-2' : 'btn-danger text-xs px-3 py-2'}
                >
                  {o.is_disabled ? <><Check size={12} /> Enable</> : <><Ban size={12} /> Disable</>}
                </button>
              </div>
            ))
          )}
        </div>
      )}

      {/* Tournaments Tab */}
      {tab === 'tournaments' && (
        <div className="space-y-2">
          {tournaments.length === 0 ? (
            <Card><p className="text-center text-gray-500 py-8">No tournaments yet.</p></Card>
          ) : (
            tournaments.map((t) => (
              <div key={t.id} className="card p-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <Badge className={STATUS_COLORS[t.status as keyof typeof STATUS_COLORS]}>
                        {STATUS_LABELS[t.status as keyof typeof STATUS_LABELS]}
                      </Badge>
                      <Badge className={PAYMENT_STATUS_COLORS[t.payment_status as keyof typeof PAYMENT_STATUS_COLORS]}>
                        {PAYMENT_STATUS_LABELS[t.payment_status as keyof typeof PAYMENT_STATUS_LABELS]}
                      </Badge>
                    </div>
                    <h3 className="font-medium text-white truncate">{t.title}</h3>
                    <div className="text-xs text-gray-500 mt-0.5">
                      {t.game} · by {t.organizer_name} · {t.player_count} players · {formatDateIST(t.created_at)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Link to={`/t/${t.slug}`} target="_blank" className="btn-ghost text-xs px-3 py-2">
                      <ExternalLink size={12} /> View
                    </Link>
                    <select
                      value={t.payment_status}
                      onChange={(e) => setPayTournament({ id: t.id, status: e.target.value })}
                      className="input py-1.5 text-xs w-auto"
                    >
                      <option value="unpaid">Unpaid</option>
                      <option value="paid">Paid</option>
                      <option value="free">Free</option>
                    </select>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      <ConfirmDialog
        open={!!toggleId}
        title={toggleId?.disable ? 'Disable organizer?' : 'Enable organizer?'}
        message={toggleId?.disable
          ? 'This organizer will not be able to log in or create new tournaments. Existing tournaments remain visible.'
          : 'This organizer will be able to log in and manage their tournaments again.'}
        confirmLabel={toggleId?.disable ? 'Disable' : 'Enable'}
        danger={toggleId?.disable}
        onConfirm={handleToggleOrganizer}
        onCancel={() => setToggleId(null)}
      />

      <ConfirmDialog
        open={!!payTournament}
        title="Update payment status?"
        message={`Mark this tournament as ${payTournament?.status}?`}
        confirmLabel="Update"
        onConfirm={handleSetPayment}
        onCancel={() => setPayTournament(null)}
      />
    </div>
  );
}
