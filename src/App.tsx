import { TermsPage, PrivacyPage, RefundPage, ContactPage } from '@/pages/LegalPages';
import TvPage from '@/pages/public/TvPage';
import OverlayPage from '@/pages/public/OverlayPage';
import RefereePage from '@/pages/public/RefereePage';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { Header, Footer } from '@/components/Layout';
import { FullPageLoader } from '@/components/ui';
import LandingPage from '@/pages/LandingPage';
import LoginPage from '@/pages/auth/LoginPage';
import SignUpPage from '@/pages/auth/SignUpPage';
import DashboardPage from '@/pages/dashboard/DashboardPage';
import TournamentCreatePage from '@/pages/dashboard/TournamentCreatePage';
import TournamentManagePage from '@/pages/dashboard/TournamentManagePage';
import PublicTournamentPage from '@/pages/public/PublicTournamentPage';
import EmbedPage from '@/pages/public/EmbedPage';
import RegisterPage from '@/pages/public/RegisterPage';
import AdminPage from '@/pages/admin/AdminPage';
import SettingsPage from '@/pages/SettingsPage';
import { ReactNode } from 'react';

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <FullPageLoader />;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function AdminRoute({ children }: { children: ReactNode }) {
  const { user, profile, loading } = useAuth();
  if (loading) return <FullPageLoader />;
  if (!user) return <Navigate to="/login" replace />;
  if (profile?.role !== 'super_admin') return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

function AppRoutes() {
  const { loading } = useAuth();
  const { pathname } = useLocation();
  const bare = /^\/(t\/[^/]+\/(embed|tv|overlay)|referee\/)/.test(pathname);
  if (loading) return <FullPageLoader />;

  return (
    <div className="flex flex-col min-h-screen">
      {!bare && <Header />}
      <main className="flex-1">
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignUpPage />} />
          <Route path="/t/:slug" element={<PublicTournamentPage />} />
          <Route path="/t/:slug/register" element={<RegisterPage />} />
          <Route path="/terms" element={<TermsPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/refund" element={<RefundPage />} />
          <Route path="/contact" element={<ContactPage />} />
          <Route path="/referee/:slug" element={<RefereePage />} />
          <Route path="/t/:slug/embed" element={<EmbedPage />} />
          <Route path="/t/:slug/tv" element={<TvPage />} />
          <Route path="/t/:slug/overlay" element={<OverlayPage />} />
          <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
          <Route path="/dashboard/new" element={<ProtectedRoute><TournamentCreatePage /></ProtectedRoute>} />
          <Route path="/dashboard/t/:slug" element={<ProtectedRoute><TournamentManagePage /></ProtectedRoute>} />
          <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
          <Route path="/admin" element={<AdminRoute><AdminPage /></AdminRoute>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      {!bare && <Footer />}
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}
