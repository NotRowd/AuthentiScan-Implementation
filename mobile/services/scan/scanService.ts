import type { ScanResult } from '../../types';
import type { ApiResponse, ApiScan, UploadImage } from '../api/contracts';
import { API_ROUTES, validateUpload } from '../api/contracts';
import { OFFLINE_MODE } from '../api/config';
import { mapScan, unwrap } from '../api/adapters';
import { apiRequest } from '../api/client';
import { File } from 'expo-file-system';
export type MockScenario = 'ai_generated' | 'authentic' | 'uncertain' | 'queued' | 'processing' | 'failed';
export interface IScanService {
  analyzeImage(image: UploadImage, scenario?: MockScenario, signal?: AbortSignal): Promise<ScanResult>;
}
let busy = false;
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
        method: 'POST', body, signal, timeoutMs: 150000,
      });
      return mapScan(unwrap(response), image.uri);
    } finally { busy = false; }
  },
};
