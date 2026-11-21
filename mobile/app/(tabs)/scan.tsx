import {useMobileTabSpacing} from '../../hooks/useMobileTabSpacing';
import {useExpoControlClearance} from '../../hooks/useExpoControlClearance';
import {useTheme,useThemedStyles} from '../../context/ThemeContext';
import type {ColorPalette} from '../../constants/Colors';
import {createStyles} from '../../constants/createStyles';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, AppState, Image, LayoutChangeEvent, NativeScrollEvent, NativeSyntheticEvent, Pressable, ScrollView, StyleSheet, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { SafeAreaView } from 'react-native-safe-area-context';
import CyberButton from '../../components/ui/CyberButton';
import CyberText from '../../components/ui/CyberText';
import Spacing from '../../constants/Spacing';
import { mockScanService } from '../../services/scan/mockScanService';
import { checkScanReadiness, realScanService, pendingScanId, recoverSubmittedScan } from '../../services/scan/scanService';
import { OFFLINE_MODE } from '../../services/api/config';
import { setLatestScanResult } from '../../services/scan/scanSession';
import { validateUpload } from '../../services/api/contracts';
import type { MockScenario } from '../../services/scan/scanService';
import type { ScanResult } from '../../types';
import { router } from 'expo-router';
import { useAllowance } from '../../hooks/useAllowance';

