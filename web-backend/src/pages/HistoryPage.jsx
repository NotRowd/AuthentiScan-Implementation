import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Search, Filter, AlertCircle, Loader2, RefreshCw, FileImage, ArrowRight } from 'lucide-react';
import { motion } from 'framer-motion';
import DashboardLayout from '../components/layout/DashboardLayout';
import StatusBadge from '../components/common/StatusBadge';
import ExportReportButton from '../components/common/ExportReportButton';
import DeleteScanDialog from '../components/common/DeleteScanDialog';
import ScanThumbnail from '../components/common/ScanThumbnail';
import {scanNumber} from '../utils/scanNumber';
import { fetchUserScans } from '../services/api';
import { scorePresentation } from '../utils/analysisPresentation';

const fadeIn = {
  hidden: { opacity: 0, y: 15 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4 } }
};

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.05 } }
};

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
  const [deleteTarget,setDeleteTarget]=useState(null);
  const [notice,setNotice]=useState('');
  const deleted = item => {
    setDeleteTarget(null);
    setNotice(`Scan ${scanNumber(item)} permanently deleted. Used credits are unchanged.`);
    beginLoading();
    // Requery from the first page so deletion cannot strand a user on an empty last page.
    setOffset(0);setRefresh(value=>value+1);
  };

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
      {deleteTarget&&<DeleteScanDialog scan={deleteTarget} onCancel={()=>setDeleteTarget(null)} onDeleted={deleted}/>}
      <motion.div initial="hidden" animate="visible" variants={staggerContainer} className="space-y-6 max-w-6xl mx-auto">
        {notice&&<p role="status" className="rounded-xl bg-success-soft border border-success p-4 text-sm text-success">{notice}</p>}
        
        {/* Header Section */}
        <motion.div variants={fadeIn} className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <p className="text-xs font-bold text-accent uppercase tracking-[0.15em] mb-2">Workspace</p>
            <h1 className="text-3xl font-bold text-ink tracking-tight">Scan History</h1>
            <p className="text-sm font-medium text-ink-muted mt-2">
              Search, filter, and review your previous AI image analyses.
            </p>
          </div>
          <button
            type="button"
            onClick={() => { beginLoading(); setOffset(0); setRefresh(value => value + 1); }}
            disabled={isLoading}
            className="self-start md:self-auto inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-surface border border-line text-sm font-bold text-ink-secondary hover:text-accent hover:bg-accent-soft transition-colors disabled:opacity-100 disabled:bg-disabled disabled:text-disabled-ink disabled:border-line shadow-sm shrink-0"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh List
          </button>
        </motion.div>

        {/* Notice Info Pill */}
        <motion.div variants={fadeIn} className="p-4 rounded-2xl bg-accent-soft/80 border border-line flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-accent shrink-0" />
          <div className="text-sm font-medium text-ink-secondary leading-relaxed pt-0.5">
            <strong className="text-ink">Your saved scans:</strong> Scan numbers start at 1 for your account and stay fixed, even after deletion. Open Details to review images and results. Predictions are estimates, not proof.
          </div>
        </motion.div>

        {/* Filter and Search Toolbar */}
        <motion.form variants={fadeIn} onSubmit={applyFilters} className="bg-surface rounded-2xl p-5 border border-line shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="relative w-full lg:w-96">
            <Search className="w-5 h-5 text-ink-muted absolute left-4 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by filename or scan number..."
              aria-label="Search scan history"
              maxLength={120}
              className="w-full bg-canvas border border-line rounded-xl pl-12 pr-4 py-3 text-sm font-medium text-ink placeholder-slate-400 focus:outline-none focus:border-accent focus:ring-4 focus:ring-focus/10 focus:bg-surface transition-all shadow-sm"
            />
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-4 w-full lg:w-auto">
            <div className="flex items-center gap-3 w-full sm:w-auto">
              <div className="flex items-center gap-2 text-sm font-bold text-ink-muted whitespace-nowrap">
                <Filter className="w-4 h-4" />
                <span>Status:</span>
              </div>
              <select
                aria-label="Scan status filter"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full sm:w-auto bg-canvas border border-line rounded-xl px-4 py-3 text-sm font-bold text-ink-secondary focus:outline-none focus:border-accent focus:ring-4 focus:ring-focus/10 cursor-pointer shadow-sm"
              >
                <option value="all">All Scans</option>
                <option value="authentic">Authentic</option>
                <option value="ai_generated">AI-Generated</option>
                <option value="uncertain">Uncertain</option>
                <option value="failed">Failed</option>
              </select>
            </div>
            <div className="flex items-center gap-3 w-full sm:w-auto">
              <button type="submit" className="theme-action flex-1 sm:flex-none rounded-xl px-6 py-3 text-sm font-bold bg-action hover:bg-action-hover text-on-action transition-colors shadow-sm">
                Apply
              </button>
              <button type="button" onClick={clearFilters} className="flex-1 sm:flex-none rounded-xl px-4 py-3 text-sm font-bold border border-line text-ink-secondary hover:bg-canvas transition-colors">
                Clear
              </button>
            </div>
          </div>
        </motion.form>

        {/* History List */}
        <motion.div variants={fadeIn} className="bg-surface rounded-3xl border border-line shadow-sm overflow-hidden flex flex-col">
          
          {/* Desktop Table Header */}
          <div className="hidden md:grid grid-cols-12 gap-4 px-6 py-4 border-b border-line bg-canvas/80 text-xs font-bold text-ink-muted uppercase tracking-wider">
            <div className="col-span-1">Scan ID</div>
            <div className="col-span-4">Scan Details</div>
            <div className="col-span-3">Status / Result</div>
            <div className="col-span-4 text-right">Actions</div>
          </div>

          <div className="divide-y divide-line flex-1 relative min-h-[300px]">
            {isLoading ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center p-12 bg-surface/80 z-10">
                <Loader2 className="w-10 h-10 animate-spin text-accent mb-4" />
                <span className="text-sm font-bold text-ink-muted">Loading your history...</span>
              </div>
            ) : error ? (
              <div className="p-12 text-center">
                <div className="inline-flex flex-col items-center justify-center p-6 rounded-2xl bg-danger-soft border border-danger text-danger">
                  <AlertCircle className="w-10 h-10 mb-3 text-danger" />
                  <p className="font-bold text-lg mb-1">Could not load history</p>
                  <p className="text-sm font-medium text-danger">{error}</p>
                </div>
              </div>
            ) : scans.length > 0 ? (
              <div className="flex flex-col">
                {scans.map((item, index) => (
                  <motion.div 
                    key={item.scan_id} 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className="group block md:grid md:grid-cols-12 md:items-center gap-4 px-6 py-5 hover:bg-accent-soft/50 transition-colors"
                  >
                    {/* Mobile ID Banner */}
                    <div className="md:hidden flex items-center justify-between mb-3 text-xs font-bold text-ink-muted">
                      <span>Scan {scanNumber(item)}</span>
                      <span>{new Date(item.created_at).toLocaleDateString()}</span>
                    </div>

                    <div className="hidden md:block col-span-1 text-sm font-semibold text-ink-secondary" aria-label={`Scan ID ${scanNumber(item)}`}>
                      #{scanNumber(item)}
                    </div>

                    <div className="col-span-12 md:col-span-4 min-w-0 flex flex-col md:flex-row md:items-center gap-4">
                      <ScanThumbnail scanId={item.scan_id} filename={item.original_file_name} available={!item.deletion_pending} />
                      <div className="min-w-0">
                        <h3 className="font-bold text-base text-ink truncate mb-1" title={item.original_file_name}>
                          {item.original_file_name}
                        </h3>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-medium text-ink-muted">
                          <span className="hidden md:inline">{new Date(item.created_at).toLocaleString()}</span>
                          <span className="inline-block w-1 h-1 rounded-full bg-surface-raised hidden md:inline"></span>
                          <span>{formatFileSize(item.file_size_bytes)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="col-span-12 md:col-span-3 flex flex-col items-start justify-center mt-4 md:mt-0 space-y-2">
                      <StatusBadge
                        status={
                          item.analysis?.verdict ||
                          (item.status === 'queued' ? 'Queued for AI' : item.status)
                        }
                      />
                      <div className="text-xs font-bold text-ink-muted">
                         {item.analysis ? `${(scorePresentation(item.analysis).value * 100).toFixed(1)}% Confidence` : item.status === 'failed' ? 'Analysis failed' : 'Pending Result'}
                      </div>
                      {item.deletion_pending&&<p className="text-xs text-danger">Deletion incomplete. Retry Delete to finish.</p>}
                    </div>

                    <div className="col-span-12 md:col-span-4 min-w-0 flex flex-row flex-wrap items-center md:justify-end gap-3 mt-5 md:mt-0">
                      {!item.deletion_pending&&<ExportReportButton scanId={item.scan_id} scanNumber={item.scan_number} />}
                      {!item.deletion_pending&&<Link to={`/scans/${item.scan_id}`} className="flex-1 md:flex-none inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-accent-soft text-accent font-bold text-sm hover:bg-accent-soft hover:text-accent transition-colors">
                        Details <ArrowRight className="w-4 h-4" />
                      </Link>}
                      <button type="button" disabled={!['completed','failed'].includes(item.status)} onClick={()=>{setNotice('');setDeleteTarget(item);}}
                        title={!['completed','failed'].includes(item.status)?'Wait for analysis to finish before deleting':undefined}
                        aria-label={`Delete Scan ${scanNumber(item)}`}
                        className="rounded-xl border border-danger px-3 py-2.5 text-sm font-semibold text-danger hover:bg-danger-soft disabled:opacity-100 disabled:bg-disabled disabled:text-disabled-ink disabled:border-line disabled:cursor-not-allowed">{item.deletion_pending?'Retry Delete':'Delete'}</button>
                    </div>
                  </motion.div>
                ))}
              </div>
            ) : (
              <div className="p-16 flex flex-col items-center justify-center text-center">
                <div className="w-20 h-20 rounded-full bg-canvas flex items-center justify-center mb-6">
                  <FileImage className="w-10 h-10 text-ink-muted" />
                </div>
                <h3 className="text-xl font-bold text-ink mb-2">No scans found</h3>
                <p className="text-sm font-medium text-ink-muted max-w-sm mx-auto mb-6">
                  {filters.q || filters.status !== 'all'
                    ? 'Try adjusting your search or status filters.'
                    : offset > 0 ? 'You have reached the end of your scan history.'
                      : 'There are no saved scans in your history.'}
                </p>
                {!(filters.q || filters.status !== 'all' || offset > 0) && (
                  <Link to="/scan" className="theme-action px-6 py-3 rounded-xl font-bold bg-action hover:bg-action-hover text-on-action shadow-md shadow-accent/20 transition-all">
                    Scan an Image
                  </Link>
                )}
              </div>
            )}
          </div>

          {/* Pagination Footer */}
          <div className="p-4 border-t border-line bg-canvas/50 flex flex-wrap gap-4 items-center justify-between">
            <span aria-live="polite" className="text-xs font-bold text-ink-muted">
              {isLoading ? 'Loading...' : error ? 'History unavailable' : `Showing ${scans.length ? offset + 1 : 0}–${scans.length ? offset + scans.length : 0} of ${total} scans`}
            </span>
            <div className="flex items-center gap-3 w-full sm:w-auto">
              <button 
                type="button" 
                disabled={isLoading || offset === 0} 
                onClick={() => { beginLoading(); setOffset(value => Math.max(0, value - pageSize)); }} 
                className="flex-1 sm:flex-none px-4 py-2 rounded-xl border border-line bg-surface text-sm font-bold text-ink-secondary hover:bg-canvas disabled:opacity-100 disabled:bg-disabled disabled:text-disabled-ink disabled:border-line transition-colors"
              >
                Previous
              </button>
              <button 
                type="button" 
                disabled={isLoading || !!error || offset + scans.length >= total} 
                onClick={() => { beginLoading(); setOffset(value => value + pageSize); }} 
                className="flex-1 sm:flex-none px-4 py-2 rounded-xl border border-line bg-surface text-sm font-bold text-ink-secondary hover:bg-canvas disabled:opacity-100 disabled:bg-disabled disabled:text-disabled-ink disabled:border-line transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </DashboardLayout>
  );
}
