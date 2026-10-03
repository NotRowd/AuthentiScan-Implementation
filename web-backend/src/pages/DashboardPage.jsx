import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Scan, AlertTriangle, Clock, RefreshCw, ArrowUpRight, Image as ImageIcon, UploadCloud, Sparkles, CheckCircle2 } from 'lucide-react';
import { motion } from 'framer-motion';
import DashboardLayout from '../components/layout/DashboardLayout';
import StatusBadge from '../components/common/StatusBadge';
import SystemReadiness from '../components/common/SystemReadiness';
import { fetchUserStats, fetchUserScans, getStoredUser, isCloudMode, usesCloudMedia, uploadScanImage } from '../services/api';

const fadeIn = {
  hidden: { opacity: 0, y: 15 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4 } }
};

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1 }
  }
};

export default function DashboardPage() {
  const navigate = useNavigate();
  const [state, setState] = useState({ loading: true, error: '', stats: null, scans: [] });
  const [refresh, setRefresh] = useState(0);
  const user = getStoredUser();
  
  // Upload State
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadError, setUploadError] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const uploadBusy = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const timeout = setTimeout(() => controller.abort(), 20000);
    Promise.all([fetchUserStats(controller.signal), fetchUserScans({ limit: 5, signal: controller.signal })])
      .then(([statsResponse, scansResponse]) => {
        if (active) setState({ loading: false, error: '', stats: statsResponse.data, scans: scansResponse.data?.scans || [] });
      }).catch(error => {
        if (active) setState({ loading: false, error: error.name === 'AbortError' ? 'The dashboard took too long to load. Check your connection and refresh.' : error.message || 'Dashboard unavailable. Please try again.', stats: null, scans: [] });
      }).finally(() => clearTimeout(timeout));
    return () => { active = false; clearTimeout(timeout); controller.abort(); };
  }, [refresh]);

  const stats = state.stats;

  useEffect(() => {
    const reload = () => {
      if (document.visibilityState === 'visible') setRefresh(value => value + 1);
    };
    const resetDelay = Date.parse(stats?.allowance_resets_at) - Date.parse(stats?.server_now);
    const timer = Number.isFinite(resetDelay) && resetDelay > 0
      ? setTimeout(reload, Math.min(resetDelay + 1000, 86401000)) : null;
    window.addEventListener('focus', reload);
    document.addEventListener('visibilitychange', reload);
    return () => { clearTimeout(timer); window.removeEventListener('focus', reload); document.removeEventListener('visibilitychange', reload); };
  }, [stats]);

  const handleFileChange = (e) => {
    if (uploadBusy.current) return;
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setUploadError('');
      e.target.value = '';

      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size === 0) {
        setSelectedFile(null);
        setUploadError('Choose a non-empty JPG, PNG, or WebP image.');
        return;
      }

      if (file.size > 10 * 1024 * 1024) {
        setSelectedFile(null);
        setUploadError('This image is too large. The upload limit is 10 MB.');
        return;
      }

      setSelectedFile(file);
    }
  };

  const handleUpload = async () => {
    if (uploadBusy.current) return;
    setUploadError('');

    if (!selectedFile) {
      setUploadError('Choose a JPG, PNG, or WebP image before uploading.');
      return;
    }

    setIsUploading(true);
    uploadBusy.current = true;

    try {
      const response = await uploadScanImage(selectedFile);
      navigate(`/scans/${response.data.scan_id}`); // Navigate directly to result page
    } catch (requestError) {
      setUploadError(requestError.message || 'The request failed. Check your history.');
    } finally {
      setIsUploading(false);
      uploadBusy.current = false;
    }
  };

  const metrics = [
    { title: 'Total scans', value: stats?.total_scans, note: 'Saved to your account', icon: Scan },
    { title: 'Scans remaining', value: stats?.scans_remaining === null ? 'Unlimited' : stats?.scans_remaining, note: stats?.plan?.scan_limit != null ? `${stats.plan.scan_limit} scans/day` : 'Current allowance', icon: Clock },
    { title: 'AI-generated', value: stats?.ai_generated_found, note: 'Model classifications', icon: AlertTriangle },
    { title: 'Queued scans', value: stats?.queued_scans, note: 'Awaiting analysis', icon: Clock },
  ];

  return (
    <DashboardLayout>
      <motion.div 
        initial="hidden" 
        animate="visible" 
        variants={staggerContainer}
        className="space-y-8"
      >
        {/* Welcome Section */}
        <motion.div variants={fadeIn} className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">
            Welcome to AuthentiScan{user?.first_name ? ', ' + user.first_name : ''}!
          </h1>
          <p className="text-base text-slate-500 font-medium max-w-2xl">
            Analyze an image and discover whether it may be authentic, AI-generated, or manipulated.
          </p>
        </motion.div>

        {state.error && (
          <motion.div variants={fadeIn} role="alert" className="p-4 rounded-xl border border-rose-200 bg-rose-50 text-rose-600 text-sm font-medium flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0"></span>
            {state.error}
          </motion.div>
        )}

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Main Upload Area - Visual Centerpiece */}
          <motion.div variants={fadeIn} className="lg:col-span-2">
            <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-xl shadow-sky-100/50 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-bl from-sky-100/50 to-transparent rounded-full -mr-20 -mt-20 blur-2xl pointer-events-none"></div>
              
              <div className="flex items-center gap-3 mb-6 relative z-10">
                <div className="w-10 h-10 rounded-xl bg-sky-100 flex items-center justify-center">
                  <Scan className="w-5 h-5 text-sky-600" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-slate-900">Start Analysis</h2>
                  <p className="text-sm font-medium text-slate-500">Upload Image &rarr; Analyze &rarr; View Results</p>
                </div>
              </div>

              <div className="relative z-10 bg-slate-50 border-2 border-dashed border-slate-200 hover:border-sky-300 rounded-2xl p-8 text-center transition-colors group focus-within:border-sky-400">
                <input
                  type="file"
                  disabled={isUploading}
                  accept="image/png, image/jpeg, image/webp"
                  onChange={handleFileChange}
                  className="absolute inset-0 opacity-0 cursor-pointer w-full h-full z-20"
                  aria-label="Upload image"
                />
                
                <div className="flex flex-col items-center justify-center">
                  <div className="w-16 h-16 rounded-full bg-white border border-slate-200 flex items-center justify-center mb-4 group-hover:scale-110 group-hover:border-sky-200 group-hover:bg-sky-50 transition-all duration-300 shadow-sm">
                    {isUploading ? (
                      <RefreshCw className="w-8 h-8 text-sky-500 animate-spin" />
                    ) : selectedFile ? (
                      <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                    ) : (
                      <UploadCloud className="w-8 h-8 text-sky-500" />
                    )}
                  </div>
                  
                  {isUploading ? (
                    <div className="space-y-1">
                      <p className="text-lg font-bold text-slate-900">Analyzing image...</p>
                      <p className="text-sm font-medium text-slate-500">Please wait while we process your request.</p>
                    </div>
                  ) : selectedFile ? (
                    <div className="space-y-1">
                      <p className="text-lg font-bold text-slate-900 break-all">{selectedFile.name}</p>
                      <p className="text-sm font-medium text-slate-500">{(selectedFile.size / (1024 * 1024)).toFixed(2)} MB</p>
                      <p className="text-sm font-bold text-sky-600 mt-2">Click to change image</p>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <p className="text-lg font-bold text-slate-900">Drag and drop or browse</p>
                      <p className="text-sm font-medium text-slate-500">Supports JPEG, PNG, or WebP up to 10 MB</p>
                    </div>
                  )}
                </div>
              </div>

              {uploadError && (
                <div className="mt-4 p-3 rounded-xl bg-rose-50 border border-rose-100 text-rose-600 text-sm font-medium">
                  {uploadError}
                </div>
              )}

              <div className="mt-6 relative z-10 flex flex-col sm:flex-row items-center gap-4">
                <button
                  type="button"
                  onClick={handleUpload}
                  disabled={isUploading || !selectedFile}
                  className="w-full sm:w-auto px-8 py-3.5 rounded-xl font-bold bg-sky-500 hover:bg-sky-600 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-white shadow-lg shadow-sky-500/30 hover:shadow-sky-500/50 transition-all flex items-center justify-center gap-2 text-base"
                >
                  <Sparkles className="w-5 h-5" />
                  Scan Image
                </button>
                {selectedFile && !isUploading && (
                  <span className="text-sm font-medium text-slate-500">Ready to analyze</span>
                )}
              </div>
            </div>
          </motion.div>

          {/* Metrics Column */}
          <motion.div variants={fadeIn} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-4">
            {metrics.map(({ title, value, note, icon: Icon }) => (
              <div key={title} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between gap-3 text-sm font-bold text-slate-600 mb-2">
                  <h3>{title}</h3>
                  <div className="w-8 h-8 rounded-lg bg-sky-50 flex items-center justify-center">
                    <Icon className="w-4 h-4 text-sky-500 shrink-0" />
                  </div>
                </div>
                <p className="text-3xl font-extrabold text-slate-900 tracking-tight mb-1">
                  {state.loading ? '—' : value ?? '—'}
                </p>
                <p className="text-xs font-medium text-slate-500">
                  {state.loading ? 'Loading...' : state.error ? 'Unavailable' : note}
                </p>
              </div>
            ))}
          </motion.div>
        </div>

        {/* Scan History Section */}
        <motion.section variants={fadeIn} className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-slate-100 flex flex-wrap items-center justify-between gap-4 bg-slate-50/50">
            <div>
              <h2 className="font-bold text-xl text-slate-900">Recent Scans</h2>
              <p className="text-sm font-medium text-slate-500 mt-1">Review your past analysis results and export reports.</p>
            </div>
            <div className="flex items-center gap-3">
              <button 
                type="button" 
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-700 hover:border-sky-300 hover:text-sky-600 transition-colors disabled:opacity-50" 
                disabled={state.loading} 
                onClick={() => { setState(current => ({ ...current, loading: true, error: '' })); setRefresh(value => value + 1); }}
              >
                <RefreshCw className={`w-4 h-4 ${state.loading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
              <Link to="/history" className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-sky-50 text-sm font-bold text-sky-600 hover:bg-sky-100 transition-colors">
                View All
              </Link>
            </div>
          </div>
          
          <div className="p-0">
            {state.loading ? (
              <div className="p-12 text-center flex flex-col items-center">
                <RefreshCw className="w-8 h-8 text-sky-200 animate-spin mb-4" />
                <p className="text-sm font-bold text-slate-500">Loading your saved scans...</p>
              </div>
            ) : state.error ? (
              <div className="p-10 text-center">
                <AlertTriangle className="w-8 h-8 text-rose-300 mx-auto mb-3" />
                <p className="text-sm font-bold text-slate-600">Could not load history. Please refresh.</p>
              </div>
            ) : state.scans.length ? (
              <ul className="divide-y divide-slate-100">
                {state.scans.map((scan, i) => (
                  <motion.li 
                    key={scan.scan_id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.1 }}
                  >
                    <Link to={`/scans/${scan.scan_id}`} className="flex flex-wrap sm:flex-nowrap items-center gap-5 p-5 sm:px-6 hover:bg-slate-50 transition-colors group">
                      <div className="w-12 h-12 rounded-xl bg-sky-50 text-sky-500 shrink-0 flex items-center justify-center group-hover:scale-110 transition-transform">
                        <ImageIcon className="w-6 h-6" />
                      </div>
                      <div className="min-w-0 flex-1 basis-40">
                        <p className="text-sm font-bold text-slate-900 truncate group-hover:text-sky-600 transition-colors">{scan.original_file_name}</p>
                        <p className="text-xs font-medium text-slate-500 mt-1">{new Date(scan.created_at).toLocaleDateString()} at {new Date(scan.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</p>
                      </div>
                      <div className="shrink-0 hidden sm:block">
                        <StatusBadge status={scan.analysis?.verdict || scan.status} />
                      </div>
                      <div className="w-10 h-10 rounded-full bg-white border border-slate-200 flex items-center justify-center shrink-0 group-hover:border-sky-300 group-hover:text-sky-600 text-slate-400 transition-colors shadow-sm">
                        <ArrowUpRight className="w-5 h-5" />
                      </div>
                    </Link>
                  </motion.li>
                ))}
              </ul>
            ) : (
              <div className="p-16 text-center flex flex-col items-center">
                <div className="w-16 h-16 rounded-2xl bg-sky-50 flex items-center justify-center mb-4">
                  <Scan className="w-8 h-8 text-sky-400" />
                </div>
                <h3 className="text-lg font-bold text-slate-900 mb-2">No scans yet.</h3>
                <p className="text-sm font-medium text-slate-500 mb-6 max-w-sm">
                  Upload an image above to start your first analysis and build your history.
                </p>
              </div>
            )}
          </div>
          <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex justify-between items-center text-xs font-medium text-slate-500">
            <span>{isCloudMode ? 'Cloud records' : 'Local Firebase history'}</span>
          </div>
        </motion.section>

        {/* Connection Tools */}
        <motion.div variants={fadeIn}>
          <details className="rounded-2xl border border-slate-200 bg-white p-5 group open:shadow-sm">
            <summary className="cursor-pointer text-sm font-bold text-slate-700 flex items-center gap-2 select-none">
              <span className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center group-open:bg-sky-100 group-open:text-sky-600 transition-colors">
                <svg width="10" height="10" fill="none" viewBox="0 0 12 12" className="transform group-open:rotate-180 transition-transform"><path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.5 4.5l3.5 3.5 3.5-3.5"/></svg>
              </span>
              Connection Tools & Diagnostics
            </summary>
            <div className="mt-4 pt-4 border-t border-slate-100">
              <p className="text-xs font-medium text-slate-500 mb-4">Use this read-only check if analysis is unavailable. It does not run a scan.</p>
              <SystemReadiness />
            </div>
          </details>
        </motion.div>

      </motion.div>
    </DashboardLayout>
  );
}
