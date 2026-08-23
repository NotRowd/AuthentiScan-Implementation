import React from 'react';
import { Link } from 'react-router-dom';
import { 
  Scan, 
  CheckCircle2, 
  AlertTriangle, 
  ShieldQuestion, 
  ArrowUpRight, 
  Plus, 
  Activity,
  AlertCircle
} from 'lucide-react';
import DashboardLayout from '../components/layout/DashboardLayout';
import Card from '../components/common/Card';
import StatusBadge from '../components/common/StatusBadge';

export default function DashboardPage() {
  return (
    <DashboardLayout>
      <div className="space-y-8">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">System Dashboard</h1>
            <p className="text-sm text-slate-400 mt-1">
              Overview of static image verification interface & sample dashboard metrics.
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

        {/* Demo / Sample Data Disclaimer Banner */}
        <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="text-xs text-amber-200 leading-relaxed">
            <span className="font-semibold text-white">Sample Data Notice:</span> The statistics and scan records shown on this dashboard are illustrative placeholders for frontend layout demonstration. Live scan metrics will populate once the AI backend is connected.
          </div>
        </div>

        {/* Stats Metrics Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          <Card icon={Scan} title="Total Scans" subtitle="Sample metrics placeholder">
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-3xl font-bold text-white">--</span>
              <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-400 font-mono">
                Sample Data
              </span>
            </div>
          </Card>

          <Card icon={CheckCircle2} title="Authentic" subtitle="Sample metrics placeholder">
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-3xl font-bold text-emerald-400">--</span>
              <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-400 font-mono">
                Sample Data
              </span>
            </div>
          </Card>

          <Card icon={AlertTriangle} title="AI-Generated" subtitle="Sample metrics placeholder">
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-3xl font-bold text-purple-400">--</span>
              <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-400 font-mono">
                Sample Data
              </span>
            </div>
          </Card>

          <Card icon={ShieldQuestion} title="Uncertain" subtitle="Sample metrics placeholder">
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-3xl font-bold text-amber-400">--</span>
              <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-400 font-mono">
                Sample Data
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
                <h3 className="font-semibold text-white">Model Pipeline Overview</h3>
                <p className="text-xs text-slate-400">EfficientNet-B0 + Grad-CAM XAI + Object Detection</p>
              </div>
            </div>
            <span className="text-xs px-2.5 py-1 rounded-full bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 font-mono">
              Ready for AI Integration
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div className="p-3.5 rounded-lg bg-slate-900/60 border border-slate-800">
              <div className="font-semibold text-slate-300 mb-1">Classifier</div>
              <div className="text-slate-400">EfficientNet-B0 Convolutional Neural Network (Planned Component)</div>
            </div>
            <div className="p-3.5 rounded-lg bg-slate-900/60 border border-slate-800">
              <div className="font-semibold text-slate-300 mb-1">Explainability</div>
              <div className="text-slate-400">Grad-CAM visual heatmap overlay generation (Planned Component)</div>
            </div>
            <div className="p-3.5 rounded-lg bg-slate-900/60 border border-slate-800">
              <div className="font-semibold text-slate-300 mb-1">Object Detection</div>
              <div className="text-slate-400">Bounding-box feature identification (Planned Component)</div>
            </div>
          </div>
        </div>

        {/* Recent Scans Placeholder Section */}
        <div className="glass-panel rounded-xl p-6 border border-slate-800">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                Recent Scans
                <span className="text-xs font-normal px-2 py-0.5 rounded bg-slate-800 text-slate-400">
                  Sample Layout
                </span>
              </h2>
              <p className="text-xs text-slate-400">Sample table layout illustrating future scan logs</p>
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
                  <th className="py-3 px-4">Filename</th>
                  <th className="py-3 px-4">Dimensions</th>
                  <th className="py-3 px-4">Classification</th>
                  <th className="py-3 px-4">Grad-CAM Status</th>
                  <th className="py-3 px-4">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 text-slate-300">
                <tr>
                  <td className="py-3.5 px-4 font-mono text-slate-400">sample_portrait_01.jpg <span className="text-[10px] text-amber-400/80">(Sample)</span></td>
                  <td className="py-3.5 px-4">1920 x 1080</td>
                  <td className="py-3.5 px-4"><StatusBadge status="Authentic" /></td>
                  <td className="py-3.5 px-4 text-slate-400">Ready</td>
                  <td className="py-3.5 px-4">
                    <Link to="/scan" className="text-brand-400 hover:underline">Details</Link>
                  </td>
                </tr>
                <tr>
                  <td className="py-3.5 px-4 font-mono text-slate-400">ai_generated_artwork.png <span className="text-[10px] text-amber-400/80">(Sample)</span></td>
                  <td className="py-3.5 px-4">1024 x 1024</td>
                  <td className="py-3.5 px-4"><StatusBadge status="AI-Generated" /></td>
                  <td className="py-3.5 px-4 text-slate-400">Ready</td>
                  <td className="py-3.5 px-4">
                    <Link to="/scan" className="text-brand-400 hover:underline">Details</Link>
                  </td>
                </tr>
                <tr>
                  <td className="py-3.5 px-4 font-mono text-slate-400">compressed_photo.jpg <span className="text-[10px] text-amber-400/80">(Sample)</span></td>
                  <td className="py-3.5 px-4">800 x 600</td>
                  <td className="py-3.5 px-4"><StatusBadge status="Uncertain" /></td>
                  <td className="py-3.5 px-4 text-slate-400">Ready</td>
                  <td className="py-3.5 px-4">
                    <Link to="/scan" className="text-brand-400 hover:underline">Details</Link>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
