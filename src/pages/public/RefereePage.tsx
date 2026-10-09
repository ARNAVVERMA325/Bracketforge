import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';

interface RefMatch {
  id: string; round: number; match_index: number; bracket_side: string;
  p1_id: string; p1_name: string; p2_id: string; p2_name: string; is_current: boolean;
}

const ERRORS: Record<string, string> = {
  invalid_code: 'Wrong referee code.',
  not_live: 'The tournament is not live yet.',
  match_not_ready: 'This match is not ready.',
  not_allowed: 'This result was already entered. Ask the organizer to correct it.',
  invalid_winner: 'Invalid winner.',
  rate_limited: 'Too many attempts. Wait a few minutes.',
};

export default function RefereePage() {
  const { slug } = useParams<{ slug: string }>();
  const [code, setCode] = useState('');
  const [title, setTitle] = useState('');
  const [matches, setMatches] = useState<RefMatch[] | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [score, setScore] = useState('');
  const [busy, setBusy] = useState(false);

  async function load(c = code) {
    setBusy(true);
    const { data, error } = await supabase.rpc('referee_matches', { p_slug: slug, p_code: c });
    setBusy(false);
    if (error || !data?.ok) {
      setMsg(ERRORS[error?.message || data?.error] || 'Could not load matches.');
      setMatches(null);
      return;
    }
    setMsg(null);
    setTitle(data.title);
    setMatches(data.matches);
  }

  async function submit(m: RefMatch, winner: string) {
    setBusy(true);
    const { data, error } = await supabase.rpc('referee_submit_result', {
      p_slug: slug, p_code: code, p_match_id: m.id, p_winner_id: winner, p_score: score.trim(),
    });
    setBusy(false);
    if (error || !data?.ok) {
      setMsg(ERRORS[error?.message || data?.error] || 'Could not save the result.');
      return;
    }
    setOpen(null);
    setScore('');
    await load();
  }

  if (!matches) {
    return (
      <div className="max-w-sm mx-auto p-6 space-y-3">
        <h1 className="text-xl font-bold text-white">Referee login</h1>
        <input
          value={code} onChange={(e) => setCode(e.target.value)} placeholder="Referee code"
          autoCapitalize="characters"
          className="w-full px-4 py-3 rounded-lg bg-ink-800 border border-ink-600 text-white text-base uppercase"
        />
        <button onClick={() => load()} disabled={busy || !code.trim()}
          className="w-full py-3 rounded-lg bg-electric-600 text-white font-semibold disabled:opacity-50">Continue</button>
        {msg && <p className="text-sm text-crimson-400">{msg}</p>}
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto p-4 space-y-3">
      <h1 className="text-lg font-bold text-white">{title}: score entry</h1>
      {msg && <p className="text-sm text-crimson-400">{msg}</p>}
      {matches.length === 0 && <p className="text-gray-400 text-sm">No matches are ready right now.</p>}
      {matches.map((m) => (
        <div key={m.id} className={`rounded-xl border p-3 ${m.is_current ? 'border-crimson-500' : 'border-ink-700'} bg-ink-850`}>
          <div className="text-xs text-gray-500 mb-2">
            {m.bracket_side === 'bronze' ? 'Bronze match' : `Round ${m.round}`}{m.is_current ? ' · On now' : ''}
          </div>
          <div className="text-white text-sm mb-2">{m.p1_name} vs {m.p2_name}</div>
          {open === m.id ? (
            <div className="space-y-2">
              <input value={score} onChange={(e) => setScore(e.target.value)} placeholder="Score (optional), e.g. 2-1" maxLength={40}
                className="w-full px-3 py-3 rounded-lg bg-ink-800 border border-ink-600 text-white text-base" />
              <div className="grid grid-cols-2 gap-2">
                {[[m.p1_id, m.p1_name], [m.p2_id, m.p2_name]].map(([id, name]) => (
                  <button key={id} disabled={busy} onClick={() => submit(m, id)}
                    className="py-3 rounded-lg bg-electric-600 text-white text-sm font-semibold truncate px-2">{name} won</button>
                ))}
              </div>
              <button onClick={() => setOpen(null)} className="text-xs text-gray-500">Cancel</button>
            </div>
          ) : (
            <button onClick={() => setOpen(m.id)} className="w-full py-3 rounded-lg bg-ink-700 text-white text-sm font-semibold">Enter result</button>
          )}
        </div>
      ))}
      <button onClick={() => load()} className="text-xs text-gray-500">Refresh</button>
    </div>
  );
}
