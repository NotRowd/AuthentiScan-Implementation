import React, { useState, useEffect } from 'react';
import { Search, Filter, AlertCircle, Loader2, RefreshCw } from 'lucide-react';
import DashboardLayout from '../components/layout/DashboardLayout';
import StatusBadge from '../components/common/StatusBadge';
import { fetchUserScans } from '../services/api';

export default function HistoryPage() {
  const [scans, setScans] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const loadScans = async () => {
    setError('');

    try {
      const response = await fetchUserScans();
      setScans(response.data?.scans || []);
    } catch (err) {
      setError(err.message || 'Failed to load scan history.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    let isMounted = true;
    fetchUserScans()
      .then((response) => {
        if (isMounted) {
          setScans(response.data?.scans || []);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setError(err.message || 'Failed to load scan history.');
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const filteredItems = scans.filter((item) => {
    const searchLower = searchTerm.toLowerCase();
    const matchesSearch =
      item.original_file_name.toLowerCase().includes(searchLower) ||
      String(item.scan_id).includes(searchLower);

    const scanVerdict = item.analysis?.verdict || 'queued';
    const matchesFilter =
      statusFilter === 'all' ||
      (statusFilter === 'queued' && (!item.analysis || scanVerdict === 'queued')) ||
      scanVerdict === statusFilter;

    return matchesSearch && matchesFilter;
  });

  const formatFileSize = (bytes) => {
    if (!bytes) return 'Unknown size';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">Scan History</h1>
            <p className="text-sm text-slate-400 mt-1">
              Log of your uploaded images and their AI analysis results.
            </p>
          </div>
          <button
            type="button"
            onClick={loadScans}
            disabled={isLoading}
            className="self-start sm:self-auto inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700/80 text-xs text-slate-300 hover:text-white hover:border-brand-500 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {/* Real Status Notice Banner */}
        <div className="p-4 rounded-xl bg-brand-500/10 border border-brand-500/20 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-brand-400 shrink-0 mt-0.5" />
          <div className="text-xs text-brand-200 leading-relaxed">
            <span className="font-semibold text-white">AI analysis connected:</span> Completed scans include the EfficientNet-B0 result. Queued, processing, or failed entries can be reviewed here while the AI service is unavailable.
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
              placeholder="Search by filename or ID..."
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
              <option value="all">All Scans</option>
              <option value="queued">Queued for AI</option>
              <option value="authentic">Authentic</option>
              <option value="ai_generated">AI-Generated</option>
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
                  <th className="py-3.5 px-4">Date Uploaded</th>
                  <th className="py-3.5 px-4">File Size</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4 text-right">Report</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 text-slate-300">
                {isLoading ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-400">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <Loader2 className="w-6 h-6 animate-spin text-brand-400" />
                        <span>Loading scan history from backend...</span>
                      </div>
                    </td>
                  </tr>
                ) : error ? (
                  <tr>
                    <td colSpan={6} className="py-8 px-4 text-center">
                      <div className="p-3 rounded-lg border border-rose-500/40 bg-rose-500/10 text-xs text-rose-200 inline-block">
                        {error}
                      </div>
                    </td>
                  </tr>
                ) : filteredItems.length > 0 ? (
                  filteredItems.map((item) => (
                    <tr key={item.scan_id} className="hover:bg-slate-900/40 transition-colors">
                      <td className="py-3.5 px-4 font-mono text-slate-400">#{item.scan_id}</td>
                      <td className="py-3.5 px-4 font-medium text-white">{item.original_file_name}</td>
                      <td className="py-3.5 px-4 text-slate-400">
                        {new Date(item.created_at).toLocaleString()}
                      </td>
                      <td className="py-3.5 px-4 text-slate-400">{formatFileSize(item.file_size_bytes)}</td>
                      <td className="py-3.5 px-4">
                        <StatusBadge
                          status={
                            item.analysis?.verdict ||
                            (item.status === 'queued' ? 'Queued for AI' : item.status)
                          }
                        />
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <span className="inline-flex items-center gap-1 text-xs text-slate-500 font-medium cursor-default">
                          {item.analysis ? `${(item.analysis.confidence_score * 100).toFixed(1)}% confidence` : 'Pending AI'}
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-500">
                      {scans.length === 0
                        ? 'No image scans found. Upload your first image on the Scan page!'
                        : 'No scan history entries matching filter criteria.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Footer */}
          <div className="p-4 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
            <span>
              Showing {filteredItems.length} of {scans.length} scans
            </span>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
