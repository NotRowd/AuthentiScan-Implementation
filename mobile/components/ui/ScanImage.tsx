import {useTheme,useThemedStyles} from '../../context/ThemeContext';
import type {ColorPalette} from '../../constants/Colors';
import {createStyles} from '../../constants/createStyles';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, View, type ImageStyle, type StyleProp } from 'react-native';
import CyberText from './CyberText';
import { loadMediaSource } from '../../services/api/media';
import { onSessionCleared } from '../../services/api/session';
type Props = { uri: string; heatmap?: boolean; style: StyleProp<ImageStyle>; label?: string; timeoutMs?: number; natural?: boolean };
export default function ScanImage({ uri, heatmap = false, style, label = 'Scan image', timeoutMs = 20000, natural = false }: Props) {
 const {colors:Colors}=useTheme(); const styles=useThemedStyles(makeStyles);

  const [aspect, setAspect] = useState(4 / 3);
  const [source, setSource] = useState<Awaited<ReturnType<typeof loadMediaSource>>>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const unsubscribe = onSessionCleared(() => { active = false; controller.abort(); setSource(null); setFailed(true); });
    setSource(null); setFailed(false); setAspect(4 / 3);
    loadMediaSource(uri, heatmap, controller.signal).then(value => { if (active) { setSource(value); setFailed(!value); } })
      .catch(() => { if (active) setFailed(true); })
      .finally(() => clearTimeout(timeout));
    return () => { active = false; clearTimeout(timeout); controller.abort(); unsubscribe(); };
  }, [uri, heatmap, attempt, timeoutMs]);
  // Protected images were fetched with auth and are displayed from an in-memory URI.
  return <View style={[style, styles.frame, natural && {height:undefined,aspectRatio:aspect}]}>
    {failed ? <Pressable style={styles.placeholder} accessibilityRole="button" accessibilityLabel={'Retry ' + label}
      onPress={(event) => { event.stopPropagation(); setAttempt(value => value + 1); }}>
      <CyberText variant="caption" align="center" numberOfLines={3}>Image unavailable. Tap to retry.</CyberText>
    </Pressable> : !source ? <View style={styles.placeholder}><ActivityIndicator /></View> :
      <Image key={attempt} source={source} style={styles.image}
        resizeMode={StyleSheet.flatten(style)?.resizeMode ?? 'cover'}
        accessibilityLabel={label} onLoad={event => { const {width,height} = event.nativeEvent.source; if(natural && width > 0 && height > 0)setAspect(width / height); }} onError={() => {
          if (__DEV__) console.debug('Scan image could not be decoded.');
          setFailed(true);
        }} />}
  </View>;
}
const makeStyles = (Colors: ColorPalette) => createStyles({
  frame: { flexShrink: 0, overflow: 'hidden' },
  image: { width: '100%', height: '100%' },
  placeholder: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 3 },
});
