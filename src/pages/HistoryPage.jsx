import React, { useState } from 'react';
import { Search, Filter, FileDown, AlertCircle } from 'lucide-react';
import DashboardLayout from '../components/layout/DashboardLayout';
import StatusBadge from '../components/common/StatusBadge';

export default function HistoryPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // Sample placeholder entries for table layout demonstration only
  const sampleHistory = [
    { id: 'SCN-1001', name: 'sample_portrait_01.jpg', date: '2026-08-20', status: 'authentic', resolution: '1920x1080' },
    { id: 'SCN-1002', name: 'synthetic_landscape.png', date: '2026-08-21', status: 'ai-generated', resolution: '1024x1024' },
    { id: 'SCN-1003', name: 'social_media_avatar.jpg', date: '2026-08-21', status: 'authentic', resolution: '800x800' },
    { id: 'SCN-1004', name: 'low_res_snapshot.webp', date: '2026-08-22', status: 'uncertain', resolution: '640x480' },
    { id: 'SCN-1005', name: 'diffusion_render_v2.png', date: '2026-08-22', status: 'ai-generated', resolution: '2048x2048' },
  ];

  const filteredItems = sampleHistory.filter((item) => {
    const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase()) || item.id.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = statusFilter === 'all' || item.status === statusFilter;
    return matchesSearch && matchesFilter;
  });

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Scan History</h1>
          <p className="text-sm text-slate-400 mt-1">
            Log of static image scans and report archives placeholder.
          </p>
        </div>

        {/* Sample Data Disclaimer Banner */}
        <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="text-xs text-amber-200 leading-relaxed">
            <span className="font-semibold text-white">Sample Layout Notice:</span> The history entries below are sample placeholder records illustrating how logged static image scans will be structured once backend integration is live.
          </div>
        </div>

        {/* Filter and Search Toolbar */}
        <div className="glass-panel rounded-xl p-4 border border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search sample entries..."
              className="w-full bg-slate-900 border border-slate-700/80 rounded-xl pl-10 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-brand-500"
            />
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <Filter className="w-3.5 h-3.5 text-slate-500" />
              <span>Status:</span>
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-slate-900 border border-slate-700/80 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-brand-500"
            >
              <option value="all">All Results</option>
              <option value="authentic">Authentic</option>
              <option value="ai-generated">AI-Generated</option>
              <option value="uncertain">Uncertain</option>
            </select>
          </div>
        </div>

        {/* Table Container */}
        <div className="glass-panel rounded-xl border border-slate-800 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-slate-400 uppercase tracking-wider bg-slate-900/90 border-b border-slate-800">
                <tr>
                  <th className="py-3.5 px-4">Scan ID</th>
                  <th className="py-3.5 px-4">Filename</th>
                  <th className="py-3.5 px-4">Date processed</th>
                  <th className="py-3.5 px-4">Resolution</th>
                  <th className="py-3.5 px-4">Result</th>
                  <th className="py-3.5 px-4 text-right">PDF Report</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 text-slate-300">
                {filteredItems.length > 0 ? (
                  filteredItems.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-900/40 transition-colors">
                      <td className="py-3.5 px-4 font-mono text-slate-400">{item.id}</td>
                      <td className="py-3.5 px-4 font-medium text-white">{item.name} <span className="text-[10px] text-amber-400/80">(Sample)</span></td>
                      <td className="py-3.5 px-4 text-slate-400">{item.date}</td>
                      <td className="py-3.5 px-4 text-slate-400">{item.resolution}</td>
                      <td className="py-3.5 px-4">
                        <StatusBadge status={item.status} />
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <span className="inline-flex items-center gap-1 text-xs text-slate-500 font-medium cursor-default">
                          <FileDown className="w-3.5 h-3.5" />
                          Sample Report
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-500">
                      No sample scan history entries matching filter criteria.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination UI Placeholder */}
          <div className="p-4 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
            <span>Showing {filteredItems.length} sample entries</span>
            <div className="flex gap-2">
              <button disabled className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-600 cursor-not-allowed">
                Previous
              </button>
              <button disabled className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-600 cursor-not-allowed">
                Next
              </button>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
