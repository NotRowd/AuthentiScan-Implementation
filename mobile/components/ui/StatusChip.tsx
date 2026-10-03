import React from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import CyberText from './CyberText';
import Colors from '../../constants/Colors';
import Spacing from '../../constants/Spacing';
import type { Verdict, SeverityLevel } from '../../types';

// ─── Verdict Chip ─────────────────────────────────────────────────────────────

interface VerdictChipProps {
  verdict: Verdict;
  style?: ViewStyle;
}

/**
 * StatusChip — Verdict variant
 * Shows AUTHENTIC / AI-GENERATED / UNCERTAIN with colour coding.
 */
export const VerdictChip: React.FC<VerdictChipProps> = ({ verdict, style }) => {
  const config: Record<Verdict, { label: string; color: string; bg: string }> = {
    authentic: {
      label: 'AUTHENTIC',
      color: Colors.authentic,
      bg: Colors.authenticDim,
    },
    ai_generated: {
      label: 'AI-GENERATED',
      color: Colors.fake,
      bg: Colors.fakeDim,
    },
    uncertain: {
      label: 'UNCERTAIN',
      color: Colors.textSecondary,
      bg: 'rgba(140, 160, 194, 0.12)',
    },
  };

  const { label, color, bg } = config[verdict];

  return (
    <View
      style={[
        styles.chip,
        { backgroundColor: bg, borderColor: color },
        style,
      ]}
      accessibilityLabel={`Verdict: ${label}`}
    >
      <CyberText variant="label" color={color} numberOfLines={1} style={{ letterSpacing: 1 }}>
        {label}
      </CyberText>
    </View>
  );
};

// ─── Severity Chip ────────────────────────────────────────────────────────────

interface SeverityChipProps {
  severity: SeverityLevel;
  style?: ViewStyle;
}

/**
 * StatusChip — Severity variant
 * Shows LOW / MEDIUM / HIGH manipulation severity.
 */
export const SeverityChip: React.FC<SeverityChipProps> = ({ severity, style }) => {
  const config: Record<SeverityLevel, { color: string; bg: string }> = {
    low: { color: Colors.authentic, bg: Colors.authenticDim },
    medium: { color: Colors.severityMedium, bg: 'rgba(245, 158, 11, 0.12)' },
    high: { color: Colors.fake, bg: Colors.fakeDim },
  };

  const { color, bg } = config[severity];

  return (
    <View
      style={[
        styles.chip,
        { backgroundColor: bg, borderColor: color },
        style,
      ]}
      accessibilityLabel={`Severity: ${severity.toUpperCase()}`}
    >
      <CyberText variant="label" color={color}>
        {severity.toUpperCase()}
      </CyberText>
    </View>
  );
};

const styles = StyleSheet.create({
  chip: {
    paddingVertical: 4,
    paddingHorizontal: Spacing.sm,
    borderRadius: Spacing.chipRadius,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
});
