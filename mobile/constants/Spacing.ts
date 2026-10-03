/**
 * AuthentiScan Spacing Scale
 * Base unit: 4px
 */
const Spacing = {
  px: 1,
  0.5: 2,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  7: 28,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
  20: 80,
  24: 96,

  // --- Named aliases ---
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  '2xl': 48,
  '3xl': 64,

  // --- Component-specific ---
  screenPadding: 20,
  cardPadding: 16,
  cardRadius: 16,
  buttonRadius: 12,
  inputRadius: 12,
  chipRadius: 20,
  tabBarHeight: 64,
} as const;

export default Spacing;
