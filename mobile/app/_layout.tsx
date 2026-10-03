import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View, Text } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { AuthProvider, useAuthContext } from '../context/AuthContext';
import { OFFLINE_MODE } from '../services/api/config';

/**
 * Root Layout
 *
 * Wraps the entire application with:
 * - AuthProvider (authentication state)
 * - Stack navigator with dark background
 * - StatusBar set to light content
 */
export default function RootLayout() {
  return (
    <SafeAreaProvider><AuthProvider>
      <View style={{ flex: 1, backgroundColor: '#05070D' }}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: '#17243a' }}>
        <Text style={{ color: '#ffd277', textAlign: 'center', padding: 6, fontSize: 11 }}>
          {OFFLINE_MODE ? 'OFFLINE TEST MODE — no backend or real AI. Use test details only; passwords are not verified.' : 'BACKEND MODE — uploads are saved to your account. AI availability depends on the server.'}
        </Text>
      </SafeAreaView>
      <StatusBar style="light" />
      <Navigation />
      </View>
    </AuthProvider></SafeAreaProvider>
  );
}

function Navigation() {
  const { isAuthenticated, isLoading } = useAuthContext();
  // Do not build a signed-out navigation history while restoring a saved session.
  if (isLoading) return <View style={{ flex: 1, justifyContent: 'center' }}><ActivityIndicator accessibilityLabel="Restoring session" color="#00d9f5" /></View>;
  return (
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: '#05070D' },
          animation: 'fade',
        }}
      >
        <Stack.Protected guard={!isAuthenticated}>
          <Stack.Screen name="index" options={{ animation: 'none' }} />
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
        <Stack.Protected guard={isAuthenticated}>
          {/* Swiping the tab shell must not pop back into the pre-login flow.
              Result/profile screens retain normal back gestures. */}
          <Stack.Screen name="(tabs)" options={{ gestureEnabled: false }} />
          <Stack.Screen name="result" />
          <Stack.Screen name="feedback" />
          <Stack.Screen name="edit-profile" />
        </Stack.Protected>
        {/* Pricing and information pages are also used from signed-in Settings. */}
        <Stack.Screen name="(public)" />
      </Stack>
  );
}
