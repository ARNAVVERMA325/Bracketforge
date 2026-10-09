import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft, Users, GitBranch, Settings, Plus, Check, X, Trash2,
  Phone, Gamepad2, Calendar, MapPin, Trophy, Share2, Copy, ExternalLink,
  Loader2, RefreshCw, AlertCircle, Code, ChevronDown, ChevronRight, Play, Award, Ban
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import {
  STATUS_LABELS, STATUS_COLORS, FORMAT_LABELS, FORMAT_SHORT,
  PLAYER_STATUS_LABELS, PLAYER_STATUS_COLORS, PAYMENT_STATUS_LABELS, PAYMENT_STATUS_COLORS,
  VISIBILITY_LABELS,
} from '@/config/app';
import {
  formatIST, formatDateIST, formatINR, validateIndianPhone, normalizePhone,
  generateUniqueSlug, slugify,
} from '@/lib/utils';
import { buildBracket, seedPlayers, applyResult, clearResult, type MatchData } from '@/lib/bracket';
import { toCsv, parseCsv, downloadCsv } from '@/lib/csv';
import { Card, Badge, EmptyState, ConfirmDialog, Modal, ErrorBanner } from '@/components/ui';
import BracketView, { type BracketMatch } from '@/components/BracketView';

type Tab = 'overview' | 'players' | 'bracket' | 'settings';

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
  seeding_method: string;
  visibility: string;
  status: string;
  has_bronze_match: boolean;
  registration_open: boolean;
  payment_status: string;
}

interface Player {
  id: string;
  name: string;
  phone: string;
  team_tag: string;
  character_loadout: string;
  seed: number | null;
  status: string;
  checked_in_at: string | null;
  registered_at: string;
}

const MATCH_COLUMNS = [
  'id', 'tournament_id', 'round', 'match_index', 'bracket_side', 'player1_id', 'player2_id',
  'winner_id', 'loser_id', 'score', 'match_details', 'status', 'next_match_id',
  'next_loser_match_id', 'is_bye', 'is_current', 'completed_at', 'station',
] as const;

/** keep only real database columns (UI rows carry extra display fields like player names) */
function matchRow(m: any) {
  const row: Record<string, unknown> = {};
  for (const c of MATCH_COLUMNS) if (m[c] !== undefined) row[c] = m[c];
  return row;
}

