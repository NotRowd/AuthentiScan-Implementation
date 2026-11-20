import {useTheme,useThemedStyles} from '../../context/ThemeContext';
import type {ColorPalette} from '../../constants/Colors';
import {createStyles} from '../../constants/createStyles';
import { Tabs, Redirect } from 'expo-router';
import { useAuth } from '../../hooks/useAuth';
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';
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
 const {colors:Colors}=useTheme(); const styles=useThemedStyles(makeStyles);

  const { isLoading, isAuthenticated } = useAuth();
  if (isLoading) return null;
  if (!isAuthenticated) return <Redirect href="/(auth)/login" />;
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: styles.tabBar,
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
          tabBarIcon: ({ focused, size }) => (
            <Ionicons name="home-outline" size={size} color={focused ? Colors.cyan : Colors.textSecondary} />
          ),
        }}
      />
      <Tabs.Screen
        name="scan"
        options={{
          title: 'Scan',
          tabBarIcon: ({ focused }) => (
            <View style={[styles.scanTab, focused && styles.scanTabActive]}>
              <Ionicons name="scan-outline" size={26} color={focused ? Colors.bgPrimary : Colors.textSecondary} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: 'History',
          tabBarIcon: ({ focused, size }) => (
            <Ionicons name="time-outline" size={size} color={focused ? Colors.cyan : Colors.textSecondary} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ focused, size }) => (
            <Ionicons name="settings-outline" size={size} color={focused ? Colors.cyan : Colors.textSecondary} />
          ),
        }}
      />
    </Tabs>
  );
}

const makeStyles = (Colors: ColorPalette) => createStyles({
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
    backgroundColor: Colors.bgSecondary,
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
  scanTab: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: Colors.glassBgStrong,
    borderWidth: 1,
    borderColor: Colors.glassBorderCyan,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  scanTabActive: {
    backgroundColor: Colors.cyan,
    borderColor: Colors.cyan,
    shadowColor: Colors.cyan,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 8,
  },
});
