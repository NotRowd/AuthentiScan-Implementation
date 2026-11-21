import {useMobileTabSpacing} from '../../hooks/useMobileTabSpacing';
import {useTheme,useThemedStyles} from '../../context/ThemeContext';
import type {ColorPalette} from '../../constants/Colors';
import {createStyles} from '../../constants/createStyles';
import React,{useCallback,useRef,useState} from 'react';
import {ActivityIndicator,AppState,Image,RefreshControl,ScrollView,StyleSheet,View,Pressable} from 'react-native';
import {router,useFocusEffect} from 'expo-router';
import {SafeAreaView} from 'react-native-safe-area-context';
import CyberButton from '../../components/ui/CyberButton';
import CyberText from '../../components/ui/CyberText';
import GlassCard from '../../components/ui/GlassCard';
import ScanImage from '../../components/ui/ScanImage';
import {VerdictChip} from '../../components/ui/StatusChip';
import {useAuth} from '../../hooks/useAuth';
import {scanHistoryService} from '../../services/scan/scanHistoryService';
import {setLatestScanResult} from '../../services/scan/scanSession';
import type {ScanResult} from '../../types';
export default function DashboardScreen(){
 const {colors:Colors}=useTheme(); const styles=useThemedStyles(makeStyles);

 const {contentBottom}=useMobileTabSpacing();
 const [authenticCount,setAuthenticCount]=useState<number|null>(null);
 const {user}=useAuth();const [scans,setScans]=useState<ScanResult[]>([]),[stats,setStats]=useState<Awaited<ReturnType<typeof scanHistoryService.getStats>>|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');const generation=useRef(0);
 const load=useCallback(async()=>{const version=++generation.current;setBusy(true);setError('');try{const [page,summary,authenticPage]=await Promise.all([scanHistoryService.getPage(0,5),scanHistoryService.getStats(),scanHistoryService.getPage(0,1,{status:'authentic'})]);if(generation.current===version){setScans(page.scans);setStats(summary);setAuthenticCount(authenticPage.pagination.total);}}catch{if(generation.current===version){setError('Could not refresh your workspace. Pull down or tap Retry.');setStats(null);setAuthenticCount(null);}}finally{if(generation.current===version)setBusy(false);}},[]);
 useFocusEffect(useCallback(()=>{void load();const listener=AppState.addEventListener('change',state=>{if(state==='active')void load();});return()=>{generation.current++;listener.remove();};},[load,user?.id]));
 const items=[['Total scans',stats?.total_scans],['Scans remaining',stats?.plan?(stats.plan.scan_limit===null?'Unlimited':typeof stats.scans_remaining==='number'?stats.scans_remaining:'—'):'—'],['AI-generated',stats?.ai_generated_found],['Authentic',authenticCount]];
 return <SafeAreaView style={styles.screen} edges={['top']}><ScrollView contentContainerStyle={[styles.content,{paddingBottom:contentBottom}]} refreshControl={<RefreshControl refreshing={busy} onRefresh={()=>void load()} tintColor={Colors.cyan}/>}>
  <View style={styles.brand}><Image source={require('../../assets/AuthentiScan-Logo.png')} style={styles.logo} accessibilityLabel="AuthentiScan logo"/><CyberText variant="h4">AuthentiScan</CyberText></View>
  <CyberText variant="h3">Welcome, {user?.firstName||'there'}!</CyberText><CyberText variant="bodySmall">Your image review workspace. Results are estimates, not proof of authenticity.</CyberText>
  <GlassCard style={styles.hero}><CyberText variant="label" color={Colors.cyan}>START ANALYSIS</CyberText><CyberText variant="h4">Take a closer look.</CyberText><CyberText variant="bodySmall">Choose an image to review its classification, suspected edit regions, and unusual details.</CyberText><CyberButton label="Scan an image" onPress={()=>router.push('/(tabs)/scan')}/><CyberText variant="caption">JPEG, PNG, WebP · Up to 10 MB</CyberText></GlassCard>
  {!!error&&<View accessibilityRole="alert"><CyberText variant="bodySmall" color={Colors.fake}>{error}</CyberText><CyberButton label="Retry" variant="secondary" onPress={()=>void load()} disabled={busy}/></View>}
  <View style={styles.grid}>{items.map(([label,value])=><GlassCard key={String(label)} style={styles.stat}><CyberText variant="caption">{label}</CyberText>{busy&&!stats?<ActivityIndicator accessibilityLabel="Loading workspace statistics" color={Colors.cyan}/>:<CyberText variant="h4">{value??'—'}</CyberText>}</GlassCard>)}</View>
  <GlassCard style={styles.recent}><View style={styles.heading}><CyberText variant="h4">Recent scans</CyberText><CyberButton label="View all" size="sm" variant="ghost" onPress={()=>router.push('/(tabs)/history')}/></View>
  {!scans.length&&!busy&&!error&&<CyberText variant="bodySmall">No scans yet. Scan an image to start your history.</CyberText>}
  {scans.map(scan=><Pressable key={scan.id} accessibilityRole="button" accessibilityLabel={'Open '+scan.fileName} style={styles.row} onPress={()=>{setLatestScanResult(scan);router.push('/result');}}><ScanImage uri={scan.imageUri||scan.imagePath} style={styles.thumb} label={scan.fileName}/><View style={{flex:1,gap:5}}><CyberText variant="bodySmall" numberOfLines={2} style={{fontWeight:'600'}}>{scan.fileName}</CyberText><CyberText variant="caption">{new Date(scan.scannedAt).toLocaleString('en-PH',{timeZone:'Asia/Manila'})}</CyberText><VerdictChip verdict={scan.verdict} status={scan.status} hasAnalysis={scan.hasAnalysis}/></View></Pressable>)}
  </GlassCard><CyberText variant="caption">Results guide your review. Compare the image, its explanation, and original source before drawing a conclusion.</CyberText>
 </ScrollView></SafeAreaView>;
}
const makeStyles = (Colors: ColorPalette) => createStyles({screen:{flex:1,backgroundColor:Colors.bgPrimary},content:{width:'100%',maxWidth:840,alignSelf:'center',padding:20,paddingBottom:32,gap:16},brand:{flexDirection:'row',alignItems:'center',gap:10},logo:{backgroundColor:Colors.logoPlate,borderRadius:32,width:40,height:40},hero:{backgroundColor:Colors.cyanDim,borderColor:Colors.border,borderRadius:22,gap:10},grid:{flexDirection:'row',flexWrap:'wrap',gap:12},stat:{width:'47%',flexGrow:1,gap:6,borderRadius:20},recent:{borderRadius:22,gap:8},heading:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap'},row:{flexDirection:'row',gap:12,alignItems:'center',paddingVertical:12,borderTopWidth:1,borderTopColor:Colors.border},thumb:{width:64,height:64,borderRadius:12}});
