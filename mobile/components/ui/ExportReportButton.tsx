import React, { useCallback, useRef, useState } from 'react';
import { Alert, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import CyberButton from './CyberButton';
import CyberText from './CyberText';
import Colors from '../../constants/Colors';
import { shareSavedScanReport } from '../../services/scan/reportExport';

export default function ExportReportButton({ scanId }: { scanId: string }) {
  const active = useRef<AbortController | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);
  useFocusEffect(useCallback(() => {
    setBusy(false); setMessage('');
    return () => {
      active.current?.abort(); active.current = null;
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
    };
  }, [scanId]));
  const exportPdf = async () => {
    if (active.current) return;
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    const controller = new AbortController(); active.current = controller;
    setBusy(true); setMessage(''); setFailed(false);
    try {
      await shareSavedScanReport(scanId, controller.signal);
      if (active.current === controller) {
        const detail = 'Your PDF report was prepared successfully. If you selected Save to Files, check your chosen folder. If you cancelled, it was not saved by this action. No scan credit was used.';
        setMessage(detail);
        // Allow the native share sheet to finish dismissing before presenting.
        noticeTimer.current = setTimeout(() => Alert.alert('PDF prepared successfully', detail, [{ text: 'OK' }]), 400);
      }
    } catch (error) {
      if (active.current === controller) {
        const detail = error instanceof Error ? error.message : 'PDF export failed. Please try again.';
        setFailed(true); setMessage(detail);
        noticeTimer.current = setTimeout(() => Alert.alert('PDF export failed', detail, [{ text: 'OK' }]), 400);
      }
    } finally {
      if (active.current === controller) { active.current = null; setBusy(false); }
    }
  };
  return <View style={{ gap: 8 }}>
    <CyberButton label={busy ? 'Preparing PDF / sharing…' : 'Export PDF'} loading={busy} disabled={busy} onPress={exportPdf} variant="secondary" />
    <CyberText variant="caption">Save or share this saved report. No new scan or credit usage. Heatmaps are included when available.</CyberText>
    {!!message && <View accessibilityLiveRegion="polite" accessibilityRole={failed ? 'alert' : undefined}
      style={{ padding: 14, borderRadius: 12, borderWidth: 1, gap: 6, borderColor: failed ? Colors.fake : Colors.authentic, backgroundColor: Colors.bgSecondary }}>
      <CyberText variant="bodySmall" color={failed ? Colors.fake : Colors.authentic}>{failed ? 'PDF export failed' : 'PDF prepared successfully'}</CyberText>
      <CyberText variant="caption" color={failed ? Colors.fake : Colors.textSecondary}>{message}</CyberText>
    </View>}
  </View>;
}
