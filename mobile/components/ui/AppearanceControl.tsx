import React,{useState} from 'react';
import {Pressable,View} from 'react-native';
import {useTheme,type ThemePreference} from '../../context/ThemeContext';
import CyberText from './CyberText';
export default function AppearanceControl({compact=false}:{compact?:boolean}){
 const {colors,preference,setPreference,saveError}=useTheme();const [focused,setFocused]=useState<ThemePreference|null>(null);
 return <View style={{gap:compact?6:10}}>
  <CyberText variant={compact?'caption':'h4'}>Appearance</CyberText>
  {!compact&&<CyberText variant="bodySmall" color={colors.textSecondary}>Choose a theme. System follows your device.</CyberText>}
  <View accessibilityRole="radiogroup" accessibilityLabel="Appearance" style={{flexDirection:'row',gap:4,padding:4,borderRadius:14,borderWidth:1,borderColor:colors.control,backgroundColor:colors.bgSecondary}}>
   {(['light','dark','system'] as const).map(choice=><Pressable key={choice} accessibilityRole="radio" accessibilityLabel={choice[0].toUpperCase()+choice.slice(1)+' theme'} accessibilityState={{checked:preference===choice}} onPress={()=>setPreference(choice)} onFocus={()=>setFocused(choice)} onBlur={()=>setFocused(null)} style={({pressed})=>({flex:1,minHeight:44,justifyContent:'center',alignItems:'center',paddingHorizontal:5,borderRadius:10,borderWidth:2,borderColor:focused===choice?colors.focus:preference===choice?colors.cyan:'transparent',backgroundColor:preference===choice?colors.cyanDim:pressed?colors.surfaceHover:colors.bgSecondary})}>
    <CyberText variant="bodySmall" color={preference===choice?colors.cyan:colors.textSecondary} style={{fontWeight:'600'}}>{choice[0].toUpperCase()+choice.slice(1)}</CyberText>
   </Pressable>)}
  </View>
  {!!saveError&&<View accessibilityRole="alert"><CyberText variant="caption" color={colors.fake}>{saveError}</CyberText></View>}
 </View>;
}
