import React, { useRef } from 'react';
import {
  Animated,
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

// ─── Process steps ────────────────────────────────────────────────────────────

const STEPS = [
  {
    step: '01',
    icon: 'cloud-upload-outline' as const,
    title: 'Upload Image',
    description:
      'Select any image from your device. AuthentiScan accepts JPEG, PNG, and WebP formats.',
    color: Colors.cyan,
  },
  {
    step: '02',
    icon: 'scan-outline' as const,
    title: 'AI Scan',
    description:
      'The current system uses EfficientNet-B0 for image classification. Backend mode requests real analysis; offline mode uses clearly labeled sample results.',
    color: Colors.cyanAlt,
  },
  {
    step: '03',
    icon: 'shield-checkmark-outline' as const,
    title: 'Get Results',
    description:
      'Receive a verdict — Authentic, AI-generated, or Uncertain — with a confidence score and plain-language explanation.',
    color: Colors.authentic,
  },
  {
    step: '04',
    icon: 'document-text-outline' as const,
    title: 'Analysis Report',
    description:
      'Review a Grad-CAM heatmap when supplied. Detailed manipulation indicators and object detection are not supported by the current model.',
    color: Colors.textSecondary,
  },
] as const;

// ─── Technology cards ─────────────────────────────────────────────────────────

const TECH = [
  {
    icon: 'git-network-outline' as const,
    title: 'Deep Neural Network',
    desc: 'Trained on large-scale real and synthetic image datasets.',
  },
  {
    icon: 'map-outline' as const,
    title: 'Grad-CAM XAI',
    desc: 'Highlights image regions that drove the model\'s prediction.',
  },
  {
    icon: 'analytics-outline' as const,
    title: 'Authenticity Scores',
    desc: 'Displays model estimates for authentic and AI-generated classes, not proof.',
  },
] as const;

/**
 * How It Works Screen
 *
 * 4-step process visualization with glass cards and cyan accents.
 */
export default function HowItWorksScreen() {
  const scrollRef = useRef<ScrollView>(null);

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
            HOW IT WORKS
          </CyberText>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Intro */}
          <View style={styles.intro}>
            <CyberText variant="h3" align="center">
              From Upload{'\n'}to Classification Result
            </CyberText>
            <CyberText variant="body" muted align="center" style={styles.introSubtitle}>
              AuthentiScan walks you through every step of the AI analysis
              process transparently.
            </CyberText>
          </View>

          {/* Steps */}
          <CyberText variant="label" style={styles.sectionLabel}>
            THE PROCESS
          </CyberText>
          <View style={styles.stepsContainer}>
            {STEPS.map((step, index) => (
              <View key={step.step}>
                <GlassCard style={styles.stepCard} variant="normal">
                  <View style={styles.stepNumber}>
                    <CyberText variant="system" color={step.color} style={styles.stepNumText}>
                      {step.step}
                    </CyberText>
                  </View>
                  <View style={styles.stepIconContainer}>
                    <View
                      style={[
                        styles.stepIconBg,
                        { backgroundColor: `${step.color}18` },
                      ]}
                    >
                      <Ionicons name={step.icon} size={28} color={step.color} />
                    </View>
                  </View>
                  <View style={styles.stepContent}>
                    <CyberText variant="h4">{step.title}</CyberText>
                    <CyberText variant="body" muted style={styles.stepDesc}>
                      {step.description}
                    </CyberText>
                  </View>
                </GlassCard>

                {/* Connector line between steps */}
                {index < STEPS.length - 1 && (
                  <View style={styles.connector}>
                    <View style={styles.connectorLine} />
                    <Ionicons
                      name="chevron-down"
                      size={14}
                      color={Colors.textMuted}
                    />
                  </View>
                )}
              </View>
            ))}
          </View>

          {/* Technology */}
          <CyberText variant="label" style={styles.sectionLabel}>
            TECHNOLOGY INSIDE
          </CyberText>
          <View style={styles.techGrid}>
            {TECH.map((item) => (
              <GlassCard key={item.title} style={styles.techCard} variant="subtle">
                <Ionicons name={item.icon} size={24} color={Colors.cyan} />
                <CyberText variant="bodySmall" color={Colors.textPrimary} style={styles.techTitle}>
                  {item.title}
                </CyberText>
                <CyberText variant="caption" style={styles.techDesc}>
                  {item.desc}
                </CyberText>
              </GlassCard>
            ))}
          </View>

          {/* CTA */}
          <GlassCard variant="strong" style={styles.ctaCard} active>
            <Ionicons name="scan-outline" size={32} color={Colors.cyan} />
            <CyberText variant="h4" align="center">
              Ready to analyze an image?
            </CyberText>
            <CyberText variant="body" muted align="center">
              Create an account to start scanning immediately.
            </CyberText>
            <TouchableOpacity
              onPress={() => router.push('/(auth)/register')}
              style={styles.ctaButton}
              accessibilityRole="button"
              accessibilityLabel="Get started"
            >
              <LinearGradient
                colors={[Colors.cyan, Colors.cyanAlt]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.ctaGradient}
              >
                <CyberText variant="label" color={Colors.bgPrimary}>
                  GET STARTED
                </CyberText>
              </LinearGradient>
            </TouchableOpacity>
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
  intro: {
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
  },
  introSubtitle: {
    maxWidth: 300,
    lineHeight: 22,
  },
  sectionLabel: {
    marginTop: 8,
  },
  stepsContainer: {
    gap: 0,
  },
  stepCard: {
    gap: 12,
  },
  stepNumber: {
    position: 'absolute',
    top: 12,
    right: 16,
  },
  stepNumText: {
    fontSize: 28,
    opacity: 0.3,
  },
  stepIconContainer: {
    alignSelf: 'flex-start',
  },
  stepIconBg: {
    width: 52,
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepContent: {
    gap: 6,
  },
  stepDesc: {
    lineHeight: 22,
  },
  connector: {
    alignItems: 'center',
    paddingVertical: 4,
  },
  connectorLine: {
    width: 1,
    height: 12,
    backgroundColor: Colors.border,
  },
  techGrid: {
    gap: 10,
  },
  techCard: {
    gap: 8,
  },
  techTitle: {
    fontWeight: '600',
  },
  techDesc: {
    lineHeight: 18,
  },
  ctaCard: {
    alignItems: 'center',
    gap: 16,
    marginTop: 8,
    paddingVertical: 28,
  },
  ctaButton: {
    width: '100%',
    borderRadius: 12,
    overflow: 'hidden',
    marginTop: 4,
  },
  ctaGradient: {
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
