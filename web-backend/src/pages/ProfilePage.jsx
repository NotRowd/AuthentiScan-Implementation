import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, Key, AlertCircle, LogOut, Loader2, ShieldCheck, Sparkles, CheckCircle2 } from 'lucide-react';
import { motion } from 'framer-motion';
import DashboardLayout from '../components/layout/DashboardLayout';
import { fetchMe, clearAuthSession, isCloudMode, usesCloudMedia } from '../services/api';

const fadeIn = {
  hidden: { opacity: 0, y: 15 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4 } }
};

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.1 } }
};

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
      <motion.div initial="hidden" animate="visible" variants={staggerContainer} className="space-y-6 max-w-4xl mx-auto">
        
        {/* Header Section */}
        <motion.div variants={fadeIn} className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <p className="text-xs font-bold text-sky-500 uppercase tracking-[0.15em] mb-2">Account Settings</p>
            <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Profile & Preferences</h1>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="px-5 py-2.5 rounded-xl text-sm font-bold bg-white text-slate-700 border border-slate-200 hover:text-rose-600 hover:border-rose-200 hover:bg-rose-50 transition-colors flex items-center gap-2 shadow-sm shrink-0"
          >
            <LogOut className="w-4 h-4" />
            Log Out
          </button>
        </motion.div>

        {/* Backend Connected Notice Banner */}
        <motion.div variants={fadeIn} className="p-4 rounded-2xl bg-sky-50/80 border border-sky-100 flex items-start gap-3">
          <div className="w-8 h-8 rounded-full bg-sky-100 flex items-center justify-center shrink-0">
            <Sparkles className="w-4 h-4 text-sky-500" />
          </div>
          <div className="text-sm font-medium text-slate-600 leading-relaxed pt-1.5">
            <strong className="text-sky-900">{isCloudMode ? 'Cloud Connected:' : 'Local System:'}</strong> {isCloudMode ? (usesCloudMedia ? 'Using protected Cloudinary storage for new images.' : 'Accounts are online; images stored on this PC.') : 'Local Firebase version active. Separate from mobile.'}
          </div>
        </motion.div>

        {isLoading ? (
          <motion.div variants={fadeIn} className="py-24 flex flex-col items-center justify-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-white shadow-sm border border-slate-100 flex items-center justify-center">
              <Loader2 className="w-8 h-8 animate-spin text-sky-500" />
            </div>
            <span className="text-sm font-bold text-slate-500">Loading your profile...</span>
          </motion.div>
        ) : error ? (
          <motion.div variants={fadeIn} className="p-6 rounded-2xl border border-rose-200 bg-rose-50 text-sm font-bold text-rose-600 text-center flex items-center justify-center gap-3">
            <AlertCircle className="w-5 h-5" />
            {error}
          </motion.div>
        ) : (
          <div className="grid md:grid-cols-3 gap-6">
            
            {/* Left Column: Avatar Profile Card */}
            <motion.div variants={fadeIn} className="md:col-span-1 space-y-6">
              <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm flex flex-col items-center text-center">
                <div className="w-24 h-24 rounded-full bg-slate-50 border-4 border-white shadow-md flex items-center justify-center font-bold text-3xl text-sky-600 mb-4 ring-1 ring-slate-100">
                  {initials}
                </div>
                <h2 className="text-xl font-bold text-slate-900 break-words w-full">
                  {user?.first_name} {user?.last_name}
                </h2>
                <p className="text-sm font-medium text-slate-500 mb-6 truncate w-full">{user?.email}</p>
                
                <div className="w-full bg-slate-50 rounded-xl p-4 border border-slate-100 text-left">
                  <div className="flex items-center gap-2 mb-1">
                    <ShieldCheck className="w-4 h-4 text-emerald-500" />
                    <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">Active Plan</span>
                  </div>
                  <p className="text-lg font-bold text-slate-900 mb-1">{plan?.name || 'Free Tier'}</p>
                  <p className="text-xs font-medium text-slate-500">
                    {plan?.scan_limit === null ? 'Unlimited scans' : plan?.scan_limit != null ? `${plan.scan_limit} scans/day` : 'Allowance unavailable'}
                  </p>
                </div>
                
                <button className="w-full mt-4 py-2.5 rounded-xl font-bold text-sm bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100 hover:text-slate-900 transition-colors">
                  Edit Avatar
                </button>
              </div>
            </motion.div>
            
            {/* Right Column: Settings & Details */}
            <motion.div variants={fadeIn} className="md:col-span-2 space-y-6">
              
              <div className="bg-white rounded-3xl p-6 md:p-8 border border-slate-200 shadow-sm">
                <div className="flex items-center justify-between gap-4 mb-6 pb-6 border-b border-slate-100">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-sky-50 flex items-center justify-center shrink-0">
                      <User className="w-5 h-5 text-sky-500" />
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-slate-900">Personal Details</h2>
                      <p className="text-xs font-medium text-slate-500">Your registered account information</p>
                    </div>
                  </div>
                  <button className="px-4 py-2 bg-sky-50 text-sky-600 hover:bg-sky-100 hover:text-sky-700 font-bold text-sm rounded-xl transition-colors shrink-0">
                    Edit Profile
                  </button>
                </div>

                <div className="grid sm:grid-cols-2 gap-x-6 gap-y-5">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">First Name</label>
                    <div className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-medium text-slate-900 cursor-not-allowed">
                      {user?.first_name}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Last Name</label>
                    <div className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-medium text-slate-900 cursor-not-allowed">
                      {user?.last_name}
                    </div>
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Email Address</label>
                    <div className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-medium text-slate-900 cursor-not-allowed">
                      {user?.email}
                    </div>
                  </div>
                </div>

                <div className="grid sm:grid-cols-2 gap-6 mt-8 pt-6 border-t border-slate-100">
                  <div>
                    <span className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Account Created</span>
                    <span className="text-sm font-bold text-slate-700">{user?.created_at ? new Date(user.created_at).toLocaleDateString() : 'N/A'}</span>
                  </div>
                  <div>
                    <span className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Last Login</span>
                    <span className="text-sm font-bold text-slate-700">{user?.last_login_at ? new Date(user.last_login_at).toLocaleDateString() : 'Just now'}</span>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-3xl p-6 md:p-8 border border-slate-200 shadow-sm">
                <div className="flex items-center justify-between gap-4 mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center shrink-0">
                      <Key className="w-5 h-5 text-slate-500" />
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-slate-900">Security & Session</h2>
                      <p className="text-xs font-medium text-slate-500">Authentication state</p>
                    </div>
                  </div>
                  <button className="px-4 py-2 border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900 font-bold text-sm rounded-xl transition-colors shrink-0">
                    Change Password
                  </button>
                </div>

                <div className="mt-4 p-5 rounded-2xl bg-slate-50 border border-slate-200">
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-sm font-bold text-slate-700">Session Status</span>
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-100">
                      <CheckCircle2 className="w-4 h-4" /> Authenticated (Active JWT)
                    </span>
                  </div>
                  <p className="text-xs font-medium text-slate-500 leading-relaxed mt-4">
                    Your session is authenticated securely via JWT Bearer token signed by the backend. All uploads and scans are strictly scoped to your user ID.
                  </p>
                </div>
              </div>
              
            </motion.div>
          </div>
        )}
      </motion.div>
    </DashboardLayout>
  );
}
