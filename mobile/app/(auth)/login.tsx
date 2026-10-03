import React, { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import GlassCard from '../../components/ui/GlassCard';
import CyberButton from '../../components/ui/CyberButton';
import CyberText from '../../components/ui/CyberText';
import ScanGrid from '../../components/ui/ScanGrid';
import Colors from '../../constants/Colors';
import Spacing from '../../constants/Spacing';
import Typography from '../../constants/Typography';
import { useAuth } from '../../hooks/useAuth';

/**
 * Login Screen
 *
 * - Glass authentication card
 * - Lock icon header
 * - Email + Password inputs with cyan focus border
 * - Loading and error states
 * - Link to registration
 */
export default function LoginScreen() {
  const { login } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailFocused, setEmailFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);

  const handleLogin = async () => {
    setError(null);

    // Basic client-side validation
    if (!email.trim()) {
      setError('Please enter your email address.');
      return;
    }
    if (!password) {
      setError('Please enter your password.');
      return;
    }

    setIsLoading(true);
    try {
      const result = await login({ email: email.trim().toLowerCase(), password });
      if (result.error) {
        setError(result.error);
      } else {
        router.replace('/(tabs)/dashboard');
      }
    } catch (e) {
      setError('Something went wrong. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#05070D', '#0B0F1A', '#05070D']}
        style={StyleSheet.absoluteFill}
      />
      <ScanGrid animated={false} />

      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          style={styles.keyboardView}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Back button */}
            <TouchableOpacity
              onPress={() => router.back()}
              style={styles.backButton}
              accessibilityRole="button"
              accessibilityLabel="Go back"
            >
              <Ionicons name="arrow-back" size={22} color={Colors.textPrimary} />
            </TouchableOpacity>

            {/* Lock icon */}
            <View style={styles.iconContainer}>
              <View style={styles.lockIconBg}>
                <Ionicons name="lock-closed" size={36} color={Colors.cyan} />
              </View>
            </View>

            {/* Title */}
            <View style={styles.titleContainer}>
              <CyberText variant="h3" align="center">
                Welcome Back
              </CyberText>
              <CyberText variant="body" muted align="center">
                Sign in to AuthentiScan
              </CyberText>
            </View>

            {/* Auth card */}
            <GlassCard variant="strong" style={styles.card}>
              {/* Error state */}
              {error && (
                <View style={styles.errorContainer}>
                  <Ionicons
                    name="alert-circle-outline"
                    size={16}
                    color={Colors.fake}
                  />
                  <CyberText
                    variant="bodySmall"
                    color={Colors.fake}
                    style={styles.errorText}
                  >
                    {error}
                  </CyberText>
                </View>
              )}

              {/* Email field */}
              <View style={styles.inputGroup}>
                <CyberText variant="label" style={styles.inputLabel}>
                  EMAIL ADDRESS
                </CyberText>
                <View
                  style={[
                    styles.inputWrapper,
                    emailFocused && styles.inputWrapperFocused,
                    !!error && styles.inputWrapperError,
                  ]}
                >
                  <Ionicons
                    name="mail-outline"
                    size={18}
                    color={emailFocused ? Colors.cyan : Colors.textSecondary}
                    style={styles.inputIcon}
                  />
                  <TextInput
                    style={styles.input}
                    value={email}
                    onChangeText={(t) => {
                      setEmail(t);
                      setError(null);
                    }}
                    placeholder="your@email.com"
                    placeholderTextColor={Colors.textMuted}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="next"
                    onFocus={() => setEmailFocused(true)}
                    onBlur={() => setEmailFocused(false)}
                    accessibilityLabel="Email address"
                  />
                </View>
              </View>

              {/* Password field */}
              <View style={styles.inputGroup}>
                <CyberText variant="label" style={styles.inputLabel}>
                  PASSWORD
                </CyberText>
                <View
                  style={[
                    styles.inputWrapper,
                    passwordFocused && styles.inputWrapperFocused,
                  ]}
                >
                  <Ionicons
                    name="lock-closed-outline"
                    size={18}
                    color={passwordFocused ? Colors.cyan : Colors.textSecondary}
                    style={styles.inputIcon}
                  />
                  <TextInput
                    style={[styles.input, { flex: 1 }]}
                    value={password}
                    onChangeText={(t) => {
                      setPassword(t);
                      setError(null);
                    }}
                    placeholder="••••••••"
                    placeholderTextColor={Colors.textMuted}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="done"
                    onSubmitEditing={handleLogin}
                    onFocus={() => setPasswordFocused(true)}
                    onBlur={() => setPasswordFocused(false)}
                    accessibilityLabel="Password"
                  />
                  <TouchableOpacity
                    onPress={() => setShowPassword((v) => !v)}
                    style={styles.eyeButton}
                    accessibilityRole="button"
                    accessibilityLabel={
                      showPassword ? 'Hide password' : 'Show password'
                    }
                  >
                    <Ionicons
                      name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                      size={18}
                      color={Colors.textSecondary}
                    />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Login button */}
              <CyberButton
                label="Sign In"
                onPress={handleLogin}
                variant="primary"
                size="lg"
                loading={isLoading}
                disabled={isLoading}
                style={styles.loginButton}
              />

              <TouchableOpacity
                onPress={() => router.push('/(auth)/forgot-password')}
                accessibilityRole="button"
                accessibilityLabel="Forgot password"
              >
                <CyberText variant="bodySmall" align="center" color={Colors.cyan}>
                  Forgot password?
                </CyberText>
              </TouchableOpacity>
            </GlassCard>

            {/* Register link */}
            <View style={styles.registerPrompt}>
              <CyberText variant="body" muted>
                Don't have an account?
              </CyberText>
              <TouchableOpacity
                onPress={() => router.push('/(auth)/register')}
                accessibilityRole="button"
                accessibilityLabel="Create account"
              >
                <CyberText variant="body" color={Colors.cyan}>
                  {' '}Create Account
                </CyberText>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
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
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: Spacing.screenPadding,
    paddingBottom: 32,
  },
  backButton: {
    paddingTop: 8,
    paddingBottom: 8,
    alignSelf: 'flex-start',
    width: 40,
    height: 44,
    justifyContent: 'center',
  },
  iconContainer: {
    alignItems: 'center',
    marginTop: 24,
    marginBottom: 20,
  },
  lockIconBg: {
    width: 80,
    height: 80,
    borderRadius: 24,
    backgroundColor: Colors.cyanDim,
    borderWidth: 1,
    borderColor: Colors.glassBorderCyan,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleContainer: {
    alignItems: 'center',
    gap: 8,
    marginBottom: 28,
  },
  card: {
    gap: 20,
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: Colors.fakeDim,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.fake,
  },
  errorText: {
    flex: 1,
    lineHeight: 18,
  },
  inputGroup: {
    gap: 8,
  },
  inputLabel: {
    paddingLeft: 2,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: Spacing.inputRadius,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 14,
    minHeight: 50,
  },
  inputWrapperFocused: {
    borderColor: Colors.cyan,
    backgroundColor: Colors.cyanDim,
  },
  inputWrapperError: {
    borderColor: Colors.fake,
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    color: Colors.textPrimary,
    fontSize: Typography.size.base,
    paddingVertical: 12,
  },
  eyeButton: {
    padding: 6,
  },
  loginButton: {
    marginTop: 4,
  },
  registerPrompt: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 24,
  },
});
