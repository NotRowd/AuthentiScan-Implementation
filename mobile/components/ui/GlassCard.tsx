import React from 'react';
import { StyleSheet, View, ViewProps, ViewStyle } from 'react-native';
import Colors from '../../constants/Colors';
import Spacing from '../../constants/Spacing';

interface GlassCardProps extends ViewProps {
  /** Extra styles applied to the outer container. */
  style?: ViewStyle | ViewStyle[];
  /** Controls the background opacity tier. Default: 'normal' */
  variant?: 'normal' | 'strong' | 'subtle';
  /** Highlight the border in cyan to indicate active/focused state. */
  active?: boolean;
  children: React.ReactNode;
}

/**
 * GlassCard
 *
 * The core glassmorphism container used throughout AuthentiScan.
 * Uses semi-transparent dark backgrounds with a thin border to create
 * a frosted-panel effect layered over the dark background.
 *
 * Note: expo-blur is not used here to maximise Expo Go compatibility
 * across platforms. The glass effect is achieved via semi-transparent
 * backgrounds and border highlights.
 */
const GlassCard: React.FC<GlassCardProps> = ({
  style,
  variant = 'normal',
  active = false,
  children,
  ...rest
}) => {
  const bgColor =
    variant === 'strong'
      ? Colors.glassBgStrong
      : variant === 'subtle'
        ? '#F8FBFE'
        : Colors.glassBg;

  const borderColor = active ? Colors.glassBorderCyan : Colors.glassBorder;

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: bgColor, borderColor },
        style,
      ]}
      {...rest}
    >
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: Spacing.cardRadius,
    borderWidth: 1,
    padding: Spacing.cardPadding,
    // Subtle shadow for depth
    shadowColor: '#18476B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
});

export default GlassCard;
