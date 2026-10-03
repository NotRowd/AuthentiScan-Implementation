import AsyncStorage from '@react-native-async-storage/async-storage';
import authService from '../auth/authService';
import type { ScanResult } from '../../types';
import { OFFLINE_MODE } from '../api/config';
import { API_ROUTES, type ScanListResponse, type StatsResponse, type ApiResponse, type ApiScan } from '../api/contracts';
import { mapScanList, mapScan, unwrap } from '../api/adapters';
import { apiRequest } from '../api/client';
import { historyQuery, matchesHistory, type HistoryFilters } from './historyFilters';
export const historyKey = (email: string) => '@authentiscan/offline-v2/scans/' + encodeURIComponent(email.trim().toLowerCase());
// Legacy shared history is preserved but never assigned to an account.
export const scanHistoryService = {
  async getAll(): Promise<ScanResult[]> {
    if (!OFFLINE_MODE) throw new Error('Use paginated server history in backend mode.');
    const user = await authService.getSession();
    if (!user) return [];
    const raw = await AsyncStorage.getItem(historyKey(user.email));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ScanResult[];
    if (!Array.isArray(parsed)) throw new Error('Offline scan history is invalid.');
    return parsed.sort((a, b) => b.scannedAt.localeCompare(a.scannedAt));
  },
  async add(scan: ScanResult, ownerEmail: string): Promise<void> {
    if (!OFFLINE_MODE) throw new Error('Backend scans cannot be inserted into offline history.');
    const key = historyKey(ownerEmail);
    const raw = await AsyncStorage.getItem(key);
    const history: ScanResult[] = raw ? JSON.parse(raw) : [];
    await AsyncStorage.setItem(key, JSON.stringify([scan, ...history.filter(item => item.id !== scan.id)]));
  },
  async getPage(offset = 0, limit = 20, filters: HistoryFilters = {}) {
    const query = historyQuery(offset, limit, filters);
    if (!OFFLINE_MODE) return mapScanList(await apiRequest<ScanListResponse>(API_ROUTES.scans + '?' + query));
    const scans = (await this.getAll()).filter(scan => matchesHistory(scan, filters));
    return { scans: scans.slice(offset, offset + limit), pagination: { total: scans.length, limit, offset } };
  },
  async getStats() {
    if (!OFFLINE_MODE) return unwrap(await apiRequest<StatsResponse>(API_ROUTES.stats));
    const user = await authService.getSession();
    const scans = await this.getAll();
    return { total_scans: scans.length, queued_scans: scans.filter(s => s.status === 'queued').length,
      ai_generated_found: scans.filter(s => s.hasAnalysis && s.verdict === 'ai_generated').length,
      scans_remaining: user?.scanLimit === null ? null : Math.max((user?.scanLimit || 0) - scans.filter(scan => scan.status !== 'failed').length, 0),
      plan: user ? { name: user.plan, scan_limit: user.scanLimit } : null };
  },
  async getScan(id: string): Promise<ScanResult> {
    if (!OFFLINE_MODE) {
      if (!/^[1-9]\d*$/.test(id)) throw new Error('Invalid scan ID.');
      return mapScan(unwrap(await apiRequest<ApiResponse<ApiScan>>(API_ROUTES.scans + '/' + id)));
    }
    const result = (await this.getAll()).find(scan => scan.id === id);
    if (!result) throw new Error('Scan not found.');
    return result;
  },
  async remove(_id: string): Promise<void> {
    throw new Error('Deleting scans is unavailable in the current backend.');
  },
};
