/**
 * AuthentiScan Color Palette
 * Primary design system colors.
 */
const Colors = {
  // --- Backgrounds ---
  bgPrimary: '#F6FAFD',
  bgSecondary: '#FFFFFF',
  bgTertiary: '#EAF4FB',

  // --- Accent / Cyan ---
  cyan: '#2589D8',
  cyanAlt: '#176FB7',
  cyanDim: '#EAF6FF',
  cyanGlow: 'rgba(37, 137, 216, 0.18)',

  // --- Verdict: Deepfake / Fake ---
  fake: '#C92A52',
  fakeDim: 'rgba(201, 42, 82, 0.10)',
  fakeGlow: 'rgba(201, 42, 82, 0.18)',

  // --- Verdict: Authentic / Success ---
  authentic: '#138A5E',
  authenticDim: 'rgba(19, 138, 94, 0.10)',
  authenticGlow: 'rgba(19, 138, 94, 0.18)',

  // --- Text ---
  textPrimary: '#12304A',
  textSecondary: '#597188',
  textMuted: '#8095A7',
  textInverse: '#FFFFFF',

  // --- Glass surfaces ---
  glassBg: '#FFFFFF',
  glassBgStrong: '#FFFFFF',
  glassBorder: '#D9EAF6',
  glassBorderCyan: '#9DCEEF',
  glassBorderStrong: '#C9DFEF',

  // --- Severity ---
  severityLow: '#3DFFB0',
  severityMedium: '#A96000',
  severityHigh: '#C92A52',

  // --- Utility ---
  white: '#FFFFFF',
  black: '#000000',
  transparent: 'transparent',

  // --- Grid / scan overlay ---
  gridLine: 'rgba(37, 137, 216, 0.045)',
  scanLine: 'rgba(37, 137, 216, 0.20)',

  // --- Border ---
  border: '#D9EAF6',
  borderActive: '#2589D8',
} as const;

export type ColorKey = keyof typeof Colors;
export default Colors;
