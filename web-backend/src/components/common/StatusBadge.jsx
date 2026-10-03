import React from 'react';
import { CheckCircle2, AlertTriangle, ShieldQuestion, Clock } from 'lucide-react';

export default function StatusBadge({ status }) {
  const normalized = (status || '').toLowerCase();

  switch (normalized) {
    case 'authentic':
      return (
        <span className="status-badge inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
          <CheckCircle2 className="w-3.5 h-3.5" />
          Authentic
        </span>
      );
    case 'ai-generated':
    case 'ai_generated':
    case 'generated':
      return (
        <span className="status-badge inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-purple-500/10 text-purple-400 border border-purple-500/20">
          <AlertTriangle className="w-3.5 h-3.5" />
          AI-Generated
        </span>
      );
    case 'uncertain':
      return (
        <span className="status-badge inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
          <ShieldQuestion className="w-3.5 h-3.5" />
          Uncertain
        </span>
      );
    case 'failed':
      return <span className="status-badge inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-rose-500/10 text-rose-300 border border-rose-500/20"><AlertTriangle className="w-3.5 h-3.5" />Failed</span>;
    default:
      return (
        <span className="status-badge inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-slate-500/10 text-slate-400 border border-slate-500/20">
          <Clock className="w-3.5 h-3.5" />
          {status || 'Pending'}
        </span>
      );
  }
}

