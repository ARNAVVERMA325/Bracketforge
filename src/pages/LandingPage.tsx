import { Link } from 'react-router-dom';
import { Trophy, Zap, Users, Eye, Shield, Smartphone, Share2, GitBranch, ArrowRight, Gamepad2, Calendar, MapPin } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { APP_CONFIG } from '@/config/app';

export default function LandingPage() {
  const { user } = useAuth();

  return (
    <div className="min-h-screen">
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-electric-900/10 via-transparent to-transparent" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-electric-600/10 rounded-full blur-[120px] pointer-events-none" />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 pt-20 pb-24 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-ink-800 border border-ink-700 mb-6 animate-fade-in">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-live-dot" />
            <span className="text-sm text-gray-400">Free during beta — no ads, no limits</span>
          </div>

          <h1 className="text-4xl sm:text-6xl font-extrabold text-white tracking-tight mb-4 animate-slide-up">
            Run tournaments for your
            <span className="block bg-gradient-to-r from-electric-400 to-electric-600 bg-clip-text text-transparent">
              gaming community
            </span>
          </h1>

          <p className="text-lg text-gray-400 max-w-2xl mx-auto mb-8 animate-slide-up" style={{ animationDelay: '0.1s' }}>
            {APP_CONFIG.name} helps cafés, college clubs, and local esports groups in India run
            single-elimination, double-elimination, and round-robin tournaments — free, fast, and mobile-first.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 animate-slide-up" style={{ animationDelay: '0.2s' }}>
            {user ? (
              <Link to="/dashboard" className="btn-primary text-base px-6 py-3.5">
                Go to Dashboard <ArrowRight size={18} />
              </Link>
            ) : (
              <Link to="/signup" className="btn-primary text-base px-6 py-3.5">
                Start Free — No Card Needed <ArrowRight size={18} />
              </Link>
            )}
            <Link to="/t/demo-championship" className="btn-outline text-base px-6 py-3.5">
              View Demo Tournament
            </Link>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {[
            { icon: GitBranch, title: 'Multiple Formats', desc: 'Single elimination with byes, double elimination, and round robin. Random, manual, or registration-order seeding.' },
            { icon: Users, title: 'Player Registration', desc: 'Share a link, collect registrations with phone validation, approve or reject players, and check them in on event day.' },
            { icon: Eye, title: 'Live Brackets', desc: 'Public tournament pages with auto-refreshing brackets. Spectators follow along without logging in.' },
            { icon: Share2, title: 'Shareable & Embeddable', desc: 'WhatsApp-friendly link previews with your poster. One-line iframe embed code for your own website.' },
            { icon: Smartphone, title: 'Mobile-First', desc: 'Designed for phones first. Large touch targets, fast loading, works on any device your players bring.' },
            { icon: Shield, title: 'Privacy First', desc: 'Phone numbers and emails never appear on public pages. Only you and the platform admin can see them.' },
          ].map((f, i) => (
            <div key={i} className="card p-6 hover:border-electric-600/40 transition-colors animate-slide-up" style={{ animationDelay: `${i * 0.05}s` }}>
              <div className="w-11 h-11 rounded-xl bg-electric-600/15 flex items-center justify-center mb-4">
                <f.icon size={22} className="text-electric-400" />
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">{f.title}</h3>
              <p className="text-sm text-gray-400 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-16">
        <h2 className="text-3xl font-bold text-white text-center mb-12">From setup to champion in minutes</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {[
            { icon: Trophy, step: '1', title: 'Create', desc: 'Set up your tournament with game, venue, date, and rules.' },
            { icon: Users, step: '2', title: 'Register', desc: 'Share the link. Players sign up with name and phone.' },
            { icon: GitBranch, step: '3', title: 'Generate', desc: 'Check in players and generate the bracket instantly.' },
            { icon: Zap, step: '4', title: 'Run it', desc: 'Enter results, track winners, crown your champion.' },
          ].map((s, i) => (
            <div key={i} className="relative">
              <div className="card p-6 text-center">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-electric-500/20 to-electric-700/20 border border-electric-600/30 flex items-center justify-center mx-auto mb-4">
                  <s.icon size={24} className="text-electric-400" />
                </div>
                <div className="absolute -top-2 -right-2 w-7 h-7 rounded-full bg-electric-600 text-white text-xs font-bold flex items-center justify-center">
                  {s.step}
                </div>
                <h3 className="font-semibold text-white mb-1">{s.title}</h3>
                <p className="text-sm text-gray-400">{s.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-16">
        <div className="card p-10 text-center relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-electric-600/10 rounded-full blur-[80px]" />
          <div className="relative">
            <Gamepad2 size={40} className="text-electric-400 mx-auto mb-4" />
            <h2 className="text-3xl font-bold text-white mb-3">Ready to run your first tournament?</h2>
            <p className="text-gray-400 mb-6 max-w-xl mx-auto">
              Join gaming communities across India using {APP_CONFIG.name} to run clean, professional tournaments.
            </p>
            {user ? (
              <Link to="/dashboard" className="btn-primary text-base px-6 py-3.5">
                Go to Your Dashboard <ArrowRight size={18} />
              </Link>
            ) : (
              <Link to="/signup" className="btn-primary text-base px-6 py-3.5">
                Get Started Free <ArrowRight size={18} />
              </Link>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
