import React, { useEffect, useRef, useState } from 'react';
import { Animated, Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import GlassCard from '../../components/ui/GlassCard';
import CyberButton from '../../components/ui/CyberButton';
import CyberText from '../../components/ui/CyberText';
import Colors from '../../constants/Colors';
import Spacing from '../../constants/Spacing';
import Typography from '../../constants/Typography';
import { passwordResetService } from '../../services/auth/passwordResetService';

/** Password reset request UI. Email delivery requires a real auth provider. */
export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isComplete, setIsComplete] = useState(false);
  const pageOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(pageOpacity, { toValue: 1, duration: 320, useNativeDriver: true }).start();
  }, [pageOpacity]);

  const requestReset = async () => {
    setError(null);
    setIsSubmitting(true);
    try {
      const response = await passwordResetService.requestReset(email.trim().toLowerCase());
      if (!response.success) setError(response.error);
      else setIsComplete(true);
    } catch {
      setError("We couldn't prepare the reset request. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Animated.View style={[styles.container, { opacity: pageOpacity }]}>
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView style={styles.keyboard} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backButton} accessibilityRole="button" accessibilityLabel="Go back"><Ionicons name="chevron-back" size={24} color={Colors.textPrimary} /></TouchableOpacity>
            <View style={styles.icon}><Image source={require('../../assets/AuthentiScan-Logo.png')} style={styles.brandLogo} accessibilityLabel="AuthentiScan logo" /></View>
            <View style={styles.heading}><CyberText variant="h3" align="center">{isComplete ? 'Reset delivery unavailable' : 'Forgot your password?'}</CyberText><CyberText variant="bodySmall" align="center">{isComplete ? 'This prototype does not have an email or authentication provider configured.' : 'Enter your email to begin a secure password reset.'}</CyberText></View>
            {isComplete ? (
              <GlassCard variant="strong" style={styles.card} active>
                <View style={styles.notice}><Ionicons name="shield-outline" size={20} color={Colors.severityMedium} /><CyberText variant="bodySmall" style={styles.noticeCopy}>No reset email was sent, and no password was changed. A real authentication provider is required to enable the secure reset and new-password steps.</CyberText></View>
                <CyberText variant="caption" align="center">REQUESTED ADDRESS: {email.toUpperCase()}</CyberText>
                <CyberButton label="Return to sign in" onPress={() => router.replace('/(auth)/login')} style={styles.fullButton} />
                <CyberButton label="Use another email" onPress={() => { setIsComplete(false); setError(null); }} variant="ghost" />
              </GlassCard>
            ) : (
              <GlassCard variant="strong" style={styles.card}>
                <View style={styles.prototypeBadge}><CyberText variant="caption" color={Colors.severityMedium}>PROTOTYPE FLOW — NO EMAIL DELIVERY</CyberText></View>
                <View style={styles.inputGroup}>
                  <CyberText variant="label">EMAIL ADDRESS</CyberText>
                  <View style={[styles.inputWrap, isFocused && styles.inputFocused, !!error && styles.inputError]}>
                    <Ionicons name="mail-outline" size={18} color={isFocused ? Colors.cyan : Colors.textSecondary} />
                    <TextInput value={email} onChangeText={(value) => { setEmail(value); setError(null); }} style={styles.input} placeholder="your@email.com" placeholderTextColor={Colors.textMuted} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} returnKeyType="done" onSubmitEditing={requestReset} onFocus={() => setIsFocused(true)} onBlur={() => setIsFocused(false)} accessibilityLabel="Email address for password reset" />
                  </View>
                </View>
                {error && <View style={styles.error}><Ionicons name="alert-circle-outline" size={17} color={Colors.fake} /><CyberText variant="bodySmall" color={Colors.fake} style={styles.errorText}>{error}</CyberText></View>}
                <CyberButton label="Continue" onPress={requestReset} loading={isSubmitting} disabled={isSubmitting} style={styles.fullButton} />
                <CyberText variant="caption" align="center">A provider-backed version will send a reset link and then allow a new password with strength and visibility controls.</CyberText>
              </GlassCard>
            )}
            {!isComplete && <TouchableOpacity onPress={() => router.replace('/(auth)/login')} accessibilityRole="button" accessibilityLabel="Return to sign in"><CyberText variant="bodySmall" align="center" color={Colors.cyan}>Back to sign in</CyberText></TouchableOpacity>}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgPrimary }, safeArea: { flex: 1 }, keyboard: { flex: 1 }, content: { flexGrow: 1, alignItems: 'stretch', paddingHorizontal: Spacing.screenPadding, paddingBottom: Spacing['3xl'], gap: Spacing.lg }, backButton: { width: 44, height: 48, justifyContent: 'center' }, icon: { alignSelf: 'center', width: 80, height: 80, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: Colors.border, marginTop: Spacing.lg }, brandLogo: { width: 72, height: 72, borderRadius: 18 }, heading: { alignItems: 'center', gap: Spacing.sm }, card: { gap: Spacing.lg }, prototypeBadge: { alignSelf: 'center', paddingHorizontal: Spacing.sm, paddingVertical: 5, borderRadius: Spacing.chipRadius, backgroundColor: 'rgba(245,158,11,0.12)', borderWidth: 1, borderColor: Colors.severityMedium }, inputGroup: { gap: Spacing.sm }, inputWrap: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.md, borderRadius: Spacing.inputRadius, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.glassBg }, inputFocused: { borderColor: Colors.cyan, backgroundColor: Colors.cyanDim }, inputError: { borderColor: Colors.fake }, input: { flex: 1, color: Colors.textPrimary, fontSize: Typography.size.base, paddingVertical: Spacing.sm }, error: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }, errorText: { flex: 1 }, notice: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, padding: Spacing.md, borderRadius: Spacing.inputRadius, backgroundColor: 'rgba(245,158,11,0.12)', borderWidth: 1, borderColor: Colors.severityMedium }, noticeCopy: { flex: 1 }, fullButton: { width: '100%' },
});
