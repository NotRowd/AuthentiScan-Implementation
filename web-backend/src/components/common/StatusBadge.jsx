import React from 'react';
import { CheckCircle2, AlertTriangle, ShieldQuestion, Clock } from 'lucide-react';

export default function StatusBadge({ status }) {
  const normalized = (status || '').toLowerCase();

  switch (normalized) {
    case 'authentic':
      return (
        <span className="status-badge inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-success-soft text-success border border-success">
          <CheckCircle2 className="w-3.5 h-3.5" />
          Authentic
        </span>
      );
    case 'ai-generated':
    case 'ai_generated':
    case 'generated':
      return (
        <span className="status-badge inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-ai-soft text-ai border border-ai">
          <AlertTriangle className="w-3.5 h-3.5" />
          AI-Generated
        </span>
      );
    case 'uncertain':
      return (
        <span className="status-badge inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-warning-soft text-warning border border-warning">
          <ShieldQuestion className="w-3.5 h-3.5" />
          Uncertain
        </span>
      );
    case 'failed':
      return <span className="status-badge inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-danger-soft text-danger border border-danger"><AlertTriangle className="w-3.5 h-3.5" />Failed</span>;
    default:
      return (
        <span className="status-badge inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-surface-raised text-ink-secondary border border-line">
          <Clock className="w-3.5 h-3.5" />
          {status || 'Pending'}
        </span>
      );
  }
}

