import React, { useState } from 'react';
import {
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

// ─── Password strength ────────────────────────────────────────────────────────

type PasswordStrength = 'none' | 'weak' | 'fair' | 'strong' | 'very-strong';

function getPasswordStrength(password: string): PasswordStrength {
  if (!password) return 'none';
  if (password.length < 8) return 'weak';
  let score = 0;
  if (password.length >= 8) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;
  if (score <= 1) return 'fair';
  if (score === 2) return 'fair';
  if (score === 3) return 'strong';
  return 'very-strong';
}

const STRENGTH_CONFIG: Record<
  PasswordStrength,
  { label: string; color: string; bars: number }
> = {
  none: { label: '', color: Colors.border, bars: 0 },
  weak: { label: 'Weak', color: Colors.fake, bars: 1 },
  fair: { label: 'Fair', color: Colors.severityMedium, bars: 2 },
  strong: { label: 'Strong', color: Colors.cyanAlt, bars: 3 },
  'very-strong': { label: 'Very Strong', color: Colors.authentic, bars: 4 },
};

/**
 * Register Screen
 *
 * - Glass form card
 * - Name / Email / Password / Confirm Password
 * - Password strength indicator
 * - Shield icon visual feedback
 * - Form validation
 */
export default function RegisterScreen() {
  const { register } = useAuth();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [focused, setFocused] = useState<string | null>(null);

  const passwordStrength = getPasswordStrength(password);
  const strengthConfig = STRENGTH_CONFIG[passwordStrength];

  const handleRegister = async () => {
    setError(null);

    if (!firstName.trim() || !lastName.trim()) {
      setError('Please enter your first and last name.');
      return;
    }
    if (!email.trim() || !email.includes('@')) {
      setError('Please enter a valid email address.');
      return;
    }
    if (passwordStrength === 'weak' || passwordStrength === 'none') {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setIsLoading(true);
    try {
      const result = await register({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim().toLowerCase(),
        password,
      });
      if (result.error) {
        setError(result.error);
      } else {
        router.replace('/(tabs)/dashboard');
      }
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const inputWrapperStyle = (field: string) => [
    styles.inputWrapper,
    focused === field && styles.inputWrapperFocused,
    !!error && styles.inputWrapperErrorBorder,
  ];

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

            {/* Shield icon */}
            <View style={styles.iconContainer}>
              <View
                style={[
                  styles.shieldIconBg,
                  passwordStrength === 'very-strong' && styles.shieldIconActive,
                ]}
              >
                <Ionicons
                  name={
                    passwordStrength === 'very-strong' || passwordStrength === 'strong'
                      ? 'shield-checkmark'
                      : 'shield-outline'
                  }
                  size={36}
                  color={
                    passwordStrength === 'very-strong'
                      ? Colors.authentic
                      : passwordStrength === 'strong'
                        ? Colors.cyan
                        : Colors.textSecondary
                  }
                />
              </View>
            </View>

            {/* Title */}
            <View style={styles.titleContainer}>
              <CyberText variant="h3" align="center">
                Create Account
              </CyberText>
              <CyberText variant="body" muted align="center">
                Join AuthentiScan
              </CyberText>
            </View>

            {/* Form card */}
            <GlassCard variant="strong" style={styles.card}>
              {/* Error state */}
              {error && (
                <View style={styles.errorContainer}>
                  <Ionicons name="alert-circle-outline" size={16} color={Colors.fake} />
                  <CyberText variant="bodySmall" color={Colors.fake} style={styles.errorText}>
                    {error}
                  </CyberText>
                </View>
              )}

              {/* Name */}
              <View style={styles.inputGroup}>
                <CyberText variant="label" style={styles.inputLabel}>
                  FIRST NAME
                </CyberText>
                <View style={inputWrapperStyle('name')}>
                  <Ionicons
                    name="person-outline"
                    size={18}
                    color={focused === 'name' ? Colors.cyan : Colors.textSecondary}
                    style={styles.inputIcon}
                  />
                  <TextInput
                    style={styles.input}
                    value={firstName}
                    onChangeText={(t) => { setFirstName(t); setError(null); }}
                    placeholder="First name"
                    placeholderTextColor={Colors.textMuted}
                    autoCapitalize="words"
                    returnKeyType="next"
                    onFocus={() => setFocused('name')}
                    onBlur={() => setFocused(null)}
                    accessibilityLabel="First name"
                  />
                </View>
              </View>

              <View style={styles.inputGroup}>
                <CyberText variant="label" style={styles.inputLabel}>LAST NAME</CyberText>
                <View style={inputWrapperStyle('lastName')}>
                  <TextInput style={styles.input} value={lastName} onChangeText={setLastName}
                    placeholder="Last name" placeholderTextColor={Colors.textMuted} autoCapitalize="words"
                    onFocus={() => setFocused('lastName')} onBlur={() => setFocused(null)} accessibilityLabel="Last name" />
                </View>
              </View>
              {/* Email */}
              <View style={styles.inputGroup}>
                <CyberText variant="label" style={styles.inputLabel}>
                  EMAIL ADDRESS
                </CyberText>
                <View style={inputWrapperStyle('email')}>
                  <Ionicons
                    name="mail-outline"
                    size={18}
                    color={focused === 'email' ? Colors.cyan : Colors.textSecondary}
                    style={styles.inputIcon}
                  />
                  <TextInput
                    style={styles.input}
                    value={email}
                    onChangeText={(t) => { setEmail(t); setError(null); }}
                    placeholder="your@email.com"
                    placeholderTextColor={Colors.textMuted}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="next"
                    onFocus={() => setFocused('email')}
                    onBlur={() => setFocused(null)}
                    accessibilityLabel="Email address"
                  />
                </View>
              </View>

              {/* Password */}
              <View style={styles.inputGroup}>
                <CyberText variant="label" style={styles.inputLabel}>
                  PASSWORD
                </CyberText>
                <View style={inputWrapperStyle('password')}>
                  <Ionicons
                    name="lock-closed-outline"
                    size={18}
                    color={focused === 'password' ? Colors.cyan : Colors.textSecondary}
                    style={styles.inputIcon}
                  />
                  <TextInput
                    style={[styles.input, { flex: 1 }]}
                    value={password}
                    onChangeText={(t) => { setPassword(t); setError(null); }}
                    placeholder="Min. 8 characters"
                    placeholderTextColor={Colors.textMuted}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="next"
                    onFocus={() => setFocused('password')}
                    onBlur={() => setFocused(null)}
                    accessibilityLabel="Password"
                  />
                  <TouchableOpacity
                    onPress={() => setShowPassword((v) => !v)}
                    style={styles.eyeButton}
                    accessibilityRole="button"
                    accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                  >
                    <Ionicons
                      name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                      size={18}
                      color={Colors.textSecondary}
                    />
                  </TouchableOpacity>
                </View>

                {/* Password strength indicator */}
                {password.length > 0 && (
                  <View style={styles.strengthContainer}>
                    <View style={styles.strengthBars}>
                      {[1, 2, 3, 4].map((bar) => (
                        <View
                          key={bar}
                          style={[
                            styles.strengthBar,
                            {
                              backgroundColor:
                                bar <= strengthConfig.bars
                                  ? strengthConfig.color
                                  : Colors.border,
                            },
                          ]}
                        />
                      ))}
                    </View>
                    {strengthConfig.label ? (
                      <CyberText
                        variant="caption"
                        color={strengthConfig.color}
                      >
                        {strengthConfig.label}
                      </CyberText>
                    ) : null}
                  </View>
                )}
              </View>

              {/* Confirm password */}
              <View style={styles.inputGroup}>
                <CyberText variant="label" style={styles.inputLabel}>
                  CONFIRM PASSWORD
                </CyberText>
                <View
                  style={[
                    ...inputWrapperStyle('confirm'),
                    confirmPassword.length > 0 &&
                      confirmPassword !== password &&
                      styles.inputWrapperErrorBorder,
                  ]}
                >
                  <Ionicons
                    name="lock-closed-outline"
                    size={18}
                    color={
                      focused === 'confirm' ? Colors.cyan : Colors.textSecondary
                    }
                    style={styles.inputIcon}
                  />
                  <TextInput
                    style={[styles.input, { flex: 1 }]}
                    value={confirmPassword}
                    onChangeText={(t) => { setConfirmPassword(t); setError(null); }}
                    placeholder="Re-enter password"
                    placeholderTextColor={Colors.textMuted}
                    secureTextEntry={!showConfirmPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="done"
                    onSubmitEditing={handleRegister}
                    onFocus={() => setFocused('confirm')}
                    onBlur={() => setFocused(null)}
                    accessibilityLabel="Confirm password"
                  />
                  <TouchableOpacity
                    onPress={() => setShowConfirmPassword((v) => !v)}
                    style={styles.eyeButton}
                    accessibilityRole="button"
                    accessibilityLabel={
                      showConfirmPassword ? 'Hide password' : 'Show password'
                    }
                  >
                    <Ionicons
                      name={showConfirmPassword ? 'eye-off-outline' : 'eye-outline'}
                      size={18}
                      color={Colors.textSecondary}
                    />
                  </TouchableOpacity>
                </View>
                {confirmPassword.length > 0 && confirmPassword !== password && (
                  <CyberText variant="caption" color={Colors.fake}>
                    Passwords do not match
                  </CyberText>
                )}
              </View>

              {/* Register button */}
              <CyberButton
                label="Create Account"
                onPress={handleRegister}
                variant="primary"
                size="lg"
                loading={isLoading}
                disabled={isLoading}
                style={styles.registerButton}
              />

              <CyberText variant="caption" align="center" muted>
                By creating an account, you agree to our Terms of Service.
              </CyberText>
            </GlassCard>

            {/* Login link */}
            <View style={styles.loginPrompt}>
              <CyberText variant="body" muted>
                Already have an account?
              </CyberText>
              <TouchableOpacity
                onPress={() => router.push('/(auth)/login')}
                accessibilityRole="button"
                accessibilityLabel="Sign in"
              >
                <CyberText variant="body" color={Colors.cyan}>
                  {' '}Sign In
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
    paddingBottom: 40,
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
    marginTop: 16,
    marginBottom: 16,
  },
  shieldIconBg: {
    width: 80,
    height: 80,
    borderRadius: 24,
    backgroundColor: Colors.glassBg,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shieldIconActive: {
    backgroundColor: Colors.authenticDim,
    borderColor: Colors.authentic,
  },
  titleContainer: {
    alignItems: 'center',
    gap: 8,
    marginBottom: 24,
  },
  card: {
    gap: 18,
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
  inputWrapperErrorBorder: {
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
  strengthContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  strengthBars: {
    flexDirection: 'row',
    gap: 4,
    flex: 1,
  },
  strengthBar: {
    flex: 1,
    height: 3,
    borderRadius: 2,
  },
  registerButton: {
    marginTop: 4,
  },
  loginPrompt: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 24,
  },
});
