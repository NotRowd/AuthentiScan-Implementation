import React from 'react';
import ScanStatCards from '../components/common/ScanStatCards';
import {useScanStatistics} from '../hooks/useScanStatistics';
import { Link } from 'react-router-dom';
import { Scan, RefreshCw, ArrowUpRight, ArrowRight, Image as ImageIcon, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';
import DashboardLayout from '../components/layout/DashboardLayout';
import StatusBadge from '../components/common/StatusBadge';
import { getStoredUser, isCloudMode } from '../services/api';

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
  const {state,refresh}=useScanStatistics({includeRecent:true});
  const user=getStoredUser(),stats=state.stats;
  const plan = stats?.plan || user?.plan;
  const planName = plan?.scan_limit === null ? 'Pro' : plan?.name || 'Free';

  return (
    <DashboardLayout>
      <motion.div initial="hidden" animate="visible" variants={staggerContainer} className="space-y-6">
        <motion.header variants={fadeIn} className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-accent">Workspace / Dashboard</p>
            <h1 className="mt-2 text-2xl sm:text-3xl font-bold tracking-tight text-ink break-words">
              Welcome back{user?.first_name ? ', ' + user.first_name : ''}.
            </h1>
            <p className="mt-2 text-sm text-ink-muted">Your image analyses, recent activity, and next steps.</p>
          </div>
          <span className="inline-flex items-center gap-2 rounded-full border border-line bg-accent-soft px-3 py-2 text-xs font-semibold text-accent">
            <span aria-hidden="true" className="theme-action h-1.5 w-1.5 rounded-full bg-action" />{planName} workspace
          </span>
        </motion.header>

        {state.error && (
          <div role="alert" className="rounded-2xl border border-danger bg-danger-soft p-4 text-sm text-danger">{state.error}</div>
        )}

        <div className="grid gap-5 xl:grid-cols-12">
          <motion.section variants={fadeIn} aria-labelledby="start-analysis-title" className="relative overflow-hidden rounded-3xl border border-line bg-gradient-to-br from-surface via-surface to-accent-soft p-6 sm:p-7 xl:col-span-7">
            <div aria-hidden="true" className="pointer-events-none absolute -right-12 -top-20 h-64 w-64 rounded-full bg-accent-soft/50 blur-3xl" />
            <div className="relative z-10">
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-accent-soft"><Scan aria-hidden="true" className="h-6 w-6 text-accent" /></div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-accent">Your next analysis</p>
              <h2 id="start-analysis-title" className="mt-2 text-2xl font-bold tracking-tight text-ink">Start with an image.</h2>
              <p className="mt-2 max-w-xs text-sm leading-relaxed text-ink-secondary">Review whether an image may be authentic or AI-generated.</p>
              <Link to="/scan" className="theme-action mt-5 inline-flex items-center justify-center gap-2 rounded-xl bg-action px-5 py-3 text-sm font-semibold text-ink transition-colors hover:bg-action-hover focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus focus-visible:ring-offset-2">
                Go to Scan Image <ArrowRight aria-hidden="true" className="h-4 w-4" />
              </Link>
              <p className="mt-3 text-[11px] text-ink-muted">JPEG, PNG, or WebP · Up to 10 MB</p>
            </div>
            <div aria-hidden="true" className="pointer-events-none absolute right-8 top-16 hidden w-32 rotate-6 rounded-2xl border border-line bg-surface/90 p-3 shadow-lg shadow-accent/50 2xl:block">
              <div className="flex h-24 items-center justify-center rounded-xl bg-accent-soft"><ImageIcon className="h-12 w-12 text-accent" strokeWidth={1} /></div>
              <p className="mt-3 text-center text-[9px] font-semibold tracking-widest text-ink-muted">IMAGE REVIEW</p>
              <div className="absolute -bottom-7 -left-5 -rotate-6 whitespace-nowrap rounded-full border border-line bg-surface px-3 py-2 text-[10px] font-medium text-accent">Ready when you are</div>
            </div>
          </motion.section>

          <motion.section variants={fadeIn} aria-label="Scan statistics" aria-busy={state.loading} className="grid grid-cols-2 gap-3 sm:gap-4 xl:col-span-5">
            <ScanStatCards stats={stats} loading={state.loading} error={state.error}/>
          </motion.section>
        </div>

        <motion.section variants={fadeIn} aria-labelledby="recent-scans-title" className="overflow-hidden rounded-3xl border border-line bg-surface shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line p-5 sm:px-6">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-ink-muted">Your workspace</p>
              <h2 id="recent-scans-title" className="mt-1 text-lg font-bold text-ink">Recent Scans</h2>
              <p className="mt-1 text-xs text-ink-muted">Pick up where you left off.</p>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" aria-label="Refresh recent scans" disabled={state.loading}
                onClick={refresh}
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-line text-ink-secondary transition-colors hover:border-line hover:text-accent disabled:opacity-100 disabled:bg-disabled disabled:text-disabled-ink disabled:border-line">
                <RefreshCw aria-hidden="true" className={`h-4 w-4 ${state.loading ? 'motion-safe:animate-spin' : ''}`} />
              </button>
              <Link to="/history" className="inline-flex h-10 items-center gap-2 rounded-xl bg-accent-soft px-4 text-xs font-semibold text-accent transition-colors hover:bg-accent-soft">View all <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" /></Link>
            </div>
          </div>
          {state.loading ? (
            <div role="status" className="p-10 text-center text-sm text-ink-muted">Loading your saved scans…</div>
          ) : state.error ? (
            <p className="p-10 text-center text-sm text-ink-secondary">Could not load history. Please refresh.</p>
          ) : state.scans.length ? (
            <ul className="divide-y divide-line">
              {state.scans.map(scan => (
                <li key={scan.scan_id}>
                  <Link to={`/scans/${scan.scan_id}`} className="group flex flex-wrap items-center gap-3 px-5 py-4 transition-colors hover:bg-canvas sm:flex-nowrap sm:gap-4 sm:px-6">
                    <div aria-hidden="true" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-line bg-accent-soft text-accent"><ImageIcon className="h-5 w-5" /></div>
                    <div className="min-w-0 flex-1 basis-36">
                      <p className="truncate text-xs font-semibold text-ink transition-colors group-hover:text-accent">{scan.original_file_name}</p>
                      <p className="mt-1 text-[11px] text-ink-muted">{new Date(scan.created_at).toLocaleDateString()} at {new Date(scan.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</p>
                    </div>
                    <StatusBadge status={scan.analysis?.verdict || scan.status} />
                    <ArrowUpRight aria-hidden="true" className="hidden h-4 w-4 shrink-0 text-ink-muted transition-colors group-hover:text-accent sm:block" />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="p-10 text-center">
              <h3 className="font-semibold text-ink">No scans yet.</h3>
              <p className="mx-auto mt-2 max-w-sm text-sm text-ink-muted">Go to Scan Image to upload your first image and build your history.</p>
            </div>
          )}
          <div className="flex flex-wrap justify-between gap-2 border-t border-line bg-canvas/50 px-6 py-3 text-[10px] text-ink-muted">
            <span>{isCloudMode ? 'Cloud records · Saved to your account' : 'Local Firebase history'}</span>
            {!state.loading && !state.error && <span>{state.scans.length} recent {state.scans.length === 1 ? 'scan' : 'scans'}</span>}
          </div>
        </motion.section>

        <motion.aside variants={fadeIn} className="flex items-start gap-3 rounded-2xl border border-line bg-accent-soft/60 p-4 text-xs leading-relaxed text-ink-secondary">
          <Sparkles aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
          <p><strong className="font-semibold text-accent">Results guide your review.</strong> Compare the image, its explanation, and original source before drawing a conclusion. AI estimates are not proof of authenticity.</p>
        </motion.aside>

      </motion.div>
    </DashboardLayout>
  );
}
