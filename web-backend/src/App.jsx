import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import LandingPage from './pages/LandingPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import DashboardPage from './pages/DashboardPage';
import ScanPage from './pages/ScanPage';
import HistoryPage from './pages/HistoryPage';
import ScanDetailsPage from './pages/ScanDetailsPage';
import ProfilePage from './pages/ProfilePage';
import SubscriptionPage from './pages/SubscriptionPage';
import { getAuthToken,isCloudMode,usesCloudMedia } from './services/api';

function ProtectedRoute({ children }) {
  const [token, setToken] = useState(getAuthToken());

  useEffect(() => {
    const updateToken = () => setToken(getAuthToken());
    window.addEventListener('auth-session-expired', updateToken);

    return () => window.removeEventListener('auth-session-expired', updateToken);
  }, []);

  if (!token) {
    return <Navigate to="/login" replace />;
  }
  return children;
}

function PageMetadata() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    const titles = { '/': 'Image analysis with context', '/login': 'Sign in', '/register': 'Create account', '/dashboard': 'Dashboard', '/scan': 'Scan image', '/history': 'Scan history', '/profile': 'Your account', '/subscription': 'Subscription preview' };
    document.title = (pathname.startsWith('/scans/') ? 'Scan details' : titles[pathname] || 'Image analysis') + ' | AuthentiScan';
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView();
    else window.scrollTo(0, 0);
  }, [pathname, hash]);
  return null;
}

export default function App() {
  return (
    <Router>
      <div role="status" className="bg-amber-950 text-amber-200 text-center text-xs p-3 border-b border-amber-800">{isCloudMode?(usesCloudMedia?'FIREBASE + CLOUDINARY — new scan images are protected online. Older images, backend and AI still use this PC. Mobile is separate.':'FIREBASE CLOUD — accounts and scan records online. Images and AI remain on this PC. Mobile is separate.'):'FIREBASE LOCAL — test accounts and images only. No cloud billing. MySQL and mobile are separate.'}</div>
      <PageMetadata />
      <Routes>
        {/* Public Routes */}
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />

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
    </Router>
  );
}
