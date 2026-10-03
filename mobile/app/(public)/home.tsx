import React, { useRef, useEffect } from 'react';
import {
  Animated,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
  Dimensions,
  Easing,
} from 'react-native';
import { Redirect, router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import GlassCard from '../../components/ui/GlassCard';
import CyberButton from '../../components/ui/CyberButton';
import CyberText from '../../components/ui/CyberText';
import ScanGrid from '../../components/ui/ScanGrid';
import GlowEffect from '../../components/ui/GlowEffect';
import Colors from '../../constants/Colors';
import Spacing from '../../constants/Spacing';
import { useAuth } from '../../hooks/useAuth';

const { width } = Dimensions.get('window');

// ─── Nav link data ────────────────────────────────────────────────────────────

const NAV_LINKS = [
  { label: 'About', icon: 'information-circle-outline' as const, route: '/(public)/about' },
  { label: 'How It Works', icon: 'help-circle-outline' as const, route: '/(public)/how-it-works' },
  { label: 'Pricing', icon: 'card-outline' as const, route: '/(public)/pricing' },
] as const;

// ─── Feature highlights ───────────────────────────────────────────────────────

const FEATURES = [
  { icon: 'eye-outline' as const, label: 'AI Image Classification' },
  { icon: 'analytics-outline' as const, label: 'Confidence Score' },
  { icon: 'map-outline' as const, label: 'Grad-CAM Heatmap' },
  { icon: 'document-text-outline' as const, label: 'Analysis Report' },
] as const;

/**
 * Home Screen
 *
 * Application hub for unauthenticated users.
 * - AuthentiScan branding
 * - Main "Detect Image" CTA
 * - Navigation links: About, How It Works, Pricing, Login
 * - Feature highlight cards
 * - Glassmorphism + scan grid environment
 */
export default function HomeScreen() {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) return null;
  // Old back-stack entries and home links must not show a signed-out screen
  // to a user whose secure session is still valid.
  if (isAuthenticated) return <Redirect href="/(tabs)/dashboard" />;
  return <GuestHomeScreen />;
}

