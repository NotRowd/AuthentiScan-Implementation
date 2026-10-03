import type { FeedbackSubmission } from '../../types';
export const feedbackService = {
  async save(_submission: FeedbackSubmission): Promise<void> {
    throw new Error('Feedback submission is unavailable: the current backend has no feedback endpoint.');
  },
};
