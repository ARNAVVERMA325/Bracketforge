import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { User, Phone, Gamepad2, Loader2, Check, AlertCircle, Trophy } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { validateIndianPhone, normalizePhone } from '@/lib/utils';
import { Card, ErrorBanner } from '@/components/ui';

interface Tournament {
  id: string;
  title: string;
  slug: string;
  game: string;
  entry_fee: number;
  max_players: number | null;
  registration_open: boolean;
  status: string;
}

export default function RegisterPage() {
  const { slug } = useParams();
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [tag, setTag] = useState('');
  const [loadout, setLoadout] = useState('');

  useEffect(() => {
    if (!slug) return;
    supabase
      .from('tournaments')
      .select('id, title, slug, game, entry_fee, max_players, registration_open, status')
      .eq('slug', slug)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error || !data) {
          setError('Tournament not found.');
        } else {
          setTournament(data as Tournament);
        }
        setLoading(false);
      });
  }, [slug]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!tournament) return;
    if (!name.trim()) { setError('Please enter your name.'); return; }
    if (!validateIndianPhone(phone)) { setError('Please enter a valid 10-digit Indian mobile number (starts with 6, 7, 8, or 9).'); return; }

    setSubmitting(true);

    const normalized = normalizePhone(phone);

    // Check max players
    if (tournament.max_players) {
      const { count } = await supabase
        .from('players')
        .select('id', { count: 'exact', head: true })
        .eq('tournament_id', tournament.id)
        .in('status', ['pending', 'approved', 'checked_in']);
      if (count && count >= tournament.max_players) {
        setError('This tournament is full. Maximum player limit reached.');
        setSubmitting(false);
        return;
      }
    }

    const { error: insertError } = await supabase
      .from('players')
      .insert({
        tournament_id: tournament.id,
        name: name.trim(),
        phone: normalized,
        phone_normalized: normalized,
        team_tag: tag.trim(),
        character_loadout: loadout.trim(),
        status: 'pending',
      });

    if (insertError) {
      if (insertError.code === '23505') {
        setError('You are already registered for this tournament with this phone number.');
      } else {
        setError('Could not register. Please try again.');
        console.error('Registration error:', insertError);
      }
      setSubmitting(false);
      return;
    }

    setSubmitted(true);
    setSubmitting(false);
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 size={32} className="animate-spin text-electric-500" />
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md text-center">
          <div className="w-16 h-16 rounded-full bg-green-600/20 border border-green-600/40 flex items-center justify-center mx-auto mb-4">
            <Check size={32} className="text-green-400" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">You're registered!</h1>
          <p className="text-gray-400 mb-6">
            Your registration for <span className="text-white font-medium">{tournament?.title}</span> has been submitted.
            The organizer will confirm your spot soon.
          </p>
          <Link to={`/t/${tournament?.slug}`} className="btn-primary">View Tournament Page</Link>
        </div>
      </div>
    );
  }

  if (!tournament || !tournament.registration_open || tournament.status === 'cancelled' || tournament.status === 'finished') {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md text-center">
          <AlertCircle size={40} className="text-crimson-400 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-white mb-2">Registration closed</h1>
          <p className="text-gray-400 mb-6">
            {tournament
              ? 'Registration for this tournament is currently closed.'
              : 'This tournament was not found.'}
          </p>
          {tournament && <Link to={`/t/${tournament.slug}`} className="btn-ghost">View Tournament</Link>}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <Link to={`/t/${tournament.slug}`} className="inline-flex items-center gap-2 mb-4">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-electric-500 to-electric-700 flex items-center justify-center">
              <Trophy size={20} className="text-white" />
            </div>
          </Link>
          <h1 className="text-2xl font-bold text-white">Register for</h1>
          <p className="text-lg text-electric-400 font-medium">{tournament.title}</p>
          <p className="text-sm text-gray-500 mt-1">{tournament.game}</p>
        </div>

        <Card className="p-6">
          {error && <div className="mb-4"><ErrorBanner message={error} onDismiss={() => setError(null)} /></div>}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">Your Name *</label>
              <div className="relative">
                <User size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="input pl-10"
                  placeholder="Full name"
                />
              </div>
            </div>

            <div>
              <label className="label">Phone Number * (10-digit Indian mobile)</label>
              <div className="relative">
                <Phone size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                <span className="absolute left-10 top-1/2 -translate-y-1/2 text-gray-500 text-sm">+91</span>
                <input
                  type="tel"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                  className="input pl-16"
                  placeholder="9876543210"
                  inputMode="numeric"
                />
              </div>
              <p className="text-xs text-gray-600 mt-1.5">Your phone number is private. Only the organizer can see it.</p>
            </div>

            <div>
              <label className="label">Gamer Tag / Team Name (optional)</label>
              <input
                type="text"
                value={tag}
                onChange={(e) => setTag(e.target.value)}
                className="input"
                placeholder="e.g. ProGamer123 or Team Phoenix"
              />
            </div>

            <div>
              <label className="label">Character / Loadout (optional)</label>
              <div className="relative">
                <Gamepad2 size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                <input
                  type="text"
                  value={loadout}
                  onChange={(e) => setLoadout(e.target.value)}
                  className="input pl-10"
                  placeholder="e.g. Kazuya, Jett, M416"
                />
              </div>
            </div>

            <button type="submit" disabled={submitting} className="btn-primary w-full">
              {submitting ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
              {submitting ? 'Registering...' : 'Register'}
            </button>
          </form>

          <p className="text-center text-xs text-gray-600 mt-4">
            By registering, you agree to follow the tournament rules set by the organizer.
          </p>
        </Card>

        <p className="text-center mt-4">
          <Link to={`/t/${tournament.slug}`} className="text-sm text-gray-500 hover:text-gray-300">
            Back to tournament page
          </Link>
        </p>
      </div>
    </div>
  );
}
