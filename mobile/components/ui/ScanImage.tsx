import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, View, type ImageStyle, type StyleProp } from 'react-native';
import CyberText from './CyberText';
import { loadMediaSource } from '../../services/api/media';
import { onSessionCleared } from '../../services/api/session';
type Props = { uri: string; heatmap?: boolean; style: StyleProp<ImageStyle>; label?: string };
export default function ScanImage({ uri, heatmap = false, style, label = 'Scan image' }: Props) {
  const [source, setSource] = useState<Awaited<ReturnType<typeof loadMediaSource>>>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    const unsubscribe = onSessionCleared(() => { active = false; controller.abort(); setSource(null); setFailed(true); });
    setSource(null); setFailed(false);
    loadMediaSource(uri, heatmap, controller.signal).then(value => { if (active) { setSource(value); setFailed(!value); } })
      .catch(() => { if (active) setFailed(true); })
      .finally(() => clearTimeout(timeout));
    return () => { active = false; clearTimeout(timeout); controller.abort(); unsubscribe(); };
  }, [uri, heatmap, attempt]);
  // Protected images were fetched with auth and are displayed from an in-memory URI.
  return <View style={[style, styles.frame]}>
    {failed ? <Pressable style={styles.placeholder} accessibilityRole="button" accessibilityLabel={'Retry ' + label}
      onPress={(event) => { event.stopPropagation(); setAttempt(value => value + 1); }}>
      <CyberText variant="caption" align="center" numberOfLines={3}>Image unavailable. Tap to retry.</CyberText>
    </Pressable> : !source ? <View style={styles.placeholder}><ActivityIndicator /></View> :
      <Image key={attempt} source={source} style={styles.image}
        resizeMode={StyleSheet.flatten(style)?.resizeMode ?? 'cover'}
        accessibilityLabel={label} onError={() => {
          if (__DEV__) console.debug('Scan image could not be decoded.');
          setFailed(true);
        }} />}
  </View>;
}
const styles = StyleSheet.create({
  frame: { flexShrink: 0, overflow: 'hidden' },
  image: { width: '100%', height: '100%' },
  placeholder: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 3 },
});
