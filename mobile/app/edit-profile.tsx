import {useTheme,useThemedStyles} from '../context/ThemeContext';
import type {ColorPalette} from '../constants/Colors';
import {createStyles} from '../constants/createStyles';
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
import Spacing from '../constants/Spacing';
import Typography from '../constants/Typography';
import { OFFLINE_MODE } from '../services/api/config';
import { useAuth } from '../hooks/useAuth';

export default function EditProfileScreen() {
 const {colors:Colors}=useTheme(); const styles=useThemedStyles(makeStyles);

  const { user, updateProfile } = useAuth();
  const [firstName, setFirstName] = useState(user?.firstName ?? '');
  const [lastName, setLastName] = useState(user?.lastName ?? '');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => { if (!user) router.replace('/(auth)/login'); }, [user]);
  if (!user) return null;

  const cancel = () => router.back();
  const save = async () => {
    setError(null); setSaved(false); setIsSaving(true);
    try {
      const result = await updateProfile({ firstName, lastName });
      if (result.error) setError(result.error);
      else setSaved(true);
    } catch { setError("We couldn't save your profile. Please try again."); }
    finally { setIsSaving(false); }
  };

  return <View style={styles.container}>
    <LinearGradient colors={[Colors.bgPrimary, Colors.bgTertiary, Colors.bgPrimary]} style={StyleSheet.absoluteFill} />
    <ScanGrid animated={false} />
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <KeyboardAvoidingView style={styles.keyboard} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.header}><TouchableOpacity onPress={cancel} style={styles.backButton} accessibilityRole="button" accessibilityLabel="Cancel profile edits"><Ionicons name="chevron-back" size={24} color={Colors.textPrimary} /></TouchableOpacity><CyberText variant="label" color={Colors.cyan}>EDIT PROFILE</CyberText><View style={styles.headerSpacer} /></View>
          <View style={styles.avatar}><Ionicons name="person" size={38} color={Colors.cyan} /></View>
          <View style={styles.heading}><CyberText variant="h3" align="center">Your profile</CyberText><CyberText variant="bodySmall" align="center">Update the name shown on your account.</CyberText></View>
          <GlassCard variant="strong" style={styles.card}>
            <View style={styles.inputGroup}>
              <CyberText variant="label">FIRST NAME</CyberText>
              <View style={styles.inputWrap}>
                <TextInput editable={!OFFLINE_MODE && !isSaving} value={firstName} onChangeText={setFirstName}
                  style={styles.input} maxLength={100} autoCapitalize="words" accessibilityLabel="First name" />
              </View>
            </View>
            <View style={styles.inputGroup}>
              <CyberText variant="label">LAST NAME</CyberText>
              <View style={styles.inputWrap}>
                <TextInput editable={!OFFLINE_MODE && !isSaving} value={lastName} onChangeText={setLastName}
                  style={styles.input} maxLength={100} autoCapitalize="words" accessibilityLabel="Last name" />
              </View>
            </View>
            <View style={styles.inputGroup}><CyberText variant="label">EMAIL ADDRESS</CyberText><View style={styles.lockedField} accessibilityLabel="Email address is managed by your authentication provider"><Ionicons name="mail-outline" size={18} color={Colors.textSecondary} /><CyberText variant="bodySmall" style={styles.lockedText}>{user.email}</CyberText><Ionicons name="lock-closed-outline" size={16} color={Colors.textMuted} /></View><CyberText variant="caption">Email changes are not supported by the current authentication provider.</CyberText></View>
            {error && <View style={styles.error}><Ionicons name="alert-circle-outline" size={17} color={Colors.fake} /><CyberText variant="bodySmall" color={Colors.fake} style={styles.errorText}>{error}</CyberText></View>}
            {saved && <View style={styles.success} accessibilityLiveRegion="polite"><Ionicons name="checkmark-circle" size={18} color={Colors.authentic} /><CyberText variant="bodySmall" color={Colors.authentic}>Profile saved.</CyberText></View>}
            <CyberButton label="Save profile" onPress={save} loading={isSaving} disabled={OFFLINE_MODE || isSaving} style={styles.fullButton} />
            <CyberButton label="Cancel" onPress={cancel} variant="secondary" style={styles.fullButton} />
          </GlassCard>
          <GlassCard variant="subtle" style={styles.notice}><Ionicons name="flask-outline" size={18} color={Colors.severityMedium} /><CyberText variant="caption" style={styles.noticeCopy}>{OFFLINE_MODE ? "Profile editing requires a connected account." : "Profile changes are shared with the website."}</CyberText></GlassCard>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  </View>;
}

const makeStyles = (Colors: ColorPalette) => createStyles({
  container: { flex: 1, backgroundColor: Colors.bgPrimary }, safeArea: { flex: 1 }, keyboard: { flex: 1 }, content: { flexGrow: 1, paddingHorizontal: Spacing.screenPadding, paddingBottom: Spacing['3xl'], gap: Spacing.lg }, header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: Spacing.md }, backButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }, headerSpacer: { width: 36 }, avatar: { width: 84, height: 84, borderRadius: 42, alignSelf: 'center', alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.cyanDim, borderWidth: 1, borderColor: Colors.glassBorderCyan }, heading: { alignItems: 'center', gap: Spacing.sm }, card: { gap: Spacing.lg }, inputGroup: { gap: Spacing.sm }, inputWrap: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.md, borderWidth: 1, borderRadius: Spacing.inputRadius, borderColor:Colors.control, backgroundColor: Colors.glassBg }, input: { flex: 1, color: Colors.textPrimary, fontSize: Typography.size.base, paddingVertical: Spacing.sm }, lockedField: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.md, borderWidth: 1, borderRadius: Spacing.inputRadius, borderColor: Colors.border, backgroundColor: Colors.bgTertiary }, lockedText: { flex: 1 }, error: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }, errorText: { flex: 1 }, success: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.sm, borderRadius: Spacing.sm, backgroundColor: Colors.authenticDim }, fullButton: { width: '100%' }, notice: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm }, noticeCopy: { flex: 1 },
});
