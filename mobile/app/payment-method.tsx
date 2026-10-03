import React, { useState } from 'react';
import { ActivityIndicator, Platform, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
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
import { paymentService, type PaymentMethod } from '../services/payment/paymentService';
import { useAuth } from '../hooks/useAuth';

type PaymentState = 'selecting' | 'processing' | 'success' | 'failed';

/**
 * Provider-pending payment UI. Card fields below are presentation-only until
 * a PCI-compliant provider supplies hosted components; no raw data is read.
 */
export default function PaymentMethodScreen() {
  const [method, setMethod] = useState<PaymentMethod>('card');
  const [state, setState] = useState<PaymentState>('selecting');
  const [error, setError] = useState<string | null>(null);
  const { activatePremium } = useAuth();
  // A real provider must verify device eligibility and an active Wallet card.
  const isApplePayAvailable = false;
  const applePayUnavailableMessage = Platform.OS === 'ios'
    ? 'Apple Pay requires a configured payment provider before device eligibility can be checked.'
    : 'Apple Pay is available only on supported Apple devices.';

  const startPayment = async () => {
    setState('processing');
    setError(null);
    const result = await paymentService.startPremiumPayment(method);
    if (result.success) {
      await activatePremium();
      setState('success');
      return;
    }
    setError(result.error);
    setState('failed');
  };

  const selection = state === 'selecting';
  return (
    <View style={styles.container}>
      <LinearGradient colors={['#05070D', '#0B0F1A', '#05070D']} style={StyleSheet.absoluteFill} />
      <ScanGrid animated={false} />
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.header}><TouchableOpacity onPress={() => router.back()} style={styles.backButton} accessibilityRole="button" accessibilityLabel="Go back"><Ionicons name="chevron-back" size={24} color={Colors.textPrimary} /></TouchableOpacity><CyberText variant="label" color={Colors.cyan}>PAYMENT METHOD</CyberText><View style={styles.headerSpacer} /></View>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <GlassCard variant="strong" style={styles.priceCard} active><View><CyberText variant="label" color={Colors.cyan}>AUTHENTISCAN PREMIUM</CyberText><CyberText variant="bodySmall">Monthly subscription</CyberText></View><View><CyberText variant="h2" color={Colors.cyan}>PHP 249</CyberText><CyberText variant="caption">/ MONTH</CyberText></View></GlassCard>
          {state === 'processing' ? <GlassCard variant="strong" style={styles.centerCard} active accessibilityLiveRegion="polite"><ActivityIndicator size="large" color={Colors.cyan} /><CyberText variant="h4" align="center">Processing payment</CyberText><CyberText variant="bodySmall" align="center">Securely handing off to your selected payment method. Payment details are never stored by AuthentiScan.</CyberText><CyberButton label="Cancel" onPress={() => { setState('selecting'); setError(null); }} variant="ghost" size="sm" /></GlassCard>
          : state === 'success' ? <GlassCard variant="strong" style={styles.successCard} active accessibilityLiveRegion="polite"><Ionicons name="shield-checkmark" size={44} color={Colors.authentic} /><CyberText variant="h4" align="center">Payment successful</CyberText><CyberText variant="bodySmall" align="center">Your Premium subscription is active. This state is shown only after provider confirmation.</CyberText><CyberButton label="Go to dashboard" onPress={() => router.replace('/(tabs)/dashboard')} style={styles.fullButton} /></GlassCard>
          : state === 'failed' ? <GlassCard style={styles.failureCard}><Ionicons name="alert-circle-outline" size={38} color={Colors.fake} /><CyberText variant="h4" align="center">Payment unavailable</CyberText><CyberText variant="bodySmall" align="center">{error}</CyberText><CyberButton label="Try again" onPress={startPayment} style={styles.fullButton} /><CyberButton label="Cancel" onPress={() => router.back()} variant="secondary" style={styles.fullButton} /></GlassCard>
          : <>
            <CyberText variant="label">CHOOSE A METHOD</CyberText>
            <TouchableOpacity onPress={() => setMethod('card')} accessibilityRole="radio" accessibilityLabel="Debit or credit card" accessibilityState={{ selected: method === 'card' }}><GlassCard style={styles.methodCard} active={method === 'card'}><View style={styles.methodIcon}><Ionicons name="card-outline" size={25} color={Colors.cyan} /></View><View style={styles.methodCopy}><CyberText variant="body">Debit / Credit Card</CyberText><CyberText variant="bodySmall">Secure provider-hosted card entry</CyberText></View><Ionicons name={method === 'card' ? 'radio-button-on' : 'radio-button-off'} size={22} color={method === 'card' ? Colors.cyan : Colors.textMuted} /></GlassCard></TouchableOpacity>
            <TouchableOpacity onPress={() => setMethod('gcash')} accessibilityRole="radio" accessibilityLabel="GCash" accessibilityState={{ selected: method === 'gcash' }}><GlassCard style={styles.methodCard} active={method === 'gcash'}><View style={styles.methodIcon}><Ionicons name="phone-portrait-outline" size={25} color={Colors.cyan} /></View><View style={styles.methodCopy}><CyberText variant="body">GCash</CyberText><CyberText variant="bodySmall">Authorize through the GCash provider flow</CyberText></View><Ionicons name={method === 'gcash' ? 'radio-button-on' : 'radio-button-off'} size={22} color={method === 'gcash' ? Colors.cyan : Colors.textMuted} /></GlassCard></TouchableOpacity>
            <TouchableOpacity disabled={!isApplePayAvailable} onPress={() => setMethod('apple-pay')} accessibilityRole="radio" accessibilityLabel="Apple Pay" accessibilityState={{ selected: method === 'apple-pay', disabled: !isApplePayAvailable }}><GlassCard style={[styles.methodCard, !isApplePayAvailable && styles.methodUnavailable]} active={method === 'apple-pay' && isApplePayAvailable}><View style={styles.applePayIcon}><CyberText variant="h4" color={isApplePayAvailable ? Colors.textPrimary : Colors.textMuted}></CyberText></View><View style={styles.methodCopy}><CyberText variant="body" color={isApplePayAvailable ? Colors.textPrimary : Colors.textSecondary}>Apple Pay</CyberText><CyberText variant="bodySmall">{isApplePayAvailable ? 'Pay with Apple Pay' : applePayUnavailableMessage}</CyberText></View>{isApplePayAvailable ? <Ionicons name={method === 'apple-pay' ? 'radio-button-on' : 'radio-button-off'} size={22} color={method === 'apple-pay' ? Colors.cyan : Colors.textMuted} /> : <Ionicons name="information-circle-outline" size={22} color={Colors.severityMedium} />}</GlassCard></TouchableOpacity>
            {method === 'card' ? <GlassCard style={styles.detailsCard}><View style={styles.detailsHeader}><CyberText variant="label" color={Colors.cyan}>CARD DETAILS</CyberText><Ionicons name="lock-closed" size={16} color={Colors.authentic} /></View><CyberText variant="bodySmall">Your payment information is securely processed by the payment provider. AuthentiScan never receives or stores card data.</CyberText>{['Cardholder name', 'Card number', 'Expiration date', 'CVV'].map((label) => <View key={label} style={styles.hostedField} accessibilityLabel={`${label}, secure payment-provider field`}><CyberText variant="caption">{label.toUpperCase()}</CyberText><View style={styles.hostedFieldPlaceholder}><Ionicons name="lock-closed-outline" size={15} color={Colors.textMuted} /><CyberText variant="bodySmall" color={Colors.textMuted}>Secure provider field</CyberText></View></View>)}</GlassCard>
            : method === 'gcash' ? <GlassCard style={styles.detailsCard}><View style={styles.detailsHeader}><CyberText variant="label" color={Colors.cyan}>GCASH AUTHORIZATION</CyberText><Ionicons name="phone-portrait-outline" size={18} color={Colors.cyan} /></View><CyberText variant="bodySmall">Pay with GCash. A connected provider will open or redirect to GCash for authorization, then return a verified payment result.</CyberText><View style={styles.pendingRow}><Ionicons name="open-outline" size={18} color={Colors.severityMedium} /><CyberText variant="bodySmall" color={Colors.severityMedium}>Transaction connection pending — no GCash authorization can open yet.</CyberText></View></GlassCard>
            : <GlassCard style={styles.detailsCard}><View style={styles.detailsHeader}><CyberText variant="label" color={Colors.cyan}>APPLE PAY</CyberText><CyberText variant="h4"></CyberText></View><CyberText variant="bodySmall">Apple Pay is unavailable until a compatible Apple device and a configured payment provider can verify eligibility.</CyberText></GlassCard>}
            <View style={styles.securityRow}><Ionicons name="shield-checkmark-outline" size={18} color={Colors.authentic} /><CyberText variant="caption" color={Colors.authentic}>NO RAW CARD NUMBER OR CVV IS STORED</CyberText></View>
            <CyberButton label={method === 'card' ? 'Continue with card' : method === 'gcash' ? 'Continue to GCash' : 'Continue with Apple Pay'} onPress={startPayment} disabled={method === 'apple-pay' && !isApplePayAvailable} style={styles.fullButton} />
            <CyberText variant="caption" align="center">Transaction integration pending: this cannot charge you, open GCash, or activate Premium yet.</CyberText>
          </>}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgPrimary }, safeArea: { flex: 1 }, header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.screenPadding, paddingVertical: Spacing.md }, backButton: { width: 36, height: 36, justifyContent: 'center', alignItems: 'center' }, headerSpacer: { width: 36 }, content: { padding: Spacing.screenPadding, paddingBottom: Spacing['3xl'], gap: Spacing.md }, priceCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, methodCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md }, methodUnavailable: { opacity: 0.62 }, methodIcon: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.cyanDim, borderWidth: 1, borderColor: Colors.glassBorderCyan }, applePayIcon: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.glassBgStrong, borderWidth: 1, borderColor: Colors.glassBorderStrong }, methodCopy: { flex: 1, gap: 3 }, detailsCard: { gap: Spacing.md }, detailsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, hostedField: { gap: Spacing.sm, padding: Spacing.md, borderRadius: Spacing.inputRadius, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.glassBg }, hostedFieldPlaceholder: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }, pendingRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, padding: Spacing.sm, backgroundColor: 'rgba(245,158,11,0.12)', borderRadius: Spacing.sm }, securityRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: Spacing.sm }, centerCard: { alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.xl }, successCard: { alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.xl }, failureCard: { alignItems: 'center', gap: Spacing.md, borderColor: Colors.fake, paddingVertical: Spacing.xl }, fullButton: { width: '100%' },
});
