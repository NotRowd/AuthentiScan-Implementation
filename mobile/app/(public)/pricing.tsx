import React, { useState } from 'react';
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
import CyberButton from '../../components/ui/CyberButton';
import CyberText from '../../components/ui/CyberText';
import ScanGrid from '../../components/ui/ScanGrid';
import Colors from '../../constants/Colors';
import Spacing from '../../constants/Spacing';
import { useAuth } from '../../hooks/useAuth';

// ─── Pricing data ─────────────────────────────────────────────────────────────
// NOTE: Display values aligned with the current database seed: PHP 249/month

const FEATURES_FREE = [
  '5 scans (no automatic monthly reset)',
  'Verdict + confidence score',
  'Basic explanation',
  'Grad-CAM when supplied by analysis',
];

const FEATURES_PREMIUM = [
  'Unlimited scans',
  'Verdict + confidence score',
  'Full explanation',
  'Grad-CAM heatmap',
  'Object detection is not available',
  'Report export is not available yet',
  'Scan history (unlimited)',
  'Payments are not integrated yet',
];

/**
 * Pricing Screen
 *
 * Shows Free and Premium plans.
 * Premium plan: PHP 249/month matching the current database seed.
 */
export default function PricingScreen() {
  const [selectedPlan, setSelectedPlan] = useState<'free' | 'premium'>('premium');
  const { isAuthenticated } = useAuth();

  const continueWithPlan = () => {
    if (!isAuthenticated) {
      router.push('/(auth)/register');
      return;
    }
    router.push(selectedPlan === 'premium' ? '/checkout' : '/(tabs)/dashboard');
  };

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
            PRICING
          </CyberText>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Heading */}
          <View style={styles.heading}>
            <CyberText variant="h3" align="center">
              Choose Your Plan
            </CyberText>
            <CyberText variant="body" muted align="center">
              Current plan definitions. Payments are not connected in this build.
            </CyberText>
          </View>

          {/* Free plan */}
          <TouchableOpacity
            onPress={() => setSelectedPlan('free')}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Select free plan"
          >
            <GlassCard
              style={styles.planCard}
              active={selectedPlan === 'free'}
              variant={selectedPlan === 'free' ? 'strong' : 'normal'}
            >
              <View style={styles.planHeader}>
                <View>
                  <CyberText variant="h4">Free</CyberText>
                  <CyberText variant="body" muted>
                    Get started
                  </CyberText>
                </View>
                <View style={styles.price}>
                  <CyberText variant="h2" color={Colors.textPrimary}>
                    $0
                  </CyberText>
                  <CyberText variant="caption">/month</CyberText>
                </View>
              </View>

              <View style={styles.divider} />

              <View style={styles.featureList}>
                {FEATURES_FREE.map((f) => (
                  <View key={f} style={styles.featureRow}>
                    <Ionicons
                      name="checkmark-outline"
                      size={16}
                      color={Colors.textSecondary}
                    />
                    <CyberText variant="bodySmall">{f}</CyberText>
                  </View>
                ))}
              </View>

              {selectedPlan === 'free' && (
                <View style={styles.selectedBadge}>
                  <CyberText variant="caption" color={Colors.cyan}>
                    SELECTED
                  </CyberText>
                </View>
              )}
            </GlassCard>
          </TouchableOpacity>

          {/* Premium plan */}
          <TouchableOpacity
            onPress={() => setSelectedPlan('premium')}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Select premium plan"
          >
            <GlassCard
              style={[
                styles.planCard,
                ...(selectedPlan === 'premium' ? [styles.premiumCardActive] : []),
              ]}
              active={selectedPlan === 'premium'}
              variant="strong"
            >
              {/* Most Secure badge */}
              <View style={styles.badge}>
                <LinearGradient
                  colors={[Colors.cyan, Colors.cyanAlt]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.badgeGradient}
                >
                  <Ionicons name="shield-checkmark" size={12} color={Colors.bgPrimary} />
                  <CyberText
                    variant="caption"
                    color={Colors.bgPrimary}
                    style={styles.badgeText}
                  >
                    PREMIUM PLAN
                  </CyberText>
                </LinearGradient>
              </View>

              <View style={styles.planHeader}>
                <View>
                  <CyberText variant="h4" color={Colors.textPrimary}>
                    Premium
                  </CyberText>
                  <CyberText variant="body" color={Colors.cyan}>
                    Unlimited scans when activated by the backend
                  </CyberText>
                </View>
                <View style={styles.price}>
                  <CyberText variant="h2" color={Colors.cyan}>
                    PHP 249
                  </CyberText>
                  <CyberText variant="caption" color={Colors.textSecondary}>
                    /month
                  </CyberText>
                </View>
              </View>

              <View style={[styles.divider, { borderColor: Colors.glassBorderCyan }]} />

              <View style={styles.featureList}>
                {FEATURES_PREMIUM.map((f) => (
                  <View key={f} style={styles.featureRow}>
                    <Ionicons
                      name="checkmark-circle-outline"
                      size={16}
                      color={Colors.cyan}
                    />
                    <CyberText variant="bodySmall" color={Colors.textPrimary}>
                      {f}
                    </CyberText>
                  </View>
                ))}
              </View>

              {selectedPlan === 'premium' && (
                <View style={[styles.selectedBadge, { borderColor: Colors.cyan }]}>
                  <CyberText variant="caption" color={Colors.cyan}>
                    SELECTED
                  </CyberText>
                </View>
              )}
            </GlassCard>
          </TouchableOpacity>

          {/* CTA */}
          <CyberButton
            label={
              selectedPlan === 'premium'
                ? 'Get Premium — PHP 249/month'
                : 'Start for Free'
            }
            onPress={continueWithPlan}
            variant={selectedPlan === 'premium' ? 'primary' : 'secondary'}
            size="lg"
            style={styles.cta}
          />

          <CyberText variant="caption" align="center" style={styles.disclaimer}>
            Payment is not connected in this prototype. No payment details are collected.
          </CyberText>
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
  heading: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
  },
  planCard: {
    position: 'relative',
    gap: 16,
    paddingTop: 20,
  },
  premiumCardActive: {
    borderColor: Colors.glassBorderCyan,
    shadowColor: Colors.cyan,
    shadowOpacity: 0.15,
    shadowRadius: 20,
  },
  badge: {
    position: 'absolute',
    top: -1,
    right: 16,
    borderRadius: 0,
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
    overflow: 'hidden',
  },
  badgeGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  badgeText: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1,
  },
  planHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  price: {
    alignItems: 'flex-end',
  },
  divider: {
    borderTopWidth: 1,
    borderColor: Colors.border,
  },
  featureList: {
    gap: 10,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  selectedBadge: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: Colors.textSecondary,
    borderRadius: 20,
    paddingVertical: 3,
    paddingHorizontal: 10,
  },
  cta: {
    marginTop: 8,
  },
  disclaimer: {
    marginTop: -4,
  },
});
