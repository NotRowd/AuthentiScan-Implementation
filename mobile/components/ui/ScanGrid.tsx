import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View, ViewStyle } from 'react-native';
import Colors from '../../constants/Colors';

interface ScanGridProps {
  style?: ViewStyle;
  animated?: boolean;
}

/**
 * ScanGrid
 *
 * Renders a subtle animated grid + horizontal scan-line overlay
 * used as a background texture on key screens.
 *
 * - The grid uses very low-opacity cyan lines to evoke a surveillance/radar grid.
 * - A slow-moving horizontal scan line sweeps vertically in a loop.
 * - Keeps opacity very low so it never distracts from foreground content.
 */
const ScanGrid: React.FC<ScanGridProps> = ({ style, animated = true }) => {
  const scanLineY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!animated) return;

    const loop = Animated.loop(
      Animated.timing(scanLineY, {
        toValue: 1,
        duration: 4000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    loop.start();

    return () => loop.stop();
  }, [animated, scanLineY]);

  return (
    <View style={[StyleSheet.absoluteFill, styles.container, style]} pointerEvents="none">
      {/* Vertical grid lines */}
      {[...Array(10)].map((_, i) => (
        <View
          key={`v-${i}`}
          style={[
            styles.verticalLine,
            { left: `${(i + 1) * 9}%` as unknown as number },
          ]}
        />
      ))}
      {/* Horizontal grid lines */}
      {[...Array(14)].map((_, i) => (
        <View
          key={`h-${i}`}
          style={[
            styles.horizontalLine,
            { top: `${(i + 1) * 6.5}%` as unknown as number },
          ]}
        />
      ))}
      {/* Animated scan line */}
      {animated && (
        <Animated.View
          style={[
            styles.scanLine,
            {
              transform: [
                {
                  translateY: scanLineY.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-10, 800],
                  }),
                },
              ],
            },
          ]}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
  },
  verticalLine: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: Colors.gridLine,
  },
  horizontalLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: Colors.gridLine,
  },
  scanLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: Colors.scanLine,
    shadowColor: Colors.cyan,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 6,
  },
});

export default ScanGrid;
