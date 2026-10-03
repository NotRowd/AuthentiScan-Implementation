/**
 * AuthentiScan Color Palette
 * Primary design system colors.
 */
const Colors = {
  // --- Backgrounds ---
  bgPrimary: '#05070D',
  bgSecondary: '#0B0F1A',
  bgTertiary: '#111827',

  // --- Accent / Cyan ---
  cyan: '#00E5FF',
  cyanAlt: '#2DD4FF',
  cyanDim: 'rgba(0, 229, 255, 0.15)',
  cyanGlow: 'rgba(0, 229, 255, 0.25)',

  // --- Verdict: Deepfake / Fake ---
  fake: '#FF2E63',
  fakeDim: 'rgba(255, 46, 99, 0.15)',
  fakeGlow: 'rgba(255, 46, 99, 0.25)',

  // --- Verdict: Authentic / Success ---
  authentic: '#3DFFB0',
  authenticDim: 'rgba(61, 255, 176, 0.15)',
  authenticGlow: 'rgba(61, 255, 176, 0.25)',

  // --- Text ---
  textPrimary: '#EAF2FF',
  textSecondary: '#8CA0C2',
  textMuted: '#4A5A7A',
  textInverse: '#05070D',

  // --- Glass surfaces ---
  glassBg: 'rgba(255, 255, 255, 0.05)',
  glassBgStrong: 'rgba(255, 255, 255, 0.09)',
  glassBorder: 'rgba(255, 255, 255, 0.10)',
  glassBorderCyan: 'rgba(0, 229, 255, 0.20)',
  glassBorderStrong: 'rgba(255, 255, 255, 0.18)',

  // --- Severity ---
  severityLow: '#3DFFB0',
  severityMedium: '#F59E0B',
  severityHigh: '#FF2E63',

  // --- Utility ---
  white: '#FFFFFF',
  black: '#000000',
  transparent: 'transparent',

  // --- Grid / scan overlay ---
  gridLine: 'rgba(0, 229, 255, 0.06)',
  scanLine: 'rgba(0, 229, 255, 0.40)',

  // --- Border ---
  border: 'rgba(255, 255, 255, 0.08)',
  borderActive: '#00E5FF',
} as const;

export type ColorKey = keyof typeof Colors;
export default Colors;