/** Selects a local image and submits it to the explicitly selected scan service. */
export default function ScanScreen() {
 const {colors:Colors}=useTheme(); const styles=useThemedStyles(makeStyles);

  const allowance=useAllowance();
  const [selectedImage, setSelectedImage] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [scanStatus, setScanStatus] = useState<'idle' | 'processing' | 'complete' | 'error'>('idle');
  const [scanStage, setScanStage] = useState('');
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const progress = useRef(new Animated.Value(0)).current;
  const scanLine = useRef(new Animated.Value(0)).current;
  const scanRun = useRef(0);
  const [scenario, setScenario] = useState<MockScenario>('ai_generated');
  const requestController = useRef<AbortController | null>(null);
  const recoveryController = useRef<AbortController | null>(null);
  const resumeWanted = useRef(false);
  const pageOpacity = useRef(new Animated.Value(0)).current;
  const { height: viewportHeight } = useWindowDimensions();
  const scrollOffset = useRef(0);
  const sectionLayouts = useRef<Record<number, { y: number; height: number }>>({});
  const sectionVisibility = useRef<Record<number, boolean>>({});
  const sectionAnimations = useRef([new Animated.Value(0), new Animated.Value(0)]).current;
  useEffect(() => {
    Animated.timing(pageOpacity, { toValue: 1, duration: 320, useNativeDriver: true }).start();
  }, [pageOpacity]);

  const updateSectionVisibility = React.useCallback(() => {
    Object.entries(sectionLayouts.current).forEach(([rawIndex, layout]) => {
      const index = Number(rawIndex);
      const top = layout.y - scrollOffset.current;
      const visible = top < viewportHeight * 0.88 && top + layout.height > viewportHeight * 0.12;
      if (visible && !sectionVisibility.current[index]) {
        sectionVisibility.current[index] = true;
        sectionAnimations[index].setValue(0);
        Animated.timing(sectionAnimations[index], { toValue: 1, duration: 340, useNativeDriver: true }).start();
      } else if (!visible && sectionVisibility.current[index]) {
        sectionVisibility.current[index] = false;
        sectionAnimations[index].stopAnimation();
        sectionAnimations[index].setValue(0);
      }
    });
  }, [sectionAnimations, viewportHeight]);

  const handleScroll = React.useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrollOffset.current = event.nativeEvent.contentOffset.y;
    updateSectionVisibility();
  }, [updateSectionVisibility]);

  const onSectionLayout = (index: number) => (event: LayoutChangeEvent) => {
    sectionLayouts.current[index] = event.nativeEvent.layout;
    updateSectionVisibility();
  };

  const sectionMotion = (index: number) => ({
    opacity: sectionAnimations[index],
    transform: [{ translateY: sectionAnimations[index].interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }],
  });
  useEffect(() => () => { scanRun.current += 1; requestController.current?.abort(); recoveryController.current?.abort(); }, []);

  useEffect(() => {
    if (OFFLINE_MODE || !selectedImage) return;
    async function recover() {
      if (!selectedImage || !pendingScanId(selectedImage) || !resumeWanted.current || recoveryController.current) return;
      const version = scanRun.current;
      const controller = new AbortController();
      recoveryController.current = controller;
      setScanStatus('processing');
      setScanStage('Checking the saved scan after returning to the app…');
      try {
        const saved = await recoverSubmittedScan(selectedImage, controller.signal);
        if (controller.signal.aborted || scanRun.current !== version) return;
        if (!saved) {
          if (!requestController.current) {
            setScanStatus('error');
            setScanStage('No saved scan was found yet. Check History before retrying. Retrying this selected image reuses the same request ID.');
          }
          return;
        }
        // Invalidate a late upload response before navigating, then release that
        // socket. The server already owns the saved operation and keeps its ID.
        scanRun.current++; resumeWanted.current = false;
        requestController.current?.abort();
        requestController.current = null;
        setScanResult(saved); setScanStatus('complete');
        setScanStage(saved.hasAnalysis ? 'Result ready' : 'Scan saved. Checking analysis status…');
        setLatestScanResult(saved);
        void allowance.refresh();
        router.push('/result');
      } catch {
        if (!controller.signal.aborted && scanRun.current === version && !requestController.current) {
          setScanStatus('error');
          setScanStage('Could not reconnect to the saved scan. Check History before uploading again.');
        }
      } finally { if (recoveryController.current === controller) recoveryController.current = null; }
    }
    const listener = AppState.addEventListener('change', state => {
      if (state === 'active') void recover();
      else if (pendingScanId(selectedImage)) setScanStage('Your phone may pause the connection while away. Return to check the saved scan.');
    });
    return () => { listener.remove(); recoveryController.current?.abort(); recoveryController.current = null; };
  }, [selectedImage, allowance.refresh]);

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
        resumeWanted.current = false;
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
    if (!selectedImage || requestController.current || recoveryController.current) return;

    const run = ++scanRun.current;
    resumeWanted.current = true;
    const controller = new AbortController();
    requestController.current = controller;
    setScanStatus('processing');
    setScanStage(OFFLINE_MODE ? 'Preparing offline sample' : 'Checking AI service and daily allowance');
    setScanResult(null);
    progress.setValue(0);
    Animated.timing(progress, { toValue: 0.92, duration: 2600, useNativeDriver: false }).start();
    // Progress is an activity indicator, not measured inference progress.

    try {
      if (!OFFLINE_MODE) {
        await checkScanReadiness(selectedImage, controller.signal);
        if (scanRun.current !== run) return;
        setScanStage('Analyzing image and preparing explanations');
      }
      const result = await (OFFLINE_MODE ? mockScanService : realScanService).analyzeImage(selectedImage, scenario, controller.signal);
      if (scanRun.current !== run) return;
      scanRun.current++; resumeWanted.current = false;
      setScanResult(result);
      setScanStage(result.hasAnalysis ? 'Result ready' : 'Scan status: ' + result.status);
      setScanStatus('complete');
      Animated.timing(progress, { toValue: 1, duration: 220, useNativeDriver: false }).start();
      setLatestScanResult(result);
      void allowance.refresh();
      router.push('/result');
    } catch (error) {
      if (scanRun.current !== run) return;
      // A lost response does not establish whether the server accepted bytes.
      // Read the exact saved operation once before showing an upload error.
      if (!OFFLINE_MODE && !controller.signal.aborted && AppState.currentState === 'active' &&
          /Connection interrupted|Request timed out/i.test(error instanceof Error ? error.message : '')) {
        setScanStage('Connection interrupted. Checking whether this scan was saved…');
        const saved = await recoverSubmittedScan(selectedImage, controller.signal).catch(() => null);
        if (scanRun.current !== run || controller.signal.aborted) return;
        if (saved) {
          scanRun.current++; resumeWanted.current = false;
          setScanResult(saved); setScanStatus('complete');
          setScanStage(saved.hasAnalysis ? 'Result ready' : 'Scan saved. Checking analysis status…');
          setLatestScanResult(saved); void allowance.refresh(); router.push('/result');
          return;
        }
      }
      setScanStatus('error');
      setScanStage(AppState.currentState !== 'active' && !OFFLINE_MODE ? (pendingScanId(selectedImage) ? 'The phone paused the connection. Return to AuthentiScan to check this saved scan.' : 'The connection paused before upload was confirmed. Return to the app and try Analyze image again.') : error instanceof Error ? error.message : 'The scan could not be completed. Check History before retrying.');
      progress.stopAnimation();
    } finally {
      if (requestController.current === controller) requestController.current = null;
    }
  };

  const cancelScan = () => {
    resumeWanted.current = false;
    recoveryController.current?.abort(); recoveryController.current = null;
    requestController.current?.abort();
    requestController.current = null;
    scanRun.current += 1;
    progress.stopAnimation();
    progress.setValue(0);
    setScanStatus('idle');
    setScanStage('');
  };

  const {contentBottom}=useMobileTabSpacing();
  const developmentClearance=useExpoControlClearance();
  return (
    <Animated.View style={[styles.container, { opacity: pageOpacity }]}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView contentContainerStyle={[styles.content,{paddingBottom:contentBottom}]} onScroll={handleScroll} scrollEventThrottle={80} showsVerticalScrollIndicator={false}>
          <View style={[styles.header,developmentClearance?{paddingTop:18+developmentClearance}:undefined]}>
            <CyberText variant="label" color={Colors.cyan}>IMAGE AUTHENTICITY</CyberText>
            <CyberText variant="h3">Scan an image</CyberText>
            <CyberText variant="bodySmall">Choose an image to review whether it may be authentic or AI-generated.</CyberText>
            <View style={styles.limitNote}>
              <Ionicons name="information-circle-outline" size={16} color={Colors.cyanAlt} />
              <CyberText variant="caption" style={styles.limitCopy}>
                {OFFLINE_MODE
                  ? 'Offline demo: selected outcomes are simulations, not AI predictions.'
                  : 'JPEG, PNG, WebP · Up to 10 MB. '+allowance.label+' Completed scans use one credit; pending scans reserve one; failed scans do not use a credit.'}
              </CyberText>
            </View>
          </View>

          {!!allowance.error && <CyberButton label="Retry allowance" variant="secondary" onPress={()=>void allowance.refresh()}/>}
          <Animated.View style={[styles.scanContentSection, sectionMotion(0)]} onLayout={onSectionLayout(0)}>
          <View style={styles.steps}>
            {[
              { number: '1', label: 'Choose' },
              { number: '2', label: 'Analyze' },
              { number: '3', label: 'Review' },
            ].map((step, index) => (
              <React.Fragment key={step.label}>
                <View style={styles.stepItem}>
                  <View style={[styles.stepNumber, (index === 0 || (selectedImage && index === 1) || scanStatus === 'complete') && styles.stepNumberActive]}>
                    <CyberText variant="caption" color={(index === 0 || (selectedImage && index === 1) || scanStatus === 'complete') ? Colors.bgSecondary : Colors.textSecondary}>{step.number}</CyberText>
                  </View>
                  <CyberText variant="caption" color={(index === 0 || (selectedImage && index === 1) || scanStatus === 'complete') ? Colors.textPrimary : Colors.textSecondary}>{step.label}</CyberText>
                </View>
                {index < 2 && <View style={styles.stepConnector} />}
              </React.Fragment>
            ))}
          </View>

          {OFFLINE_MODE && <View style={styles.demoPanel}>
            <View style={styles.demoHeading}>
              <View style={styles.demoIcon}><Ionicons name="flask-outline" size={18} color={Colors.cyanAlt} /></View>
              <View style={styles.demoHeadingCopy}>
                <CyberText variant="body" style={styles.demoTitle}>Choose a demo outcome</CyberText>
                <CyberText variant="caption">These sample results are not predictions.</CyberText>
              </View>
            </View>
            <View style={styles.scenarioList}>
              {(['ai_generated', 'authentic', 'uncertain', 'queued', 'processing', 'failed'] as MockScenario[]).map(value => (
                <CyberButton key={value} label={value.replace('_', ' ')} size="sm" disabled={scanStatus === 'processing'}
                  variant={scenario === value ? 'primary' : 'secondary'} onPress={() => setScenario(value)} style={styles.scenarioButton} />
              ))}
            </View>
          </View>}

          {selectedImage ? (
            <View style={styles.previewCard}>
              <View style={styles.previewHeader}>
                <View style={styles.previewHeading}>
                  <View style={styles.previewStatusDot} />
                  <CyberText variant="label" color={Colors.cyanAlt}>IMAGE SELECTED</CyberText>
                </View>
                <CyberText variant="caption">Preview</CyberText>
              </View>
              <View style={styles.imageFrame}>
                <Image source={{ uri: selectedImage.uri }} style={styles.preview} accessibilityLabel="Selected image preview" />
                <View pointerEvents="none" style={styles.viewfinder}>
                  <View style={[styles.corner, styles.cornerTopLeft]} />
                  <View style={[styles.corner, styles.cornerTopRight]} />
                  <View style={[styles.corner, styles.cornerBottomLeft]} />
                  <View style={[styles.corner, styles.cornerBottomRight]} />
                </View>
                {scanStatus === 'processing' && (
                  <Animated.View
                    pointerEvents="none"
                    style={[styles.scanLine, { transform: [{ translateY: scanLine.interpolate({ inputRange: [0, 1], outputRange: [8, 232] }) }] }]}
                    accessibilityElementsHidden
                  />
                )}
                <TouchableOpacity onPress={() => { setSelectedImage(null); cancelScan(); setScanResult(null); }} style={styles.removeButton} accessibilityRole="button" accessibilityLabel="Remove selected image">
                  <Ionicons name="close" size={19} color={Colors.textSecondary} />
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <Pressable onPress={pickImage} style={styles.uploadZone} accessibilityRole="button" accessibilityLabel="Choose an image from your library">
              <View style={styles.uploadIcon}>
                <Ionicons name="images-outline" size={36} color={Colors.cyan} />
              </View>
              <CyberText variant="h4" align="center">Upload an image to begin</CyberText>
              <CyberText variant="bodySmall" align="center">{OFFLINE_MODE ? 'Choose a local photo to preview a sample scenario.' : 'Choose a photo for an authenticity analysis.'}</CyberText>
              <View style={styles.formats}><CyberText variant="caption" align="center">JPEG · PNG · WebP · Maximum 10 MB</CyberText></View>
              <View style={styles.uploadHint}>
                <Ionicons name="shield-checkmark-outline" size={14} color={Colors.authentic} />
                <CyberText variant="caption" color={Colors.authentic}>{OFFLINE_MODE ? 'Your image stays on this device' : 'The image is stored with your account'}</CyberText>
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
          </Animated.View>

          <Animated.View style={[styles.actionsSection, sectionMotion(1)]} onLayout={onSectionLayout(1)}>
          <View style={styles.actions}>
            {scanStatus === 'processing' ? (
              <View style={styles.processingCard} accessibilityLiveRegion="polite">
                <View style={styles.processingHeader}>
                  <ActivityIndicator size="small" color={Colors.cyan} />
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
                <CyberButton label="Analyze image" onPress={startScan} disabled={!selectedImage} icon={<Ionicons name="scan-outline" size={18} color={Colors.textInverse} />} style={styles.fullButton} />
                <CyberButton label={selectedImage ? 'Choose a different image' : 'Select from library'} onPress={pickImage} variant="secondary" icon={<Ionicons name="images-outline" size={18} color={Colors.cyan} />} style={styles.fullButton} />
              </>
            )}
            {scanStatus === 'error' && (
              <View style={styles.errorNote}>
                <Ionicons name="alert-circle" size={18} color={Colors.fake} />
                <CyberText variant="bodySmall" color={Colors.fake} style={styles.errorCopy}>{scanStage}</CyberText>
              </View>
            )}
            {selectedImage && scanStatus === 'idle' && (
              <View style={styles.readyNote}>
                <Ionicons name="checkmark-circle" size={18} color={Colors.authentic} />
                <CyberText variant="bodySmall" color={Colors.authentic}>Image ready to scan.</CyberText>
              </View>
            )}
          </View>
          </Animated.View>
        </ScrollView>
      </SafeAreaView>
    </Animated.View>
  );
}

const makeStyles = (Colors: ColorPalette) => createStyles({
  container: { flex: 1, backgroundColor: Colors.bgPrimary },
  safeArea: { flex: 1 },
  content: { flexGrow: 1, paddingHorizontal: 18, paddingBottom: Spacing.tabBarHeight + 28, gap: 15 },
  header: { gap: 7, paddingTop: 18, paddingBottom: 3 },
  limitNote: { flexDirection: 'row', alignItems: 'flex-start', gap: 7, marginTop: 4, paddingHorizontal: 11, paddingVertical: 9, borderRadius: 12, backgroundColor: Colors.cyanDim },
  limitCopy: { flex: 1, fontSize: 10, lineHeight: 15 },
  steps: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8, paddingVertical: 2 },
  stepItem: { alignItems: 'center', gap: 5,flexShrink:1,minWidth:0 },
  stepNumber: { width: 27, height: 27, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.bgTertiary, borderWidth: 1, borderColor: Colors.border },
  stepNumberActive: { backgroundColor: Colors.cyan, borderColor: Colors.cyan },
  stepConnector: { height: 1, flex: 1, marginHorizontal: 10, backgroundColor: Colors.border },
  scanContentSection: { gap: 15 },
  actionsSection: {},
  demoPanel: { gap: 13, padding: 14, borderRadius: 17, backgroundColor: Colors.bgSecondary, borderWidth: 1, borderColor: Colors.border },
  demoHeading: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  demoIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.cyanDim },
  demoHeadingCopy: { flex: 1, gap: 2 },
  demoTitle: { fontWeight: '700' },
  scenarioList: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  scenarioButton: { minHeight: 38, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 12 },
  uploadZone: { minHeight: 242, borderWidth: 1.5, borderStyle: 'dashed', borderColor: Colors.glassBorderCyan, borderRadius: 20, backgroundColor: Colors.bgSecondary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 22, paddingVertical: 24, gap: 11 },
  uploadIcon: { width: 62, height: 62, borderRadius: 20, backgroundColor: Colors.cyanDim, borderWidth: 1, borderColor: Colors.glassBorderCyan, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  formats: { paddingHorizontal: 11, paddingVertical: 6, borderRadius: 10, backgroundColor: Colors.bgTertiary },
  uploadHint: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 2 },
  previewCard: { gap: 10, padding: 11, borderWidth: 1, borderColor: Colors.border, borderRadius: 19, backgroundColor: Colors.bgSecondary, shadowColor: Colors.shadow, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.04, shadowRadius: 8, elevation: 2 },
  previewHeader: { minHeight: 28, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 3 },
  previewHeading: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  previewStatusDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: Colors.authentic },
  imageFrame: { height: 250, overflow: 'hidden', position: 'relative', borderRadius: 13, backgroundColor: Colors.bgTertiary },
  preview: { width: '100%', height: '100%', resizeMode: 'contain' },
  scanLine: { position: 'absolute', left: 12, right: 12, height: 2, borderRadius: 1, backgroundColor: Colors.cyan, shadowColor: Colors.cyan, shadowOpacity: 0.85, shadowRadius: 8, elevation: 5 },
  viewfinder: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  corner: { position: 'absolute', width: 24, height: 24, borderColor: Colors.cyan },
  cornerTopLeft: { top: 14, left: 14, borderTopWidth: 2, borderLeftWidth: 2 },
  cornerTopRight: { top: 14, right: 14, borderTopWidth: 2, borderRightWidth: 2 },
  cornerBottomLeft: { bottom: 14, left: 14, borderBottomWidth: 2, borderLeftWidth: 2 },
  cornerBottomRight: { right: 14, bottom: 14, borderBottomWidth: 2, borderRightWidth: 2 },
  removeButton: { position: 'absolute', top: 9, right: 9, width: 44, height: 44, borderRadius: 13, backgroundColor: Colors.bgSecondary, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center', elevation: 2 },
  imageDetails: { gap: 5, paddingHorizontal: 13, paddingVertical: 11, borderRadius: 14, backgroundColor: Colors.bgSecondary, borderWidth: 1, borderColor: Colors.border },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  fileName: { flex: 1 },
  actions: { gap: Spacing.md },
  fullButton: { width: '100%' },
  readyNote: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.sm },
  processingCard: { alignItems: 'stretch', gap: Spacing.md, padding: Spacing.md, borderRadius: 17, backgroundColor: Colors.bgSecondary, borderWidth: 1, borderColor: Colors.glassBorderCyan },
  processingHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm },
  progressTrack: { height: 7, overflow: 'hidden', borderRadius: 4, backgroundColor: Colors.bgTertiary },
  progressFill: { height: '100%', borderRadius: 3, backgroundColor: Colors.cyan },
  errorNote: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, padding: 12, borderRadius: 13, backgroundColor: Colors.fakeDim },
  errorCopy: { flex: 1 },
});
