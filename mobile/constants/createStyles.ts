import {StyleSheet,type TextStyle} from 'react-native';
import {poppinsFamily} from './Typography';
// Keep React Native's exact type inference and never mutate frozen style inputs.
export const createStyles: typeof StyleSheet.create = styles => {
 const themed = Object.fromEntries(Object.entries(styles).map(([key,value])=>{
  const text=value as TextStyle;
  return [key,text&&!text.fontFamily&&('fontSize' in text||'fontWeight' in text||'textTransform' in text||'letterSpacing' in text)
    ? {...text,fontFamily:poppinsFamily(text.fontWeight)} : value];
 }));
 return StyleSheet.create(themed) as typeof styles;
};

