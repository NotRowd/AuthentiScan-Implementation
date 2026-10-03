import React from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
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

/**
 * Settings Screen
 *
 * User profile and app settings.
 */
export default function SettingsScreen() {
  const { user, logout } = useAuth();

  const handleLogout = async () => {
    await logout();
    router.replace('/(public)/home');
  };

  const SETTINGS_GROUPS = [
    {
      title: 'ACCOUNT',
      items: [
        { label: 'Edit Profile', icon: 'person-outline' as const },
        { label: 'Subscription Plan', icon: 'card-outline' as const },
      ],
    },
    {
      title: 'PREFERENCES',
      items: [
        { label: 'Notifications', icon: 'notifications-outline' as const },
        { label: 'Theme', icon: 'color-palette-outline' as const, value: 'Dark' },
      ],
    },
    {
      title: 'ABOUT',
      items: [
        { label: 'Terms of Service', icon: 'document-text-outline' as const },
        { label: 'Privacy Policy', icon: 'shield-outline' as const },
        { label: 'App Version', icon: 'information-circle-outline' as const, value: '1.0.0' },
      ],
    },
  ];

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#05070D', '#0B0F1A', '#05070D']}
        style={StyleSheet.absoluteFill}
      />
      <ScanGrid animated={false} />

      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.header}>
          <CyberText variant="label" color={Colors.cyan}>
            SETTINGS
          </CyberText>
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Profile Card */}
          <GlassCard style={styles.profileCard}>
            <View style={styles.avatar}>
              <Ionicons name="person" size={32} color={Colors.cyan} />
            </View>
            <View style={styles.profileInfo}>
              <CyberText variant="h4">{user?.name || 'User'}</CyberText>
              <CyberText variant="bodySmall" color={Colors.textSecondary}>
                {user?.email || 'user@example.com'}
              </CyberText>
            </View>
            <View style={styles.planBadge}>
              <CyberText variant="caption" color={Colors.bgPrimary}>
                {user?.plan === 'premium' ? 'PREMIUM' : 'FREE'}
              </CyberText>
            </View>
          </GlassCard>

          {/* Settings Groups */}
          {SETTINGS_GROUPS.map((group, idx) => (
            <View key={idx} style={styles.group}>
              <CyberText variant="label" style={styles.groupLabel}>
                {group.title}
              </CyberText>
              <GlassCard style={styles.groupCard}>
                {group.items.map((item, itemIdx) => (
                  <React.Fragment key={item.label}>
                    <TouchableOpacity
                      style={styles.itemRow}
                      onPress={item.label === 'Edit Profile' ? () => router.push('/edit-profile') : item.label === 'Subscription Plan' ? () => router.push('/(public)/pricing') : undefined}
                      accessibilityRole="button"
                      accessibilityLabel={item.label}
                    >
                      <View style={styles.itemLeft}>
                        <Ionicons name={item.icon} size={20} color={Colors.textSecondary} />
                        <CyberText variant="body">{item.label}</CyberText>
                      </View>
                      <View style={styles.itemRight}>
                        {'value' in item && item.value && (
                          <CyberText variant="bodySmall" color={Colors.textMuted} style={{ marginRight: 8 }}>
                            {item.value}
                          </CyberText>
                        )}
                        <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
                      </View>
                    </TouchableOpacity>
                    {itemIdx < group.items.length - 1 && (
                      <View style={styles.divider} />
                    )}
                  </React.Fragment>
                ))}
              </GlassCard>
            </View>
          ))}

          <CyberButton
            label="Log Out"
            onPress={handleLogout}
            variant="ghost"
            style={styles.logoutButton}
            textStyle={{ color: Colors.fake }}
          />

          <View style={{ height: Spacing.tabBarHeight + 32 }} />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bgPrimary,
  },
  safeArea: {
    flex: 1,
  },
  header: {
    paddingHorizontal: Spacing.screenPadding,
    paddingTop: 16,
    paddingBottom: 12,
  },
  scrollContent: {
    paddingHorizontal: Spacing.screenPadding,
    paddingBottom: 16,
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingVertical: 20,
    marginBottom: 24,
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: Colors.cyanDim,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.glassBorderCyan,
  },
  profileInfo: {
    flex: 1,
    gap: 4,
  },
  planBadge: {
    backgroundColor: Colors.cyan,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  group: {
    marginBottom: 24,
  },
  groupLabel: {
    marginBottom: 8,
    paddingLeft: 4,
  },
  groupCard: {
    padding: 0,
    overflow: 'hidden',
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  itemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  itemRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginLeft: 48,
  },
  logoutButton: {
    marginTop: 8,
    borderColor: Colors.fakeDim,
    borderWidth: 1,
  },
});
