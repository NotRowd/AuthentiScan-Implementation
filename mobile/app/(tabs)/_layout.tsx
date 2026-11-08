import { Tabs, Redirect } from 'expo-router';
import { useAuth } from '../../hooks/useAuth';
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Colors from '../../constants/Colors';
import Spacing from '../../constants/Spacing';
import Typography from '../../constants/Typography';

/**
 * Tabs Layout
 *
 * Bottom navigation for authenticated users:
 * - Dashboard (home)
 * - Scan (upload image — core action)
 * - History
 * - Settings
 *
 * Uses a custom light tab bar with a prominent scan action.
 */
export default function TabsLayout() {
  const { isLoading, isAuthenticated } = useAuth();
  const insets = useSafeAreaInsets();
  if (isLoading) return null;
  if (!isAuthenticated) return <Redirect href="/(auth)/login" />;
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: [styles.tabBar, { height: Spacing.tabBarHeight + insets.bottom, paddingBottom: insets.bottom + 8 }],
        tabBarActiveTintColor: Colors.cyan,
        tabBarInactiveTintColor: Colors.textSecondary,
        tabBarLabelStyle: styles.tabBarLabel,
        tabBarItemStyle: styles.tabBarItem,
        tabBarBackground: () => (
          <View style={StyleSheet.absoluteFill}>
            <View style={styles.tabBarBg} />
          </View>
        ),
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{
          title: 'Dashboard',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home-outline" size={size} color={typeof color === 'string' ? color : Colors.textSecondary} />
          ),
        }}
      />
      <Tabs.Screen
        name="scan"
        options={{
          title: 'Scan',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="scan-outline" size={size} color={typeof color === 'string' ? color : Colors.textSecondary} />
          ),
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: 'History',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="time-outline" size={size} color={typeof color === 'string' ? color : Colors.textSecondary} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="settings-outline" size={size} color={typeof color === 'string' ? color : Colors.textSecondary} />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: 'transparent',
    borderTopWidth: 1,
    borderTopColor: Colors.glassBorder,
    height: Spacing.tabBarHeight,
    paddingBottom: 8,
    paddingTop: 4,
    elevation: 0,
    position: 'absolute',
  },
  tabBarBg: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(255,255,255,0.96)',
  },
  tabBarLabel: {
    fontSize: Typography.size.xs,
    fontWeight: Typography.weight.medium,
    letterSpacing: 0.5,
    marginTop: 2,
  },
  tabBarItem: {
    paddingTop: 4,
  },
});
