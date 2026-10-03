import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View, ViewStyle } from 'react-native';
import Colors from '../../constants/Colors';

interface GlowEffectProps {
  children: React.ReactNode;
  color?: string;
  intensity?: 'subtle' | 'medium' | 'strong';
  pulse?: boolean;
  style?: ViewStyle;
}

/**
 * GlowEffect
 *
 * Wraps children in a pulsing glow halo.
 * Used for: scan buttons, verdict cards, shield icons, CTAs.
 *
 * The glow is created via shadow properties on a wrapper View,
 * keeping it fully compatible with Expo Go on both iOS and Android.
 */
const GlowEffect: React.FC<GlowEffectProps> = ({
  children,
  color = Colors.cyan,
  intensity = 'medium',
  pulse = true,
  style,
}) => {
  const pulseAnim = useRef(new Animated.Value(0.6)).current;

  const glowRadius = intensity === 'subtle' ? 8 : intensity === 'medium' ? 16 : 28;
  const glowOpacity = intensity === 'subtle' ? 0.2 : intensity === 'medium' ? 0.35 : 0.55;

  useEffect(() => {
    if (!pulse) return;

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1600,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0.5,
          duration: 1600,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();

    return () => loop.stop();
  }, [pulse, pulseAnim]);

  return (
    <View style={[styles.wrapper, style]}>
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          {
            borderRadius: 999,
            backgroundColor: 'transparent',
            shadowColor: color,
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: glowOpacity,
            shadowRadius: glowRadius,
            opacity: pulse ? pulseAnim : glowOpacity,
          },
        ]}
      />
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default GlowEffect;
