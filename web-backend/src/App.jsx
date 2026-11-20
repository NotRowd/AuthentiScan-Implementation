import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import LandingPage from './pages/LandingPage';
import LoginPage from './pages/LoginPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import RegisterPage from './pages/RegisterPage';
import VerifyEmailPage from './pages/VerifyEmailPage';
import DashboardPage from './pages/DashboardPage';
import ScanPage from './pages/ScanPage';
import HistoryPage from './pages/HistoryPage';
import ScanDetailsPage from './pages/ScanDetailsPage';
import ProfilePage from './pages/ProfilePage';
import SubscriptionPage from './pages/SubscriptionPage';
import PageErrorBoundary from './components/common/PageErrorBoundary';
import {MotionConfig} from 'framer-motion';
import { getAuthToken, getStoredUser, fetchMe } from './services/api';

function ProtectedRoute({ children, allowUnverified=false }) {
  const [token, setToken] = useState(getAuthToken());
  const [user, setUser] = useState(getStoredUser());

  useEffect(() => {
    const updateToken = () => {setToken(getAuthToken());setUser(getStoredUser());};
    window.addEventListener('auth-session-expired', updateToken);
    if(getAuthToken())fetchMe().catch(()=>{});

    return () => window.removeEventListener('auth-session-expired', updateToken);
  }, []);

  if (!token) {
    return <Navigate to="/login" replace />;
  }
  if(!allowUnverified && user?.email_verification_required && !user.email_verified)return <Navigate to="/verify-email" replace />;
  return children;
}

function PageMetadata() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    const titles = { '/': 'Image analysis with context', '/login': 'Sign in', '/forgot-password': 'Reset password', '/reset-password': 'Choose a new password', '/register': 'Create account', '/dashboard': 'Dashboard', '/scan': 'Scan image', '/history': 'Scan history', '/profile': 'Your account', '/subscription': 'Subscription preview' };
    document.title = (pathname==='/verify-email'?'Verify email':pathname.startsWith('/scans/') ? 'Scan details' : titles[pathname] || 'Image analysis') + ' | AuthentiScan';
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView();
    else window.scrollTo(0, 0);
  }, [pathname, hash]);
  return null;
}

function PageRecovery({children}) {
  const location = useLocation();
  return <PageErrorBoundary key={location.pathname}>{children}</PageErrorBoundary>;
}

export default function App() {
  return (
    <Router>
      <PageMetadata />
      <MotionConfig reducedMotion="user">
      <PageRecovery>
      <Routes>
        {/* Public Routes */}
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/verify-email" element={<ProtectedRoute allowUnverified><VerifyEmailPage /></ProtectedRoute>} />

        {/* Protected Routes (require authentication) */}
        <Route path="/scans/:scanId" element={<ProtectedRoute><ScanDetailsPage /></ProtectedRoute>} />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <DashboardPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/scan"
          element={
            <ProtectedRoute>
              <ScanPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/history"
          element={
            <ProtectedRoute>
              <HistoryPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/profile"
          element={
            <ProtectedRoute>
              <ProfilePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/subscription"
          element={
            <ProtectedRoute>
              <SubscriptionPage />
            </ProtectedRoute>
          }
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </PageRecovery>
      </MotionConfig>
    </Router>
  );
}

