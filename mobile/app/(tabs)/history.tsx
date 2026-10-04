import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Keyboard, NativeScrollEvent, NativeSyntheticEvent, Pressable, ScrollView, StyleSheet, TextInput, View, useWindowDimensions } from 'react-native';
import { useFocusEffect, router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import GlassCard from '../../components/ui/GlassCard';
import CyberButton from '../../components/ui/CyberButton';
import CyberText from '../../components/ui/CyberText';
import { VerdictChip } from '../../components/ui/StatusChip';
import ScanGrid from '../../components/ui/ScanGrid';
import Colors from '../../constants/Colors';
import Spacing from '../../constants/Spacing';
import { setLatestScanResult } from '../../services/scan/scanSession';
import { scanHistoryService } from '../../services/scan/scanHistoryService';
import { useAuth } from '../../hooks/useAuth';
import type { ScanResult } from '../../types';
import { OFFLINE_MODE } from '../../services/api/config';
import ScanImage from '../../components/ui/ScanImage';
import { HISTORY_STATUSES, type HistoryFilters, type HistoryStatus } from '../../services/scan/historyFilters';

type SectionBox = { y: number; height: number };

export default function HistoryScreen() {
  const { user } = useAuth();
  const [scans, setScans] = useState<ScanResult[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const generation = useRef(0);
  const busy = useRef(false);
  const [refresh, setRefresh] = useState(0);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<HistoryStatus>('all');
  const [filters, setFilters] = useState<HistoryFilters>({ q: '', status: 'all' });
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
        Animated.timing(revealValues[index], { toValue: 1, duration: 320, useNativeDriver: true }).start();
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
    transform: [{ translateY: revealValues[index].interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }],
  });

  const applyFilters = () => {
    Keyboard.dismiss();
    generation.current++;
    setScans([]); setTotal(0); setOffset(0); setIsLoading(true);
    setFilters({ q: search.trim(), status });
  };

  const clearFilters = () => {
    Keyboard.dismiss();
    generation.current++;
    setSearch(''); setStatus('all'); setScans([]); setTotal(0); setOffset(0); setIsLoading(true);
    setFilters({ q: '', status: 'all' });
  };

  useFocusEffect(useCallback(() => {
    const version = ++generation.current;
    busy.current = true;
    setScans([]); setIsLoading(true); setError(''); setTotal(0); setOffset(0);
    scanHistoryService.getPage(0, 20, filters).then(page => {
      if (generation.current !== version) return;
      setScans(page.scans); setTotal(page.pagination.total);
      setOffset(page.pagination.offset + page.scans.length);
    }).catch(error => { if (generation.current === version) setError(error.message || 'History could not be loaded.'); })
      .finally(() => { if (generation.current === version) { busy.current = false; setIsLoading(false); } });
    return () => { generation.current++; busy.current = false; };
  }, [user?.id, refresh, filters]));

  const more = async () => {
    if (busy.current) return;
    const version = generation.current;
    busy.current = true; setIsLoading(true); setError('');
    try {
      const page = await scanHistoryService.getPage(offset, 20, filters);
      if (generation.current !== version) return;
      setScans(existing => [...existing, ...page.scans.filter(scan => !existing.some(item => item.id === scan.id))]);
      setOffset(offset + page.scans.length);
      setTotal(page.pagination.total);
      if (!page.scans.length && offset < page.pagination.total) setError('History changed. Refresh to reload the matching scans.');
    } catch (error) { if (generation.current === version) setError(error instanceof Error ? error.message : 'History could not be loaded.'); }
    finally { if (generation.current === version) { busy.current = false; setIsLoading(false); } }
  };

  const formatDate = (iso: string) => new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  const hasActiveFilter = !!filters.q || filters.status !== 'all';

  return (
    <View style={styles.root}>
      <LinearGradient colors={['#F6FAFD', '#EEF7FD', '#F6FAFD']} style={StyleSheet.absoluteFill} />
      <ScanGrid animated={false} />
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} onScroll={handleScroll} scrollEventThrottle={80}>
          <View style={styles.header}>
            <View style={styles.headerIcon}><Ionicons name="time-outline" size={21} color={Colors.cyan} /></View>
            <View style={styles.headerCopy}>
              <CyberText variant="label" color={Colors.cyan}>YOUR LIBRARY</CyberText>
              <CyberText variant="h2" style={styles.title}>Scan History</CyberText>
              <CyberText variant="bodySmall" color={Colors.textSecondary}>Review your previous image analyses.</CyberText>
            </View>
          </View>

          <Animated.View style={[styles.filterSection, sectionStyle(0)]} onLayout={registerSection(0)}>
            <GlassCard style={styles.filterCard}>
              <View style={styles.sectionTitleRow}>
                <View><CyberText variant="h4">Find a scan</CyberText><CyberText variant="caption" color={Colors.textSecondary}>Search by filename or scan ID</CyberText></View>
                {hasActiveFilter && <Pressable onPress={clearFilters} accessibilityRole="button"><CyberText variant="caption" color={Colors.cyan}>Clear</CyberText></Pressable>}
              </View>
              <View style={styles.searchField}>
                <Ionicons name="search-outline" size={18} color={Colors.textMuted} />
                <TextInput value={search} onChangeText={setSearch} maxLength={120} placeholder="Filename or scan ID" placeholderTextColor={Colors.textMuted} accessibilityLabel="Search scan history" style={styles.search} autoCapitalize="none" autoCorrect={false} returnKeyType="search" onSubmitEditing={applyFilters} />
                {!!search && <Pressable onPress={() => setSearch('')} accessibilityRole="button" accessibilityLabel="Clear search"><Ionicons name="close-circle" size={18} color={Colors.textMuted} /></Pressable>}
              </View>
              <View style={styles.statuses}>
                {HISTORY_STATUSES.map(([value, label]) => <Pressable key={value} accessibilityRole="radio" accessibilityLabel={label} accessibilityState={{ checked: status === value }} onPress={() => setStatus(value)} style={[styles.filterChip, status === value && styles.selectedChip]}><CyberText variant="caption" color={status === value ? Colors.cyanAlt : Colors.textSecondary}>{label}</CyberText></Pressable>)}
              </View>
              <CyberButton label="Apply filters" onPress={applyFilters} size="md" style={styles.applyButton} />
            </GlassCard>
          </Animated.View>

          <Animated.View style={[styles.listSection, sectionStyle(1)]} onLayout={registerSection(1)}>
            <View style={styles.listHeading}>
              <View><CyberText variant="h4">Previous scans</CyberText><CyberText variant="caption" color={Colors.textSecondary}>{scans.length} of {total} matching scans</CyberText></View>
              <Pressable onPress={() => setRefresh(value => value + 1)} disabled={isLoading} style={styles.refreshButton} accessibilityRole="button" accessibilityLabel="Refresh scan history">
                {isLoading ? <ActivityIndicator size="small" color={Colors.cyan} /> : <Ionicons name="refresh-outline" size={18} color={Colors.cyan} />}
              </Pressable>
            </View>

            {!!error && <GlassCard style={styles.stateCard}><View style={styles.stateIconError}><Ionicons name="cloud-offline-outline" size={22} color={Colors.fake} /></View><CyberText variant="bodySmall" color={Colors.fake} style={styles.stateText}>{error}</CyberText><CyberButton label="Try again" onPress={() => setRefresh(value => value + 1)} variant="secondary" size="sm" /></GlassCard>}
            {isLoading && scans.length === 0 && !error && <GlassCard style={styles.loadingCard}><ActivityIndicator color={Colors.cyan} /><CyberText variant="bodySmall" color={Colors.textSecondary}>Loading your scans…</CyberText></GlassCard>}
            {!isLoading && !error && scans.length === 0 && <GlassCard style={styles.emptyCard}>
              <View style={styles.emptyIcon}><Ionicons name="images-outline" size={24} color={Colors.cyan} /></View>
              <View style={styles.emptyCopy}><CyberText variant="h4">{hasActiveFilter ? 'No matching scans' : 'No scans yet'}</CyberText><CyberText variant="bodySmall" color={Colors.textSecondary}>{hasActiveFilter ? 'Try another filename or filter.' : 'Your image analysis results will appear here.'}</CyberText></View>
              {!hasActiveFilter && <CyberButton label="Scan an image" onPress={() => router.push('/(tabs)/scan')} size="md" />}
            </GlassCard>}

            <View style={styles.scanList}>
              {scans.map((scan) => {
                const scanStatus = scan.status.replace(/_/g, ' ').toLowerCase();
                const failed = scanStatus.includes('fail') || scanStatus.includes('error');
                const processing = scanStatus.includes('process') || scanStatus.includes('pending') || scanStatus.includes('upload');
                const statusColor = failed ? Colors.fake : processing ? Colors.severityMedium : Colors.textSecondary;
                return <Pressable key={scan.id} accessibilityRole="button" accessibilityLabel={`Open ${scan.fileName}`} onPress={() => { setLatestScanResult(scan); router.push('/result'); }}>
                  <GlassCard style={styles.scanCard}>
                    <ScanImage uri={scan.imageUri || scan.imagePath} style={styles.thumbnail} label={`${scan.fileName} thumbnail`} />
                    <View style={styles.scanDetails}>
                      <CyberText variant="body" numberOfLines={1} style={styles.fileName}>{scan.fileName}</CyberText>
                      <View style={styles.resultLine}>{scan.hasAnalysis ? <VerdictChip verdict={scan.verdict} /> : <View style={[styles.statusBadge, { backgroundColor: failed ? Colors.fakeDim : processing ? '#FFF3DE' : Colors.bgTertiary }]}><View style={[styles.statusDot, { backgroundColor: statusColor }]} /><CyberText variant="caption" color={statusColor}>{scanStatus}</CyberText></View>}</View>
                      <View style={styles.metaLine}><Ionicons name="calendar-outline" size={13} color={Colors.textMuted} /><CyberText variant="caption" color={Colors.textSecondary} numberOfLines={1}>{formatDate(scan.scannedAt)}</CyberText></View>
                      {scan.creditStatus === 'not_charged' && <CyberText variant="caption" color={Colors.textMuted}>No scan credit used</CyberText>}
                    </View>
                    <View style={styles.confidenceBlock}>
                      <CyberText variant="h4" color={scan.hasAnalysis ? (scan.verdict === 'authentic' ? Colors.authentic : scan.verdict === 'ai_generated' ? Colors.fake : Colors.severityMedium) : Colors.textMuted}>{scan.hasAnalysis ? `${scan.confidence}%` : '—'}</CyberText>
                      <CyberText variant="caption" color={Colors.textMuted}>confidence</CyberText>
                      <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
                    </View>
                  </GlassCard>
                </Pressable>;
              })}
            </View>

            {offset < total && <CyberButton label={isLoading ? 'Loading…' : 'Load more scans'} variant="secondary" disabled={isLoading || !!error} onPress={more} />}
            <CyberText variant="caption" color={Colors.textMuted} align="center">{OFFLINE_MODE ? 'Offline samples are stored on this device.' : 'Your saved scans are shared with your web account.'}</CyberText>
          </Animated.View>
          <View style={{ height: Spacing.tabBarHeight + 20 }} />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bgPrimary },
  safeArea: { flex: 1 },
  content: { paddingHorizontal: Spacing.screenPadding, paddingBottom: 16, gap: 17 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 14, paddingBottom: 2 },
  headerIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border },
  headerCopy: { flex: 1, gap: 3 },
  title: { marginTop: 1 },
  filterSection: { width: '100%' },
  filterCard: { gap: 12, padding: 15 },
  sectionTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  searchField: { minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 12, borderRadius: 13, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.bgTertiary },
  search: { flex: 1, minWidth: 0, paddingVertical: 9, color: Colors.textPrimary, fontSize: 14 },
  statuses: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  filterChip: { minHeight: 34, justifyContent: 'center', paddingHorizontal: 11, borderRadius: 18, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.white },
  selectedChip: { borderColor: Colors.glassBorderCyan, backgroundColor: Colors.cyanDim },
  applyButton: { minHeight: 42 },
  listSection: { gap: 11 },
  listHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  refreshButton: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border },
  scanList: { gap: 9 },
  scanCard: { flexDirection: 'row', alignItems: 'center', gap: 11, padding: 11 },
  thumbnail: { width: 64, height: 76, borderRadius: 12, backgroundColor: Colors.bgTertiary },
  scanDetails: { flex: 1, minWidth: 0, gap: 6 },
  fileName: { fontWeight: '700' },
  resultLine: { flexDirection: 'row', alignItems: 'center' },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 14, paddingHorizontal: 8, paddingVertical: 4 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  metaLine: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  confidenceBlock: { minWidth: 54, alignItems: 'flex-end', gap: 1 },
  stateCard: { alignItems: 'center', gap: 9, paddingVertical: 16 },
  stateIconError: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.fakeDim },
  stateText: { textAlign: 'center' },
  loadingCard: { minHeight: 80, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 11 },
  emptyCard: { flexDirection: 'row', alignItems: 'center', gap: 11, padding: 14 },
  emptyIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.cyanDim },
  emptyCopy: { flex: 1, gap: 4 },
});
