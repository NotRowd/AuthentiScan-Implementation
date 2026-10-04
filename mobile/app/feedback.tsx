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
import { getLatestScanResult } from '../services/scan/scanSession';
import { feedbackService } from '../services/feedback/feedbackService';
import type { FeedbackRating } from '../types';

export default function FeedbackScreen() {
  const result = getLatestScanResult();
  const [rating, setRating] = useState<FeedbackRating | null>(null);
  const [comment, setComment] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { if (!result) router.replace('/(tabs)/history'); }, [result]);
  if (!result) return null;

  const saveFeedback = async () => {
    if (!rating) { setError('Choose a rating before saving your feedback.'); return; }
    setIsSaving(true); setError(null);
    try {
      await feedbackService.save({ scanId: result.id, rating, comment: comment.trim() || undefined });
      setSaved(true);
    } catch { setError("We couldn't save your feedback on this device. Please try again."); }
    finally { setIsSaving(false); }
  };

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#F6FAFD', '#EEF7FD', '#F6FAFD']} style={StyleSheet.absoluteFill} />
      <ScanGrid animated={false} />
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <KeyboardAvoidingView style={styles.keyboard} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backButton} accessibilityRole="button" accessibilityLabel="Go back"><Ionicons name="chevron-back" size={24} color={Colors.textPrimary} /></TouchableOpacity>
            <View style={styles.heading}><View style={styles.icon}><Ionicons name="chatbubble-ellipses-outline" size={30} color={Colors.cyan} /></View><CyberText variant="h3" align="center">Rate this result</CyberText><CyberText variant="bodySmall" align="center">Tell us whether this report was useful.</CyberText></View>
            {saved ? (
              <GlassCard variant="strong" style={styles.savedCard} active><Ionicons name="checkmark-circle" size={42} color={Colors.authentic} /><CyberText variant="h4" align="center">Feedback saved</CyberText><CyberText variant="bodySmall" align="center">Your feedback was saved only on this device. It was not sent to a server.</CyberText><CyberButton label="Back to report" onPress={() => router.back()} size="sm" /></GlassCard>
            ) : (
              <GlassCard variant="strong" style={styles.card}>
                <CyberText variant="label" color={Colors.cyan}>USEFULNESS RATING</CyberText>
                <View style={styles.stars}>{[1, 2, 3, 4, 5].map((value) => <TouchableOpacity key={value} onPress={() => { setRating(value as FeedbackRating); setError(null); }} style={styles.starButton} accessibilityRole="button" accessibilityLabel={`${value} star rating`}><Ionicons name={rating && value <= rating ? 'star' : 'star-outline'} size={34} color={rating && value <= rating ? Colors.cyan : Colors.textMuted} /></TouchableOpacity>)}</View>
                <CyberText variant="caption" align="center">{rating ? `${rating} of 5 selected` : 'Select one to five stars'}</CyberText>
                <View style={styles.inputGroup}><CyberText variant="label">OPTIONAL COMMENT</CyberText><TextInput value={comment} onChangeText={setComment} multiline maxLength={500} placeholder="What could make this report clearer?" placeholderTextColor={Colors.textMuted} style={styles.input} accessibilityLabel="Feedback comment" /></View>
                {error && <View style={styles.error}><Ionicons name="alert-circle-outline" size={17} color={Colors.fake} /><CyberText variant="bodySmall" color={Colors.fake} style={styles.errorText}>{error}</CyberText></View>}
                <CyberButton label="Save feedback locally" onPress={saveFeedback} loading={isSaving} disabled={isSaving} style={styles.fullButton} />
                <CyberText variant="caption" align="center">Feedback sending is not connected in this prototype.</CyberText>
              </GlassCard>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgPrimary }, safeArea: { flex: 1 }, keyboard: { flex: 1 }, content: { flexGrow: 1, padding: Spacing.screenPadding, paddingBottom: Spacing['3xl'], gap: Spacing.lg }, backButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', marginLeft: -Spacing.sm },
  heading: { alignItems: 'center', gap: Spacing.sm }, icon: { width: 68, height: 68, borderRadius: 34, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.cyanDim, borderWidth: 1, borderColor: Colors.glassBorderCyan }, card: { gap: Spacing.md }, stars: { flexDirection: 'row', justifyContent: 'center', gap: 4 }, starButton: { padding: 4 }, inputGroup: { gap: Spacing.sm }, input: { minHeight: 120, borderRadius: Spacing.inputRadius, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.glassBg, color: Colors.textPrimary, padding: Spacing.md, textAlignVertical: 'top' }, error: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'center' }, errorText: { flex: 1 }, fullButton: { width: '100%' }, savedCard: { alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.xl },
});
