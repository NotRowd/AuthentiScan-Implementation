import type { ApiResponse, ApiScan, UploadImage } from '../api/contracts';
import { validateUpload } from '../api/contracts';
import { mapScan, unwrap } from '../api/adapters';
import type { IScanService, MockScenario } from './scanService';
import authService from '../auth/authService';
import { scanHistoryService } from './scanHistoryService';

export function makeScanFixture(image: UploadImage, scenario: MockScenario, id: number): ApiResponse<ApiScan> {
  const now = new Date().toISOString();
  const verdict = ['authentic', 'ai_generated', 'uncertain'].includes(scenario) ? scenario as 'authentic' | 'ai_generated' | 'uncertain' : null;
  const authentic = scenario === 'authentic' ? 0.94 : scenario === 'uncertain' ? 0.38 : 0.13;
  const status = verdict ? 'completed' : scenario as 'queued' | 'processing' | 'failed';
  return { success: true, message: 'Offline fixture: no image was uploaded or analyzed.', data: {
    scan_id: id, original_file_name: image.fileName || 'test-image.jpg', mime_type: image.mimeType || 'image/jpeg',
    file_size_bytes: image.fileSize || 0, status,
    credit_status: status === 'failed' ? 'not_charged' : status === 'completed' ? 'used' : 'reserved',
    created_at: now, updated_at: now, image_url: '/api/v1/scans/' + id + '/image',
    analysis_status: status === 'queued' ? 'pending_ai_service' : status,
    analysis: verdict ? { verdict, confidence_score: Math.max(authentic, 1 - authentic),
      authentic_score: authentic, ai_generated_score: 1 - authentic,
      readable_explanation: 'Offline sample scores only. Model estimates are not proof of authenticity. No real AI ran.',
      heatmap_url: null, model_version: 'curated-v1-candidate-v1-dev (OFFLINE FIXTURE)', analyzed_at: now } : null,
  } };
}
let busy = false;
export const mockScanService: IScanService = {
  async analyzeImage(image, scenario = 'ai_generated', signal) {
    if (busy) throw new Error('A mock scan is already running.');
    busy = true;
    try {
      const error = validateUpload(image);
      if (error) throw new Error(error);
      const user = await authService.getSession();
      if (!user) throw new Error('Sign in to an offline test account first.');
      const revision = authService.getRevision();
      const history = await scanHistoryService.getAll();
      if (user.scanLimit !== null && history.filter(scan => scan.status !== 'failed').length >= user.scanLimit) throw new Error('Your plan scan limit has been reached (5 offline credits; failed scans do not count; no monthly reset).');
      await new Promise(resolve => setTimeout(resolve, 1200));
      if (signal?.aborted) throw new Error('Offline scan cancelled.');
      if (authService.getRevision() !== revision) throw new Error('Session changed. Please sign in again.');
      const scan = mapScan(unwrap(makeScanFixture(image, scenario, Date.now())), image.uri);
      await scanHistoryService.add(scan, user.email);
      if (authService.getRevision() !== revision) throw new Error('Session changed. Please sign in again.');
      return scan;
    } finally { busy = false; }
  },
};
