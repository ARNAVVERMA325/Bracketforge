import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Mail, Lock, User, ArrowRight, Trophy, Chrome, AlertCircle } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { APP_CONFIG } from '@/config/app';
import { ErrorBanner } from '@/components/ui';

export default function SignUpPage() {
  const { signUp, signInWithGoogle } = useAuth();
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }

    setLoading(true);
    const { error } = await signUp(email, password, displayName);
    if (error) {
      setError(error);
      setLoading(false);
    } else {
      navigate('/dashboard');
    }
  };

  const handleGoogle = async () => {
    setError(null);
    setGoogleLoading(true);
    const { error } = await signInWithGoogle();
    if (error) {
      setError(error);
      setGoogleLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex items-center gap-2 mb-6">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-electric-500 to-electric-700 flex items-center justify-center">
              <Trophy size={24} className="text-white" />
            </div>
          </Link>
          <h1 className="text-2xl font-bold text-white mb-1">Create your account</h1>
          <p className="text-sm text-gray-500">Start running tournaments for free</p>
        </div>

        <div className="card p-6">
          {error && <div className="mb-4"><ErrorBanner message={error} onDismiss={() => setError(null)} /></div>}

          <button
            onClick={handleGoogle}
            disabled={googleLoading || loading}
            className="w-full flex items-center justify-center gap-3 px-4 py-3 rounded-xl bg-white text-gray-800 font-semibold text-sm hover:bg-gray-100 transition-colors disabled:opacity-50"
          >
            <Chrome size={18} />
            {googleLoading ? 'Connecting...' : 'Sign up with Google'}
          </button>

          <div className="flex items-center gap-3 my-5">
            <div className="flex-1 h-px bg-ink-700" />
            <span className="text-xs text-gray-600 uppercase tracking-wider">or</span>
            <div className="flex-1 h-px bg-ink-700" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">Your Name</label>
              <div className="relative">
                <User size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                <input
                  type="text"
                  required
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="input pl-10"
                  placeholder="e.g. Arjun Sharma"
                  autoComplete="name"
                />
              </div>
            </div>

            <div>
              <label className="label">Email</label>
              <div className="relative">
                <Mail size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input pl-10"
                  placeholder="you@example.com"
                  autoComplete="email"
                />
              </div>
            </div>

            <div>
              <label className="label">Password</label>
              <div className="relative">
                <Lock size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input pl-10"
                  placeholder="At least 6 characters"
                  autoComplete="new-password"
                />
              </div>
            </div>

            <button type="submit" disabled={loading} className="btn-primary w-full">
              {loading ? 'Creating account...' : 'Create Account'}
              {!loading && <ArrowRight size={16} />}
            </button>
          </form>

          <p className="text-center text-sm text-gray-500 mt-5">
            Already have an account?{' '}
            <Link to="/login" className="text-electric-400 hover:text-electric-300 font-medium">
              Sign in
            </Link>
          </p>

          <p className="text-center text-xs text-gray-600 mt-4">
            By signing up, you agree to use {APP_CONFIG.name} for organizing gaming tournaments.
          </p>
        </div>
      </div>
    </div>
  );
}
