import React, { useEffect, useRef, useState } from 'react';
import { Alert, Animated, Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { SafeAreaView } from 'react-native-safe-area-context';
import CyberButton from '../../components/ui/CyberButton';
import CyberText from '../../components/ui/CyberText';
import ScanGrid from '../../components/ui/ScanGrid';
import Colors from '../../constants/Colors';
import Spacing from '../../constants/Spacing';
import { mockScanService } from '../../services/scan/mockScanService';
import { realScanService } from '../../services/scan/scanService';
import { OFFLINE_MODE } from '../../services/api/config';
import { setLatestScanResult } from '../../services/scan/scanSession';
import { validateUpload } from '../../services/api/contracts';
import type { MockScenario } from '../../services/scan/scanService';
import type { ScanResult } from '../../types';
import { router } from 'expo-router';

/** Selects a local image and submits it to the explicitly selected scan service. */
export default function ScanScreen() {
  const [selectedImage, setSelectedImage] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [scanStatus, setScanStatus] = useState<'idle' | 'processing' | 'complete' | 'error'>('idle');
  const [scanStage, setScanStage] = useState('');
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const progress = useRef(new Animated.Value(0)).current;
  const scanLine = useRef(new Animated.Value(0)).current;
  const scanRun = useRef(0);
  const [scenario, setScenario] = useState<MockScenario>('ai_generated');
  const requestController = useRef<AbortController | null>(null);
  useEffect(() => () => { scanRun.current += 1; requestController.current?.abort(); }, []);

  useEffect(() => {
    if (scanStatus !== 'processing') {
      scanLine.stopAnimation();
      scanLine.setValue(0);
      return;
    }

    const animation = Animated.loop(
      Animated.timing(scanLine, { toValue: 1, duration: 1600, useNativeDriver: true })
    );
    animation.start();
    return () => animation.stop();
  }, [scanLine, scanStatus]);

  const pickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 1,
        selectionLimit: 1,
      });

      if (!result.canceled) {
        const validationError = validateUpload(result.assets[0]);
        if (validationError) { Alert.alert('Unsupported image', validationError); return; }
        setSelectedImage(result.assets[0]);
        setScanStatus('idle');
        setScanResult(null);
        progress.setValue(0);
      }
    } catch {
      Alert.alert('Unable to open photos', 'Please try selecting an image again.');
    }
  };

  const startScan = async () => {
    if (!selectedImage || scanStatus === 'processing') return;

    const run = ++scanRun.current;
    requestController.current = new AbortController();
    setScanStatus('processing');
    setScanStage(OFFLINE_MODE ? 'Preparing offline sample' : 'Uploading image and waiting for the server');
    setScanResult(null);
    progress.setValue(0);
    Animated.timing(progress, { toValue: 0.92, duration: 2600, useNativeDriver: false }).start();
    // Progress is an activity indicator, not measured inference progress.

    try {
      const result = await (OFFLINE_MODE ? mockScanService : realScanService).analyzeImage(selectedImage, scenario, requestController.current.signal);
      if (scanRun.current !== run) return;
      setScanResult(result);
      setScanStage(result.hasAnalysis ? 'Result ready' : 'Scan status: ' + result.status);
      setScanStatus('complete');
      Animated.timing(progress, { toValue: 1, duration: 220, useNativeDriver: false }).start();
      setLatestScanResult(result);
      router.push('/result');
    } catch (error) {
      if (scanRun.current !== run) return;
      setScanStatus('error');
      setScanStage(error instanceof Error ? error.message : 'The scan could not be completed. Check History before retrying.');
      progress.stopAnimation();
    }
  };

  const cancelScan = () => {
    requestController.current?.abort();
    scanRun.current += 1;
    progress.stopAnimation();
    progress.setValue(0);
    setScanStatus('idle');
    setScanStage('');
  };

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#05070D', '#0B0F1A', '#05070D']} style={StyleSheet.absoluteFill} />
      <ScanGrid animated />

      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <CyberText variant="label" color={Colors.cyan}>SCAN</CyberText>
          <CyberText variant="h3">Image analysis</CyberText>
          <CyberText variant="bodySmall">{OFFLINE_MODE ? 'Offline sample only. ' : 'Uploads are sent to your backend. '}JPEG, PNG, WebP up to 10 MB. Free: 5 credits, no automatic monthly reset. Completed scans use credits; queued or processing scans reserve them. Failed scans do not count.</CyberText>
        </View>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {OFFLINE_MODE && <><CyberText variant="label">CHOOSE A MOCK RESPONSE (NOT AN AI PREDICTION)</CyberText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {(['ai_generated', 'authentic', 'uncertain', 'queued', 'processing', 'failed'] as MockScenario[]).map(value => (
              <CyberButton key={value} label={value.replace('_', ' ')} size="sm" disabled={scanStatus === 'processing'}
                variant={scenario === value ? 'primary' : 'secondary'} onPress={() => setScenario(value)} />
            ))}
          </View></>}
          {selectedImage ? (
            <View style={styles.previewCard}>
              <Image source={{ uri: selectedImage.uri }} style={styles.preview} accessibilityLabel="Selected image preview" />
              <View style={styles.previewShade} />
              <View pointerEvents="none" style={styles.viewfinder}>
                <View style={[styles.corner, styles.cornerTopLeft]} />
                <View style={[styles.corner, styles.cornerTopRight]} />
                <View style={[styles.corner, styles.cornerBottomLeft]} />
                <View style={[styles.corner, styles.cornerBottomRight]} />
              </View>
              {scanStatus === 'processing' && (
                <Animated.View
                  pointerEvents="none"
                  style={[styles.scanLine, { transform: [{ translateY: scanLine.interpolate({ inputRange: [0, 1], outputRange: [8, 315] }) }] }]}
                  accessibilityElementsHidden
                />
              )}
              <Pressable onPress={() => { setSelectedImage(null); cancelScan(); setScanResult(null); }} style={styles.removeButton} accessibilityRole="button" accessibilityLabel="Remove selected image">
                <Ionicons name="close" size={20} color={Colors.textPrimary} />
              </Pressable>
            </View>
          ) : (
            <Pressable onPress={pickImage} style={styles.uploadZone} accessibilityRole="button" accessibilityLabel="Choose an image from your library">
              <View style={styles.uploadIcon}>
                <Ionicons name="images-outline" size={36} color={Colors.cyan} />
              </View>
              <CyberText variant="h4" align="center">Choose an image</CyberText>
              <CyberText variant="bodySmall" align="center">{OFFLINE_MODE ? 'Select a local photo to preview a sample response.' : 'Select a photo to upload for AI classification.'}</CyberText>
              <View style={styles.uploadHint}>
                <Ionicons name="shield-checkmark-outline" size={14} color={Colors.authentic} />
                <CyberText variant="caption" color={Colors.authentic}>{OFFLINE_MODE ? 'Your image stays on this device' : 'Your image will be stored by the backend'}</CyberText>
              </View>
            </Pressable>
          )}

          {selectedImage && (
            <View style={styles.imageDetails}>
              <View style={styles.detailRow}>
                <Ionicons name="image-outline" size={17} color={Colors.cyan} />
                <CyberText variant="bodySmall" numberOfLines={1} style={styles.fileName}>{selectedImage.fileName ?? 'Selected image'}</CyberText>
              </View>
              {selectedImage.width && selectedImage.height && <CyberText variant="caption">{selectedImage.width} × {selectedImage.height} pixels</CyberText>}
            </View>
          )}

          <View style={styles.actions}>
            {scanStatus === 'processing' ? (
              <View style={styles.processingCard} accessibilityLiveRegion="polite">
                <View style={styles.processingHeader}>
                  <Ionicons name="scan-outline" size={22} color={Colors.cyan} />
                  <CyberText variant="label" color={Colors.cyan}>ANALYZING IMAGE</CyberText>
                </View>
                <CyberText variant="bodySmall" align="center">{scanStage}</CyberText>
                <View style={styles.progressTrack}>
                  <Animated.View style={[styles.progressFill, { width: progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }]} />
                </View>
                <CyberButton label="Cancel scan" onPress={cancelScan} variant="ghost" size="sm" />
                {!OFFLINE_MODE && <CyberText variant="caption">Cancelling stops waiting, not server processing. Check History before uploading again.</CyberText>}
              </View>
            ) : (
              <>
                <CyberButton label="Start scan" onPress={startScan} disabled={!selectedImage} icon={<Ionicons name="scan-outline" size={18} color={Colors.bgPrimary} />} style={styles.fullButton} />
                <CyberButton label={selectedImage ? 'Choose a different image' : 'Select from library'} onPress={pickImage} variant="secondary" icon={<Ionicons name="images-outline" size={18} color={Colors.cyan} />} style={styles.fullButton} />
              </>
            )}
            {scanStatus === 'error' && (
              <View style={styles.errorNote}>
                <Ionicons name="alert-circle" size={18} color={Colors.fake} />
                <CyberText variant="bodySmall" color={Colors.fake}>{scanStage}</CyberText>
              </View>
            )}
            {selectedImage && scanStatus === 'idle' && (
              <View style={styles.readyNote}>
                <Ionicons name="checkmark-circle" size={18} color={Colors.authentic} />
                <CyberText variant="bodySmall" color={Colors.authentic}>Image ready to scan.</CyberText>
              </View>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgPrimary },
  safeArea: { flex: 1 },
  header: { gap: 6, paddingHorizontal: Spacing.screenPadding, paddingTop: 16, paddingBottom: Spacing.md },
  content: { flexGrow: 1, padding: Spacing.screenPadding, paddingBottom: Spacing.tabBarHeight + Spacing.xl, gap: Spacing.lg },
  uploadZone: { minHeight: 320, borderWidth: 1, borderStyle: 'dashed', borderColor: Colors.glassBorderCyan, borderRadius: Spacing.cardRadius, backgroundColor: Colors.glassBg, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl, gap: Spacing.md },
  uploadIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: Colors.cyanDim, borderWidth: 1, borderColor: Colors.glassBorderCyan, alignItems: 'center', justifyContent: 'center' },
  uploadHint: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: Spacing.sm },
  previewCard: { height: 340, overflow: 'hidden', borderWidth: 1, borderColor: Colors.glassBorderCyan, borderRadius: Spacing.cardRadius, backgroundColor: Colors.bgTertiary },
  preview: { width: '100%', height: '100%', resizeMode: 'contain' },
  previewShade: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(5,7,13,0.10)' },
  scanLine: { position: 'absolute', left: 12, right: 12, height: 2, borderRadius: 1, backgroundColor: Colors.cyan, shadowColor: Colors.cyan, shadowOpacity: 0.95, shadowRadius: 10, elevation: 6 },
  viewfinder: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  corner: { position: 'absolute', width: 26, height: 26, borderColor: Colors.cyan },
  cornerTopLeft: { top: 14, left: 14, borderTopWidth: 2, borderLeftWidth: 2 },
  cornerTopRight: { top: 14, right: 14, borderTopWidth: 2, borderRightWidth: 2 },
  cornerBottomLeft: { bottom: 14, left: 14, borderBottomWidth: 2, borderLeftWidth: 2 },
  cornerBottomRight: { right: 14, bottom: 14, borderBottomWidth: 2, borderRightWidth: 2 },
  removeButton: { position: 'absolute', top: 12, right: 12, width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(5,7,13,0.84)', borderWidth: 1, borderColor: Colors.glassBorderStrong, alignItems: 'center', justifyContent: 'center' },
  imageDetails: { gap: 4, padding: Spacing.md, borderRadius: Spacing.inputRadius, backgroundColor: Colors.glassBg, borderWidth: 1, borderColor: Colors.glassBorder },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  fileName: { flex: 1 },
  actions: { gap: Spacing.md },
  fullButton: { width: '100%' },
  readyNote: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.sm },
  processingCard: { gap: Spacing.md, padding: Spacing.md, borderRadius: Spacing.cardRadius, backgroundColor: Colors.glassBgStrong, borderWidth: 1, borderColor: Colors.glassBorderCyan },
  processingHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm },
  progressTrack: { height: 6, overflow: 'hidden', borderRadius: 3, backgroundColor: Colors.cyanDim },
  progressFill: { height: '100%', borderRadius: 3, backgroundColor: Colors.cyan },
  errorNote: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.sm },
});
