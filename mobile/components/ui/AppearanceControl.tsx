import React,{useState} from 'react';
import {Pressable,View} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {useTheme} from '../../context/ThemeContext';
import CyberText from './CyberText';
export default function AppearanceControl({compact=false}:{compact?:boolean}){
 const {colors,preference,isDark,setPreference,saveError}=useTheme(),[focused,setFocused]=useState(false);
 return <View style={{gap:compact?6:10}}>
  <CyberText variant={compact?'caption':'h4'}>Appearance</CyberText>
  <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:10,flexWrap:'wrap'}}>
   <CyberText variant="bodySmall" style={{fontWeight:'600'}}>{isDark?'Dark':'Light'}</CyberText>
   <Pressable accessibilityRole="switch" accessibilityLabel="Dark mode" accessibilityState={{checked:isDark}} onPress={()=>setPreference(isDark?'light':'dark')} onFocus={()=>setFocused(true)} onBlur={()=>setFocused(false)} style={({pressed})=>({width:112,height:48,borderRadius:999,borderWidth:1,borderColor:focused?colors.focus:colors.control,backgroundColor:pressed?colors.surfaceHover:colors.bgTertiary,flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:14,...(focused?{outlineWidth:3,outlineColor:colors.focus,outlineOffset:3}:{})})}>
    <View pointerEvents="none" style={{position:'absolute',left:isDark?68:4,top:4,width:38,height:38,borderRadius:19,borderWidth:1,borderColor:isDark?colors.cyan:colors.control,backgroundColor:isDark?colors.cyan:colors.bgSecondary}}/>
    <Ionicons accessible={false} name="sunny-outline" size={20} color={isDark?colors.textSecondary:colors.cyan}/>
    <Ionicons accessible={false} name="moon-outline" size={20} color={isDark?colors.onAction:colors.textSecondary}/>
   </Pressable>
  </View>
  {!!saveError&&<View accessibilityRole="alert"><CyberText variant="caption" color={colors.fake}>{saveError}</CyberText><Pressable accessibilityRole="button" onPress={()=>setPreference(preference)} style={{minHeight:44,justifyContent:'center'}}><CyberText variant="bodySmall" color={colors.cyan}>Retry saving theme</CyberText></Pressable></View>}
 </View>;
}
