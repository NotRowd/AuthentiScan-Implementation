import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Image,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import CyberButton from '../../components/ui/CyberButton';
import { VerdictChip } from '../../components/ui/StatusChip';
import ScanImage from '../../components/ui/ScanImage';
import Colors from '../../constants/Colors';
import Spacing from '../../constants/Spacing';
import { useAuth } from '../../hooks/useAuth';
import { scanHistoryService } from '../../services/scan/scanHistoryService';
import { setLatestScanResult } from '../../services/scan/scanSession';
import type { ScanResult } from '../../types';
import { OFFLINE_MODE } from '../../services/api/config';

type SectionBox = { y: number; height: number };

export default function DashboardScreen() {
  const { user, logout } = useAuth();
  const [scans, setScans] = useState<ScanResult[]>([]);
  const [historyError, setHistoryError] = useState(false);
  const [stats, setStats] = useState<Awaited<ReturnType<typeof scanHistoryService.getStats>> | null>(null);
  const { height: viewportHeight } = useWindowDimensions();
  const scrollY = useRef(0);
  const sectionBoxes = useRef<Record<number, SectionBox>>({});
  const activeSections = useRef<Record<number, boolean>>({});
  const revealValues = useRef([0, 0].map(() => new Animated.Value(0))).current;

  useFocusEffect(useCallback(() => {
    let active = true;
    setScans([]);
    setStats(null);
    setHistoryError(false);
    Promise.all([scanHistoryService.getPage(0, 3), scanHistoryService.getStats()])
      .then(([page, summary]) => {
        if (active) { setScans(page.scans); setStats(summary); }
      })
      .catch(() => { if (active) setHistoryError(true); });
    return () => { active = false; };
  }, [user?.email]));

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

  const handleLogout = async () => {
    await logout();
    router.replace('/(public)/home');
  };

  const formatDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });

  const statItems = [
    { label: 'Total scans', value: historyError || !stats ? '—' : stats.total_scans.toString(), icon: 'images-outline' as const, color: Colors.cyan },
    { label: 'AI-generated', value: historyError || !stats ? '—' : stats.ai_generated_found.toString(), icon: 'sparkles-outline' as const, color: Colors.fake },
    { label: 'Remaining', value: historyError || !stats ? '—' : !stats.plan ? 'No plan' : stats.scans_remaining === null ? 'Unlimited' : stats.scans_remaining.toString(), icon: 'shield-checkmark-outline' as const, color: Colors.authentic },
  ];

  const openScan = (scan: ScanResult) => {
    setLatestScanResult(scan);
    router.push('/result');
  };

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView
          contentContainerStyle={styles.content}
          onScroll={handleScroll}
          scrollEventThrottle={80}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <View style={styles.identity}>
              <Image source={require('../../assets/AuthentiScan-Logo.png')} style={styles.logo} accessibilityLabel="AuthentiScan logo" />
              <View style={styles.greeting}>
                <Text style={styles.greetingLabel}>YOUR IMAGE REVIEW SPACE</Text>
                <Text style={styles.userName} numberOfLines={1}>Welcome, {user?.firstName || user?.name || 'there'}</Text>
              </View>
            </View>
            <TouchableOpacity onPress={handleLogout} style={styles.logoutButton} accessibilityRole="button" accessibilityLabel="Sign out">
              <Ionicons name="log-out-outline" size={20} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <View style={styles.heroCard}>
            <LinearGradient colors={['#E5F4FF', '#F7FBFF']} style={StyleSheet.absoluteFill} />
            <View style={styles.heroContent}>
              <View style={styles.heroCopy}>
                <Text style={styles.heroEyebrow}>IMAGE AUTHENTICITY</Text>
                <Text style={styles.heroTitle}>Take a closer look.</Text>
                <Text style={styles.heroBody}>
                  {OFFLINE_MODE
                    ? 'Explore image review with offline sample scenarios.'
                    : 'Review whether an image may be authentic or AI-generated.'}
                </Text>
              </View>
              <View style={styles.heroArtwork}>
                <View style={styles.artworkRing}>
                  <Ionicons name="scan-outline" size={36} color={Colors.cyan} />
                </View>
                <View style={styles.artworkSparkle}><Ionicons name="sparkles" size={15} color="#FFFFFF" /></View>
              </View>
            </View>
            <CyberButton
              label="Scan an image"
              onPress={() => router.push('/(tabs)/scan')}
              variant="primary"
              size="lg"
              style={styles.scanButton}
              textStyle={styles.scanButtonText}
              icon={<Ionicons name="scan-outline" size={20} color={Colors.textInverse} />}
            />
            <View style={styles.flowHint}>
              <Ionicons name="cloud-upload-outline" size={15} color={Colors.cyanAlt} />
              <Text style={styles.flowHintText}>Choose an image · Review the analysis · Save your result</Text>
            </View>
          </View>

          <Animated.View style={[styles.statsSection, sectionStyle(0)]} onLayout={registerSection(0)}>
            <View style={styles.sectionTitleRow}>
              <Text style={styles.sectionTitle}>Your activity</Text>
              {historyError && <Text style={styles.inlineError}>Couldn't refresh</Text>}
            </View>
            <View style={styles.statsRow}>
              {statItems.map((item) => (
                <View key={item.label} style={styles.statCard}>
                  <View style={[styles.statIcon, { backgroundColor: item.color + '14' }]}>
                    <Ionicons name={item.icon} size={18} color={item.color} />
                  </View>
                  {!stats && !historyError
                    ? <ActivityIndicator size="small" color={Colors.cyan} style={styles.statLoading} />
                    : <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>{item.value}</Text>}
                  <Text style={styles.statLabel} numberOfLines={1} adjustsFontSizeToFit>{item.label}</Text>
                </View>
              ))}
            </View>
          </Animated.View>

          <Animated.View style={[styles.recentSection, sectionStyle(1)]} onLayout={registerSection(1)}>
            <View style={styles.sectionTitleRow}>
              <View>
                <Text style={styles.sectionTitle}>Recent scans</Text>
                <Text style={styles.sectionSubtitle}>Your latest image reviews</Text>
              </View>
              <TouchableOpacity onPress={() => router.push('/(tabs)/history')} style={styles.viewAll} accessibilityRole="button" accessibilityLabel="View all scans">
                <Text style={styles.viewAllText}>View all</Text>
                <Ionicons name="arrow-forward" size={15} color={Colors.cyanAlt} />
              </TouchableOpacity>
            </View>

            {historyError ? (
              <View style={styles.stateCard}>
                <View style={styles.stateIcon}><Ionicons name="cloud-offline-outline" size={22} color={Colors.fake} /></View>
                <Text style={styles.stateTitle}>Couldn't load your scans</Text>
                <Text style={styles.stateBody}>Open another tab and return to try again.</Text>
              </View>
            ) : !stats ? (
              <View style={styles.stateCard}>
                <ActivityIndicator color={Colors.cyan} />
                <Text style={styles.stateBody}>Loading your account…</Text>
              </View>
            ) : scans.length === 0 ? (
              <View style={styles.stateCard}>
                <View style={styles.stateIcon}><Ionicons name="images-outline" size={23} color={Colors.cyanAlt} /></View>
                <Text style={styles.stateTitle}>No scans yet</Text>
                <Text style={styles.stateBody}>Choose an image to start your first review.</Text>
                <CyberButton label="Scan your first image" onPress={() => router.push('/(tabs)/scan')} size="md" style={styles.emptyButton} />
              </View>
            ) : (
              <View style={styles.scanList}>
                {scans.slice(0, 3).map((scan) => (
                  <Pressable key={scan.id} onPress={() => openScan(scan)} style={styles.scanCard} accessibilityRole="button" accessibilityLabel={`Open ${scan.fileName} scan result`}>
                    <ScanImage uri={scan.imageUri || scan.imagePath} style={styles.thumbnail} label={`${scan.fileName} thumbnail`} />
                    <View style={styles.scanDetails}>
                      <Text style={styles.fileName} numberOfLines={1}>{scan.fileName}</Text>
                      {scan.hasAnalysis
                        ? <VerdictChip verdict={scan.verdict} style={styles.verdictChip} />
                        : <View style={styles.pendingChip}><Text style={styles.pendingText}>{scan.status.replace(/_/g, ' ')}</Text></View>}
                      <Text style={styles.scanDate}>{formatDate(scan.scannedAt)}</Text>
                    </View>
                    <View style={styles.scanResult}>
                      <Text style={[
                        styles.confidence,
                        scan.verdict === 'ai_generated' ? styles.confidenceFake : scan.verdict === 'authentic' ? styles.confidenceAuthentic : null,
                      ]}>{scan.hasAnalysis ? `${scan.confidence}%` : '—'}</Text>
                      <Text style={styles.confidenceLabel}>confidence</Text>
                      <Ionicons name="chevron-forward" size={16} color="#8095A7" style={styles.chevron} />
                    </View>
                  </Pressable>
                ))}
              </View>
            )}
          </Animated.View>
          <Text style={styles.disclaimer}>AI estimates are informational and are not proof of an image’s origin.</Text>
          <View style={{ height: Spacing.tabBarHeight + 24 }} />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bgPrimary },
  safeArea: { flex: 1 },
  content: { paddingHorizontal: 20, paddingBottom: 16 },
  header: { minHeight: 76, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12 },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  logo: { width: 42, height: 42, borderRadius: 12, backgroundColor: '#FFFFFF' },
  greeting: { flex: 1, gap: 3 },
  greetingLabel: { fontSize: 9, fontWeight: '800', letterSpacing: 1.1, color: Colors.textSecondary },
  userName: { fontSize: 18, fontWeight: '800', letterSpacing: -0.3, color: Colors.textPrimary },
  logoutButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: Colors.border },
  heroCard: { overflow: 'hidden', padding: 18, borderRadius: 22, backgroundColor: '#EAF6FF', borderWidth: 1, borderColor: '#D5EAF8', marginTop: 7, marginBottom: 23 },
  heroContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  heroCopy: { flex: 1, paddingVertical: 2 },
  heroEyebrow: { fontSize: 9, fontWeight: '800', letterSpacing: 1.15, color: Colors.cyanAlt },
  heroTitle: { marginTop: 7, fontSize: 23, lineHeight: 28, fontWeight: '800', letterSpacing: -0.6, color: Colors.textPrimary },
  heroBody: { marginTop: 6, maxWidth: 235, fontSize: 12, lineHeight: 18, color: Colors.textSecondary },
  heroArtwork: { width: 76, height: 76, alignItems: 'center', justifyContent: 'center' },
  artworkRing: { width: 66, height: 66, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#C9E4F7' },
  artworkSparkle: { position: 'absolute', top: -1, right: -2, width: 27, height: 27, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.cyan },
  scanButton: { minHeight: 52, borderRadius: 15, backgroundColor: Colors.cyan, borderColor: Colors.cyan, shadowOpacity: 0.12, shadowRadius: 7, elevation: 3 },
  scanButtonText: { textTransform: 'none', letterSpacing: 0.1 },
  flowHint: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingTop: 12 },
  flowHintText: { flexShrink: 1, fontSize: 10, lineHeight: 15, color: Colors.textSecondary },
  statsSection: { marginBottom: 26 },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  sectionTitle: { fontSize: 18, fontWeight: '800', letterSpacing: -0.3, color: Colors.textPrimary },
  sectionSubtitle: { marginTop: 3, fontSize: 12, color: Colors.textSecondary },
  inlineError: { fontSize: 11, color: Colors.fake },
  statsRow: { flexDirection: 'row', gap: 9 },
  statCard: { flex: 1, minHeight: 113, paddingHorizontal: 9, paddingVertical: 12, alignItems: 'center', justifyContent: 'center', borderRadius: 17, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: Colors.border, shadowColor: '#18476B', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.035, shadowRadius: 8, elevation: 1 },
  statIcon: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 11, marginBottom: 7 },
  statValue: { maxWidth: '100%', fontSize: 20, fontWeight: '800', color: Colors.textPrimary },
  statLoading: { height: 24, marginVertical: 1 },
  statLabel: { marginTop: 4, fontSize: 9, fontWeight: '700', color: Colors.textSecondary },
  recentSection: { gap: 2 },
  viewAll: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 5, paddingLeft: 8 },
  viewAllText: { fontSize: 12, fontWeight: '700', color: Colors.cyanAlt },
  stateCard: { alignItems: 'center', justifyContent: 'center', minHeight: 184, gap: 8, padding: 19, borderRadius: 18, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: Colors.border },
  stateIcon: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 15, backgroundColor: Colors.cyanDim, marginBottom: 3 },
  stateTitle: { fontSize: 15, fontWeight: '800', textAlign: 'center', color: Colors.textPrimary },
  stateBody: { maxWidth: 270, fontSize: 12, lineHeight: 18, textAlign: 'center', color: Colors.textSecondary },
  emptyButton: { minHeight: 44, paddingVertical: 10, marginTop: 4 },
  scanList: { gap: 10 },
  scanCard: { minHeight: 92, flexDirection: 'row', alignItems: 'center', gap: 11, padding: 11, borderRadius: 17, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: Colors.border, shadowColor: '#18476B', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.035, shadowRadius: 8, elevation: 1 },
  thumbnail: { width: 64, height: 68, borderRadius: 12, resizeMode: 'cover', backgroundColor: '#EEF6FC' },
  scanDetails: { flex: 1, minWidth: 0, alignItems: 'flex-start', gap: 5 },
  fileName: { maxWidth: '100%', fontSize: 12, fontWeight: '700', color: Colors.textPrimary },
  verdictChip: { paddingVertical: 3, paddingHorizontal: 7 },
  pendingChip: { paddingVertical: 4, paddingHorizontal: 8, borderRadius: 12, backgroundColor: '#FFF5E8' },
  pendingText: { fontSize: 9, fontWeight: '800', textTransform: 'uppercase', color: Colors.severityMedium },
  scanDate: { fontSize: 10, color: Colors.textSecondary },
  scanResult: { minWidth: 57, alignItems: 'flex-end', justifyContent: 'center' },
  confidence: { fontSize: 16, fontWeight: '800', color: Colors.textSecondary },
  confidenceFake: { color: Colors.fake },
  confidenceAuthentic: { color: Colors.authentic },
  confidenceLabel: { marginTop: 2, fontSize: 9, color: Colors.textSecondary },
  chevron: { marginTop: 5, marginRight: -2 },
  disclaimer: { marginTop: 22, paddingHorizontal: 12, fontSize: 10, lineHeight: 15, textAlign: 'center', color: Colors.textSecondary },
});
