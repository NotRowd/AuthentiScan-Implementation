import React from 'react';
import { Text, TextStyle, StyleSheet } from 'react-native';
import Colors from '../../constants/Colors';
import Typography from '../../constants/Typography';

type TextVariant =
  | 'h1'
  | 'h2'
  | 'h3'
  | 'h4'
  | 'body'
  | 'bodySmall'
  | 'label'
  | 'caption'
  | 'system';

interface CyberTextProps {
  children: React.ReactNode;
  variant?: TextVariant;
  color?: string;
  style?: TextStyle | TextStyle[];
  numberOfLines?: number;
  align?: 'left' | 'center' | 'right';
  muted?: boolean;
}

/**
 * CyberText
 *
 * Unified text component for AuthentiScan.
 * Enforces consistent typography across all screens.
 *
 * - h1/h2/h3/h4: Screen and section headings
 * - body/bodySmall: General content
 * - label: Uppercase system labels (e.g. "CONFIDENCE", "SCAN COMPLETE")
 * - caption: Small secondary info
 * - system: Monospace system/status readouts
 */
const CyberText: React.FC<CyberTextProps> = ({
  children,
  variant = 'body',
  color,
  style,
  numberOfLines,
  align = 'left',
  muted = false,
}) => {
  const textColor = color ?? (muted ? Colors.textSecondary : Colors.textPrimary);

  return (
    <Text
      style={[
        styles[variant],
        { color: textColor, textAlign: align },
        style,
      ]}
      numberOfLines={numberOfLines}
    >
      {children}
    </Text>
  );
};

const styles = StyleSheet.create({
  h1: {
    fontSize: Typography.size['4xl'],
    fontWeight: Typography.weight.extrabold,
    letterSpacing: Typography.tracking.tight,
    lineHeight: Typography.size['4xl'] * Typography.leading.tight,
    color: Colors.textPrimary,
  },
  h2: {
    fontSize: Typography.size['3xl'],
    fontWeight: Typography.weight.bold,
    letterSpacing: Typography.tracking.tight,
    lineHeight: Typography.size['3xl'] * Typography.leading.tight,
    color: Colors.textPrimary,
  },
  h3: {
    fontSize: Typography.size['2xl'],
    fontWeight: Typography.weight.bold,
    letterSpacing: Typography.tracking.normal,
    lineHeight: Typography.size['2xl'] * Typography.leading.tight,
    color: Colors.textPrimary,
  },
  h4: {
    fontSize: Typography.size.xl,
    fontWeight: Typography.weight.semibold,
    letterSpacing: Typography.tracking.normal,
    lineHeight: Typography.size.xl * Typography.leading.normal,
    color: Colors.textPrimary,
  },
  body: {
    fontSize: Typography.size.base,
    fontWeight: Typography.weight.regular,
    letterSpacing: Typography.tracking.normal,
    lineHeight: Typography.size.base * Typography.leading.relaxed,
    color: Colors.textPrimary,
  },
  bodySmall: {
    fontSize: Typography.size.sm,
    fontWeight: Typography.weight.regular,
    letterSpacing: Typography.tracking.normal,
    lineHeight: Typography.size.sm * Typography.leading.relaxed,
    color: Colors.textSecondary,
  },
  label: {
    fontSize: Typography.size.xs,
    fontWeight: Typography.weight.bold,
    letterSpacing: Typography.tracking.widest,
    textTransform: 'uppercase',
    color: Colors.textSecondary,
  },
  caption: {
    fontSize: Typography.size.xs,
    fontWeight: Typography.weight.regular,
    letterSpacing: Typography.tracking.wide,
    color: Colors.textMuted,
  },
  system: {
    fontFamily: 'Courier',
    fontSize: Typography.size.sm,
    fontWeight: Typography.weight.medium,
    letterSpacing: Typography.tracking.wide,
    color: Colors.cyan,
  },
});

export default CyberText;
