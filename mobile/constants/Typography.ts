import { TextStyle } from 'react-native';

/**
 * AuthentiScan Typography Scale
 */
const Typography = {
  // --- Font families (system fallback used since custom fonts need expo-font) ---
  // To upgrade: load 'SpaceGrotesk' or 'Inter' via expo-font in _layout.tsx
  fontFamily: {
    sans: 'System',
    mono: 'Courier',
  },

  // --- Font sizes ---
  size: {
    xs: 10,
    sm: 12,
    base: 14,
    md: 16,
    lg: 18,
    xl: 20,
    '2xl': 24,
    '3xl': 28,
    '4xl': 32,
    '5xl': 40,
  },

  // --- Font weights ---
  weight: {
    regular: '400' as TextStyle['fontWeight'],
    medium: '500' as TextStyle['fontWeight'],
    semibold: '600' as TextStyle['fontWeight'],
    bold: '700' as TextStyle['fontWeight'],
    extrabold: '800' as TextStyle['fontWeight'],
  },

  // --- Letter spacing ---
  tracking: {
    tight: -0.5,
    normal: 0,
    wide: 0.5,
    wider: 1.5,
    widest: 3,
  },

  // --- Line heights ---
  leading: {
    tight: 1.2,
    normal: 1.5,
    relaxed: 1.7,
  },
} as const;

export default Typography;
