import React from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import GlassCard from '../components/ui/GlassCard';
import CyberButton from '../components/ui/CyberButton';
import CyberText from '../components/ui/CyberText';
import ScanGrid from '../components/ui/ScanGrid';
import Colors from '../constants/Colors';
import Spacing from '../constants/Spacing';
import { useAuth } from '../hooks/useAuth';

/** Provider-isolated checkout UI. No payment method data is collected here. */
export default function CheckoutScreen() {
  const { isAuthenticated, user } = useAuth();
  return (
    <View style={styles.container}>
      <LinearGradient colors={['#F6FAFD', '#EEF7FD', '#F6FAFD']} style={StyleSheet.absoluteFill} />
      <ScanGrid animated={false} />
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backButton} accessibilityRole="button" accessibilityLabel="Go back"><Ionicons name="chevron-back" size={24} color={Colors.textPrimary} /></TouchableOpacity>
            <CyberText variant="label" color={Colors.cyan}>SECURE CHECKOUT</CyberText>
            <View style={styles.headerSpacer} />
          </View>
          <View style={styles.lockIcon}><Ionicons name="lock-closed" size={32} color={Colors.cyan} /></View>
          <View style={styles.heading}><CyberText variant="h3" align="center">AuthentiScan Premium</CyberText><CyberText variant="bodySmall" align="center">PHP 249 per month · Cancel through your payment provider.</CyberText></View>

          <GlassCard variant="strong" style={styles.summaryCard} active>
            <View style={styles.summaryTop}><View><CyberText variant="label" color={Colors.cyan}>SELECTED PLAN</CyberText><CyberText variant="h4">Premium</CyberText></View><View><CyberText variant="h2" color={Colors.cyan}>PHP 249</CyberText><CyberText variant="caption">MONTHLY</CyberText></View></View>
            <View style={styles.divider} />
            <View style={styles.statusRow}><Ionicons name={user?.plan === 'premium' ? 'shield-checkmark-outline' : 'shield-outline'} size={20} color={user?.plan === 'premium' ? Colors.authentic : Colors.textSecondary} /><View style={styles.statusCopy}><CyberText variant="body">Subscription status</CyberText><CyberText variant="bodySmall" color={user?.plan === 'premium' ? Colors.authentic : Colors.textSecondary}>{user?.plan === 'premium' ? 'Premium active' : 'Free plan — Premium is not active'}</CyberText></View></View>
          </GlassCard>

          {!isAuthenticated ? (
            <GlassCard style={styles.noticeCard}><Ionicons name="person-add-outline" size={22} color={Colors.cyan} /><View style={styles.noticeCopy}><CyberText variant="body">Create an account first</CyberText><CyberText variant="bodySmall">An account is required before a subscription can be purchased.</CyberText></View></GlassCard>
          ) : (
            <>
              <GlassCard style={styles.methodCard}>
                <View style={styles.methodHeader}><Ionicons name="card-outline" size={22} color={Colors.cyan} /><CyberText variant="body">Payment method</CyberText></View>
                <View style={styles.unavailableMethod}><Ionicons name="shield-checkmark-outline" size={18} color={Colors.authentic} /><View style={styles.noticeCopy}><CyberText variant="bodySmall">Debit/Credit Card or GCash</CyberText><CyberText variant="caption">Choose your preferred secure method on the next screen.</CyberText></View></View>
              </GlassCard>
              <View style={styles.securityRow}><Ionicons name="shield-checkmark-outline" size={18} color={Colors.authentic} /><CyberText variant="caption" color={Colors.authentic}>PAYMENT DATA IS NEVER STORED IN THIS APP</CyberText></View>
              <CyberButton label="Choose payment method" onPress={() => router.push('/payment-method')} style={styles.fullButton} />
              <CyberText variant="caption" align="center">Choose Debit/Credit Card or GCash next. Payment integration remains provider-pending.</CyberText>
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgPrimary }, safeArea: { flex: 1 }, header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.screenPadding, paddingVertical: Spacing.md }, backButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }, headerSpacer: { width: 36 },
  content: { padding: Spacing.screenPadding, paddingBottom: Spacing['3xl'], gap: Spacing.lg }, lockIcon: { width: 72, height: 72, borderRadius: 36, alignSelf: 'center', alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.cyanDim, borderWidth: 1, borderColor: Colors.glassBorderCyan }, heading: { gap: Spacing.sm }, summaryCard: { gap: Spacing.md }, summaryTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }, divider: { height: 1, backgroundColor: Colors.glassBorderCyan }, statusRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }, statusCopy: { flex: 1, gap: 3 },
  noticeCard: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm }, noticeCopy: { flex: 1, gap: 4 }, methodCard: { gap: Spacing.md }, methodHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }, unavailableMethod: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, padding: Spacing.md, borderRadius: Spacing.inputRadius, borderWidth: 1, borderColor: Colors.severityMedium, backgroundColor: 'rgba(245,158,11,0.12)' }, securityRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: Spacing.sm }, fullButton: { width: '100%' },
});
