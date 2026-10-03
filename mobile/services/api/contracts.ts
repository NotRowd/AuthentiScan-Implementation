// Backend wire contracts shared by offline fixtures and authenticated transport.
export type ApiVerdict = 'authentic' | 'ai_generated' | 'uncertain';
export type ApiScanStatus = 'queued' | 'processing' | 'completed' | 'failed';
export type ApiResponse<T> = { success: true; message?: string; data: T } | { success: false; message: string };
export type RegisterRequest = { firstName: string; lastName: string; email: string; password: string };
export type ApiPlan = { name: string; scan_limit: number | null; billing_cycle?: string };
export type ApiUser = { user_id: number; first_name: string; last_name: string; email: string; plan: ApiPlan | null };
export type AuthResponse = ApiResponse<{ user: ApiUser; token: string }>;
export type MeResponse = ApiResponse<{ user: Omit<ApiUser, 'plan'>; plan: ApiPlan | null }>;
export type ApiAnalysis = {
  verdict: ApiVerdict; confidence_score: number; authentic_score: number; ai_generated_score: number;
  readable_explanation: string; heatmap_url: string | null; model_version: string; analyzed_at: string;
};
export type ApiScan = {
  scan_id: number; original_file_name: string; mime_type: string; file_size_bytes: number;
  status: ApiScanStatus; created_at: string; updated_at: string; image_url: string;
  credit_status?: 'not_charged' | 'reserved' | 'used';
  analysis_error?: { code: string; message: string };
  analysis_status: 'completed' | 'processing' | 'failed' | 'pending_ai_service'; analysis: ApiAnalysis | null;
};
export type ScanListResponse = ApiResponse<{ scans: ApiScan[]; pagination: { total: number; limit: number; offset: number } }>;
export type StatsResponse = ApiResponse<{ total_scans: number; queued_scans: number; ai_generated_found: number; scans_remaining: number | null; plan: ApiPlan | null }>;
export const API_ROUTES = Object.freeze({ register: '/api/v1/auth/register', login: '/api/v1/auth/login', me: '/api/v1/auth/me', scans: '/api/v1/scans', stats: '/api/v1/users/stats' });
export { OFFLINE_MODE } from './config';
export const FREE_SCAN_LIMIT = 5;
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export type UploadImage = { uri: string; fileName?: string | null; mimeType?: string | null; fileSize?: number };
export function validateUpload(image: UploadImage): string | null {
  if (!image.uri) return 'Select an image first.';
  if (image.fileSize !== undefined && (!Number.isFinite(image.fileSize) || image.fileSize <= 0 || image.fileSize > MAX_IMAGE_BYTES)) return 'Choose an image no larger than 10 MB.';
  const extension = (image.fileName || image.uri).split('.').pop()?.toLowerCase();
  const inferred = extension === 'jpg' || extension === 'jpeg' ? 'image/jpeg' : extension === 'png' ? 'image/png' : extension === 'webp' ? 'image/webp' : null;
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(image.mimeType || inferred || '')) return 'Only JPEG, PNG, and WebP images are supported.';
  return null;
}
