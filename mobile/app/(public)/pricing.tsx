import DetailBack from '../../components/ui/DetailBack';
import {useTheme} from '../../context/ThemeContext';
import type {ColorPalette} from '../../constants/Colors';
import React from 'react';
import {Redirect,router} from 'expo-router';
import {ScrollView,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useAuth} from '../../hooks/useAuth';
import CyberText from '../../components/ui/CyberText';
import CyberButton from '../../components/ui/CyberButton';
import GlassCard from '../../components/ui/GlassCard';
export default function PricingScreen(){
 const {colors:Colors}=useTheme();

 const {isAuthenticated}=useAuth();if(isAuthenticated)return <Redirect href="/checkout"/>;
 return <SafeAreaView style={{flex:1,backgroundColor:Colors.bgPrimary}}><ScrollView contentContainerStyle={{padding:20,gap:14,width:'100%',maxWidth:600,alignSelf:'center'}}><DetailBack fallback="/(public)/home"/><CyberText variant="h3">Plans &amp; payments</CyberText><CyberText variant="bodySmall">Capstone demonstration · Payments are simulated. No real money is charged.</CyberText>
 <GlassCard><CyberText variant="h4">Free</CyberText><CyberText variant="h3">₱0</CyberText><CyberText>5 scans per day</CyberText><CyberText variant="caption">Resets at midnight Philippine time.</CyberText></GlassCard>
 <GlassCard style={{borderColor:Colors.glassBorderCyan,gap:8}}><CyberText variant="h4">Pro</CyberText><CyberText>Unlimited scans for one calendar month</CyberText><CyberText variant="bodySmall">Sign in to see the current price and checkout availability. Pay once. No automatic renewal. After expiry, you return to Free and keep your saved scans.</CyberText></GlassCard>
 <GlassCard><CyberText variant="bodySmall">Both plans include saved scan history and PDF reports at no extra cost. Failed scans do not use a credit.</CyberText></GlassCard><CyberText variant="bodySmall">Both plans use the same AI analysis. Pro increases your scan allowance, not prediction accuracy.</CyberText>
 <CyberButton label="Sign in to view plans" onPress={()=>router.push('/(auth)/login')}/><CyberButton label="Create account" variant="secondary" onPress={()=>router.push('/(auth)/register')}/></ScrollView></SafeAreaView>;
}
