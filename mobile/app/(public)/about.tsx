import React from 'react';
import {
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import GlassCard from '../../components/ui/GlassCard';
import CyberText from '../../components/ui/CyberText';
import ScanGrid from '../../components/ui/ScanGrid';
import Colors from '../../constants/Colors';
import Spacing from '../../constants/Spacing';

// ─── Placeholder stat cards ───────────────────────────────────────────────────
// NOTE: These are placeholder statistics for prototype purposes only.
// Replace with verified data before production launch.

const PLACEHOLDER_STATS = [
  { value: 'Offline', label: 'Test Mode', note: 'No live model evaluation' },
  { value: '<3s', label: 'Analysis Time', note: '[Prototype target]' },
  { value: 'XAI', label: 'Explainable AI', note: '[Core feature]' },
] as const;

/**
 * About Screen
 *
 * Explains the AuthentiScan mission, technology, and team context.
 * Stats are clearly marked as placeholders per project guidelines.
 */
export default function AboutScreen() {
  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#05070D', '#0B0F1A', '#05070D']}
        style={StyleSheet.absoluteFill}
      />
      <ScanGrid animated={false} />

      <SafeAreaView style={styles.safeArea}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.backButton}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Ionicons name="arrow-back" size={22} color={Colors.textPrimary} />
          </TouchableOpacity>
          <CyberText variant="label" color={Colors.cyan}>
            ABOUT
          </CyberText>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Mission panel */}
          <GlassCard style={styles.missionCard} variant="strong">
            <View style={styles.missionHeader}>
              <Ionicons name="shield-checkmark" size={32} color={Colors.cyan} />
              <View style={styles.missionTitleContainer}>
                <CyberText variant="h3">AuthentiScan</CyberText>
                <CyberText variant="label" color={Colors.cyan}>
                  AI IMAGE CLASSIFICATION
                </CyberText>
              </View>
            </View>
            <CyberText variant="body" muted style={styles.missionText}>
              AuthentiScan is an explainable AI-powered mobile application
              designed to help people review estimates of AI-generated
              images with confidence.
            </CyberText>
            <CyberText variant="body" muted style={styles.missionText}>
              In an era where synthetic media is increasingly realistic and
              widespread, AuthentiScan provides a model-assisted image review —
              giving you not just a verdict, but a clear explanation of why
              the AI produced its result.
            </CyberText>
          </GlassCard>

          {/* Stats */}
          <CyberText variant="label" style={styles.sectionLabel}>
            KEY METRICS
          </CyberText>
          <View style={styles.statsRow}>
            {PLACEHOLDER_STATS.map((stat) => (
              <GlassCard key={stat.label} style={styles.statCard}>
                <CyberText variant="h3" color={Colors.cyan} align="center">
                  {stat.value}
                </CyberText>
                <CyberText variant="caption" align="center">
                  {stat.label}
                </CyberText>
                <CyberText
                  variant="caption"
                  align="center"
                  color={Colors.severityMedium}
                  style={styles.statNote}
                >
                  {stat.note}
                </CyberText>
              </GlassCard>
            ))}
          </View>

          {/* What we detect */}
          <CyberText variant="label" style={styles.sectionLabel}>
            WHAT WE DETECT
          </CyberText>
          <GlassCard style={styles.detectCard}>
            {[
              { icon: 'alert-circle-outline' as const, text: 'GAN-generated portraits and faces' },
              { icon: 'alert-circle-outline' as const, text: 'Static images only; no video detection' },
              { icon: 'alert-circle-outline' as const, text: 'AI-inpainted or edited images' },
              { icon: 'alert-circle-outline' as const, text: 'Diffusion model outputs' },
              { icon: 'checkmark-circle-outline' as const, text: 'Authentic, camera-captured images' },
            ].map((item, idx) => (
              <View key={idx} style={styles.detectRow}>
                <Ionicons
                  name={item.icon}
                  size={18}
                  color={
                    item.icon === 'checkmark-circle-outline'
                      ? Colors.authentic
                      : Colors.fake
                  }
                />
                <CyberText variant="bodySmall" style={styles.detectText}>
                  {item.text}
                </CyberText>
              </View>
            ))}
          </GlassCard>

          {/* Explainability */}
          <CyberText variant="label" style={styles.sectionLabel}>
            EXPLAINABLE AI (XAI)
          </CyberText>
          <GlassCard variant="normal" style={styles.xaiCard}>
            <Ionicons name="map-outline" size={28} color={Colors.cyan} />
            <CyberText variant="body" muted style={styles.xaiText}>
              AuthentiScan doesn't just give you a verdict — it shows{' '}
              <CyberText variant="body" color={Colors.textPrimary}>
                why
              </CyberText>
              . Using Gradient-weighted Class Activation Mapping (Grad-CAM),
              the app highlights the exact regions of the image that
              influenced the AI's decision.
            </CyberText>
          </GlassCard>

          {/* Project note */}
          <GlassCard variant="subtle" style={styles.projectNote}>
            <Ionicons name="information-circle-outline" size={18} color={Colors.textSecondary} />
            <CyberText variant="caption" style={styles.projectNoteText}>
              AuthentiScan is a capstone research project. All AI analysis
              results should be treated as assistive information, not
              definitive legal evidence.
            </CyberText>
          </GlassCard>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bgPrimary,
  },
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.screenPadding,
    paddingVertical: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  scrollContent: {
    paddingHorizontal: Spacing.screenPadding,
    paddingBottom: 48,
    gap: 16,
  },
  missionCard: {
    gap: 16,
  },
  missionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  missionTitleContainer: {
    flex: 1,
    gap: 4,
  },
  missionText: {
    lineHeight: 22,
  },
  sectionLabel: {
    marginTop: 8,
    marginBottom: 4,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  statCard: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    paddingVertical: 16,
  },
  statNote: {
    fontSize: 9,
    marginTop: 2,
  },
  detectCard: {
    gap: 12,
  },
  detectRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  detectText: {
    flex: 1,
    lineHeight: 20,
  },
  xaiCard: {
    gap: 12,
  },
  xaiText: {
    lineHeight: 22,
  },
  projectNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginTop: 8,
  },
  projectNoteText: {
    flex: 1,
    lineHeight: 18,
  },
});
