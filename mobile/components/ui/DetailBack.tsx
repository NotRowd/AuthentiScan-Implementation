import React,{useState} from 'react';
import {Pressable,View,type StyleProp,type ViewStyle} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import type {Href} from 'expo-router';
import {useTheme} from '../../context/ThemeContext';
import {useDetailBack} from '../../hooks/useDetailBack';
import CyberText from './CyberText';

export default function DetailBack({fallback,disabled=false,style}:{fallback:Href;disabled?:boolean;style?:StyleProp<ViewStyle>}){
 const {goBack}=useDetailBack(fallback,disabled);
 return <BackButton onPress={goBack} disabled={disabled} style={style}/>;
}
export function BackButton({onPress,disabled=false,style}:{onPress:()=>void;disabled?:boolean;style?:StyleProp<ViewStyle>}){
 const {colors}=useTheme(),[focused,setFocused]=useState(false);
 return <View style={[{alignSelf:'flex-start',marginBottom:8},style]}>
  <Pressable accessibilityRole="button" accessibilityLabel="Go back" accessibilityState={{disabled}} disabled={disabled} onPress={onPress} onFocus={()=>setFocused(true)} onBlur={()=>setFocused(false)}
   style={({pressed})=>({minHeight:44,minWidth:72,paddingHorizontal:8,paddingVertical:8,borderRadius:12,borderWidth:2,borderColor:focused?colors.focus:'transparent',flexDirection:'row',alignItems:'center',gap:4,backgroundColor:pressed?colors.cyanDim:'transparent',opacity:disabled?.6:1})}>
   <Ionicons name="chevron-back" size={20} color={colors.cyanAlt}/><CyberText variant="bodySmall" color={colors.cyanAlt}>Back</CyberText>
  </Pressable>
 </View>;
}
