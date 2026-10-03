import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
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
import Typography from '../constants/Typography';
import { useAuth } from '../hooks/useAuth';

/** Profile UI for fields supported by the active mock auth provider. */
export default function EditProfileScreen() {
  const { user, updateProfile } = useAuth();
  const [name, setName] = useState(user?.name ?? '');
  const [isFocused, setIsFocused] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => { if (!user) router.replace('/(auth)/login'); }, [user]);
  if (!user) return null;

  const cancel = () => { setName(user.name); setError(null); setSaved(false); router.back(); };
  const save = async () => {
    setError(null); setSaved(false); setIsSaving(true);
    try {
      const result = await updateProfile({ name });
      if (result.error) setError(result.error);
      else setSaved(true);
    } catch { setError("We couldn't save your profile. Please try again."); }
    finally { setIsSaving(false); }
  };

  return <View style={styles.container}>
    <LinearGradient colors={['#05070D', '#0B0F1A', '#05070D']} style={StyleSheet.absoluteFill} />
    <ScanGrid animated={false} />
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <KeyboardAvoidingView style={styles.keyboard} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.header}><TouchableOpacity onPress={cancel} style={styles.backButton} accessibilityRole="button" accessibilityLabel="Cancel profile edits"><Ionicons name="chevron-back" size={24} color={Colors.textPrimary} /></TouchableOpacity><CyberText variant="label" color={Colors.cyan}>EDIT PROFILE</CyberText><View style={styles.headerSpacer} /></View>
          <View style={styles.avatar}><Ionicons name="person" size={38} color={Colors.cyan} /></View>
          <View style={styles.heading}><CyberText variant="h3" align="center">Your profile</CyberText><CyberText variant="bodySmall" align="center">Read-only profile: the current backend has no profile-update endpoint.</CyberText></View>
          <GlassCard variant="strong" style={styles.card}>
            <View style={styles.inputGroup}><CyberText variant="label">DISPLAY NAME</CyberText><View style={[styles.inputWrap, isFocused && styles.inputFocused, !!error && styles.inputError]}><Ionicons name="person-outline" size={18} color={isFocused ? Colors.cyan : Colors.textSecondary} /><TextInput editable={false} value={name} onChangeText={(value) => { setName(value); setError(null); setSaved(false); }} style={styles.input} placeholder="Your name" placeholderTextColor={Colors.textMuted} autoCapitalize="words" onFocus={() => setIsFocused(true)} onBlur={() => setIsFocused(false)} returnKeyType="done" onSubmitEditing={save} accessibilityLabel="Display name" /></View></View>
            <View style={styles.inputGroup}><CyberText variant="label">EMAIL ADDRESS</CyberText><View style={styles.lockedField} accessibilityLabel="Email address is managed by your authentication provider"><Ionicons name="mail-outline" size={18} color={Colors.textSecondary} /><CyberText variant="bodySmall" style={styles.lockedText}>{user.email}</CyberText><Ionicons name="lock-closed-outline" size={16} color={Colors.textMuted} /></View><CyberText variant="caption">Email changes are not supported by the current authentication provider.</CyberText></View>
            {error && <View style={styles.error}><Ionicons name="alert-circle-outline" size={17} color={Colors.fake} /><CyberText variant="bodySmall" color={Colors.fake} style={styles.errorText}>{error}</CyberText></View>}
            {saved && <View style={styles.success} accessibilityLiveRegion="polite"><Ionicons name="checkmark-circle" size={18} color={Colors.authentic} /><CyberText variant="bodySmall" color={Colors.authentic}>Profile saved on this device.</CyberText></View>}
            <CyberButton label="Profile editing unavailable" onPress={save} loading={isSaving} disabled={true} style={styles.fullButton} />
            <CyberButton label="Cancel" onPress={cancel} variant="secondary" style={styles.fullButton} />
          </GlassCard>
          <GlassCard variant="subtle" style={styles.notice}><Ionicons name="flask-outline" size={18} color={Colors.severityMedium} /><CyberText variant="caption" style={styles.noticeCopy}>Profile updates are disabled to match the current backend. Offline test details do not synchronize with web accounts.</CyberText></GlassCard>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  </View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgPrimary }, safeArea: { flex: 1 }, keyboard: { flex: 1 }, content: { flexGrow: 1, paddingHorizontal: Spacing.screenPadding, paddingBottom: Spacing['3xl'], gap: Spacing.lg }, header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: Spacing.md }, backButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }, headerSpacer: { width: 36 }, avatar: { width: 84, height: 84, borderRadius: 42, alignSelf: 'center', alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.cyanDim, borderWidth: 1, borderColor: Colors.glassBorderCyan }, heading: { alignItems: 'center', gap: Spacing.sm }, card: { gap: Spacing.lg }, inputGroup: { gap: Spacing.sm }, inputWrap: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.md, borderWidth: 1, borderRadius: Spacing.inputRadius, borderColor: Colors.border, backgroundColor: Colors.glassBg }, inputFocused: { borderColor: Colors.cyan, backgroundColor: Colors.cyanDim }, inputError: { borderColor: Colors.fake }, input: { flex: 1, color: Colors.textPrimary, fontSize: Typography.size.base, paddingVertical: Spacing.sm }, lockedField: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.md, borderWidth: 1, borderRadius: Spacing.inputRadius, borderColor: Colors.border, backgroundColor: Colors.bgTertiary }, lockedText: { flex: 1 }, error: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }, errorText: { flex: 1 }, success: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.sm, borderRadius: Spacing.sm, backgroundColor: Colors.authenticDim }, fullButton: { width: '100%' }, notice: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm }, noticeCopy: { flex: 1 },
});
