import React, { useState, useCallback, useRef } from 'react';
import { ActivityIndicator, Keyboard, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useFocusEffect, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import GlassCard from '../../components/ui/GlassCard';
import CyberButton from '../../components/ui/CyberButton';
import CyberText from '../../components/ui/CyberText';
import { VerdictChip } from '../../components/ui/StatusChip';
import Colors from '../../constants/Colors';
import Spacing from '../../constants/Spacing';
import { setLatestScanResult } from '../../services/scan/scanSession';
import { scanHistoryService } from '../../services/scan/scanHistoryService';
import { useAuth } from '../../hooks/useAuth';
import type { ScanResult } from '../../types';
import { OFFLINE_MODE } from '../../services/api/config';
import ScanImage from '../../components/ui/ScanImage';
import { HISTORY_STATUSES, type HistoryFilters, type HistoryStatus } from '../../services/scan/historyFilters';

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
  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <CyberText variant="h3">Scan history</CyberText>
        <CyberText variant="bodySmall">{OFFLINE_MODE ? 'Offline samples; not synchronized with the web. ' : 'Backend scans shared with the web. '}{user?.email}</CyberText>
        <CyberText variant="caption">Deletion is unavailable: the current backend has no delete-scan endpoint.</CyberText>
        <View style={styles.filters}>
          <CyberText variant="label">SEARCH AND FILTER</CyberText>
          <TextInput value={search} onChangeText={setSearch} maxLength={120}
            placeholder="Filename or scan ID" placeholderTextColor={Colors.textSecondary}
            accessibilityLabel="Search scan history" style={styles.search}
            autoCapitalize="none" autoCorrect={false} returnKeyType="search" onSubmitEditing={applyFilters} />
          <View style={styles.statuses}>
            {HISTORY_STATUSES.map(([value, label]) => <Pressable key={value}
              accessibilityRole="radio" accessibilityLabel={label} accessibilityState={{ checked: status === value }}
              onPress={() => setStatus(value)} style={[styles.filterChip, status === value && styles.selectedChip]}>
              <CyberText variant="caption" color={status === value ? Colors.cyan : Colors.textPrimary}>{label}</CyberText>
            </Pressable>)}
          </View>
          <CyberButton label="Apply filters" onPress={applyFilters} />
          <CyberButton label="Clear filters" variant="secondary" onPress={clearFilters} />
          <CyberText variant="caption">Searches all your {OFFLINE_MODE ? 'account-local samples' : 'saved scans'}, not just loaded entries.</CyberText>
        </View>
        {!!error && <CyberText variant="body">{error}</CyberText>}
        {!isLoading && !error && scans.length === 0 && <CyberText variant="body">{filters.q || filters.status !== 'all' ? 'No scans match these filters.' : 'No saved scans for this account.'}</CyberText>}
        {scans.map(scan => (
          <Pressable key={scan.id} accessibilityRole="button" accessibilityLabel={'Open ' + scan.fileName}
            onPress={() => { setLatestScanResult(scan); router.push('/result'); }}>
            <GlassCard style={styles.card}>
              <ScanImage uri={scan.imageUri || scan.imagePath} style={styles.thumbnail} />
              <View style={{ flex: 1, minWidth: 0, gap: 5 }}>
                <CyberText variant="body" numberOfLines={1}>{scan.fileName}</CyberText>
                {scan.hasAnalysis ? <VerdictChip verdict={scan.verdict} /> : <CyberText variant="label">{scan.status.toUpperCase()}</CyberText>}
                <CyberText variant="caption">{new Date(scan.scannedAt).toLocaleString()}</CyberText>
                {scan.creditStatus === 'not_charged' && <CyberText variant="caption">No scan credit used</CyberText>}
                <CyberText variant="caption">{scan.hasAnalysis ? scan.confidence + '% ' + (OFFLINE_MODE ? 'sample confidence' : 'confidence') : 'No result yet'}</CyberText>
              </View>
            </GlassCard>
          </Pressable>
        ))}
        {isLoading && <ActivityIndicator color={Colors.cyan} />}
        <CyberText variant="caption">Showing {scans.length} of {total} matching scans</CyberText>
        {offset < total && <CyberButton label="Load more" variant="secondary" disabled={isLoading || !!error} onPress={more} />}
        <CyberButton label={OFFLINE_MODE ? 'Refresh local history' : 'Refresh server history'} disabled={isLoading} variant="secondary" onPress={() => setRefresh(value => value + 1)} />
      </ScrollView>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.bgPrimary },
  content: { padding: Spacing.screenPadding, paddingBottom: 120, gap: Spacing.md },
  card: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  thumbnail: { width: 55, height: 70, borderRadius: 8 },
  filters: { gap: Spacing.sm, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border, borderRadius: 12 },
  search: { color: Colors.textPrimary, backgroundColor: Colors.bgTertiary, borderRadius: 8, padding: 12, minHeight: 48 },
  statuses: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  filterChip: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 16, borderWidth: 1, borderColor: Colors.border },
  selectedChip: { borderColor: Colors.cyan, backgroundColor: Colors.cyanDim },
});
