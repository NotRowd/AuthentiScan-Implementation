import type { ScanResult } from '../../types';

export const HISTORY_STATUSES = [
  ['all', 'All scans'], ['queued', 'Queued'], ['processing', 'Processing'],
  ['failed', 'Failed'], ['completed', 'Completed'], ['authentic', 'Authentic'],
  ['ai_generated', 'AI-generated'], ['uncertain', 'Uncertain'],
] as const;
export type HistoryStatus = typeof HISTORY_STATUSES[number][0];
export type HistoryFilters = { q?: string; status?: HistoryStatus };

export function historyQuery(offset: number, limit: number, filters: HistoryFilters = {}) {
  if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new Error('Invalid history pagination.');
  }
  if (filters.q !== undefined && (typeof filters.q !== 'string' || filters.q.length > 120)) {
    throw new Error('Search must be at most 120 characters.');
  }
  const q = (filters.q || '').trim();
  const status = filters.status ?? 'all';
  if (!HISTORY_STATUSES.some(item => item[0] === status)) throw new Error('Invalid history status.');
  const query = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  if (q) query.set('q', q);
  if (status !== 'all') query.set('status', status);
  return query.toString();
}

// Offline filtering is applied to all account-local samples before slicing a page.
export function matchesHistory(scan: ScanResult, filters: HistoryFilters) {
  const q = (filters.q || '').trim().toLowerCase();
  const idQuery = /^#\d+$/.test(q) ? q.slice(1) : q;
  if (q && !scan.fileName.toLowerCase().includes(q) && !scan.id.includes(idQuery)) return false;
  const status = filters.status ?? 'all';
  if (status === 'all') return true;
  if (['authentic', 'ai_generated', 'uncertain'].includes(status)) {
    return scan.status === 'completed' && scan.hasAnalysis && scan.verdict === status;
  }
  return scan.status === status;
}
