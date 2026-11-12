import React, { useEffect, useState, useRef } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
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
import { apiRequest } from '../services/api/client';
import { FEATURE_LABELS, describeVisualReview } from '../services/scan/visualReview';
import { OFFLINE_MODE } from '../services/api/config';
import ScanImage from '../components/ui/ScanImage';
import ExportReportButton from '../components/ui/ExportReportButton';

export default function ResultScreen() {
  const [result, setResult] = useState(getLatestScanResult);
  const [operation, setOperation] = useState<'refresh' | 'features' | null>(null);
  const [error, setError] = useState('');
  const [showChecks, setShowChecks] = useState(false);
  const active = useRef<AbortController | null>(null);
  useEffect(() => () => { active.current?.abort(); active.current = null; }, []);
  const refresh = async (kind: 'refresh' | 'features' = 'refresh') => {
    if (!result || active.current) return;
    const controller = new AbortController();
    active.current = controller;
    setOperation(kind);
    setError('');
    try {
      if (kind === 'features') {
        await apiRequest('/api/v1/scans/' + result.id + '/features', {
          method: 'POST', signal: controller.signal, timeoutMs: 395000,
        });
      }
      const latest = await scanHistoryService.getScan(result.id, controller.signal);
      if (active.current === controller) {
        setResult(latest);
        setLatestScanResult(latest);
      }
    } catch (failure) {
      if (active.current === controller) setError(failure instanceof Error ? failure.message : 'Could not update this report.');
    } finally {
      if (active.current === controller) { active.current = null; setOperation(null); }
    }
  };
  useEffect(() => { if (!result) router.replace('/(tabs)/history'); }, [result]);
  if (!result) return null;
  const visualReview = describeVisualReview(result.featureReview, result.sceneAnalysis);
  const creditMessage = {
    not_charged: 'No scan credit used. This scan stays in your history.',
    reserved: 'One scan credit is reserved while analysis is pending.',
    used: 'One scan credit used for this completed analysis.',
  };
  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <CyberText variant="label" color={Colors.cyan}>{OFFLINE_MODE ? 'OFFLINE SAMPLE REPORT' : 'AI SCAN REPORT'}</CyberText>
        <CyberText variant="h3">{result.fileName}</CyberText>
        {result.scanNumber ? <CyberText variant="caption">Scan #{result.scanNumber}</CyberText> : null}
        <ScanImage uri={result.imageUri || result.imagePath} style={styles.image} label="Original image" />
        {!result.hasAnalysis && <GlassCard style={styles.card}>
          <CyberText variant="label">SCAN STATUS: {result.status.toUpperCase()}</CyberText>
          <CyberText variant="caption">Analysis status: {result.analysisStatus}</CyberText>
          <CyberText variant="h4">No AI result available</CyberText>
          <CyberText variant="bodySmall">{result.summary}</CyberText>
          {result.creditStatus && <CyberText variant="caption">
            {creditMessage[result.creditStatus]}
          </CyberText>}
          <CyberText variant="caption">
            {OFFLINE_MODE ? 'This is a fixed offline scenario; no background AI task is running.' : 'Upload acceptance is not analysis completion. Refresh to check the saved status. The current backend does not automatically retry queued or failed scans.'}
          </CyberText>
        </GlassCard>}
        {result.hasAnalysis &&
          <GlassCard style={styles.card}>
            <CyberText variant="label">IMAGE CLASSIFICATION</CyberText>
            <VerdictChip verdict={result.verdict} />
            <CyberText variant="h4">{result.analysisProvider === 'truthscan' ? 'Provider label confidence' : 'Confidence'}: {result.confidence}%</CyberText>
            {result.authenticScore !== null && <CyberText variant="body">Authentic: {result.authenticScore}%</CyberText>}
            {result.aiGeneratedScore !== null && <CyberText variant="body">AI-generated: {result.aiGeneratedScore}%</CyberText>}
            {result.analysisProvider === 'truthscan' && <CyberText variant="bodySmall">{result.summary}</CyberText>}
            {result.verdict === 'uncertain' && result.analysisProvider !== 'truthscan' && <CyberText variant="caption">{result.usesSixtyPercentRule
              ? 'Uncertain means both saved class scores were below 60%.'
              : 'The saved decision rule did not confidently select either class.'}</CyberText>}
            <CyberText variant="caption">Scores are model estimates, not proof.{OFFLINE_MODE ? ' These values are mock fixtures.' : ''}</CyberText>
            {result.usesSixtyPercentRule && result.verdict !== 'uncertain' &&
              <CyberText variant="caption">A class is selected when its unrounded score reaches 60%.</CyberText>}
            {result.creditStatus && <CyberText variant="caption">{creditMessage[result.creditStatus]}</CyberText>}
          </GlassCard>
        }
        {!OFFLINE_MODE && result.hasAnalysis && <>
          <GlassCard style={styles.card}>
            <CyberText variant="label">SUSPECTED EDIT REGIONS</CyberText>
            {result.localization?.status === 'available' ? <>
              <ScanImage uri={'/api/v1/scans/' + result.id + '/localization-image'} style={styles.image} label="Suggested edit regions" timeoutMs={110000} />
              {typeof result.localization.highlighted_pixels === 'number' &&
                <CyberText variant="caption">{result.localization.highlighted_pixels.toLocaleString()} pixels highlighted</CyberText>}
              <CyberText variant="caption">Highlights are suggestions for review and can be wrong.</CyberText>
            </> : <CyberText variant="bodySmall">No reliable region is available to highlight.</CyberText>}
          </GlassCard>
          <GlassCard style={styles.card}>
            <CyberText variant="label">WHAT LOOKS UNUSUAL?</CyberText>
            {result.analysisProvider === 'truthscan' ? <>
              <CyberText variant="bodySmall">{result.providerReview?.text || 'No written provider analysis is available for this saved result.'}</CyberText>
              <CyberText variant="caption">TruthScan visual analysis. Automated observations may be incorrect.</CyberText>
            </> : visualReview ? <>
              <CyberText variant="body">{visualReview.label}</CyberText>
              <CyberText variant="bodySmall">{visualReview.text}</CyberText>
              <CyberButton label={showChecks ? 'Hide feature checks' : 'View all feature checks'} variant="secondary"
                onPress={() => setShowChecks(value => !value)} />
              {showChecks && visualReview.findings.map((finding, index) => <View key={finding.category || index}>
                <CyberText variant="bodySmall">{FEATURE_LABELS[finding.category || ''] || 'Visual detail'} · {
                  finding.status === 'possible_concern' ? 'Tentative observation'
                    : finding.status === 'no_clear_concern' ? 'No clear concern' : 'Unable to assess'}</CyberText>
                <CyberText variant="caption">{finding.observation}</CyberText>
              </View>)}
            </> : <>
              <CyberText variant="bodySmall">{result.featureReview ? 'This saved review uses an older version.'
                : result.visualReviewUnavailable ? 'The visual review was unavailable during this scan.'
                  : 'This image has no completed visual review yet.'}</CyberText>
              <CyberButton label={result.featureReview ? 'Run updated visual check'
                : result.visualReviewUnavailable ? 'Retry visual review' : 'Check unusual details'} variant="secondary"
                onPress={() => refresh('features')} disabled={!!operation} loading={operation === 'features'} />
              <CyberText variant="caption">No additional scan credit is used.</CyberText>
            </>}
            <CyberText variant="caption">AI observations are unverified. The visual review is separate from the classification.</CyberText>
          </GlassCard>
          <CyberButton label="Rate this report" variant="secondary" onPress={() => router.push('/feedback')} />
        </>}
        {!!error && <View accessibilityLiveRegion="polite"><CyberText variant="bodySmall" color={Colors.fake}>{error}</CyberText></View>}
        {!OFFLINE_MODE && <ExportReportButton key={result.id} scanId={result.id} />}
        {!OFFLINE_MODE && <CyberButton label={operation === 'refresh' ? 'Refreshing…' : 'Refresh result'} disabled={!!operation} onPress={() => refresh()} variant="secondary" />}
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
