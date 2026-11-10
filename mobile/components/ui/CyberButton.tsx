import React, { useRef } from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  ViewStyle,
  TextStyle,
  ActivityIndicator,
} from 'react-native';
import Colors from '../../constants/Colors';
import Typography from '../../constants/Typography';
import Spacing from '../../constants/Spacing';

interface CyberButtonProps {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
}

/**
 * CyberButton
 *
 * The primary interactive element in AuthentiScan.
 * - primary: Solid cyan background (main CTAs)
 * - secondary: Glass/outlined style (secondary actions)
 * - danger: Red accent (destructive actions)
 * - ghost: Minimal, no background (tertiary links)
 */
const CyberButton: React.FC<CyberButtonProps> = ({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  style,
  textStyle,
  icon,
  iconPosition = 'left',
}) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.96,
      useNativeDriver: true,
      speed: 50,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      speed: 50,
    }).start();
  };

  const containerStyle = [
    styles.base,
    styles[`size_${size}`],
    styles[`variant_${variant}`],
    (disabled || loading) && styles.disabled,
    style,
  ];

  const labelStyle = [
    styles.label,
    styles[`label_${size}`],
    styles[`label_${variant}`],
    textStyle,
  ];

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
      <Pressable
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={disabled || loading}
        style={containerStyle}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled: disabled || loading, busy: loading }}
      >
        {loading ? (
          <ActivityIndicator
            size="small"
            color={variant === 'primary' ? Colors.textInverse : Colors.cyan}
          />
        ) : (
          <>
            {icon && iconPosition === 'left' && (
              <React.Fragment>{icon}</React.Fragment>
            )}
            <Text style={labelStyle}>{label}</Text>
            {icon && iconPosition === 'right' && (
              <React.Fragment>{icon}</React.Fragment>
            )}
          </>
        )}
      </Pressable>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: Spacing.buttonRadius,
    borderWidth: 1,
    borderColor: Colors.transparent,
  },

  // --- Sizes ---
  size_sm: { paddingVertical: 8, paddingHorizontal: 16, minHeight: 36 },
  size_md: { paddingVertical: 14, paddingHorizontal: 24, minHeight: 48 },
  size_lg: { paddingVertical: 18, paddingHorizontal: 32, minHeight: 56 },

  // --- Variants ---
  variant_primary: {
    backgroundColor: Colors.cyan,
    borderColor: Colors.cyan,
    shadowColor: Colors.cyan,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 6,
  },
  variant_secondary: {
    backgroundColor: Colors.glassBg,
    borderColor: Colors.glassBorderCyan,
  },
  variant_danger: {
    backgroundColor: Colors.fakeDim,
    borderColor: Colors.fake,
  },
  variant_ghost: {
    backgroundColor: Colors.transparent,
    borderColor: Colors.transparent,
  },

  disabled: {
    opacity: 0.45,
  },

  // --- Labels ---
  label: {
    fontWeight: Typography.weight.bold,
    letterSpacing: Typography.tracking.wider,
    textTransform: 'uppercase',
  },
  label_sm: { fontSize: Typography.size.xs },
  label_md: { fontSize: Typography.size.sm },
  label_lg: { fontSize: Typography.size.base },

  label_primary: { color: Colors.textInverse },
  label_secondary: { color: Colors.cyan },
  label_danger: { color: Colors.fake },
  label_ghost: { color: Colors.textSecondary },
});

export default CyberButton;
