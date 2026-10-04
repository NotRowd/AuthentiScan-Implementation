import React, { useCallback, useRef, useState } from 'react';
import { Animated, NativeScrollEvent, NativeSyntheticEvent, ScrollView, StyleSheet, TouchableOpacity, View, useWindowDimensions } from 'react-native';
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

const FEATURES_FREE = [
  '5 scans (no automatic monthly reset)',
  'Verdict and confidence score',
  'Basic explanation',
  'Grad-CAM when supplied by analysis',
];

const FEATURES_PREMIUM = [
  'Unlimited scans when enabled by backend',
  'Verdict and confidence score',
  'Full explanation and Grad-CAM',
  'Unlimited scan history',
];

type SectionBox = { y: number; height: number };

export default function PricingScreen() {
  const [selectedPlan, setSelectedPlan] = useState<'free' | 'premium'>('premium');
  const { isAuthenticated, user } = useAuth();
  const { height: viewportHeight } = useWindowDimensions();
  const scrollY = useRef(0);
  const sectionBoxes = useRef<Record<number, SectionBox>>({});
  const activeSections = useRef<Record<number, boolean>>({});
  const revealValues = useRef([0, 0, 0].map(() => new Animated.Value(0))).current;

  const refreshReveals = useCallback(() => {
    Object.entries(sectionBoxes.current).forEach(([rawIndex, box]) => {
      const index = Number(rawIndex);
      const top = box.y - scrollY.current;
      const visible = top < viewportHeight * 0.88 && top + box.height > viewportHeight * 0.12;
      if (visible && !activeSections.current[index]) {
        activeSections.current[index] = true;
        revealValues[index].setValue(0);
        Animated.timing(revealValues[index], { toValue: 1, duration: 340, useNativeDriver: true }).start();
      } else if (!visible && activeSections.current[index]) {
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
    transform: [{ translateY: revealValues[index].interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }],
  });

  const continueWithPlan = () => {
    if (!isAuthenticated) {
      router.push('/(auth)/register');
      return;
    }
    router.push(selectedPlan === 'premium' ? '/checkout' : '/(tabs)/dashboard');
  };

  const currentPlan = user?.plan === 'premium' ? 'Premium' : 'Free';
  const currentLimit = user?.scanLimit === null ? 'Unlimited scans' : `${user?.scanLimit ?? 5} scans included`;

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#F6FAFD', '#EEF7FD', '#F6FAFD']} style={StyleSheet.absoluteFill} />
      <ScanGrid animated={false} />
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} onScroll={handleScroll} scrollEventThrottle={80}>
          <View style={styles.header}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backButton} accessibilityRole="button" accessibilityLabel="Go back">
              <Ionicons name="arrow-back" size={21} color={Colors.textPrimary} />
            </TouchableOpacity>
            <View style={styles.headerText}>
              <CyberText variant="label" color={Colors.cyan}>SUBSCRIPTION</CyberText>
              <CyberText variant="h2" style={styles.pageTitle}>Plans & Pricing</CyberText>
            </View>
            <View style={styles.headerSpacer} />
          </View>

          {isAuthenticated && <GlassCard variant="strong" style={styles.currentCard}>
            <View style={styles.currentIcon}><Ionicons name="shield-checkmark" size={20} color={Colors.cyan} /></View>
            <View style={styles.currentCopy}>
              <CyberText variant="caption" color={Colors.textSecondary}>CURRENT PLAN</CyberText>
              <View style={styles.currentPlanLine}><CyberText variant="h4">{currentPlan}</CyberText><View style={styles.activeBadge}><CyberText variant="caption" color={Colors.authentic}>ACTIVE</CyberText></View></View>
              <CyberText variant="bodySmall" color={Colors.textSecondary}>{currentLimit}</CyberText>
            </View>
          </GlassCard>}

          <Animated.View style={[styles.intro, sectionStyle(0)]} onLayout={registerSection(0)}>
            <CyberText variant="h3">Choose the plan that fits</CyberText>
            <CyberText variant="bodySmall" color={Colors.textSecondary}>Compare scan access and analysis features.</CyberText>
          </Animated.View>

          <Animated.View style={sectionStyle(1)} onLayout={registerSection(1)}>
            <TouchableOpacity onPress={() => setSelectedPlan('free')} activeOpacity={0.86} accessibilityRole="button" accessibilityLabel="Select free plan" accessibilityState={{ selected: selectedPlan === 'free' }}>
              <GlassCard style={styles.planCard} active={selectedPlan === 'free'}>
                <View style={styles.planHeader}>
                  <View style={styles.planTitleLine}><View style={styles.planIcon}><Ionicons name="sparkles-outline" size={17} color={Colors.textSecondary} /></View><CyberText variant="h4">Free</CyberText></View>
                  <View style={styles.price}><CyberText variant="h2">$0</CyberText><CyberText variant="caption" color={Colors.textSecondary}>/ month</CyberText></View>
                </View>
                <CyberText variant="bodySmall" color={Colors.textSecondary}>Explore image authenticity analysis.</CyberText>
                <View style={styles.divider} />
                <View style={styles.featureList}>{FEATURES_FREE.map((feature) => <View key={feature} style={styles.featureRow}><Ionicons name="checkmark-circle" size={17} color={Colors.authentic} /><CyberText variant="bodySmall" style={styles.featureText}>{feature}</CyberText></View>)}</View>
                {selectedPlan === 'free' && <View style={styles.selectedBadge}><Ionicons name="checkmark-circle" size={15} color={Colors.cyan} /><CyberText variant="caption" color={Colors.cyan}>SELECTED</CyberText></View>}
              </GlassCard>
            </TouchableOpacity>
          </Animated.View>

          <Animated.View style={sectionStyle(2)} onLayout={registerSection(2)}>
            <TouchableOpacity onPress={() => setSelectedPlan('premium')} activeOpacity={0.86} accessibilityRole="button" accessibilityLabel="Select premium plan" accessibilityState={{ selected: selectedPlan === 'premium' }}>
              <GlassCard style={[styles.planCard, styles.premiumPlanCard, selectedPlan === 'premium' && styles.premiumSelected]} active={selectedPlan === 'premium'} variant="strong">
                <View style={styles.premiumTag}><Ionicons name="star" size={12} color={Colors.white} /><CyberText variant="caption" color={Colors.white}>PREMIUM</CyberText></View>
                <View style={styles.planHeader}>
                  <View style={styles.planTitleLine}><View style={[styles.planIcon, styles.premiumIcon]}><Ionicons name="shield-checkmark" size={17} color={Colors.cyan} /></View><CyberText variant="h4">Premium</CyberText></View>
                  <View style={styles.price}><CyberText variant="h2" color={Colors.cyan}>PHP 249</CyberText><CyberText variant="caption" color={Colors.textSecondary}>/ month</CyberText></View>
                </View>
                <CyberText variant="bodySmall" color={Colors.textSecondary}>More scans and detailed results.</CyberText>
                <View style={[styles.divider, styles.premiumDivider]} />
                <View style={styles.featureList}>{FEATURES_PREMIUM.map((feature) => <View key={feature} style={styles.featureRow}><Ionicons name="checkmark-circle" size={17} color={Colors.cyan} /><CyberText variant="bodySmall" style={styles.featureText}>{feature}</CyberText></View>)}</View>
                {selectedPlan === 'premium' && <View style={[styles.selectedBadge, styles.premiumSelectedBadge]}><Ionicons name="checkmark-circle" size={15} color={Colors.cyan} /><CyberText variant="caption" color={Colors.cyan}>SELECTED</CyberText></View>}
              </GlassCard>
            </TouchableOpacity>
          </Animated.View>

          <CyberButton label={selectedPlan === 'premium' ? 'Continue with Premium' : 'Continue with Free'} onPress={continueWithPlan} variant="primary" size="lg" style={styles.cta} />
          <View style={styles.paymentNote}><Ionicons name="information-circle-outline" size={17} color={Colors.textSecondary} /><CyberText variant="caption" color={Colors.textSecondary} style={styles.noteText}>Payments are not integrated in this build. No payment details are collected.</CyberText></View>
          <View style={{ height: 28 }} />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgPrimary },
  safeArea: { flex: 1 },
  scrollContent: { paddingHorizontal: Spacing.screenPadding, paddingBottom: 24, gap: 14 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 8, paddingBottom: 8 },
  backButton: { width: 40, height: 40, borderRadius: 13, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  headerText: { flex: 1 },
  pageTitle: { marginTop: 4 },
  headerSpacer: { width: 4 },
  currentCard: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 },
  currentIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: Colors.cyanDim, alignItems: 'center', justifyContent: 'center' },
  currentCopy: { flex: 1, gap: 3 },
  currentPlanLine: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  activeBadge: { borderRadius: 20, backgroundColor: Colors.authenticDim, paddingHorizontal: 8, paddingVertical: 3 },
  intro: { gap: 4, paddingTop: 4, paddingBottom: 2 },
  planCard: { gap: 12, padding: 17 },
  premiumPlanCard: { paddingTop: 34 },
  premiumSelected: { borderColor: Colors.glassBorderCyan, shadowColor: Colors.cyan, shadowOpacity: 0.12 },
  planHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  planTitleLine: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  planIcon: { width: 34, height: 34, borderRadius: 11, backgroundColor: Colors.bgTertiary, alignItems: 'center', justifyContent: 'center' },
  premiumIcon: { backgroundColor: Colors.cyanDim },
  price: { alignItems: 'flex-end' },
  divider: { height: 1, backgroundColor: Colors.border },
  premiumDivider: { backgroundColor: Colors.glassBorderCyan },
  featureList: { gap: 9 },
  featureRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 9 },
  featureText: { flex: 1 },
  premiumTag: { position: 'absolute', top: 0, right: 14, flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: Colors.cyan, paddingHorizontal: 10, paddingVertical: 5, borderBottomLeftRadius: 9, borderBottomRightRadius: 9 },
  selectedBadge: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 18, backgroundColor: Colors.cyanDim, paddingHorizontal: 9, paddingVertical: 5 },
  premiumSelectedBadge: { backgroundColor: Colors.cyanDim },
  cta: { marginTop: 2 },
  paymentNote: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'center', gap: 7, paddingHorizontal: 8 },
  noteText: { flex: 1, textAlign: 'center' },
});
