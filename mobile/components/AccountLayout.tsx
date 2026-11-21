import DetailBack from './ui/DetailBack';
import type {Href} from 'expo-router';
import AppearanceControl from './ui/AppearanceControl';
import {useTheme,useThemedStyles} from '../context/ThemeContext';
import type {ColorPalette} from '../constants/Colors';
import {createStyles} from '../constants/createStyles';
import React,{forwardRef,useState} from 'react';
import {Image,KeyboardAvoidingView,Platform,Pressable,ScrollView,StyleSheet,TextInput,View,type TextInputProps} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {router} from 'expo-router';
import CyberText from './ui/CyberText';
export default function AccountLayout({title,subtitle,children,footer,backFallback='/(public)/home'}:{title:string;subtitle:string;children:React.ReactNode;footer?:React.ReactNode;backFallback?:Href}){
 const {colors:Colors,isDark}=useTheme(); const styles=useThemedStyles(makeStyles);

 return <SafeAreaView style={styles.screen}><KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==='ios'?'padding':'height'}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scroll}>
  <View style={styles.wrap}><View style={{marginBottom:14}}><AppearanceControl compact/></View><DetailBack fallback={backFallback}/>
  <View style={styles.card}><Image source={require('../assets/AuthentiScan-Logo.png')} style={styles.logo} accessibilityLabel="AuthentiScan logo"/><CyberText variant="h3" align="center">{title}</CyberText><CyberText variant="bodySmall" align="center">{subtitle}</CyberText><View style={styles.form}>{children}</View></View>
  {!!footer&&<View style={styles.footer}>{footer}</View>}</View>
 </ScrollView></KeyboardAvoidingView></SafeAreaView>;
}
type Props=TextInputProps&{label:string;help?:string;error?:string;password?:boolean};
export const AccountField=forwardRef<React.ComponentRef<typeof TextInput>,Props>(function AccountField({label,help,error,password,...props},ref){
 const {colors:Colors,isDark}=useTheme(); const styles=useThemedStyles(makeStyles);

 const [focus,setFocus]=useState(false),[visible,setVisible]=useState(false);
 return <View style={styles.field}><CyberText variant="bodySmall" style={{fontWeight:'600'}}>{label}</CyberText><View style={[styles.inputWrap,focus&&styles.focus,error?styles.invalid:undefined]}>
 <TextInput ref={ref} {...props} accessibilityLabel={label} accessibilityHint={error||help} autoCapitalize={props.autoCapitalize??'none'} autoCorrect={false} keyboardAppearance={isDark?'dark':'light'} placeholderTextColor={Colors.textMuted} secureTextEntry={password&&!visible} style={[styles.input,props.style]} onFocus={e=>{setFocus(true);props.onFocus?.(e);}} onBlur={e=>{setFocus(false);props.onBlur?.(e);}}/>
 {password&&<Pressable accessibilityRole="button" accessibilityLabel={(visible?'Hide ':'Show ')+label.toLowerCase()} onPress={()=>setVisible(v=>!v)} style={styles.toggle}><CyberText variant="bodySmall" color={Colors.cyanAlt}>{visible?'Hide':'Show'}</CyberText></Pressable>}</View>
 {!!error&&<View accessibilityLiveRegion="polite"><CyberText variant="bodySmall" color={Colors.fake}>{error}</CyberText></View>}{!!help&&<CyberText variant="caption">{help}</CyberText>}</View>;
});
export function AccountError({message}:{message:string|null}){
 const {colors:Colors,isDark}=useTheme(); const styles=useThemedStyles(makeStyles);
return message?<View accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.error}><CyberText variant="bodySmall" color={Colors.fake}>{message}</CyberText></View>:null;}
const makeStyles = (Colors: ColorPalette) => createStyles({screen:{flex:1,backgroundColor:Colors.bgPrimary},scroll:{flexGrow:1,padding:20,paddingBottom:36,justifyContent:'center'},wrap:{width:'100%',maxWidth:420,alignSelf:'center'},back:{minHeight:44,justifyContent:'center',alignSelf:'flex-start',marginBottom:8},card:{backgroundColor:Colors.bgSecondary,borderWidth:1,borderColor:Colors.border,borderRadius:24,padding:22,gap:8},logo:{backgroundColor:Colors.logoPlate,borderRadius:27,width:54,height:54,alignSelf:'center',marginBottom:4},form:{gap:14,marginTop:12},footer:{alignItems:'center',gap:4,marginTop:14},field:{gap:6},inputWrap:{minHeight:48,flexDirection:'row',alignItems:'center',borderWidth:1,borderColor:Colors.control,borderRadius:12,backgroundColor:Colors.bgTertiary},input:{flex:1,minWidth:0,color:Colors.textPrimary,fontFamily:'Poppins-Regular',fontSize:16,paddingHorizontal:12,paddingVertical:10},toggle:{paddingHorizontal:12,minHeight:44,justifyContent:'center'},focus:{borderColor:Colors.cyan,backgroundColor:Colors.cyanDim},invalid:{borderColor:Colors.fake},error:{padding:12,borderRadius:12,backgroundColor:Colors.fakeDim}});
