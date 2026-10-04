import React, { useCallback, useRef } from 'react';
import {
  Animated,
  Image,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { Redirect, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import CyberButton from '../../components/ui/CyberButton';
import { useAuth } from '../../hooks/useAuth';

const BRAND = {
  ink: '#12304A',
  muted: '#597188',
  blue: '#2589D8',
  deepBlue: '#176FB7',
  paleBlue: '#EAF6FF',
  border: '#D9EAF6',
  surface: '#FFFFFF',
  canvas: '#F6FAFD',
};

const NAV_LINKS = [
  { label: 'About', icon: 'information-circle-outline' as const, route: '/(public)/about' },
  { label: 'How it works', icon: 'help-circle-outline' as const, route: '/(public)/how-it-works' },
  { label: 'Pricing', icon: 'card-outline' as const, route: '/(public)/pricing' },
] as const;

const FEATURES = [
  { icon: 'scan-outline' as const, title: 'Image review', body: 'Get an AI estimate for an image.' },
  { icon: 'analytics-outline' as const, title: 'Clear results', body: 'See the result and its confidence score.' },
  { icon: 'map-outline' as const, title: 'Visual context', body: 'Review the Grad-CAM explanation when available.' },
  { icon: 'document-text-outline' as const, title: 'Shareable report', body: 'Keep a report of your completed analysis.' },
] as const;

type SectionBox = { y: number; height: number };

export default function HomeScreen() {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) return null;
  if (isAuthenticated) return <Redirect href="/(tabs)/dashboard" />;
  return <GuestHomeScreen />;
}

function GuestHomeScreen() {
  const { height: viewportHeight } = useWindowDimensions();
  const scrollY = useRef(0);
  const sectionBoxes = useRef<Record<number, SectionBox>>({});
  const activeSections = useRef<Record<number, boolean>>({});
  const revealValues = useRef([0, 0, 0].map(() => new Animated.Value(0))).current;
  const introOpacity = useRef(new Animated.Value(0)).current;
  const introOffset = useRef(new Animated.Value(12)).current;

  React.useEffect(() => {
    Animated.parallel([
      Animated.timing(introOpacity, { toValue: 1, duration: 420, useNativeDriver: true }),
      Animated.timing(introOffset, { toValue: 0, duration: 420, useNativeDriver: true }),
    ]).start();
  }, [introOpacity, introOffset]);

  const refreshReveals = useCallback(() => {
    Object.entries(sectionBoxes.current).forEach(([rawIndex, box]) => {
      const index = Number(rawIndex);
      const top = box.y - scrollY.current;
      const isVisible = top < viewportHeight * 0.86 && top + box.height > viewportHeight * 0.12;
      if (isVisible && !activeSections.current[index]) {
        activeSections.current[index] = true;
        revealValues[index].setValue(0);
        Animated.timing(revealValues[index], {
          toValue: 1,
          duration: 360,
          useNativeDriver: true,
        }).start();
      } else if (!isVisible && activeSections.current[index]) {
        activeSections.current[index] = false;
        revealValues[index].stopAnimation();
        revealValues[index].setValue(0);
      }
    });
  }, [revealValues, viewportHeight]);

  const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrollY.current = event.nativeEvent.contentOffset.y;
    refreshReveals();
  }, [refreshReveals]);

  const registerSection = (index: number) => (event: { nativeEvent: { layout: SectionBox } }) => {
    sectionBoxes.current[index] = event.nativeEvent.layout;
    refreshReveals();
  };

  const sectionStyle = (index: number) => ({
    opacity: revealValues[index],
    transform: [{ translateY: revealValues[index].interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }],
  });

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          stickyHeaderIndices={[0]}
          onScroll={handleScroll}
          scrollEventThrottle={80}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <View style={styles.brand}>
              <Image source={require('../../assets/AuthentiScan-Logo.png')} style={styles.logo} accessibilityLabel="AuthentiScan logo" />
              <Text style={styles.brandName}>AuthentiScan</Text>
            </View>
            <TouchableOpacity
              onPress={() => router.push('/(auth)/login')}
              style={styles.loginButton}
              accessibilityRole="button"
              accessibilityLabel="Log in"
            >
              <Text style={styles.loginText}>Log in</Text>
              <Ionicons name="arrow-forward" size={16} color={BRAND.deepBlue} />
            </TouchableOpacity>
          </View>

          <Animated.View
            style={[styles.hero, { opacity: introOpacity, transform: [{ translateY: introOffset }] }]}
          >
            <View style={styles.eyebrow}>
              <View style={styles.eyebrowDot} />
              <Text style={styles.eyebrowText}>AI-ASSISTED IMAGE REVIEW</Text>
            </View>
            <Text style={styles.heroTitle}>A clearer look at{ '\n' }what’s in an image.</Text>
            <Text style={styles.heroBody}>
              Review whether an image may be authentic or AI-generated with explainable AI insights.
            </Text>

            <View style={styles.heroVisual}>
              <View style={styles.visualOrbOuter}>
                <View style={styles.visualOrbInner}>
                  <Image source={require('../../assets/AuthentiScan-Logo.png')} style={styles.heroLogo} accessibilityLabel="AuthentiScan logo" />
                </View>
                <View style={[styles.signalDot, styles.signalDotTop]} />
                <View style={[styles.signalDot, styles.signalDotRight]} />
                <View style={[styles.signalDot, styles.signalDotBottom]} />
              </View>
              <View style={styles.scanPill}>
                <Ionicons name="sparkles-outline" size={15} color={BRAND.deepBlue} />
                <Text style={styles.scanPillText}>Image authenticity insights</Text>
              </View>
            </View>

            <View style={styles.ctas}>
              <CyberButton
                label="Start scanning"
                onPress={() => router.push('/(auth)/login')}
                variant="primary"
                size="lg"
                style={styles.primaryButton}
                textStyle={styles.primaryButtonText}
                icon={<Ionicons name="scan-outline" size={20} color="#FFFFFF" />}
              />
              <TouchableOpacity
                onPress={() => router.push('/(auth)/register')}
                style={styles.createAccountButton}
                accessibilityRole="button"
                accessibilityLabel="Create a free account"
              >
                <Text style={styles.createAccountText}>Create a free account</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.heroNote}>Sign in to begin · Estimates are informational, not proof</Text>
          </Animated.View>

          <Animated.View style={[styles.section, sectionStyle(0)]} onLayout={registerSection(0)}>
            <View style={styles.sectionHeading}>
              <Text style={styles.kicker}>WHAT YOU CAN REVIEW</Text>
              <Text style={styles.sectionTitle}>Useful insights, made clear.</Text>
            </View>
            <View style={styles.featureGrid}>
              {FEATURES.map((feature) => (
                <View key={feature.title} style={styles.featureCard}>
                  <View style={styles.featureIcon}>
                    <Ionicons name={feature.icon} size={21} color={BRAND.deepBlue} />
                  </View>
                  <Text style={styles.featureTitle}>{feature.title}</Text>
                  <Text style={styles.featureBody}>{feature.body}</Text>
                </View>
              ))}
            </View>
          </Animated.View>

          <Animated.View style={[styles.section, styles.learnSection, sectionStyle(1)]} onLayout={registerSection(1)}>
            <View style={styles.learnCard}>
              <View style={styles.learnIcon}>
                <Ionicons name="shield-checkmark-outline" size={24} color={BRAND.deepBlue} />
              </View>
              <View style={styles.learnCopy}>
                <Text style={styles.learnTitle}>Understand the result</Text>
                <Text style={styles.learnBody}>See how image analysis works and what its estimates can—and can’t—tell you.</Text>
              </View>
              <Ionicons name="arrow-down" size={18} color={BRAND.muted} />
            </View>
          </Animated.View>

          <Animated.View style={[styles.section, styles.linksSection, sectionStyle(2)]} onLayout={registerSection(2)}>
            <Text style={styles.kicker}>EXPLORE AUTHENTISCAN</Text>
            {NAV_LINKS.map((link) => (
              <TouchableOpacity
                key={link.label}
                onPress={() => router.push(link.route as any)}
                style={styles.navCard}
                accessibilityRole="button"
                accessibilityLabel={link.label}
              >
                <View style={styles.navIcon}>
                  <Ionicons name={link.icon} size={20} color={BRAND.deepBlue} />
                </View>
                <Text style={styles.navLabel}>{link.label}</Text>
                <Ionicons name="chevron-forward" size={18} color={BRAND.muted} />
              </TouchableOpacity>
            ))}
          </Animated.View>

          <View style={styles.footer}>
            <View style={styles.footerBrand}>
              <Image source={require('../../assets/AuthentiScan-Logo.png')} style={styles.footerLogo} accessibilityLabel="" />
              <Text style={styles.footerBrandName}>AuthentiScan</Text>
            </View>
            <Text style={styles.footerNote}>AI analysis is an estimate and should not be treated as definitive proof.</Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BRAND.canvas },
  safeArea: { flex: 1 },
  scrollContent: { paddingBottom: 32 },
  header: {
    minHeight: 68,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: BRAND.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BRAND.border,
    zIndex: 10,
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  logo: { width: 36, height: 36, borderRadius: 10 },
  brandName: { fontSize: 18, fontWeight: '800', letterSpacing: -0.5, color: BRAND.ink },
  loginButton: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 13, borderRadius: 13, backgroundColor: BRAND.paleBlue },
  loginText: { fontSize: 14, fontWeight: '700', color: BRAND.deepBlue },
  hero: { paddingHorizontal: 22, paddingTop: 31, paddingBottom: 32, alignItems: 'center' },
  eyebrow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, backgroundColor: '#E5F4FF' },
  eyebrowDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: BRAND.blue },
  eyebrowText: { fontSize: 10, fontWeight: '800', letterSpacing: 1.15, color: BRAND.deepBlue },
  heroTitle: { marginTop: 20, fontSize: 34, lineHeight: 40, fontWeight: '800', letterSpacing: -1.2, textAlign: 'center', color: BRAND.ink },
  heroBody: { maxWidth: 340, marginTop: 12, fontSize: 15, lineHeight: 23, textAlign: 'center', color: BRAND.muted },
  heroVisual: { height: 206, width: '100%', maxWidth: 370, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  visualOrbOuter: { width: 158, height: 158, borderRadius: 80, alignItems: 'center', justifyContent: 'center', backgroundColor: '#E4F3FF', borderWidth: 1, borderColor: '#C8E4F9' },
  visualOrbInner: { width: 112, height: 112, borderRadius: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF', shadowColor: '#237EC2', shadowOffset: { width: 0, height: 7 }, shadowOpacity: 0.12, shadowRadius: 16, elevation: 5 },
  heroLogo: { width: 92, height: 92, borderRadius: 24 },
  signalDot: { position: 'absolute', width: 13, height: 13, borderRadius: 7, backgroundColor: '#FFFFFF', borderWidth: 3, borderColor: '#91C9F3' },
  signalDotTop: { top: 8, left: 73 },
  signalDotRight: { right: 4, top: 73 },
  signalDotBottom: { bottom: 8, left: 73 },
  scanPill: { position: 'absolute', bottom: 9, flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 13, paddingVertical: 9, borderRadius: 18, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: BRAND.border, shadowColor: '#12304A', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.08, shadowRadius: 9, elevation: 3 },
  scanPillText: { fontSize: 12, fontWeight: '700', color: BRAND.ink },
  ctas: { width: '100%', maxWidth: 380, alignItems: 'stretch', gap: 4 },
  primaryButton: { width: '100%', alignSelf: 'stretch', justifyContent: 'center', minHeight: 56, backgroundColor: BRAND.blue, borderColor: BRAND.blue, borderRadius: 16, elevation: 3, shadowOpacity: 0.16, shadowRadius: 8 },
  primaryButtonText: { color: '#FFFFFF', textTransform: 'none', letterSpacing: 0.1, fontSize: 16 },
  createAccountButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  createAccountText: { fontSize: 14, fontWeight: '700', color: BRAND.deepBlue },
  heroNote: { marginTop: 8, fontSize: 11, lineHeight: 16, textAlign: 'center', color: '#70869A' },
  section: { paddingHorizontal: 20, paddingTop: 21, paddingBottom: 8 },
  sectionHeading: { marginBottom: 16 },
  kicker: { marginBottom: 8, fontSize: 10, fontWeight: '800', letterSpacing: 1.2, color: BRAND.deepBlue },
  sectionTitle: { fontSize: 23, lineHeight: 29, fontWeight: '800', letterSpacing: -0.5, color: BRAND.ink },
  featureGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 11 },
  featureCard: { width: '48%', flexGrow: 1, minHeight: 146, padding: 15, borderRadius: 18, backgroundColor: BRAND.surface, borderWidth: 1, borderColor: BRAND.border, shadowColor: '#18476B', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.04, shadowRadius: 10, elevation: 2 },
  featureIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: BRAND.paleBlue, marginBottom: 12 },
  featureTitle: { fontSize: 14, fontWeight: '800', color: BRAND.ink },
  featureBody: { marginTop: 5, fontSize: 12, lineHeight: 18, color: BRAND.muted },
  learnSection: { paddingTop: 17 },
  learnCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 15, borderRadius: 18, backgroundColor: '#EAF6FF', borderWidth: 1, borderColor: '#D3EAF9' },
  learnIcon: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' },
  learnCopy: { flex: 1 },
  learnTitle: { fontSize: 14, fontWeight: '800', color: BRAND.ink },
  learnBody: { marginTop: 4, fontSize: 12, lineHeight: 17, color: BRAND.muted },
  linksSection: { paddingTop: 27, gap: 9 },
  navCard: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 13, borderRadius: 16, backgroundColor: BRAND.surface, borderWidth: 1, borderColor: BRAND.border },
  navIcon: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 11, backgroundColor: BRAND.paleBlue },
  navLabel: { flex: 1, fontSize: 14, fontWeight: '700', color: BRAND.ink },
  footer: { alignItems: 'center', paddingHorizontal: 26, paddingTop: 30 },
  footerBrand: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  footerLogo: { width: 22, height: 22, borderRadius: 6 },
  footerBrandName: { fontSize: 13, fontWeight: '800', color: BRAND.ink },
  footerNote: { marginTop: 9, fontSize: 11, lineHeight: 16, textAlign: 'center', color: BRAND.muted },
});
