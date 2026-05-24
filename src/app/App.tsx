import type { ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './AuthProvider';
import AccountPage from '../pages/AccountPage';
import ActivitiesPage from '../pages/ActivitiesPage';
import AdminPage from '../pages/AdminPage';
import CourtInfoPage from '../pages/CourtInfoPage';
import DashboardPage from '../pages/DashboardPage';
import LadderPage from '../pages/LadderPage';
import LoginPage from '../pages/LoginPage';
import ResetPasswordPage from '../pages/ResetPasswordPage';
import SignUpPage from '../pages/SignUpPage';

function PublicRoute({ children }: { children: ReactNode }) {
  const { isLoading, session } = useAuth();

  if (isLoading) {
    return <LoadingScreen />;
  }

  if (session) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { isLoading, session } = useAuth();

  if (isLoading) {
    return <LoadingScreen />;
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  return children;
}

function AdminRoute({ children }: { children: ReactNode }) {
  const { isLoading, role, session } = useAuth();

  if (isLoading) {
    return <LoadingScreen />;
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  if (role !== 'admin') {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}

function LoadingScreen() {
  return (
    <main className="court-surface grid min-h-screen place-items-center px-6 text-ink-900">
      <p className="premium-card rounded-2xl px-5 py-4 text-sm font-bold text-ink-700">
        Loading...
      </p>
    </main>
  );
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route
        path="/login"
        element={
          <PublicRoute>
            <LoginPage />
          </PublicRoute>
        }
      />
      <Route path="/admin-login" element={<Navigate to="/login" replace />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route
        path="/signup"
        element={
          <PublicRoute>
            <SignUpPage />
          </PublicRoute>
        }
      />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <DashboardPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/account"
        element={
          <ProtectedRoute>
            <AccountPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/activities"
        element={
          <ProtectedRoute>
            <ActivitiesPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/court-info"
        element={
          <ProtectedRoute>
            <CourtInfoPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin"
        element={
          <AdminRoute>
            <AdminPage />
          </AdminRoute>
        }
      />
      <Route
        path="/ladder"
        element={
          <ProtectedRoute>
            <LadderPage />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

export default App;
