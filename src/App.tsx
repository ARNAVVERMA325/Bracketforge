import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
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
  if (loading) return <FullPageLoader />;

  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      <main className="flex-1">
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignUpPage />} />
          <Route path="/t/:slug" element={<PublicTournamentPage />} />
          <Route path="/t/:slug/register" element={<RegisterPage />} />
          <Route path="/t/:slug/embed" element={<EmbedPage />} />
          <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
          <Route path="/dashboard/new" element={<ProtectedRoute><TournamentCreatePage /></ProtectedRoute>} />
          <Route path="/dashboard/t/:slug" element={<ProtectedRoute><TournamentManagePage /></ProtectedRoute>} />
          <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
          <Route path="/admin" element={<AdminRoute><AdminPage /></AdminRoute>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <Footer />
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
