import { useState } from 'react';
import { User, Save, LogOut, Mail, Building, MapPin, Upload, AlertCircle } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { Card, ErrorBanner, LoadingSpinner } from '@/components/ui';

export default function SettingsPage() {
  const { profile, refreshProfile, signOut } = useAuth();
  const [displayName, setDisplayName] = useState(profile?.display_name || '');
  const [organization, setOrganization] = useState(profile?.organization || '');
  const [city, setCity] = useState(profile?.city || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(false);

    const { error } = await supabase
      .from('profiles')
      .update({ display_name: displayName, organization, city })
      .eq('id', profile!.id);

    if (error) {
      setError('Could not save your profile. Please try again.');
      console.error('Profile update error:', error);
    } else {
      setSuccess(true);
      await refreshProfile();
      setTimeout(() => setSuccess(false), 3000);
    }
    setSaving(false);
  };

  if (!profile) return <LoadingSpinner />;

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
      <h1 className="text-2xl font-bold text-white mb-6">Profile Settings</h1>

      <Card className="mb-5">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-electric-500/20 to-electric-700/20 border border-electric-600/30 flex items-center justify-center">
            <User size={28} className="text-electric-400" />
          </div>
          <div>
            <p className="text-sm text-gray-500">Account email</p>
            <p className="text-white font-medium">{profile.email}</p>
          </div>
        </div>

        {error && <div className="mb-4"><ErrorBanner message={error} onDismiss={() => setError(null)} /></div>}
        {success && (
          <div className="mb-4 px-4 py-3 rounded-xl bg-green-600/10 border border-green-600/30 text-green-400 text-sm animate-slide-down">
            Profile saved successfully.
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="label">Display Name</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="input"
              placeholder="Your name"
            />
          </div>

          <div>
            <label className="label">Organization / Café / Club</label>
            <input
              type="text"
              value={organization}
              onChange={(e) => setOrganization(e.target.value)}
              className="input"
              placeholder="e.g. Nexus Gaming Café"
            />
          </div>

          <div>
            <label className="label">City</label>
            <input
              type="text"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className="input"
              placeholder="e.g. Mumbai"
            />
          </div>

          <button onClick={handleSave} disabled={saving} className="btn-primary">
            {saving ? <LoadingSpinner size={16} /> : <Save size={16} />}
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </Card>

      <Card className="border-crimson-600/20">
        <h3 className="font-semibold text-white mb-2">Sign Out</h3>
        <p className="text-sm text-gray-400 mb-4">Sign out of your account on this device.</p>
        <button onClick={() => signOut()} className="btn-danger">
          <LogOut size={16} /> Sign Out
        </button>
      </Card>
    </div>
  );
}
