import {useTheme,useThemedStyles} from '../context/ThemeContext';
import type {ColorPalette} from '../constants/Colors';
import {createStyles} from '../constants/createStyles';
import React, { useEffect, useState, useRef } from 'react';
import { AppState, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import GlassCard from '../components/ui/GlassCard';
import CyberButton from '../components/ui/CyberButton';
import CyberText from '../components/ui/CyberText';
import { VerdictChip } from '../components/ui/StatusChip';
import Spacing from '../constants/Spacing';
import { getLatestScanResult, setLatestScanResult } from '../services/scan/scanSession';
import { scanHistoryService } from '../services/scan/scanHistoryService';
import { apiRequest } from '../services/api/client';
import { FEATURE_LABELS, describeVisualReview } from '../services/scan/visualReview';
import { OFFLINE_MODE } from '../services/api/config';
import ScanImage from '../components/ui/ScanImage';
import {usePendingScanRefresh} from '../hooks/usePendingScanRefresh';
import ExportReportButton from '../components/ui/ExportReportButton';
import { classificationRows, regionPresentation, resultExplanation } from '../services/scan/resultPresentation';

export default function ResultScreen() {
 const {colors:Colors}=useTheme(); const styles=useThemedStyles(makeStyles);

  const [result, setResult] = useState(getLatestScanResult);
  const [operation, setOperation] = useState<'refresh' | 'features' | null>(null);
  const [error, setError] = useState('');
  const [showChecks, setShowChecks] = useState(false);
  const active = useRef<AbortController | null>(null);
  useEffect(() => () => { active.current?.abort(); active.current = null; }, []);
  usePendingScanRefresh(result, operation, error, () => refresh());
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
  const scores = classificationRows(result);
  const regions = regionPresentation(result);
  return <SafeAreaView style={styles.screen} edges={['top']}>
    <ScrollView contentContainerStyle={styles.content}>
      <CyberText variant="label" color={Colors.cyan}>SAVED ANALYSIS</CyberText>
      <CyberText variant="h3">Scan report</CyberText>
      <CyberText variant="body" style={{fontWeight:'600'}}>{result.fileName}</CyberText>
      <CyberText variant="caption">{result.scanNumber ? 'Scan #'+result.scanNumber+' · ' : ''}{new Date(result.scannedAt).toLocaleString('en-PH',{timeZone:'Asia/Manila'})}{result.fileSizeBytes ? ' · '+(result.fileSizeBytes/1024).toFixed(1)+' KB' : ''}</CyberText>
      {!OFFLINE_MODE && <View style={styles.actions}><ExportReportButton key={result.id} scanId={result.id}/><CyberButton label={operation==='refresh'?'Refreshing…':'Refresh result'} disabled={!!operation} loading={operation==='refresh'} onPress={()=>refresh()} variant="secondary"/></View>}
      {!!error && <View accessibilityRole="alert" accessibilityLiveRegion="polite"><CyberText variant="bodySmall" color={Colors.fake}>{error}</CyberText></View>}
      {!result.hasAnalysis ? <GlassCard style={styles.card}>
        <CyberText variant="h4">{result.status==='failed'?'Analysis unavailable':'Analysis pending'}</CyberText>
        <ScanImage uri={result.imageUri||result.imagePath} style={styles.image} natural label="Original image"/>
        <CyberText variant="bodySmall">{result.summary}</CyberText>
        {result.status!=='failed'&&<CyberText variant="caption">This scan is saved. Its status refreshes while this report is open and when you return to the app. No new image is uploaded.</CyberText>}
        {result.creditStatus&&<CyberText variant="caption">{creditMessage[result.creditStatus]}</CyberText>}
        <CyberText variant="caption">Refresh to check the saved status. A failed scan is not an Uncertain result. Check History before submitting the image again.</CyberText>
      </GlassCard> : <>
        <GlassCard style={styles.card}>
          <CyberText variant="h4">Image classification</CyberText><VerdictChip verdict={result.verdict}/>
          <CyberText variant="caption">AI estimate · Not proof of authenticity</CyberText>
          {scores.rows.map(row=><View key={row.key} style={styles.scoreCard}>
            <CyberText variant="bodySmall">{row.label}</CyberText>
            <CyberText variant="h3">{row.percent===null?'Not supplied':row.percent.toFixed(2)+'%'}</CyberText>
            {!!row.note&&<CyberText variant="caption">{row.note}</CyberText>}
            <View accessibilityRole={row.percent===null?'none':'progressbar'} accessibilityLabel={row.label+(row.derived?' calculated remainder':' confidence')} accessibilityValue={row.percent===null?undefined:{min:0,max:100,now:row.percent}} style={styles.track}>
              <View style={[styles.bar,{width:(row.percent??0)+'%',backgroundColor:row.key==='authentic'?Colors.cyan:Colors.ai}]}/>
            </View>
          </View>)}
          {!!scores.explanation&&<CyberText variant="bodySmall">{scores.explanation}</CyberText>}
          <CyberText variant="bodySmall">{resultExplanation(result)}</CyberText>
          {result.creditStatus&&<CyberText variant="caption">{creditMessage[result.creditStatus]}</CyberText>}
        </GlassCard>
        <GlassCard style={styles.card}>
          <CyberText variant="h4">{regions.originalOnly?'Uploaded image':'Suspected edit regions'}</CyberText>
          {!regions.originalOnly&&<CyberText variant="bodySmall">Compare the original image with the supplied heatmap. Highlights are areas for review and do not establish exact edited boundaries.</CyberText>}
          <ScanImage uri={result.imageUri||result.imagePath} style={styles.image} natural label="Original image"/>
          <CyberText variant="caption">Original image</CyberText>
          {!regions.originalOnly&&(regions.available?<>
            <ScanImage uri={regions.image} style={styles.image} natural label="Supplied heatmap" timeoutMs={110000}/><CyberText variant="caption">Supplied heatmap · Highlights may be incorrect.</CyberText>
          </>:<CyberText variant="bodySmall">No heatmap is available for this saved result.</CyberText>)}
        </GlassCard>
        {!OFFLINE_MODE&&<GlassCard style={styles.card}>
          <CyberText variant="h4">What looks unusual?</CyberText>
          {result.analysisProvider==='truthscan'?<>
            <CyberText variant="bodySmall">{result.providerReview?.text||'No written visual analysis is available for this saved result.'}</CyberText>
            {!!result.providerReview?.indicators?.length&&<><CyberButton label={showChecks?'Hide analysis indicators':'View analysis indicators'} variant="secondary" onPress={()=>setShowChecks(v=>!v)}/>{showChecks&&result.providerReview.indicators.map((item,index)=><CyberText key={index} variant="bodySmall">• {item}</CyberText>)}</>}
          </>:visualReview?<>
            <CyberText variant="body">{visualReview.label}</CyberText><CyberText variant="bodySmall">{visualReview.text}</CyberText>
            <CyberButton label={showChecks?'Hide feature checks':'View all feature checks'} variant="secondary" onPress={()=>setShowChecks(v=>!v)}/>
            {showChecks&&visualReview.findings.map((finding,index)=><View key={finding.category||index}><CyberText variant="bodySmall">{FEATURE_LABELS[finding.category||'']||'Visual detail'} · {finding.status==='possible_concern'?'Tentative observation':finding.status==='no_clear_concern'?'No clear concern':'Unable to assess'}</CyberText><CyberText variant="caption">{finding.observation}</CyberText></View>)}
          </>:<><CyberText variant="bodySmall">{result.visualReviewUnavailable?'The visual review was unavailable during this scan.':'This image has no completed visual review yet.'}</CyberText><CyberButton label={result.visualReviewUnavailable?'Retry visual review':'Check unusual details'} variant="secondary" onPress={()=>refresh('features')} disabled={!!operation} loading={operation==='features'}/><CyberText variant="caption">No additional scan credit is used.</CyberText></>}
          <CyberText variant="caption">Automated observations may be incorrect. The visual review is separate from the classification.</CyberText>
        </GlassCard>}
        {!OFFLINE_MODE&&<CyberButton label="Rate this report" variant="secondary" onPress={()=>router.push('/feedback')}/>}
      </>}
      <CyberButton label={OFFLINE_MODE?'Test another response':'Scan another image'} onPress={()=>router.replace('/(tabs)/scan')}/>
      <CyberButton label="Back to history" variant="secondary" onPress={()=>router.replace('/(tabs)/history')}/>
    </ScrollView>
  </SafeAreaView>;
}
const makeStyles = (Colors: ColorPalette) => createStyles({
  screen:{flex:1,backgroundColor:Colors.bgPrimary},content:{width:'100%',maxWidth:840,alignSelf:'center',padding:20,paddingBottom:48,gap:14},
  card:{gap:12,borderRadius:22},image:{width:'100%',height:280,resizeMode:'contain',borderRadius:14,backgroundColor:Colors.bgSecondary},
  actions:{gap:10},scoreCard:{padding:14,borderRadius:16,backgroundColor:Colors.bgPrimary,gap:5},track:{height:8,borderRadius:5,overflow:'hidden',backgroundColor:Colors.border,marginTop:6},bar:{height:8,borderRadius:5},
});
