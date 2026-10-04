import React from 'react';
import { Image, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import GlassCard from '../../components/ui/GlassCard';
import CyberText from '../../components/ui/CyberText';
import ScanGrid from '../../components/ui/ScanGrid';
import CyberButton from '../../components/ui/CyberButton';
import Colors from '../../constants/Colors';
import Spacing from '../../constants/Spacing';
import { useAuth } from '../../hooks/useAuth';

type SettingsItem = {
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  value?: string;
  route?: '/edit-profile' | '/(public)/pricing';
};

const GROUPS: { title: string; items: SettingsItem[] }[] = [
  { title: 'ACCOUNT', items: [
    { label: 'Edit Profile', icon: 'person-outline', route: '/edit-profile' },
    { label: 'Subscription Plan', icon: 'card-outline', route: '/(public)/pricing' },
  ] },
  { title: 'PREFERENCES', items: [
    { label: 'Notifications', icon: 'notifications-outline', value: 'Coming soon' },
    { label: 'Theme', icon: 'color-palette-outline', value: 'Light' },
  ] },
  { title: 'ABOUT', items: [
    { label: 'Terms of Service', icon: 'document-text-outline' },
    { label: 'Privacy Policy', icon: 'shield-outline' },
    { label: 'App Version', icon: 'information-circle-outline', value: '1.0.0' },
  ] },
];

export default function SettingsScreen() {
  const { user, logout } = useAuth();

  const handleLogout = async () => {
    await logout();
    router.replace('/(public)/home');
  };

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#F6FAFD', '#EEF7FD', '#F6FAFD']} style={StyleSheet.absoluteFill} />
      <ScanGrid animated={false} />
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <View>
              <CyberText variant="label" color={Colors.cyan}>YOUR ACCOUNT</CyberText>
              <CyberText variant="h2" style={styles.title}>Profile & Settings</CyberText>
            </View>
            <View style={styles.headerIcon}><Ionicons name="settings-outline" size={21} color={Colors.cyan} /></View>
          </View>

          <GlassCard variant="strong" style={styles.profileCard}>
            <View style={styles.avatar}>
              {user?.avatarUri ? <Image source={{ uri: user.avatarUri }} style={styles.avatarImage} /> : <Ionicons name="person" size={28} color={Colors.cyan} />}
            </View>
            <View style={styles.profileInfo}>
              <CyberText variant="h4" numberOfLines={1}>{user?.name || 'User'}</CyberText>
              <CyberText variant="bodySmall" color={Colors.textSecondary} numberOfLines={1}>{user?.email || 'user@example.com'}</CyberText>
              <View style={styles.planBadge}><View style={styles.planDot} /><CyberText variant="caption" color={Colors.cyanAlt}>{user?.plan === 'premium' ? 'PREMIUM PLAN' : 'FREE PLAN'}</CyberText></View>
            </View>
            <TouchableOpacity onPress={() => router.push('/edit-profile')} style={styles.editIcon} accessibilityRole="button" accessibilityLabel="Edit profile">
              <Ionicons name="pencil-outline" size={18} color={Colors.cyan} />
            </TouchableOpacity>
          </GlassCard>

          {GROUPS.map((group) => (
            <View key={group.title} style={styles.group}>
              <CyberText variant="label" color={Colors.textSecondary} style={styles.groupLabel}>{group.title}</CyberText>
              <GlassCard style={styles.groupCard}>
                {group.items.map((item, index) => {
                  const content = <>
                    <View style={styles.itemLeft}>
                      <View style={[styles.itemIcon, !item.route && styles.itemIconMuted]}><Ionicons name={item.icon} size={18} color={item.route ? Colors.cyan : Colors.textSecondary} /></View>
                      <CyberText variant="body">{item.label}</CyberText>
                    </View>
                    <View style={styles.itemRight}>
                      {!!item.value && <CyberText variant="caption" color={Colors.textMuted}>{item.value}</CyberText>}
                      {!!item.route && <Ionicons name="chevron-forward" size={17} color={Colors.textMuted} />}
                    </View>
                  </>;
                  return <React.Fragment key={item.label}>
                    {item.route ? <TouchableOpacity style={styles.itemRow} onPress={() => router.push(item.route!)} accessibilityRole="button" accessibilityLabel={item.label}>{content}</TouchableOpacity> : <View style={styles.itemRow}>{content}</View>}
                    {index < group.items.length - 1 && <View style={styles.divider} />}
                  </React.Fragment>;
                })}
              </GlassCard>
            </View>
          ))}

          <CyberButton label="Log Out" onPress={handleLogout} variant="ghost" style={styles.logoutButton} textStyle={styles.logoutText} />
          <View style={{ height: Spacing.tabBarHeight + 24 }} />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgPrimary },
  safeArea: { flex: 1 },
  scrollContent: { paddingHorizontal: Spacing.screenPadding, paddingBottom: 16 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 16, paddingBottom: 20 },
  title: { marginTop: 5 },
  headerIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  profileCard: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 18, marginBottom: 26 },
  avatar: { width: 58, height: 58, borderRadius: 29, backgroundColor: Colors.cyanDim, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.glassBorderCyan, overflow: 'hidden' },
  avatarImage: { width: '100%', height: '100%' },
  profileInfo: { flex: 1, gap: 4 },
  planBadge: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 20, backgroundColor: Colors.cyanDim },
  planDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.cyan },
  editIcon: { width: 36, height: 36, borderRadius: 12, backgroundColor: Colors.cyanDim, alignItems: 'center', justifyContent: 'center' },
  group: { marginBottom: 22 },
  groupLabel: { marginBottom: 9, paddingLeft: 4, letterSpacing: 1 },
  groupCard: { padding: 0, overflow: 'hidden' },
  itemRow: { minHeight: 60, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, paddingHorizontal: 14 },
  itemLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  itemIcon: { width: 34, height: 34, borderRadius: 11, backgroundColor: Colors.cyanDim, alignItems: 'center', justifyContent: 'center' },
  itemIconMuted: { backgroundColor: Colors.bgTertiary },
  itemRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  divider: { height: 1, backgroundColor: Colors.border, marginLeft: 60 },
  logoutButton: { marginTop: 2, borderColor: Colors.fakeDim, borderWidth: 1 },
  logoutText: { color: Colors.fake },
});