function GuestHomeScreen() {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  const heroScale = useRef(new Animated.Value(0.95)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 600,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.spring(slideAnim, {
        toValue: 0,
        tension: 60,
        friction: 10,
        useNativeDriver: true,
      }),
      Animated.spring(heroScale, {
        toValue: 1,
        tension: 50,
        friction: 8,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#05070D', '#0B0F1A', '#080C14']}
        locations={[0, 0.6, 1]}
        style={StyleSheet.absoluteFill}
      />
      <ScanGrid animated />

      <SafeAreaView style={styles.safeArea}>
        <Animated.ScrollView
          style={{ opacity: fadeAnim }}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* ── Header ──────────────────────────────────────── */}
          <Animated.View
            style={[
              styles.header,
              { transform: [{ translateY: slideAnim }] },
            ]}
          >
            <View style={styles.logoRow}>
              <Ionicons name="shield-checkmark" size={28} color={Colors.cyan} />
              <CyberText variant="h4" color={Colors.textPrimary}>
                AuthentiScan
              </CyberText>
            </View>

            <TouchableOpacity
              onPress={() => router.push('/(auth)/login')}
              style={styles.loginLink}
              accessibilityRole="button"
              accessibilityLabel="Log in"
            >
              <CyberText variant="label" color={Colors.cyan}>
                Log In
              </CyberText>
            </TouchableOpacity>
          </Animated.View>

          {/* ── Hero section ─────────────────────────────────── */}
          <Animated.View
            style={[
              styles.heroSection,
              { transform: [{ scale: heroScale }, { translateY: slideAnim }] },
            ]}
          >
            <GlowEffect color={Colors.cyan} intensity="medium" pulse>
              <View style={styles.shieldIcon}>
                <Ionicons name="shield-checkmark" size={64} color={Colors.cyan} />
              </View>
            </GlowEffect>

            <View style={styles.heroTextContainer}>
              <CyberText variant="label" color={Colors.cyan} align="center">
                AI-POWERED VERIFICATION
              </CyberText>
              <CyberText variant="h1" align="center" style={styles.heroTitle}>
                Inspect Images.{'\n'}Review AI Estimates.
              </CyberText>
              <CyberText
                variant="body"
                align="center"
                muted
                style={styles.heroSubtitle}
              >
                Upload any image and let AuthentiScan's explainable AI reveal
                whether it's authentic or AI-generated.
              </CyberText>
            </View>

            {/* Primary CTA */}
            <View style={styles.ctaContainer}>
              <CyberButton
                label="Detect Image"
                onPress={() => router.push('/(auth)/login')}
                variant="primary"
                size="lg"
                style={styles.ctaButton}
                icon={<Ionicons name="scan-outline" size={20} color={Colors.bgPrimary} />}
              />
              <CyberButton
                label="Create Account — It's Free"
                onPress={() => router.push('/(auth)/register')}
                variant="ghost"
                size="md"
              />
            </View>
          </Animated.View>

          {/* ── Feature cards ────────────────────────────────── */}
          <Animated.View
            style={[
              styles.featuresSection,
              {
                opacity: fadeAnim,
                transform: [{ translateY: slideAnim }],
              },
            ]}
          >
            <CyberText variant="label" align="center" style={styles.sectionLabel}>
              WHAT AUTHENTISCAN DOES
            </CyberText>
            <View style={styles.featuresGrid}>
              {FEATURES.map((feature) => (
                <GlassCard key={feature.label} style={styles.featureCard}>
                  <Ionicons
                    name={feature.icon}
                    size={24}
                    color={Colors.cyan}
                  />
                  <CyberText
                    variant="caption"
                    align="center"
                    color={Colors.textSecondary}
                    style={styles.featureLabel}
                  >
                    {feature.label}
                  </CyberText>
                </GlassCard>
              ))}
            </View>
          </Animated.View>

          {/* ── Navigation links ─────────────────────────────── */}
          <Animated.View
            style={[
              styles.navSection,
              { opacity: fadeAnim },
            ]}
          >
            {NAV_LINKS.map((link) => (
              <TouchableOpacity
                key={link.label}
                onPress={() => router.push(link.route as any)}
                style={styles.navLink}
                accessibilityRole="button"
                accessibilityLabel={link.label}
              >
                <GlassCard style={styles.navLinkCard}>
                  <View style={styles.navLinkContent}>
                    <Ionicons name={link.icon} size={20} color={Colors.cyan} />
                    <CyberText variant="body" color={Colors.textPrimary}>
                      {link.label}
                    </CyberText>
                  </View>
                  <Ionicons
                    name="chevron-forward"
                    size={18}
                    color={Colors.textSecondary}
                  />
                </GlassCard>
              </TouchableOpacity>
            ))}
          </Animated.View>

          {/* ── Bottom tagline ───────────────────────────────── */}
          <View style={styles.bottomTagline}>
            <CyberText variant="caption" align="center">
              Model estimates are not proof · Offline preview
            </CyberText>
          </View>
        </Animated.ScrollView>
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
  scrollContent: {
    paddingHorizontal: Spacing.screenPadding,
    paddingBottom: 48,
  },
  // ── Header ──────────────────────────────────────────
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 16,
    paddingBottom: 8,
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  loginLink: {
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  // ── Hero ─────────────────────────────────────────────
  heroSection: {
    alignItems: 'center',
    paddingTop: 32,
    paddingBottom: 16,
    gap: 24,
  },
  shieldIcon: {
    width: 100,
    height: 100,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 50,
    backgroundColor: Colors.cyanDim,
    borderWidth: 1,
    borderColor: Colors.glassBorderCyan,
  },
  heroTextContainer: {
    alignItems: 'center',
    gap: 12,
  },
  heroTitle: {
    lineHeight: 40,
  },
  heroSubtitle: {
    maxWidth: width * 0.75,
    lineHeight: 22,
  },
  ctaContainer: {
    alignItems: 'center',
    gap: 12,
    width: '100%',
  },
  ctaButton: {
    width: '100%',
  },
  // ── Features ─────────────────────────────────────────
  featuresSection: {
    marginTop: 32,
    gap: 16,
  },
  sectionLabel: {
    marginBottom: 4,
  },
  featuresGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'space-between',
  },
  featureCard: {
    width: (width - Spacing.screenPadding * 2 - 10) / 2,
    alignItems: 'center',
    gap: 8,
    paddingVertical: 16,
  },
  featureLabel: {
    textAlign: 'center',
  },
  // ── Nav links ─────────────────────────────────────────
  navSection: {
    marginTop: 32,
    gap: 10,
  },
  navLink: {},
  navLinkCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  navLinkContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  // ── Bottom ────────────────────────────────────────────
  bottomTagline: {
    marginTop: 40,
    paddingBottom: 16,
  },
});
