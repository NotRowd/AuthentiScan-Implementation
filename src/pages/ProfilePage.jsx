import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, Key, AlertCircle, LogOut, Loader2, ShieldCheck } from 'lucide-react';
import DashboardLayout from '../components/layout/DashboardLayout';
import Card from '../components/common/Card';
import { fetchMe, clearAuthSession } from '../services/api';

export default function ProfilePage() {
  const [profileData, setProfileData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    let isMounted = true;

    fetchMe()
      .then((response) => {
        if (isMounted) {
          setProfileData(response.data);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setError(err.message || 'Failed to load user profile.');
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const handleLogout = () => {
    clearAuthSession();
    navigate('/login');
  };

  const user = profileData?.user;
  const plan = profileData?.plan;

  const initials = user?.first_name && user?.last_name
    ? `${user.first_name[0]}${user.last_name[0]}`.toUpperCase()
    : 'US';

  return (
    <DashboardLayout>
      <div className="space-y-8 max-w-4xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">Profile & Account</h1>
            <p className="text-sm text-slate-400 mt-1">
              Your registered user details, active subscription tier, and system session.
            </p>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="px-4 py-2 rounded-xl text-xs font-semibold bg-rose-500/10 text-rose-300 border border-rose-500/20 hover:bg-rose-500/20 transition-colors flex items-center gap-1.5 self-start sm:self-auto"
          >
            <LogOut className="w-4 h-4" />
            Log Out Account
          </button>
        </div>

        {/* Backend Connected Notice Banner */}
        <div className="p-4 rounded-xl bg-brand-500/10 border border-brand-500/20 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-brand-400 shrink-0 mt-0.5" />
          <div className="text-xs text-brand-200 leading-relaxed">
            <span className="font-semibold text-white">Backend Connected:</span> Account data loaded live from MySQL via <span className="font-mono text-white">GET /api/v1/auth/me</span>.
          </div>
        </div>

        {isLoading ? (
          <div className="py-16 text-center text-slate-400 flex flex-col items-center justify-center gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-brand-400" />
            <span>Loading user profile details...</span>
          </div>
        ) : error ? (
          <div className="p-4 rounded-xl border border-rose-500/40 bg-rose-500/10 text-xs text-rose-200 text-center">
            {error}
          </div>
        ) : (
          <>
            {/* User Card Header */}
            <div className="glass-panel rounded-2xl p-6 border border-slate-800 flex flex-col sm:flex-row items-center gap-6">
              <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-brand-600 to-purple-600 p-0.5 shadow-xl">
                <div className="w-full h-full rounded-full bg-slate-950 flex items-center justify-center font-bold text-2xl text-white">
                  {initials}
                </div>
              </div>
              <div className="text-center sm:text-left space-y-1">
                <h2 className="text-xl font-bold text-white">
                  {user?.first_name} {user?.last_name}
                </h2>
                <p className="text-xs text-slate-400">{user?.email}</p>
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-brand-500/10 text-brand-300 border border-brand-500/20 mt-2">
                  <ShieldCheck className="w-3.5 h-3.5 text-brand-400" />
                  Active Plan: {plan?.name || 'Free'} ({plan?.scan_limit ? `${plan.scan_limit} scans limit` : 'Unlimited scans'})
                </div>
              </div>
            </div>

            {/* Personal Details View */}
            <Card icon={User} title="Personal Credentials" subtitle="User account information from MySQL">
              <div className="mt-4 space-y-4 text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block font-semibold text-slate-400 uppercase tracking-wider mb-1">
                      First Name
                    </label>
                    <div className="bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-white font-medium">
                      {user?.first_name}
                    </div>
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-400 uppercase tracking-wider mb-1">
                      Last Name
                    </label>
                    <div className="bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-white font-medium">
                      {user?.last_name}
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block font-semibold text-slate-400 uppercase tracking-wider mb-1">
                    Email Address
                  </label>
                  <div className="bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-white font-medium">
                    {user?.email}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block font-semibold text-slate-400 uppercase tracking-wider mb-1">
                      Account Registered On
                    </label>
                    <div className="bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-slate-300">
                      {user?.created_at ? new Date(user.created_at).toLocaleString() : 'N/A'}
                    </div>
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-400 uppercase tracking-wider mb-1">
                      Last Login
                    </label>
                    <div className="bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-slate-300">
                      {user?.last_login_at ? new Date(user.last_login_at).toLocaleString() : 'Just now'}
                    </div>
                  </div>
                </div>
              </div>
            </Card>

            {/* Security & Token Info */}
            <Card icon={Key} title="Authentication Session" subtitle="JWT session state">
              <div className="mt-4 p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-300">Session Status:</span>
                  <span className="font-mono text-emerald-400">Authenticated (Active JWT)</span>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Your session is authenticated via JWT Bearer token signed by the Express backend. All uploads and scans are strictly scoped to your user ID.
                </p>
              </div>
            </Card>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
