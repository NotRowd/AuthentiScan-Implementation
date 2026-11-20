import {useTheme,useThemedStyles} from '../../context/ThemeContext';
import type {ColorPalette} from '../../constants/Colors';
import {createStyles} from '../../constants/createStyles';
import React from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import CyberText from './CyberText';
import Spacing from '../../constants/Spacing';
import type { Verdict, SeverityLevel } from '../../types';

// ─── Verdict Chip ─────────────────────────────────────────────────────────────

interface VerdictChipProps {
  verdict: Verdict;
  status?: string;
  hasAnalysis?: boolean;
  style?: ViewStyle;
}

/**
 * StatusChip — Verdict variant
 * Shows AUTHENTIC / AI-GENERATED / UNCERTAIN with colour coding.
 */
export const VerdictChip: React.FC<VerdictChipProps> = ({ verdict, style, status, hasAnalysis }) => {
 const {colors:Colors}=useTheme(); const styles=useThemedStyles(makeStyles);

  const config: Record<Verdict, { label: string; color: string; bg: string }> = {
    authentic: {
      label: 'AUTHENTIC',
      color: Colors.authentic,
      bg: Colors.authenticDim,
    },
    ai_generated: {
      label: 'AI-GENERATED',
      color: Colors.ai,
      bg: Colors.aiDim,
    },
    uncertain: {
      label: 'UNCERTAIN',
      color: Colors.warning,
      bg: Colors.warningDim,
    },
  };

  const {label,color,bg}=hasAnalysis===false ? {label:status==='failed'?'FAILED':status==='processing'?'PROCESSING':'QUEUED',color:Colors.textSecondary,bg:Colors.bgTertiary} : config[verdict];

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
 const {colors:Colors}=useTheme(); const styles=useThemedStyles(makeStyles);

  const config: Record<SeverityLevel, { color: string; bg: string }> = {
    low: { color: Colors.authentic, bg: Colors.authenticDim },
    medium: { color: Colors.severityMedium, bg: Colors.warningDim },
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

const makeStyles = (Colors: ColorPalette) => createStyles({
  chip: {
    paddingVertical: 4,
    paddingHorizontal: Spacing.sm,
    borderRadius: Spacing.chipRadius,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
});
