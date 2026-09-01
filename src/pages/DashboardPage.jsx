import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { 
  Scan, 
  AlertTriangle, 
  ShieldQuestion, 
  ArrowUpRight, 
  Plus, 
  Activity,
  AlertCircle,
  Clock,
  Loader2
} from 'lucide-react';
import DashboardLayout from '../components/layout/DashboardLayout';
import Card from '../components/common/Card';
import StatusBadge from '../components/common/StatusBadge';
import { fetchUserStats, fetchUserScans } from '../services/api';

export default function DashboardPage() {
  const [stats, setStats] = useState(null);
  const [recentScans, setRecentScans] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let isMounted = true;

    Promise.all([fetchUserStats(), fetchUserScans()])
      .then(([statsResponse, scansResponse]) => {
        if (isMounted) {
          setStats(statsResponse.data);
          const allScans = scansResponse.data?.scans || [];
          setRecentScans(allScans.slice(0, 5));
          setIsLoading(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setError(err.message || 'Failed to load dashboard metrics.');
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const formatFileSize = (bytes) => {
    if (!bytes) return 'Unknown size';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <DashboardLayout>
      <div className="space-y-8">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">System Dashboard</h1>
            <p className="text-sm text-slate-400 mt-1">
              Overview of your uploaded image scans and plan limits.
            </p>
          </div>
          <Link
            to="/scan"
            className="px-4 py-2.5 rounded-xl font-semibold text-sm bg-gradient-to-r from-brand-600 to-indigo-600 hover:from-brand-500 hover:to-indigo-500 text-white shadow-lg shadow-brand-500/20 transition-all flex items-center justify-center gap-2 self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" />
            New Image Scan
          </Link>
        </div>

        {/* Backend Status Notice Banner */}
        <div className="p-4 rounded-xl bg-brand-500/10 border border-brand-500/20 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-brand-400 shrink-0 mt-0.5" />
          <div className="text-xs text-brand-200 leading-relaxed">
            <span className="font-semibold text-white">Backend Connected:</span> Showing real user scan counts and plan allowance. Images are stored securely in MySQL and queued for the future AI service.
          </div>
        </div>

        {error && (
          <div className="p-3 rounded-lg border border-rose-500/40 bg-rose-500/10 text-xs text-rose-200">
            {error}
          </div>
        )}

        {/* Stats Metrics Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          <Card icon={Scan} title="Total Scans" subtitle="Images uploaded to date">
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-3xl font-bold text-white">
                {isLoading ? <Loader2 className="w-6 h-6 animate-spin text-slate-400" /> : (stats?.total_scans ?? 0)}
              </span>
              <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
                Real Stats
              </span>
            </div>
          </Card>

          <Card icon={Clock} title="Scans Remaining" subtitle={`Plan: ${stats?.plan?.name || 'Free'}`}>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-3xl font-bold text-emerald-400">
                {isLoading ? (
                  <Loader2 className="w-6 h-6 animate-spin text-emerald-400" />
                ) : stats?.scans_remaining !== null && stats?.scans_remaining !== undefined ? (
                  stats.scans_remaining
                ) : (
                  'Unlimited'
                )}
              </span>
              <span className="text-xs px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono">
                {stats?.plan?.name || 'Free'} Plan
              </span>
            </div>
          </Card>

          <Card icon={AlertTriangle} title="AI-Generated" subtitle="Detected deepfakes">
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-3xl font-bold text-purple-400">
                {isLoading ? <Loader2 className="w-6 h-6 animate-spin text-purple-400" /> : (stats?.ai_generated_found ?? 0)}
              </span>
              <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-400 font-mono">
                Pending AI
              </span>
            </div>
          </Card>

          <Card icon={ShieldQuestion} title="Queued Scans" subtitle="Waiting for AI service">
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-3xl font-bold text-amber-400">
                {isLoading ? <Loader2 className="w-6 h-6 animate-spin text-amber-400" /> : (stats?.queued_scans ?? 0)}
              </span>
              <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-400 font-mono">
                Queued
              </span>
            </div>
          </Card>
        </div>

        {/* System Model Specs Card */}
        <div className="glass-panel rounded-xl p-6 border border-slate-800">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                <Activity className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-semibold text-white">Model Pipeline Architecture</h3>
                <p className="text-xs text-slate-400">EfficientNet-B0 + Grad-CAM XAI + Object Detection</p>
              </div>
            </div>
            <span className="text-xs px-2.5 py-1 rounded-full bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 font-mono">
              Queued Backend Active
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div className="p-3.5 rounded-lg bg-slate-900/60 border border-slate-800">
              <div className="font-semibold text-slate-300 mb-1">Classifier</div>
              <div className="text-slate-400">EfficientNet-B0 Convolutional Neural Network (Planned AI Component)</div>
            </div>
            <div className="p-3.5 rounded-lg bg-slate-900/60 border border-slate-800">
              <div className="font-semibold text-slate-300 mb-1">Explainability</div>
              <div className="text-slate-400">Grad-CAM visual heatmap overlay generation (Planned AI Component)</div>
            </div>
            <div className="p-3.5 rounded-lg bg-slate-900/60 border border-slate-800">
              <div className="font-semibold text-slate-300 mb-1">Object Detection</div>
              <div className="text-slate-400">Bounding-box feature identification (Planned AI Component)</div>
            </div>
          </div>
        </div>

        {/* Recent Scans Section */}
        <div className="glass-panel rounded-xl p-6 border border-slate-800">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                Recent Scans
                <span className="text-xs font-normal px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono">
                  Live DB Records
                </span>
              </h2>
              <p className="text-xs text-slate-400">Your most recent uploaded image scans</p>
            </div>
            <Link
              to="/history"
              className="text-xs font-semibold text-brand-400 hover:text-brand-300 flex items-center gap-1"
            >
              View Full History
              <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-slate-400 uppercase tracking-wider bg-slate-900/80 border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4">Scan ID</th>
                  <th className="py-3 px-4">Filename</th>
                  <th className="py-3 px-4">File Size</th>
                  <th className="py-3 px-4">Date Uploaded</th>
                  <th className="py-3 px-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 text-slate-300">
                {isLoading ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-500">
                      Loading recent scans...
                    </td>
                  </tr>
                ) : recentScans.length > 0 ? (
                  recentScans.map((scan) => (
                    <tr key={scan.scan_id} className="hover:bg-slate-900/40 transition-colors">
                      <td className="py-3.5 px-4 font-mono text-slate-400">#{scan.scan_id}</td>
                      <td className="py-3.5 px-4 font-medium text-white">{scan.original_file_name}</td>
                      <td className="py-3.5 px-4 text-slate-400">{formatFileSize(scan.file_size_bytes)}</td>
                      <td className="py-3.5 px-4 text-slate-400">
                        {new Date(scan.created_at).toLocaleDateString()}
                      </td>
                      <td className="py-3.5 px-4">
                        <StatusBadge
                          status={
                            scan.analysis?.verdict ||
                            (scan.status === 'queued' ? 'Queued for AI' : scan.status)
                          }
                        />
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-500">
                      No scans uploaded yet. Start by uploading an image on the Scan page!
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
