import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Trophy, LogOut, LayoutDashboard, Menu, X, Shield, User as UserIcon } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { APP_CONFIG } from '@/config/app';
import { getInitials } from '@/lib/utils';

export function Header() {
  const { user, profile, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  const isActive = (path: string) => location.pathname === path;

  return (
    <header className="sticky top-0 z-40 bg-ink-950/90 backdrop-blur-lg border-b border-ink-700">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-16">
          <Link to="/" className="flex items-center gap-2 group">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-electric-500 to-electric-700 flex items-center justify-center group-hover:shadow-lg group-hover:shadow-electric-600/30 transition-all">
              <Trophy size={20} className="text-white" />
            </div>
            <span className="font-bold text-lg text-white tracking-tight hidden sm:block">
              {APP_CONFIG.name}
            </span>
          </Link>

          {user && profile ? (
            <div className="flex items-center gap-2">
              <nav className="hidden md:flex items-center gap-1">
                <Link
                  to="/dashboard"
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isActive('/dashboard') ? 'text-electric-400 bg-electric-600/10' : 'text-gray-400 hover:text-gray-200 hover:bg-ink-800'
                  }`}
                >
                  <LayoutDashboard size={16} className="inline mr-1.5 -mt-0.5" />
                  Dashboard
                </Link>
                {profile.role === 'super_admin' && (
                  <Link
                    to="/admin"
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      isActive('/admin') ? 'text-crimson-400 bg-crimson-600/10' : 'text-gray-400 hover:text-gray-200 hover:bg-ink-800'
                    }`}
                  >
                    <Shield size={16} className="inline mr-1.5 -mt-0.5" />
                    Admin
                  </Link>
                )}
              </nav>

              <div className="hidden md:flex items-center gap-2 pl-2 ml-2 border-l border-ink-700">
                <Link to="/settings" className="flex items-center gap-2 group">
                  <div className="w-8 h-8 rounded-full bg-ink-700 flex items-center justify-center text-xs font-bold text-electric-400 group-hover:bg-ink-600 transition-colors">
                    {getInitials(profile.display_name || profile.email)}
                  </div>
                  <span className="text-sm text-gray-300 max-w-[120px] truncate">
                    {profile.display_name || profile.email}
                  </span>
                </Link>
                <button onClick={handleSignOut} className="p-2 rounded-lg text-gray-500 hover:text-crimson-400 hover:bg-ink-800 transition-colors" title="Sign out">
                  <LogOut size={18} />
                </button>
              </div>

              <button onClick={() => setMenuOpen(!menuOpen)} className="md:hidden p-2 rounded-lg text-gray-400 hover:bg-ink-800">
                {menuOpen ? <X size={20} /> : <Menu size={20} />}
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Link to="/login" className="btn-ghost text-sm hidden sm:inline-flex">Log In</Link>
              <Link to="/signup" className="btn-primary text-sm">Sign Up Free</Link>
            </div>
          )}
        </div>

        {menuOpen && user && profile && (
          <div className="md:hidden py-3 border-t border-ink-700 animate-slide-down">
            <Link to="/dashboard" onClick={() => setMenuOpen(false)} className="flex items-center gap-3 px-4 py-3 rounded-lg text-gray-300 hover:bg-ink-800">
              <LayoutDashboard size={18} /> Dashboard
            </Link>
            {profile.role === 'super_admin' && (
              <Link to="/admin" onClick={() => setMenuOpen(false)} className="flex items-center gap-3 px-4 py-3 rounded-lg text-gray-300 hover:bg-ink-800">
                <Shield size={18} /> Admin Panel
              </Link>
            )}
            <Link to="/settings" onClick={() => setMenuOpen(false)} className="flex items-center gap-3 px-4 py-3 rounded-lg text-gray-300 hover:bg-ink-800">
              <UserIcon size={18} /> Profile Settings
            </Link>
            <button onClick={handleSignOut} className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-crimson-400 hover:bg-ink-800">
              <LogOut size={18} /> Sign Out
            </button>
          </div>
        )}
      </div>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="border-t border-ink-800 mt-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-electric-500 to-electric-700 flex items-center justify-center">
              <Trophy size={14} className="text-white" />
            </div>
            <span className="text-sm text-gray-500">
              {APP_CONFIG.name} — {APP_CONFIG.tagline}
            </span>
          </div>
          <nav className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-gray-500">
            <Link to="/terms" className="hover:text-gray-300">Terms</Link>
            <Link to="/privacy" className="hover:text-gray-300">Privacy</Link>
            <Link to="/refund" className="hover:text-gray-300">Refunds</Link>
            <Link to="/contact" className="hover:text-gray-300">Contact</Link>
          </nav>
        </div>
      </div>
    </footer>
  );
}
