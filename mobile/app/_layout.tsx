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
 * - Stack navigator with the application canvas background
 * - StatusBar set to dark content for light surfaces
 */
export default function RootLayout() {
  return (
    <SafeAreaProvider><AuthProvider>
      <View style={{ flex: 1, backgroundColor: '#F6FAFD' }}>
      {OFFLINE_MODE && <SafeAreaView edges={['top']} style={{ backgroundColor: '#EAF6FF' }}>
        <Text style={{ color: '#176FB7', textAlign: 'center', padding: 6, fontSize: 11 }}>
          OFFLINE TEST MODE — no backend or real AI. Use test details only; passwords are not verified.
        </Text>
      </SafeAreaView>}
      <StatusBar style="dark" />
      <Navigation />
      </View>
    </AuthProvider></SafeAreaProvider>
  );
}

function Navigation() {
  const { isAuthenticated, isLoading, user } = useAuthContext();
  // Do not build a signed-out navigation history while restoring a saved session.
  if (isLoading) return <View style={{ flex: 1, justifyContent: 'center', backgroundColor: '#F6FAFD' }}><ActivityIndicator accessibilityLabel="Restoring session" color="#2589D8" /></View>;
  return (
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: '#F6FAFD' },
          animation: 'fade',
        }}
      >
        <Stack.Screen name="index" options={{ animation: 'none' }} />
        <Stack.Protected guard={!isAuthenticated}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
        <Stack.Protected guard={isAuthenticated && Boolean(user?.emailVerificationRequired)}>
          <Stack.Screen name="verify-email" />
        </Stack.Protected>
        <Stack.Protected guard={isAuthenticated && !user?.emailVerificationRequired}>
          {/* Swiping the tab shell must not pop back into the pre-login flow.
              Result/profile screens retain normal back gestures. */}
          <Stack.Screen name="(tabs)" options={{ gestureEnabled: false }} />
          <Stack.Screen name="result" />
          <Stack.Screen name="feedback" />
          <Stack.Screen name="edit-profile" />
          <Stack.Screen name="checkout" />
          <Stack.Screen name="change-password" />
        </Stack.Protected>
        {/* Pricing and information pages are also used from signed-in Settings. */}
        <Stack.Screen name="(public)" />
      </Stack>
  );
}
