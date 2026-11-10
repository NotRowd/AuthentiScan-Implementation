import type { ScanResult } from '../../types';
import type { ApiResponse, ApiScan, StatsResponse, UploadImage } from '../api/contracts';
import { API_ROUTES, validateUpload } from '../api/contracts';
import { OFFLINE_MODE } from '../api/config';
import { mapScan, unwrap } from '../api/adapters';
import { ApiError, apiRequest } from '../api/client';
import { sessionRevision } from '../api/session';
import { File } from 'expo-file-system';
export type MockScenario = 'ai_generated' | 'authentic' | 'uncertain' | 'queued' | 'processing' | 'failed';
export interface IScanService {
  analyzeImage(image: UploadImage, scenario?: MockScenario, signal?: AbortSignal): Promise<ScanResult>;
}
let busy = false;
const pendingUploads = new WeakMap<UploadImage, { key: string; revision: number }>();
function uploadKey(image: UploadImage) {
  const revision = sessionRevision();
  const previous = pendingUploads.get(image);
  if (previous?.revision === revision) return previous.key;
  // This value identifies an operation, not an account or an authentication credential.
  const key = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, char => {
    const value = Math.floor(Math.random() * 16);
    return (char === 'x' ? value : (value & 3) | 8).toString(16);
  });
  pendingUploads.set(image, { key, revision });
  return key;
}
export async function checkScanReadiness(image: UploadImage, signal?: AbortSignal) {
  // A retry of an ambiguous submission must still reach the idempotent upload endpoint.
  if (pendingUploads.get(image)?.revision === sessionRevision()) return;
  const [health, stats] = await Promise.all([
    apiRequest<ApiResponse<{ backend: string; ai: string }>>('/api/v1/system/health', { signal, timeoutMs: 12000 }),
    apiRequest<StatsResponse>(API_ROUTES.stats, { signal, timeoutMs: 12000 }),
  ]);
  const state = unwrap(health);
  if (state.backend !== 'online' || state.ai !== 'ready') {
    throw new Error('The AI service is not ready. No image was uploaded. Please try again later.');
  }
  const remaining = unwrap(stats).scans_remaining;
  if (remaining === 0) {
    throw new Error('No scans remain today. Your allowance resets at midnight Philippine time. No image was uploaded.');
  }
  if (remaining !== null && (!Number.isFinite(remaining) || remaining < 0)) {
    throw new Error('Could not check your daily allowance. No image was uploaded.');
  }
}
export function createUploadBody(image: UploadImage): FormData {
  const body = new FormData();
  const file = new File(image.uri);
  // Expo's File is Blob-compatible, but not instanceof the global Blob. Its
  // FormData patch therefore ignores append's third filename argument. Wrap the
  // file with explicit metadata; keep byte reads bound to the real native file.
  const upload: Blob & { name: string } = {
    name: image.fileName || file.name || 'image.jpg',
    type: file.type || image.mimeType || 'application/octet-stream',
    size: file.size,
    bytes: () => file.bytes(),
    arrayBuffer: () => file.arrayBuffer(),
    text: () => file.text(),
    stream: () => file.stream(),
    slice: (start, end, type) => file.slice(start, end, type),
  };
  body.append('image', upload);
  return body;
}
export const realScanService: IScanService = {
  async analyzeImage(image, _scenario, signal) {
    if (OFFLINE_MODE) throw new Error('Backend connection is disabled in offline mode.');
    if (busy) throw new Error('An upload is already running.');
    const error = validateUpload(image);
    if (error) throw new Error(error);
    busy = true;
    try {
      // Expo SDK 57 fetch requires a File/Blob, not the legacy { uri, name, type } object.
      const body = createUploadBody(image);
      const response = await apiRequest<ApiResponse<ApiScan>>(API_ROUTES.scans, {
        method: 'POST', body, signal, timeoutMs: 660000, idempotencyKey: uploadKey(image),
      });
      const scan = mapScan(unwrap(response), image.uri);
      if (scan.status === 'completed' || scan.status === 'failed') pendingUploads.delete(image);
      return scan;
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) throw new Error('This scan may still be processing. Check History before starting another upload.');
      throw error;
    } finally { busy = false; }
  },
};
