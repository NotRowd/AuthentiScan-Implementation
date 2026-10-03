import React, { useEffect, useState, useRef } from 'react';
import { Image, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import GlassCard from '../components/ui/GlassCard';
import CyberButton from '../components/ui/CyberButton';
import CyberText from '../components/ui/CyberText';
import { VerdictChip } from '../components/ui/StatusChip';
import Colors from '../constants/Colors';
import Spacing from '../constants/Spacing';
import { getLatestScanResult, setLatestScanResult } from '../services/scan/scanSession';
import { scanHistoryService } from '../services/scan/scanHistoryService';
import { OFFLINE_MODE } from '../services/api/config';
import ScanImage from '../components/ui/ScanImage';
import ExportReportButton from '../components/ui/ExportReportButton';

export default function ResultScreen() {
  const [result, setResult] = useState(getLatestScanResult);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const refresh = async () => {
    if (!result || refreshing) return;
    setRefreshing(true); setError('');
    try { const latest = await scanHistoryService.getScan(result.id); if (active.current) { setResult(latest); setLatestScanResult(latest); } }
    catch (error) { if (active.current) setError(error instanceof Error ? error.message : 'Could not refresh scan.'); }
    finally { if (active.current) setRefreshing(false); }
  };
  useEffect(() => { if (!result) router.replace('/(tabs)/history'); }, [result]);
  if (!result) return null;
  const localHeatmap = result.gradCam?.heatmapUri;
  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <CyberText variant="label" color={Colors.cyan}>{OFFLINE_MODE ? 'OFFLINE SAMPLE REPORT' : 'AI SCAN REPORT'}</CyberText>
        <CyberText variant="h3">{result.fileName}</CyberText>
        <ScanImage uri={result.imageUri || result.imagePath} style={styles.image} label="Scanned image" />
        <GlassCard style={styles.card}>
          <CyberText variant="label">SCAN STATUS: {result.status.toUpperCase()}</CyberText>
          <CyberText variant="caption">Analysis status: {result.analysisStatus}</CyberText>
          {result.hasAnalysis ? <VerdictChip verdict={result.verdict} /> : <CyberText variant="h4">No AI result available</CyberText>}
          <CyberText variant="bodySmall">{result.summary}</CyberText>
          {result.creditStatus && <CyberText variant="caption">
            {result.creditStatus === 'not_charged' ? 'No scan credit used. This failed scan stays in your history.' : result.creditStatus === 'reserved' ? 'One scan credit is reserved while analysis is pending.' : 'One scan credit used for this completed analysis.'}
          </CyberText>}
          {!result.hasAnalysis && <CyberText variant="caption">
            {OFFLINE_MODE ? 'This is a fixed offline scenario; no background AI task is running.' : 'Upload acceptance is not analysis completion. Refresh to check the saved status. The current backend does not automatically retry queued or failed scans.'}
          </CyberText>}
        </GlassCard>
        {result.hasAnalysis && <>
          <GlassCard style={styles.card}>
            <CyberText variant="label">{OFFLINE_MODE ? 'SAMPLE SCORES' : 'MODEL SCORES'}</CyberText>
            <CyberText variant="h4">Confidence: {result.confidence}%</CyberText>
            <CyberText variant="body">Authentic: {result.authenticScore}%</CyberText>
            <CyberText variant="body">AI-generated: {result.aiGeneratedScore}%</CyberText>
            {result.verdict === 'uncertain' && <CyberText variant="caption">Uncertain means the score falls near the decision threshold; neither class is confirmed.</CyberText>}
            <CyberText variant="caption">Scores are model estimates, not proof.{OFFLINE_MODE ? ' These values are mock fixtures.' : ''}</CyberText>
            <CyberText variant="caption">Model: {result.modelVersion}</CyberText>
          </GlassCard>
          <GlassCard style={styles.card}>
            <CyberText variant="label">GRAD-CAM VISUALIZATION</CyberText>
            {localHeatmap
              ? <ScanImage uri={localHeatmap} heatmap style={styles.image} label="Grad-CAM heatmap" />
              : <CyberText variant="bodySmall">No heatmap was supplied for this result.</CyberText>}
            <CyberText variant="caption">The backend supplies an image, not named face regions. A heatmap indicates contributions to a class score, not proof of manipulation.</CyberText>
          </GlassCard>
        </>}
        <GlassCard style={styles.card}>
          <CyberText variant="label">NOT AVAILABLE IN THE CURRENT SYSTEM</CyberText>
          <CyberText variant="bodySmall">Object detection and detailed manipulation indicators are not provided by the current model. Feedback submission is not integrated.{OFFLINE_MODE ? ' PDF export requires a saved backend scan.' : ''}</CyberText>
        </GlassCard>
        {!!error && <CyberText variant="caption">{error}</CyberText>}
        {!OFFLINE_MODE && <ExportReportButton key={result.id} scanId={result.id} />}
        {!OFFLINE_MODE && <CyberButton label={refreshing ? 'Refreshing…' : 'Refresh result'} disabled={refreshing} onPress={refresh} variant="secondary" />}
        <CyberButton label={OFFLINE_MODE ? 'Test another response' : 'Scan another image'} onPress={() => router.replace('/(tabs)/scan')} />
        <CyberButton label="Back to history" variant="secondary" onPress={() => router.replace('/(tabs)/history')} />
      </ScrollView>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.bgPrimary },
  content: { padding: Spacing.screenPadding, paddingBottom: 50, gap: Spacing.md },
  card: { gap: Spacing.sm },
  image: { width: '100%', height: 230, resizeMode: 'contain', borderRadius: 14, backgroundColor: Colors.bgSecondary },
});
