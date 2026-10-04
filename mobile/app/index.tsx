import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  Image,
  StyleSheet,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import CyberText from '../components/ui/CyberText';
import ScanGrid from '../components/ui/ScanGrid';
import GlowEffect from '../components/ui/GlowEffect';
import Colors from '../constants/Colors';
import { useAuth } from '../hooks/useAuth';

/**
 * Splash Screen (index.tsx)
 *
 * - Light AuthentiScan branded background
 * - AuthentiScan logo with cyan glow
 * - Radar sweep animation
 * - Subtle scan grid
 * - Auto-navigates after session check
 */
export default function SplashScreen() {
  const { isAuthenticated, isLoading } = useAuth();

  // Fade in animation
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.8)).current;

  // Radar sweep rotation
  const radarAnim = useRef(new Animated.Value(0)).current;

  // Outer ring pulse
  const ringScale = useRef(new Animated.Value(1)).current;
  const ringOpacity = useRef(new Animated.Value(0.6)).current;

  useEffect(() => {
    // Entrance animation
    const entrance = Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 60,
        friction: 8,
        useNativeDriver: true,
      }),
    ]);
    entrance.start();

    // Radar rotation loop
    const radar = Animated.loop(
      Animated.timing(radarAnim, {
        toValue: 1,
        duration: 2500,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    radar.start();

    // Ring pulse
    const ring = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(ringScale, {
            toValue: 1.4,
            duration: 1500,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(ringOpacity, {
            toValue: 0,
            duration: 1500,
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(ringScale, { toValue: 1, duration: 0, useNativeDriver: true }),
          Animated.timing(ringOpacity, { toValue: 0.6, duration: 0, useNativeDriver: true }),
        ]),
      ])
    );
    ring.start();
    return () => { entrance.stop(); radar.stop(); ring.stop(); };
  }, [fadeAnim, scaleAnim, radarAnim, ringScale, ringOpacity]);

  useEffect(() => {
    if (isLoading) return;

    // Navigate after splash display
    const timer = setTimeout(() => {
      if (isAuthenticated) {
        router.replace('/(tabs)/dashboard');
      } else {
        router.replace('/(public)/home');
      }
    }, 2800);

    return () => clearTimeout(timer);
  }, [isLoading, isAuthenticated]);

  const radarRotate = radarAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#F6FAFD', '#EEF7FD', '#F6FAFD']}
        locations={[0, 0.5, 1]}
        style={StyleSheet.absoluteFill}
      />
      <ScanGrid animated />

      <Animated.View
        style={[
          styles.content,
          { opacity: fadeAnim, transform: [{ scale: scaleAnim }] },
        ]}
      >
        {/* Pulsing outer ring */}
        <Animated.View
          style={[
            styles.pulseRing,
            {
              transform: [{ scale: ringScale }],
              opacity: ringOpacity,
            },
          ]}
        />

        {/* Radar sweep */}
        <Animated.View
          style={[
            styles.radarContainer,
            { transform: [{ rotate: radarRotate }] },
          ]}
        >
          <View style={styles.radarSweep} />
        </Animated.View>

        {/* Brand logo */}
        <GlowEffect color={Colors.cyan} intensity="strong" pulse>
          <Image
            source={require('../assets/AuthentiScan-Logo.png')}
            style={styles.logo}
            resizeMode="contain"
            accessibilityLabel="AuthentiScan logo"
          />
        </GlowEffect>

        {/* The logo contains the app name */}
        <View style={styles.brandingContainer}>
          <CyberText variant="label" align="center" color={Colors.cyan} style={styles.tagline}>
            AI Image Classification
          </CyberText>
        </View>

        {/* Loading indicator */}
        <View style={styles.loadingContainer}>
          <View style={styles.loadingBar}>
            <Animated.View
              style={[
                styles.loadingFill,
                {
                  transform: [{ scaleX: radarAnim }],
                },
              ]}
            />
          </View>
          <CyberText variant="system" style={styles.loadingText}>
            INITIALIZING...
          </CyberText>
        </View>
      </Animated.View>

      {/* Bottom version */}
      <View style={styles.bottomContainer}>
        <CyberText variant="caption" align="center">
          v1.0.0 · PROTOTYPE
        </CyberText>
      </View>
    </View>
  );
}

const RADAR_SIZE = 180;
const LOGO_SIZE = 184;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bgPrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
  },
  pulseRing: {
    position: 'absolute',
    width: RADAR_SIZE + 40,
    height: RADAR_SIZE + 40,
    borderRadius: (RADAR_SIZE + 40) / 2,
    borderWidth: 1.5,
    borderColor: Colors.cyan,
    backgroundColor: Colors.cyanDim,
  },
  radarContainer: {
    position: 'absolute',
    width: RADAR_SIZE,
    height: RADAR_SIZE,
    borderRadius: RADAR_SIZE / 2,
    borderWidth: 1,
    borderColor: Colors.cyanGlow,
    overflow: 'hidden',
  },
  radarSweep: {
    position: 'absolute',
    top: 0,
    left: RADAR_SIZE / 2,
    width: RADAR_SIZE / 2,
    height: RADAR_SIZE / 2,
    backgroundColor: 'transparent',
    borderTopRightRadius: RADAR_SIZE / 2,
    borderRightWidth: 0,
    // Gradient-like sweep via opacity
    opacity: 0.25,
  },
  logo: { width: LOGO_SIZE, height: LOGO_SIZE },
  brandingContainer: {
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  tagline: {
    marginTop: 4,
  },
  loadingContainer: {
    alignItems: 'center',
    gap: 8,
    marginTop: 16,
    width: 200,
  },
  loadingBar: {
    width: '100%',
    height: 2,
    backgroundColor: Colors.glassBorder,
    borderRadius: 1,
    overflow: 'hidden',
  },
  loadingFill: {
    width: '100%',
    transformOrigin: 'left center',
    height: '100%',
    backgroundColor: Colors.cyan,
    shadowColor: Colors.cyan,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 4,
  },
  loadingText: {
    fontSize: 10,
  },
  bottomContainer: {
    position: 'absolute',
    bottom: 40,
  },
});
