import type { ApiResponse, ApiScan, ApiUser, MeResponse, ScanListResponse } from './contracts';
import type { ScanResult, User } from '../../types';
export function unwrap<T>(response: ApiResponse<T>): T {
  if (!response.success) throw new Error(response.message);
  return response.data;
}
export function mapUser(user: ApiUser): User {
  return { id: String(user.user_id), name: [user.first_name, user.last_name].join(' ').trim(), email: user.email,
    plan: user.plan?.name.toLowerCase() === 'premium' ? 'premium' : 'free', firstName: user.first_name, lastName: user.last_name,
    scanLimit: user.plan ? user.plan.scan_limit : 0 };
}
export function mapMe(response: MeResponse): User {
  const data = unwrap(response);
  return mapUser({ ...data.user, plan: data.plan });
}
// Keep pagination metadata: one backend page is not the user's entire history.
export function mapScanList(response: ScanListResponse) {
  const data = unwrap(response);
  return { scans: data.scans.map(scan => mapScan(scan)), pagination: data.pagination };
}
function percentage(score: number): number {
  if (!Number.isFinite(score) || score < 0 || score > 1) throw new Error('Invalid score from analysis.');
  return Math.round(score * 10000) / 100;
}
// Convert scores once, at the boundary between backend data and display data.
export function mapScan(scan: ApiScan, localImageUri = ''): ScanResult {
  const completed = scan.status === 'completed' && scan.analysis_status === 'completed' && scan.analysis !== null;
  const analysis = completed ? scan.analysis : null;
  if (analysis && !['authentic', 'ai_generated', 'uncertain'].includes(analysis.verdict)) throw new Error('Unsupported verdict.');
  return {
    id: String(scan.scan_id), imageUri: localImageUri, imagePath: scan.image_url, fileName: scan.original_file_name,
    status: scan.status, analysisStatus: scan.analysis_status, scannedAt: scan.updated_at,
    creditStatus: scan.credit_status,
    hasAnalysis: !!analysis, verdict: analysis?.verdict ?? 'uncertain', confidence: analysis ? percentage(analysis.confidence_score) : 0,
    authenticScore: analysis ? percentage(analysis.authentic_score) : null, aiGeneratedScore: analysis ? percentage(analysis.ai_generated_score) : null,
    summary: analysis?.readable_explanation ?? scan.analysis_error?.message ?? (scan.status === 'failed' ? 'Image saved, but analysis failed.' : 'Image saved; analysis is not complete.'),
    modelVersion: analysis?.model_version ?? null, manipulationIndicators: [],
    gradCam: analysis?.heatmap_url ? { heatmapUri: analysis.heatmap_url, highlightedRegions: [] } : undefined,
  };
}