export default function TournamentManagePage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [matches, setMatches] = useState<BracketMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('overview');
  const [error, setError] = useState<string | null>(null);
  const [addPlayerOpen, setAddPlayerOpen] = useState(false);
  const [scoreMatch, setScoreMatch] = useState<BracketMatch | null>(null);
  const [embedOpen, setEmbedOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [refCode, setRefCode] = useState<string | null>(null);
  const [auditRows, setAuditRows] = useState<any[] | null>(null);

  // Add player form
  const [pName, setPName] = useState('');
  const [pPhone, setPPhone] = useState('');
  const [pTag, setPTag] = useState('');
  const [pLoadout, setPLoadout] = useState('');
  const [addError, setAddError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  // Score entry
  const [scoreWinner, setScoreWinner] = useState<string>('');
  const [scoreText, setScoreText] = useState('');

  const loadTournament = useCallback(async () => {
    if (!slug) return;
    setLoading(true);
    const { data: t, error: tErr } = await supabase
      .from('tournaments')
      .select('*')
      .eq('slug', slug)
      .maybeSingle();

    if (tErr || !t) {
      setError('Tournament not found.');
      setLoading(false);
      return;
    }
    if (t.organizer_id !== profile!.id) {
      setError('You do not have access to this tournament.');
      setLoading(false);
      return;
    }
    setTournament(t as Tournament);

    const [{ data: pData }, { data: mData }] = await Promise.all([
      supabase.from('players').select('*').eq('tournament_id', t.id).order('registered_at', { ascending: true }),
      supabase.from('matches').select('*').eq('tournament_id', t.id).order('round, match_index', { ascending: true }),
    ]);

    setPlayers((pData || []) as Player[]);

    if (mData && mData.length > 0) {
      const playerMap = new Map((pData || []).map((p: any) => [p.id, p]));
      const enriched: BracketMatch[] = mData.map((m: any) => ({
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
  }, [slug, profile]);

  useEffect(() => { loadTournament(); }, [loadTournament]);

  async function updateStatus(newStatus: string) {
    if (!tournament) return;
    setError(null);

    // Check payment gate
    if (newStatus === 'live' || newStatus === 'registration_open') {
      if (tournament.payment_status === 'unpaid') {
        const { data: settings } = await supabase.from('app_settings').select('free_during_beta').eq('id', 1).maybeSingle();
        if (!settings?.free_during_beta) {
          setError('This tournament is unpaid. It cannot go live until payment is marked as paid by the platform admin.');
          return;
        }
      }
    }

    const { error } = await supabase.from('tournaments').update({ status: newStatus }).eq('id', tournament.id);
    if (error) {
      setError(error.message?.includes('payment_required')
        ? 'This tournament is unpaid. It cannot go live until payment is marked as paid by the platform admin.'
        : 'Could not update tournament status.');
      return;
    }
    setTournament({ ...tournament, status: newStatus });
  }

  async function toggleRegistration() {
    if (!tournament) return;
    const newVal = !tournament.registration_open;
    const { error } = await supabase.from('tournaments').update({ registration_open: newVal }).eq('id', tournament.id);
    if (error) return;
    setTournament({ ...tournament, registration_open: newVal });
  }

  async function addPlayer() {
    if (!tournament || !pName.trim() || !pPhone.trim()) {
      setAddError('Name and phone are required.');
      return;
    }
    if (!validateIndianPhone(pPhone)) {
      setAddError('Please enter a valid 10-digit Indian mobile number.');
      return;
    }
    const normalized = normalizePhone(pPhone);
    // Check duplicate
    const dup = players.find((p) => normalizePhone(p.phone) === normalized);
    if (dup) {
      setAddError('A player with this phone number is already registered.');
      return;
    }
    if (tournament.max_players && players.length >= tournament.max_players) {
      setAddError('Maximum player limit reached.');
      return;
    }

    setAdding(true);
    const { data, error } = await supabase
      .from('players')
      .insert({
        tournament_id: tournament.id,
        name: pName.trim(),
        phone: normalized,
        phone_normalized: normalized,
        team_tag: pTag.trim(),
        character_loadout: pLoadout.trim(),
        status: 'approved',
      })
      .select()
      .single();

    if (error) {
      setAddError('Could not add player. They may already be registered.');
      setAdding(false);
      return;
    }
    setPlayers([...players, data as Player]);
    setPName(''); setPPhone(''); setPTag(''); setPLoadout('');
    setAddError(null);
    setAdding(false);
  }

  async function updatePlayerStatus(playerId: string, newStatus: string) {
    const updates: any = { status: newStatus };
    if (newStatus === 'checked_in') updates.checked_in_at = new Date().toISOString();
    if (newStatus !== 'checked_in') updates.checked_in_at = null;

    const { error } = await supabase.from('players').update(updates).eq('id', playerId);
    if (error) return;
    setPlayers(players.map((p) => (p.id === playerId ? { ...p, ...updates } : p)));
  }

  async function removePlayer(playerId: string) {
    const { error } = await supabase.from('players').delete().eq('id', playerId);
    if (error) return;
    setPlayers(players.filter((p) => p.id !== playerId));
  }

  async function handleGenerateBracket() {
    if (!tournament) return;
    const checkedIn = players.filter((p) => p.status === 'checked_in');
    if (checkedIn.length < 2) {
      setError('At least 2 checked-in players are needed to generate a bracket.');
      return;
    }

    setGenerating(true);
    setError(null);

    // Seed players (parallel updates)
    const seeded = seedPlayers(players, tournament.seeding_method);
    await Promise.all(
      seeded.map((p, i) => supabase.from('players').update({ seed: i + 1 }).eq('id', p.id))
    );

    // Build the full bracket (ids, links and byes resolved) and insert it in ONE call
    await supabase.from('matches').delete().eq('tournament_id', tournament.id);
    const built = buildBracket(seeded, tournament.format, tournament.has_bronze_match);
    const { error: insErr } = await supabase
      .from('matches')
      .insert(built.map((m) => matchRow({ ...m, tournament_id: tournament.id })));

    if (insErr) {
      setError('Could not generate bracket.');
      setGenerating(false);
      return;
    }

    await loadTournament();
    setGenerating(false);
    setTab('bracket');
  }

  function exportRegistrants() {
    if (!tournament) return;
    const rows = players.map((p) => ({
      name: p.name, phone: p.phone, team_tag: p.team_tag, character_loadout: p.character_loadout,
      status: p.status, seed: p.seed ?? '',
    }));
    downloadCsv(`${tournament.slug}-players.csv`, toCsv(rows, ['name', 'phone', 'team_tag', 'character_loadout', 'status', 'seed']));
  }

  function exportResults() {
    if (!tournament) return;
    const rows = matches
      .filter((m) => !m.is_bye)
      .map((m) => ({
        round: m.bracket_side === 'bronze' ? 'Bronze' : m.round,
        match: m.match_index + 1,
        player1: m.player1_name ?? '',
        player2: m.player2_name ?? '',
        winner: m.winner_id === m.player1_id ? m.player1_name ?? '' : m.winner_id === m.player2_id ? m.player2_name ?? '' : '',
        score: m.score,
        status: m.status,
      }));
    downloadCsv(`${tournament.slug}-results.csv`, toCsv(rows, ['round', 'match', 'player1', 'player2', 'winner', 'score', 'status']));
  }

  async function importPlayers(file: File) {
    if (!tournament) return;
    setError(null);
    const table = parseCsv(await file.text());
    if (table.length < 2 || table.length > 501) {
      setError('CSV must have a header row and 1 to 500 players.');
      return;
    }
    const header = table[0].map((h) => h.trim().toLowerCase());
    const col = (names: string[]) => header.findIndex((h) => names.includes(h));
    const iName = col(['name', 'player', 'player name']);
    const iPhone = col(['phone', 'mobile', 'phone number', 'mobile number']);
    const iTag = col(['team_tag', 'gamer tag', 'tag', 'team']);
    const iLoadout = col(['character_loadout', 'character', 'loadout']);
    if (iName < 0 || iPhone < 0) {
      setError('CSV needs "name" and "phone" columns.');
      return;
    }
    const seen = new Set(players.map((p) => normalizePhone(p.phone)));
    const toInsert: any[] = [];
    let skipped = 0;
    for (const r of table.slice(1)) {
      const name = (r[iName] || '').trim().slice(0, 60);
      const phone = normalizePhone(r[iPhone] || '');
      if (name.length < 2 || !validateIndianPhone(phone) || seen.has(phone)) { skipped++; continue; }
      seen.add(phone);
      toInsert.push({
        tournament_id: tournament.id, name, phone, phone_normalized: phone,
        team_tag: iTag >= 0 ? (r[iTag] || '').trim().slice(0, 40) : '',
        character_loadout: iLoadout >= 0 ? (r[iLoadout] || '').trim().slice(0, 40) : '',
        status: 'approved',
      });
    }
    if (tournament.max_players && players.length + toInsert.length > tournament.max_players) {
      setError(`Import would exceed the max of ${tournament.max_players} players. Nothing was imported.`);
      return;
    }
    if (toInsert.length === 0) {
      setError(`No valid new players found (${skipped} rows skipped: bad phone, short name or duplicate).`);
      return;
    }
    const { error: insErr } = await supabase.from('players').insert(toInsert);
    if (insErr) {
      setError('Import failed. Nothing was imported.');
      return;
    }
    setError(skipped ? `Imported ${toInsert.length} players. ${skipped} rows skipped (bad phone, short name or duplicate).` : null);
    await loadTournament();
  }

  async function createRefereeCode() {
    if (!tournament) return;
    const { data, error } = await supabase.rpc('set_referee_code', { p_tournament_id: tournament.id });
    if (error) { setError('Could not create referee code.'); return; }
    setRefCode(data as string);
  }

  async function loadAudit() {
    if (!tournament) return;
    const { data } = await supabase
      .from('audit_log')
      .select('id, actor_role, old_value, new_value, created_at')
      .eq('tournament_id', tournament.id)
      .order('created_at', { ascending: false })
      .limit(30);
    setAuditRows(data || []);
  }

  async function persistChanges(updated: MatchData[], changed: string[]) {
    const rows = updated.filter((m) => changed.includes(m.id as string)).map(matchRow);
    const { error } = await supabase.from('matches').upsert(rows, { onConflict: 'id' });
    return !error;
  }

  async function saveScore() {
    if (!scoreMatch || !scoreWinner) return;
    try {
      const res = applyResult(matches as unknown as MatchData[], scoreMatch.id, scoreWinner, scoreText);
      if (!(await persistChanges(res.matches, res.changed))) {
        setError('Could not save the result.');
        return;
      }
    } catch (e: any) {
      setError(`Could not save the result (${e.message}).`);
      return;
    }
    setScoreMatch(null);
    setScoreWinner('');
    setScoreText('');
    await loadTournament();
  }

  async function correctMatchResult(match: BracketMatch) {
    if (!match.winner_id) return;
    try {
      const res = clearResult(matches as unknown as MatchData[], match.id);
      if (!(await persistChanges(res.matches, res.changed))) {
        setError('Could not reset the result.');
        return;
      }
    } catch (e: any) {
      setError(`Could not reset the result (${e.message}).`);
      return;
    }
    await loadTournament();
  }

  async function saveStation(match: BracketMatch, value: string) {
    const v = value.trim().slice(0, 20);
    if ((match.station || '') === v) return;
    const { error } = await supabase.from('matches').update({ station: v || null }).eq('id', match.id);
    if (error) { setError('Could not save the station.'); return; }
    setMatches(matches.map((m) => (m.id === match.id ? { ...m, station: v || null } : m)));
  }

  async function toggleCurrent(match: BracketMatch) {
    const newVal = !match.is_current;
    await supabase.from('matches').update({ is_current: newVal, status: newVal ? 'in_progress' : 'pending' }).eq('id', match.id);
    await loadTournament();
  }

  function copyLink() {
    navigator.clipboard.writeText(`${window.location.origin}/t/${tournament!.slug}`);
  }

  function copyRegLink() {
    navigator.clipboard.writeText(`${window.location.origin}/t/${tournament!.slug}/register`);
  }

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="skeleton h-8 w-64 mb-4" />
        <div className="skeleton h-32 mb-4" />
      </div>
    );
  }

  if (error && !tournament) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <AlertCircle size={40} className="text-crimson-400 mx-auto mb-4" />
        <p className="text-gray-400 mb-4">{error}</p>
        <Link to="/dashboard" className="btn-primary">Back to Dashboard</Link>
      </div>
    );
  }

  if (!tournament) return null;

  const checkedInCount = players.filter((p) => p.status === 'checked_in').length;
  const pendingCount = players.filter((p) => p.status === 'pending').length;
  const hasBracket = matches.length > 0;

  const tabs: { key: Tab; label: string; icon: any }[] = [
    { key: 'overview', label: 'Overview', icon: Trophy },
    { key: 'players', label: `Players (${players.length})`, icon: Users },
    { key: 'bracket', label: 'Bracket', icon: GitBranch },
    { key: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
      {/* Header */}
      <button onClick={() => navigate('/dashboard')} className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-300 mb-4">
        <ArrowLeft size={16} /> Dashboard
      </button>

      {error && <div className="mb-4"><ErrorBanner message={error} onDismiss={() => setError(null)} /></div>}

      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-6">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <Badge className={STATUS_COLORS[tournament.status as keyof typeof STATUS_COLORS]}>
              {STATUS_LABELS[tournament.status as keyof typeof STATUS_LABELS]}
            </Badge>
            <Badge className="bg-ink-700 text-gray-400">{FORMAT_LABELS[tournament.format as keyof typeof FORMAT_LABELS]}</Badge>
            <Badge className={PAYMENT_STATUS_COLORS[tournament.payment_status as keyof typeof PAYMENT_STATUS_COLORS]}>
              {PAYMENT_STATUS_LABELS[tournament.payment_status as keyof typeof PAYMENT_STATUS_LABELS]}
            </Badge>
          </div>
          <h1 className="text-2xl font-bold text-white truncate">{tournament.title}</h1>
          <div className="flex items-center gap-4 mt-1 text-sm text-gray-500 flex-wrap">
            <span className="flex items-center gap-1"><Gamepad2 size={14} /> {tournament.game}</span>
            {tournament.venue && <span className="flex items-center gap-1"><MapPin size={14} /> {tournament.venue}</span>}
            {tournament.start_datetime && <span className="flex items-center gap-1"><Calendar size={14} /> {formatDateIST(tournament.start_datetime)}</span>}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={copyLink} className="btn-ghost text-sm"><Share2 size={14} /> Copy Link</button>
          <button onClick={() => setEmbedOpen(true)} className="btn-ghost text-sm"><Code size={14} /> Embed</button>
          <Link to={`/t/${tournament.slug}`} target="_blank" className="btn-ghost text-sm"><ExternalLink size={14} /> View Public</Link>
        </div>
      </div>

      {/* Status Controls */}
      <Card className="mb-5">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-gray-300 mb-1">Tournament Status</p>
            <p className="text-xs text-gray-500">Change the status to control visibility and behavior.</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={tournament.status}
              onChange={(e) => updateStatus(e.target.value)}
              className="input py-2 text-sm w-auto"
            >
              <option value="draft">Draft</option>
              <option value="registration_open">Registration Open</option>
              <option value="live">Live</option>
              <option value="finished">Finished</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
        </div>
      </Card>

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-5 border-b border-ink-700 overflow-x-auto no-scrollbar">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              tab === t.key
                ? 'border-electric-500 text-electric-400'
                : 'border-transparent text-gray-500 hover:text-gray-300'
            }`}
          >
            <t.icon size={16} /> {t.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {tab === 'overview' && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card className="text-center py-4">
              <p className="text-2xl font-bold text-white">{players.length}</p>
              <p className="text-xs text-gray-500 mt-1">Registered</p>
            </Card>
            <Card className="text-center py-4">
              <p className="text-2xl font-bold text-green-400">{checkedInCount}</p>
              <p className="text-xs text-gray-500 mt-1">Checked In</p>
            </Card>
            <Card className="text-center py-4">
              <p className="text-2xl font-bold text-yellow-400">{pendingCount}</p>
              <p className="text-xs text-gray-500 mt-1">Pending</p>
            </Card>
            <Card className="text-center py-4">
              <p className="text-2xl font-bold text-electric-400">{matches.filter(m => m.status === 'completed').length}</p>
              <p className="text-xs text-gray-500 mt-1">Matches Done</p>
            </Card>
          </div>

          {tournament.poster_url && (
            <Card>
              <img src={tournament.poster_url} alt={tournament.title} className="w-full rounded-xl max-h-80 object-cover" />
            </Card>
          )}

          {tournament.description && (
            <Card>
              <h3 className="font-semibold text-white mb-2">About</h3>
              <p className="text-sm text-gray-400 whitespace-pre-wrap">{tournament.description}</p>
            </Card>
          )}

          <div className="grid sm:grid-cols-2 gap-4">
            {tournament.rules && (
              <Card>
                <h3 className="font-semibold text-white mb-2">Rules</h3>
                <p className="text-sm text-gray-400 whitespace-pre-wrap">{tournament.rules}</p>
              </Card>
            )}
            {tournament.prize && (
              <Card>
                <h3 className="font-semibold text-white mb-2">Prizes</h3>
                <p className="text-sm text-gray-400 whitespace-pre-wrap">{tournament.prize}</p>
              </Card>
            )}
          </div>

          <Card>
            <h3 className="font-semibold text-white mb-3">Quick Actions</h3>
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-400">Registration Link</span>
                <button onClick={copyRegLink} className="btn-ghost text-sm"><Copy size={14} /> Copy Registration Link</button>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-400">Registration Status</span>
                <button onClick={toggleRegistration} className={tournament.registration_open ? 'btn-danger text-sm' : 'btn-primary text-sm'}>
                  {tournament.registration_open ? 'Close Registration' : 'Open Registration'}
                </button>
              </div>
              {!hasBracket ? (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-400">Generate bracket from {checkedInCount} checked-in players</span>
                  <button onClick={handleGenerateBracket} disabled={generating || checkedInCount < 2} className="btn-primary text-sm">
                    {generating ? <Loader2 size={14} className="animate-spin" /> : <GitBranch size={14} />}
                    {generating ? 'Generating...' : 'Generate Bracket'}
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-400">Bracket generated ({matches.length} matches)</span>
                  <button onClick={handleGenerateBracket} disabled={generating} className="btn-ghost text-sm">
                    <RefreshCw size={14} /> Regenerate
                  </button>
                </div>
              )}
            </div>
          </Card>
        </div>
      )}

      {tab === 'players' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-white">Registered Players</h2>
            <button onClick={() => setAddPlayerOpen(true)} className="btn-primary text-sm">
              <Plus size={16} /> Add Player
            </button>
          </div>
          <div className="flex flex-wrap gap-2 text-sm">
            <button onClick={exportRegistrants} disabled={players.length === 0} className="px-3 py-2 rounded-lg bg-ink-700 text-white disabled:opacity-40">Export players (CSV)</button>
            <button onClick={exportResults} disabled={matches.length === 0} className="px-3 py-2 rounded-lg bg-ink-700 text-white disabled:opacity-40">Export results (CSV)</button>
            <label className="px-3 py-2 rounded-lg bg-ink-700 text-white cursor-pointer">
              Import players (CSV)
              <input type="file" accept=".csv,text/csv" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) importPlayers(f); e.target.value = ''; }} />
            </label>
          </div>

          {players.length === 0 ? (
            <Card>
              <EmptyState
                icon={<Users size={40} />}
                title="No players yet"
                description="Share the registration link or add players manually."
                action={<button onClick={() => setAddPlayerOpen(true)} className="btn-primary text-sm"><Plus size={16} /> Add Player</button>}
              />
            </Card>
          ) : (
            <div className="space-y-2">
              {players.map((p, i) => (
                <div key={p.id} className="card p-3 sm:p-4 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-ink-700 flex items-center justify-center text-xs font-bold text-gray-400 shrink-0">
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-white truncate">{p.name}</span>
                      {p.team_tag && <span className="text-xs text-electric-400 font-mono">{p.team_tag}</span>}
                      {p.character_loadout && <span className="text-xs text-gray-500">{p.character_loadout}</span>}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-gray-600 flex items-center gap-1"><Phone size={11} /> {p.phone}</span>
                    </div>
                  </div>
                  <Badge className={PLAYER_STATUS_COLORS[p.status as keyof typeof PLAYER_STATUS_COLORS]}>
                    {PLAYER_STATUS_LABELS[p.status as keyof typeof PLAYER_STATUS_LABELS]}
                  </Badge>
                  <div className="flex items-center gap-1">
                    {p.status === 'pending' && (
                      <button onClick={() => updatePlayerStatus(p.id, 'approved')} className="p-2 rounded-lg text-green-400 hover:bg-green-600/10" title="Approve">
                        <Check size={16} />
                      </button>
                    )}
                    {p.status === 'approved' && (
                      <button onClick={() => updatePlayerStatus(p.id, 'checked_in')} className="p-2 rounded-lg text-electric-400 hover:bg-electric-600/10" title="Check In">
                        <Check size={16} />
                      </button>
                    )}
                    {p.status === 'checked_in' && (
                      <button onClick={() => updatePlayerStatus(p.id, 'approved')} className="p-2 rounded-lg text-yellow-400 hover:bg-yellow-600/10" title="Undo Check-in">
                        <X size={16} />
                      </button>
                    )}
                    {p.status !== 'rejected' && (
                      <button onClick={() => updatePlayerStatus(p.id, 'rejected')} className="p-2 rounded-lg text-crimson-400 hover:bg-crimson-600/10" title="Reject">
                        <Ban size={16} />
                      </button>
                    )}
                    <button onClick={() => removePlayer(p.id)} className="p-2 rounded-lg text-gray-500 hover:text-crimson-400 hover:bg-ink-700" title="Remove">
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'bracket' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-white">Bracket</h2>
            {hasBracket && (
              <button onClick={handleGenerateBracket} disabled={generating} className="btn-ghost text-sm">
                <RefreshCw size={14} /> Regenerate
              </button>
            )}
          </div>

          {!hasBracket ? (
            <Card>
              <EmptyState
                icon={<GitBranch size={40} />}
                title="No bracket generated"
                description={`Check in your players (${checkedInCount} checked in) and generate the bracket to start matches.`}
                action={
                  <button onClick={handleGenerateBracket} disabled={generating || checkedInCount < 2} className="btn-primary text-sm">
                    {generating ? <Loader2 size={14} className="animate-spin" /> : <GitBranch size={14} />}
                    {generating ? 'Generating...' : 'Generate Bracket'}
                  </button>
                }
              />
            </Card>
          ) : (
            <>
              <Card className="p-3">
                <BracketView matches={matches} format={tournament.format} showNextUp={tournament.status === 'live'} onMatchClick={(m) => {
                  if (m.status === 'completed') {
                    setScoreMatch(m);
                  } else if (m.player1_id && m.player2_id) {
                    setScoreMatch(m);
                  }
                }} />
              </Card>

              {/* Match List for score entry */}
              <Card>
                <h3 className="font-semibold text-white mb-3 text-sm">Match Results</h3>
                <div className="space-y-1.5 max-h-96 overflow-y-auto">
                  {matches.filter(m => !m.is_bye).map((m) => (
                    <div key={m.id} className="flex items-center gap-3 p-2.5 rounded-lg bg-ink-800 hover:bg-ink-700 transition-colors">
                      <span className="text-xs text-gray-600 w-16 shrink-0">{m.bracket_side === 'winners' ? `R${m.round}` : m.bracket_side === 'bronze' ? '3rd' : `L${m.round}`}</span>
                      <span className="text-sm text-gray-300 flex-1 truncate">
                        {m.player1_name || 'TBD'} vs {m.player2_name || 'TBD'}
                      </span>
                      {m.status === 'completed' ? (
                        <>
                          <span className="text-xs text-electric-400">{m.score || 'Done'}</span>
                          <button onClick={() => correctMatchResult(m)} className="p-1.5 rounded-lg text-yellow-400 hover:bg-yellow-600/10" title="Correct result">
                            <RefreshCw size={13} />
                          </button>
                        </>
                      ) : m.player1_id && m.player2_id ? (
                        <>
                          <input
                            defaultValue={m.station || ''} maxLength={20} placeholder="Station"
                            onBlur={(e) => saveStation(m, e.target.value)}
                            className="w-24 px-2 py-1.5 rounded-lg bg-ink-800 border border-ink-600 text-white text-base"
                            aria-label="Station for this match"
                          />
                          <button onClick={() => toggleCurrent(m)} className={`p-1.5 rounded-lg ${m.is_current ? 'text-crimson-400' : 'text-gray-500'} hover:bg-ink-600`} title={m.is_current ? 'Remove "On Now"' : 'Mark "On Now"'}>
                            <Play size={13} />
                          </button>
                          <button onClick={() => setScoreMatch(m)} className="btn-primary text-xs px-3 py-1.5">Enter Result</button>
                        </>
                      ) : (
                        <span className="text-xs text-gray-600">Waiting</span>
                      )}
                    </div>
                  ))}
                </div>
              </Card>
            </>
          )}
        </div>
      )}

      {tab === 'settings' && (
        <div className="space-y-4">
          <Card>
            <h3 className="font-semibold text-white mb-2">Referee access</h3>
            <p className="text-xs text-gray-500 mb-3">Referees can only enter scores while the tournament is live. Generating a new code replaces the old one.</p>
            <button onClick={createRefereeCode} className="px-4 py-2.5 rounded-lg bg-ink-700 text-white text-sm font-semibold">Generate referee code</button>
            {refCode && (
              <div className="mt-3 text-sm text-gray-300">
                <div>Code (shown once): <span className="font-mono text-white">{refCode}</span></div>
                <div className="mt-1">Link: <span className="font-mono text-electric-400 text-xs">{window.location.origin}/referee/{tournament.slug}</span></div>
              </div>
            )}
          </Card>
          <Card>
            <h3 className="font-semibold text-white mb-2">Result history</h3>
            {auditRows === null ? (
              <button onClick={loadAudit} className="px-4 py-2.5 rounded-lg bg-ink-700 text-white text-sm font-semibold">Show last 30 changes</button>
            ) : auditRows.length === 0 ? (
              <p className="text-sm text-gray-500">No result changes yet.</p>
            ) : (
              <ul className="space-y-2 text-xs text-gray-400">
                {auditRows.map((r) => (
                  <li key={r.id} className="border-b border-ink-700 pb-2">
                    <span className="text-gray-300">{new Date(r.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</span>
                    {' · '}{r.actor_role}{' · '}
                    {r.new_value.bracket_side === 'bronze' ? 'Bronze' : `Round ${r.new_value.round}`}
                    {': '}{r.old_value.winner_name || 'none'} {r.old_value.score ? `(${r.old_value.score})` : ''}
                    {' → '}{r.new_value.winner_name || 'cleared'} {r.new_value.score ? `(${r.new_value.score})` : ''}
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card>
            <h3 className="font-semibold text-white mb-4">Tournament Settings</h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between py-2 border-b border-ink-700">
                <span className="text-gray-500">Format</span>
                <span className="text-gray-300">{FORMAT_LABELS[tournament.format as keyof typeof FORMAT_LABELS]}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-ink-700">
                <span className="text-gray-500">Seeding</span>
                <span className="text-gray-300 capitalize">{tournament.seeding_method.replace('_', ' ')}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-ink-700">
                <span className="text-gray-500">Visibility</span>
                <span className="text-gray-300">{VISIBILITY_LABELS[tournament.visibility as keyof typeof VISIBILITY_LABELS]}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-ink-700">
                <span className="text-gray-500">Entry Fee</span>
                <span className="text-gray-300">{formatINR(tournament.entry_fee)}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-ink-700">
                <span className="text-gray-500">Max Players</span>
                <span className="text-gray-300">{tournament.max_players || 'Unlimited'}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-ink-700">
                <span className="text-gray-500">Bronze Match</span>
                <span className="text-gray-300">{tournament.has_bronze_match ? 'Yes' : 'No'}</span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-gray-500">Public Link</span>
                <span className="text-electric-400 font-mono text-xs">/t/{tournament.slug}</span>
              </div>
            </div>
          </Card>

          <Card className="border-crimson-600/20">
            <h3 className="font-semibold text-crimson-400 mb-2">Danger Zone</h3>
            <p className="text-sm text-gray-400 mb-3">Permanently delete this tournament and all its data.</p>
            <button onClick={() => setDeleteConfirm(true)} className="btn-danger text-sm">
              <Trash2 size={14} /> Delete Tournament
            </button>
          </Card>
        </div>
      )}

      {/* Add Player Modal */}
      <Modal open={addPlayerOpen} onClose={() => setAddPlayerOpen(false)} title="Add Player Manually">
        {addError && <div className="mb-4"><ErrorBanner message={addError} onDismiss={() => setAddError(null)} /></div>}
        <div className="space-y-3">
          <div>
            <label className="label">Name *</label>
            <input type="text" value={pName} onChange={(e) => setPName(e.target.value)} className="input" placeholder="Player name" />
          </div>
          <div>
            <label className="label">Phone (10-digit) *</label>
            <input type="tel" value={pPhone} onChange={(e) => setPPhone(e.target.value)} className="input" placeholder="9876543210" maxLength={10} />
          </div>
          <div>
            <label className="label">Gamer Tag / Team (optional)</label>
            <input type="text" value={pTag} onChange={(e) => setPTag(e.target.value)} className="input" placeholder="e.g. ProGamer123" />
          </div>
          <div>
            <label className="label">Character / Loadout (optional)</label>
            <input type="text" value={pLoadout} onChange={(e) => setPLoadout(e.target.value)} className="input" placeholder="e.g. Kazuya" />
          </div>
          <button onClick={addPlayer} disabled={adding} className="btn-primary w-full">
            {adding ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
            {adding ? 'Adding...' : 'Add Player'}
          </button>
        </div>
      </Modal>

      {/* Score Entry Modal */}
      <Modal open={!!scoreMatch} onClose={() => { setScoreMatch(null); setScoreWinner(''); setScoreText(''); }} title="Enter Match Result">
        {scoreMatch && (
          <div className="space-y-4">
            <div className="text-center text-sm text-gray-400 mb-3">
              {scoreMatch.player1_name || 'TBD'} vs {scoreMatch.player2_name || 'TBD'}
              {scoreMatch.status === 'completed' && (
                <div className="mt-2 text-xs text-yellow-400">This match already has a result. Entering a new one will overwrite it.</div>
              )}
            </div>
            <div>
              <label className="label">Winner</label>
              <div className="space-y-2">
                {scoreMatch.player1_id && (
                  <button
                    onClick={() => setScoreWinner(scoreMatch.player1_id!)}
                    className={`w-full p-3 rounded-xl border text-left transition-all ${scoreWinner === scoreMatch.player1_id ? 'border-electric-500 bg-electric-600/10' : 'border-ink-600 bg-ink-800'}`}
                  >
                    <span className="text-white font-medium">{scoreMatch.player1_name}</span>
                    {scoreMatch.player1_tag && <span className="text-xs text-electric-400 ml-2">{scoreMatch.player1_tag}</span>}
                  </button>
                )}
                {scoreMatch.player2_id && (
                  <button
                    onClick={() => setScoreWinner(scoreMatch.player2_id!)}
                    className={`w-full p-3 rounded-xl border text-left transition-all ${scoreWinner === scoreMatch.player2_id ? 'border-electric-500 bg-electric-600/10' : 'border-ink-600 bg-ink-800'}`}
                  >
                    <span className="text-white font-medium">{scoreMatch.player2_name}</span>
                    {scoreMatch.player2_tag && <span className="text-xs text-electric-400 ml-2">{scoreMatch.player2_tag}</span>}
                  </button>
                )}
              </div>
            </div>
            <div>
              <label className="label">Score (optional)</label>
              <input type="text" value={scoreText} onChange={(e) => setScoreText(e.target.value)} className="input" placeholder="e.g. 2-1 or 3-0" />
            </div>
            <button onClick={saveScore} disabled={!scoreWinner} className="btn-primary w-full">
              <Check size={16} /> Save Result
            </button>
          </div>
        )}
      </Modal>

      {/* Embed Code Modal */}
      <Modal open={embedOpen} onClose={() => setEmbedOpen(false)} title="Embed Code">
        <div className="space-y-4">
          <p className="text-sm text-gray-400">Copy this code and paste it into your website to embed the live bracket:</p>
          <pre className="bg-ink-950 border border-ink-700 rounded-xl p-4 text-xs text-gray-300 overflow-x-auto whitespace-pre-wrap font-mono">
{`<iframe src="${window.location.origin}/t/${tournament.slug}/embed" width="100%" height="600" frameborder="0" style="border-radius:12px;border:none;background:#0a0a0f;" title="${tournament.title} - Live Bracket"></iframe>`}
          </pre>
          <button
            onClick={() => navigator.clipboard.writeText(`<iframe src="${window.location.origin}/t/${tournament.slug}/embed" width="100%" height="600" frameborder="0" style="border-radius:12px;border:none;background:#0a0a0f;" title="${tournament.title} - Live Bracket"></iframe>`)}
            className="btn-primary w-full"
          >
            <Copy size={16} /> Copy Embed Code
          </button>
          <p className="text-sm text-gray-400 mt-4">Registration form for your website:</p>
          <pre className="bg-ink-900 rounded-lg p-3 text-xs text-gray-300 overflow-x-auto whitespace-pre-wrap">
{`<iframe src="${window.location.origin}/t/${tournament.slug}/register" width="100%" height="640" frameborder="0" style="border:none;border-radius:12px;" title="${tournament.title} - Register"></iframe>`}
          </pre>
          <button
            onClick={() => navigator.clipboard.writeText(`<iframe src="${window.location.origin}/t/${tournament.slug}/register" width="100%" height="640" frameborder="0" style="border:none;border-radius:12px;" title="${tournament.title} - Register"></iframe>`)}
            className="px-3 py-2 rounded-lg bg-ink-700 text-white text-sm font-semibold"
          >
            Copy registration form code
          </button>
          <p className="text-xs text-gray-500">Café TV screen: <span className="font-mono">{window.location.origin}/t/{tournament.slug}/tv</span></p>
          <p className="text-xs text-gray-500">OBS overlay (Browser Source, 1280x200): <span className="font-mono">{window.location.origin}/t/{tournament.slug}/overlay</span></p>
          <p className="text-xs text-gray-500">Public JSON for developers: <span className="font-mono">{window.location.origin}/api/v1/tournaments/{tournament.slug}</span></p>
        </div>
      </Modal>

      <ConfirmDialog
        open={deleteConfirm}
        title="Delete tournament?"
        message="This will permanently delete the tournament, all players, and all match data. This cannot be undone."
        confirmLabel="Delete"
        danger
        onConfirm={async () => {
          await supabase.from('tournaments').delete().eq('id', tournament.id);
          navigate('/dashboard');
        }}
        onCancel={() => setDeleteConfirm(false)}
      />
    </div>
  );
}
