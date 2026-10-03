import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Search, Filter, AlertCircle, Loader2, RefreshCw } from 'lucide-react';
import DashboardLayout from '../components/layout/DashboardLayout';
import StatusBadge from '../components/common/StatusBadge';
import ExportReportButton from '../components/common/ExportReportButton';
import ScanCreditNotice from '../components/common/ScanCreditNotice';
import { fetchUserScans } from '../services/api';

export default function HistoryPage() {
  const [scans, setScans] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [filters, setFilters] = useState({ q: '', status: 'all' });
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [refresh, setRefresh] = useState(0);
  const pageSize = 20;
  const beginLoading = () => { setIsLoading(true); setError(''); setScans([]); setTotal(0); };
  const applyFilters = (event) => {
    event.preventDefault();
    beginLoading();
    setOffset(0);
    setFilters({ q: searchTerm.trim(), status: statusFilter });
  };
  const clearFilters = () => {
    beginLoading();
    setSearchTerm(''); setStatusFilter('all'); setOffset(0);
    setFilters({ q: '', status: 'all' });
  };

  useEffect(() => {
    let isMounted = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    fetchUserScans({ ...filters, limit: pageSize, offset, signal: controller.signal })
      .then((response) => {
        if (isMounted) {
          setScans(response.data?.scans || []);
          setTotal(response.data?.pagination?.total || 0);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setError(err.name === 'AbortError' ? 'History took too long to load. Check the connection and refresh.' : err.message || 'Failed to load scan history.');
          setIsLoading(false);
        }
      }).finally(() => clearTimeout(timeout));

    return () => {
      isMounted = false;
      clearTimeout(timeout);
      controller.abort();
    };
  }, [filters, offset, refresh]);

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
              View saved scans and export PDF reports without using scan allowance.
            </p>
          </div>
          <button
            type="button"
            onClick={() => { beginLoading(); setOffset(0); setRefresh(value => value + 1); }}
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
            <span className="font-semibold text-white">Your saved scans:</span> Select a filename to view its result, original image, and available heatmap. Predictions are model estimates, not proof.
          </div>
        </div>

        {/* Filter and Search Toolbar */}
        <form onSubmit={applyFilters} className="glass-panel rounded-xl p-4 border border-slate-800 flex flex-col sm:flex-row sm:flex-wrap items-center justify-between gap-4">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by filename or ID..."
              aria-label="Search scan history"
              maxLength={120}
              className="w-full bg-slate-900 border border-slate-700/80 rounded-xl pl-10 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-brand-500"
            />
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <Filter className="w-3.5 h-3.5 text-slate-500" />
              <span>Status:</span>
            </div>
            <select
              aria-label="Scan status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-slate-900 border border-slate-700/80 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-brand-500"
            >
              <option value="all">All Scans</option>
              <option value="queued">Queued for AI</option>
              <option value="processing">Processing</option>
              <option value="failed">Failed</option>
              <option value="completed">Completed</option>
              <option value="authentic">Authentic</option>
              <option value="ai_generated">AI-Generated</option>
              <option value="uncertain">Uncertain</option>
            </select>
          </div>
          <div className="flex items-center gap-3">
            <button type="submit" className="rounded-xl px-4 py-2 text-xs bg-brand-600 text-white">Apply filters</button>
            <button type="button" onClick={clearFilters} className="rounded-xl px-4 py-2 text-xs border border-slate-700 text-slate-300">Clear filters</button>
          </div>
          <p className="w-full text-xs text-slate-400">Searches all your saved scans, not just the current page.</p>
        </form>

        {/* Table Container */}
        <div className="glass-panel rounded-xl border border-slate-800 overflow-hidden">
          <div className="overflow-x-auto" role="region" aria-label="Saved scan table" tabIndex={0}>
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
                ) : scans.length > 0 ? (
                  scans.map((item) => (
                    <tr key={item.scan_id} className="hover:bg-slate-900/40 transition-colors">
                      <td className="py-3.5 px-4 font-mono text-slate-400">#{item.scan_id}</td>
                      <td className="py-3.5 px-4 font-medium text-white"><Link to={`/scans/${item.scan_id}`} className="block min-w-28 max-w-64 break-all text-brand-300 underline underline-offset-4 hover:text-white">{item.original_file_name}</Link></td>
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
                        <ScanCreditNotice scan={item} />
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <ExportReportButton scanId={item.scan_id} />
                        <span className="inline-flex items-center gap-1 text-xs text-slate-500 font-medium cursor-default">
                          {item.analysis ? `${(item.analysis.confidence_score * 100).toFixed(1)}% confidence` : item.status === 'failed' ? 'Analysis failed' : 'No result yet'}
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-500">
                      {filters.q || filters.status !== 'all'
                        ? 'No scan history entries matching filter criteria.'
                        : offset > 0 ? 'No scans on this page. Go back or refresh history.'
                          : 'No image scans found. Upload your first image on the Scan page!'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Footer */}
          <div className="p-4 border-t border-slate-800 flex flex-wrap gap-3 items-center justify-between text-xs text-slate-400">
            <span aria-live="polite">
              {isLoading ? 'Loading…' : error ? 'History unavailable' : `Showing ${scans.length ? offset + 1 : 0}–${scans.length ? offset + scans.length : 0} of ${total} matching scans`}
            </span>
            <div className="flex gap-3">
              <button type="button" disabled={isLoading || offset === 0} onClick={() => { beginLoading(); setOffset(value => Math.max(0, value - pageSize)); }} className="px-3 py-2 rounded-lg border border-slate-700 disabled:opacity-40">Previous</button>
              <button type="button" disabled={isLoading || !!error || offset + scans.length >= total} onClick={() => { beginLoading(); setOffset(value => value + pageSize); }} className="px-3 py-2 rounded-lg border border-slate-700 disabled:opacity-40">Next</button>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
