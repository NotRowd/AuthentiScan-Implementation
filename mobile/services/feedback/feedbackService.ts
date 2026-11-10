import type { FeedbackSubmission } from '../../types';
import { apiRequest } from '../api/client';
import { isSavedScanId } from '../scan/scanId';
import { OFFLINE_MODE } from '../api/config';
function path(id: string) {
  if (OFFLINE_MODE || !isSavedScanId(id)) throw new Error('Feedback requires a saved scan.');
  return '/api/v1/scans/' + id + '/feedback';
}
export const feedbackService = {
  async load(id: string, signal: AbortSignal) {
    const result = await apiRequest<{ data: Pick<FeedbackSubmission, 'rating' | 'comment'> | null }>(path(id), { signal });
    return result.data;
  },
  async save(submission: FeedbackSubmission): Promise<void> {
    await apiRequest(path(submission.scanId), {
      method: 'PUT', json: { rating: submission.rating, comment: submission.comment || '' },
    });
  },
};
