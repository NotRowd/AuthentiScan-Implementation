/**
 * AuthentiScan — Shared TypeScript types
 *
 * Keep this file as the single source of truth for all domain types.
 * UI components and services should import from here.
 */

// ─── Verdict ─────────────────────────────────────────────────────────────────

export type Verdict = 'authentic' | 'ai_generated' | 'uncertain';

export type SeverityLevel = 'low' | 'medium' | 'high';

// ─── Scan / Analysis ──────────────────────────────────────────────────────────

export type ManipulationIndicator = {
  label: string;
  severity: SeverityLevel;
  explanation: string;
};

export type GradCamResult = {
  /** URI to the heatmap overlay image. Can be a local file URI or a remote URL. */
  heatmapUri: string;
  /** Human-readable labels describing highlighted regions. */
  highlightedRegions: string[];
};

export type ScanResult = {
  status: import('../services/api/contracts').ApiScanStatus;
  analysisStatus: string;
  creditStatus?: 'not_charged' | 'reserved' | 'used';
  hasAnalysis: boolean;
  authenticScore: number | null;
  aiGeneratedScore: number | null;
  modelVersion: string | null;
  fileName: string;
  imagePath: string;
  /** Unique identifier for this scan. */
  id: string;

  /** The verdict produced by the AI model. */
  verdict: Verdict;

  /**
   * Confidence level as a percentage (0–100).
   * Must come from the actual AI response — never randomly generated.
   */
  confidence: number;

  /**
   * Plain-language summary of why the AI produced this result.
   * Must be based on actual model output — never fabricated.
   */
  summary: string;

  /** List of manipulation signals detected. Empty array if none found. */
  manipulationIndicators: ManipulationIndicator[];

  /**
   * Optional Grad-CAM heatmap result.
   * Only present when the AI backend provides explainability data.
   */
  gradCam?: GradCamResult;

  /** Local URI of the scanned image. */
  imageUri: string;

  /** ISO 8601 timestamp of when the scan was completed. */
  scannedAt: string;
};

// ─── Scan request / state ─────────────────────────────────────────────────────

export type ScanStatus = 'idle' | 'uploading' | 'processing' | 'success' | 'error';

export type ScanState = {
  status: ScanStatus;
  result: ScanResult | null;
  error: string | null;
};

// ─── User / Auth ──────────────────────────────────────────────────────────────

export type SubscriptionPlan = 'free' | 'premium';

export type User = {
  firstName: string;
  lastName: string;
  scanLimit: number | null;
  id: string;
  name: string;
  email: string;
  plan: SubscriptionPlan;
  avatarUri?: string;
};

export type AuthState = {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
};

// ─── Feedback ─────────────────────────────────────────────────────────────────

export type FeedbackRating = 1 | 2 | 3 | 4 | 5;

export type FeedbackSubmission = {
  scanId: string;
  rating: FeedbackRating;
  comment?: string;
};

// ─── History ──────────────────────────────────────────────────────────────────

export type HistoryFilter = 'all' | Verdict;

export type HistoryEntry = ScanResult;
