import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, AlertCircle, Image as ImageIcon, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { APP_CONFIG, type TournamentFormat, type SeedingMethod, type TournamentVisibility } from '@/config/app';
import { slugify, generateUniqueSlug } from '@/lib/utils';
import { Card, ErrorBanner } from '@/components/ui';

export default function TournamentCreatePage() {
  const navigate = useNavigate();
  const { profile } = useAuth();

  const [title, setTitle] = useState('');
  const [game, setGame] = useState('');
  const [description, setDescription] = useState('');
  const [venue, setVenue] = useState('');
  const [startDate, setStartDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [rules, setRules] = useState('');
  const [prize, setPrize] = useState('');
  const [entryFee, setEntryFee] = useState(0);
  const [maxPlayers, setMaxPlayers] = useState<number | ''>('');
  const [format, setFormat] = useState<TournamentFormat>('single_elimination');
  const [seedingMethod, setSeedingMethod] = useState<SeedingMethod>('random');
  const [visibility, setVisibility] = useState<TournamentVisibility>('public');
  const [hasBronzeMatch, setHasBronzeMatch] = useState(false);
  const [registrationOpen, setRegistrationOpen] = useState(true);
  const [posterUrl, setPosterUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePosterUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Please upload an image file (PNG, JPG, or WebP).');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('Image must be under 5MB.');
      return;
    }

    setUploading(true);
    setError(null);
    try {
      const ext = file.name.split('.').pop();
      const fileName = `${Date.now()}.${ext}`;
      const filePath = `${profile!.id}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('tournament-posters')
        .upload(filePath, file, { cacheControl: '3600', upsert: false });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('tournament-posters')
        .getPublicUrl(filePath);

      setPosterUrl(publicUrl);
    } catch (err) {
      setError('Could not upload the image. Please try again.');
      console.error('Upload error:', err);
    }
    setUploading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !game.trim()) {
      setError('Tournament title and game are required.');
      return;
    }

    setSaving(true);
    setError(null);

    // Generate slug
    const { data: existing } = await supabase
      .from('tournaments')
      .select('slug')
      .order('created_at', { ascending: false });

    const existingSlugs = existing?.map((t: any) => t.slug) || [];
    const slug = generateUniqueSlug(title, existingSlugs);

    // Combine date and time in IST
    let startDatetime: string | null = null;
    if (startDate) {
      const timeStr = startTime || '10:00';
      startDatetime = new Date(`${startDate}T${timeStr}:00+05:30`).toISOString();
    }

    const { data, error: insertError } = await supabase
      .from('tournaments')
      .insert({
        title: title.trim(),
        slug,
        game: game.trim(),
        description: description.trim(),
        venue: venue.trim(),
        start_datetime: startDatetime,
        poster_url: posterUrl || null,
        rules: rules.trim(),
        prize: prize.trim(),
        entry_fee: entryFee || 0,
        max_players: maxPlayers === '' ? null : maxPlayers,
        format,
        seeding_method: seedingMethod,
        visibility,
        has_bronze_match: hasBronzeMatch,
        registration_open: registrationOpen,
        status: 'draft',
        organizer_id: profile!.id,
      })
      .select('slug')
      .single();

    if (insertError) {
      setError('Could not create the tournament. Please try again.');
      console.error('Insert error:', insertError);
      setSaving(false);
      return;
    }

    navigate(`/dashboard/t/${data.slug}`);
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      <button onClick={() => navigate('/dashboard')} className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-300 mb-6">
        <ArrowLeft size={16} /> Back to Dashboard
      </button>

      <h1 className="text-2xl font-bold text-white mb-6">Create New Tournament</h1>

      {error && <div className="mb-5"><ErrorBanner message={error} onDismiss={() => setError(null)} /></div>}

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Basic Info */}
        <Card>
          <h2 className="text-lg font-semibold text-white mb-4">Basic Information</h2>
          <div className="space-y-4">
            <div>
              <label className="label">Tournament Title <span className="text-crimson-400">*</span></label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="input"
                placeholder="e.g. Winter Championship 2026"
              />
              {title && (
                <p className="text-xs text-gray-500 mt-1.5">
                  Public link: /t/{slugify(title) || 'tournament'}
                </p>
              )}
            </div>

            <div>
              <label className="label">Game <span className="text-crimson-400">*</span></label>
              <input
                type="text"
                required
                value={game}
                onChange={(e) => setGame(e.target.value)}
                className="input"
                placeholder="e.g. Tekken 8, Valorant, BGMI"
              />
            </div>

            <div>
              <label className="label">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="input min-h-[80px] resize-y"
                placeholder="Tell players what this tournament is about..."
              />
            </div>

            <div>
              <label className="label">Poster Image</label>
              <div className="flex items-center gap-4">
                {posterUrl ? (
                  <img src={posterUrl} alt="Poster" className="w-24 h-24 rounded-xl object-cover border border-ink-600" />
                ) : (
                  <div className="w-24 h-24 rounded-xl bg-ink-800 border border-ink-600 flex items-center justify-center">
                    <ImageIcon size={24} className="text-gray-600" />
                  </div>
                )}
                <div>
                  <label className="btn-ghost cursor-pointer text-sm">
                    {uploading ? <Loader2 size={16} className="animate-spin" /> : <ImageIcon size={16} />}
                    {uploading ? 'Uploading...' : 'Upload Image'}
                    <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={handlePosterUpload} />
                  </label>
                  <p className="text-xs text-gray-600 mt-1.5">PNG, JPG, or WebP. Max 5MB.</p>
                </div>
              </div>
            </div>
          </div>
        </Card>

        {/* Venue & Schedule */}
        <Card>
          <h2 className="text-lg font-semibold text-white mb-4">Venue & Schedule</h2>
          <div className="space-y-4">
            <div>
              <label className="label">Venue</label>
              <input
                type="text"
                value={venue}
                onChange={(e) => setVenue(e.target.value)}
                className="input"
                placeholder="e.g. Nexus Gaming Café, Bandra West, Mumbai"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Start Date</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="input"
                />
              </div>
              <div>
                <label className="label">Start Time (IST)</label>
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="input"
                />
              </div>
            </div>
          </div>
        </Card>

        {/* Format */}
        <Card>
          <h2 className="text-lg font-semibold text-white mb-4">Tournament Format</h2>
          <div className="space-y-4">
            <div>
              <label className="label">Format</label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {([
                  { value: 'single_elimination', label: 'Single Elimination', desc: 'One loss and out' },
                  { value: 'double_elimination', label: 'Double Elimination', desc: 'Two losses to out' },
                  { value: 'round_robin', label: 'Round Robin', desc: 'Everyone plays everyone' },
                ] as const).map((f) => (
                  <button
                    key={f.value}
                    type="button"
                    onClick={() => setFormat(f.value)}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      format === f.value
                        ? 'border-electric-500 bg-electric-600/10'
                        : 'border-ink-600 bg-ink-800 hover:border-ink-500'
                    }`}
                  >
                    <p className="text-sm font-semibold text-white">{f.label}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{f.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {format === 'single_elimination' && (
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={hasBronzeMatch}
                  onChange={(e) => setHasBronzeMatch(e.target.checked)}
                  className="w-5 h-5 rounded accent-electric-500"
                />
                <span className="text-sm text-gray-300">Include bronze match (3rd place)</span>
              </label>
            )}

            <div>
              <label className="label">Seeding Method</label>
              <select
                value={seedingMethod}
                onChange={(e) => setSeedingMethod(e.target.value as SeedingMethod)}
                className="input"
              >
                <option value="random">Random</option>
                <option value="manual">Manual (Drag & Drop)</option>
                <option value="registration_order">Registration Order</option>
              </select>
            </div>
          </div>
        </Card>

        {/* Rules & Prizes */}
        <Card>
          <h2 className="text-lg font-semibold text-white mb-4">Rules & Prizes</h2>
          <div className="space-y-4">
            <div>
              <label className="label">Rules</label>
              <textarea
                value={rules}
                onChange={(e) => setRules(e.target.value)}
                className="input min-h-[100px] resize-y"
                placeholder="Best of 3, double elimination, no items, etc."
              />
            </div>

            <div>
              <label className="label">Prizes</label>
              <textarea
                value={prize}
                onChange={(e) => setPrize(e.target.value)}
                className="input min-h-[60px] resize-y"
                placeholder="1st: ₹5,000, 2nd: ₹2,000, 3rd: ₹1,000"
              />
            </div>

            <div>
              <label className="label">Entry Fee (display only, INR)</label>
              <input
                type="number"
                min={0}
                value={entryFee}
                onChange={(e) => setEntryFee(Number(e.target.value))}
                className="input"
                placeholder="0"
              />
              <p className="text-xs text-gray-600 mt-1.5">Shown to players for information. No payment is processed.</p>
            </div>
          </div>
        </Card>

        {/* Settings */}
        <Card>
          <h2 className="text-lg font-semibold text-white mb-4">Registration & Visibility</h2>
          <div className="space-y-4">
            <div>
              <label className="label">Max Players (optional)</label>
              <input
                type="number"
                min={2}
                value={maxPlayers}
                onChange={(e) => setMaxPlayers(e.target.value === '' ? '' : Number(e.target.value))}
                className="input"
                placeholder="Leave empty for unlimited"
              />
            </div>

            <div>
              <label className="label">Visibility</label>
              <div className="grid grid-cols-2 gap-2">
                {([
                  { value: 'public', label: 'Public', desc: 'Anyone can find it' },
                  { value: 'unlisted', label: 'Unlisted', desc: 'Only with the link' },
                ] as const).map((v) => (
                  <button
                    key={v.value}
                    type="button"
                    onClick={() => setVisibility(v.value)}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      visibility === v.value
                        ? 'border-electric-500 bg-electric-600/10'
                        : 'border-ink-600 bg-ink-800 hover:border-ink-500'
                    }`}
                  >
                    <p className="text-sm font-semibold text-white">{v.label}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{v.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={registrationOpen}
                onChange={(e) => setRegistrationOpen(e.target.checked)}
                className="w-5 h-5 rounded accent-electric-500"
              />
              <span className="text-sm text-gray-300">Open registration now</span>
            </label>
          </div>
        </Card>

        <div className="flex items-center justify-end gap-3 pb-8">
          <button type="button" onClick={() => navigate('/dashboard')} className="btn-ghost">
            Cancel
          </button>
          <button type="submit" disabled={saving} className="btn-primary">
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            {saving ? 'Creating...' : 'Create Tournament'}
          </button>
        </div>
      </form>
    </div>
  );
}
