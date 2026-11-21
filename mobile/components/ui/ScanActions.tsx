import React,{useRef,useState} from 'react';
import {ActionSheetIOS,ActivityIndicator,Alert,Platform,Pressable,type StyleProp,type ViewStyle} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {useTheme} from '../../context/ThemeContext';

/** Sibling of the open-report target, so deletion never opens the report. */
export default function ScanActions({fileName,onDelete,disabled=false,busy=false,style}:{fileName:string;onDelete:()=>void;disabled?:boolean;busy?:boolean;style?:StyleProp<ViewStyle>}){
 const {colors,isDark}=useTheme(),[focused,setFocused]=useState(false),[expanded,setExpanded]=useState(false),button=useRef<React.ComponentRef<typeof Pressable>>(null);
 const selectedDelete=useRef(false),menuOpen=useRef(false);
 const restore=()=>{menuOpen.current=false;setExpanded(false);button.current?.focus();};
 const choose=(remove:boolean)=>{selectedDelete.current=remove;menuOpen.current=false;setExpanded(false);if(remove)onDelete();else button.current?.focus();};
 const open=()=>{
  if(disabled||menuOpen.current)return;menuOpen.current=true;selectedDelete.current=false;setExpanded(true);
  if(Platform.OS==='ios')ActionSheetIOS.showActionSheetWithOptions({title:'Scan actions',message:fileName,options:['Cancel','Delete scan'],cancelButtonIndex:0,destructiveButtonIndex:1,userInterfaceStyle:isDark?'dark':'light'},index=>choose(index===1));
  else Alert.alert('Scan actions',fileName,[{text:'Cancel',style:'cancel',onPress:()=>choose(false)},{text:'Delete scan',style:'destructive',onPress:()=>choose(true)}],{cancelable:true,onDismiss:()=>{if(selectedDelete.current)setExpanded(false);else restore();}});
 };
 return <Pressable ref={button} onPress={open} disabled={disabled} onFocus={()=>setFocused(true)} onBlur={()=>setFocused(false)} accessibilityRole="button" accessibilityLabel={busy?'Deleting '+fileName:'More actions for '+fileName} accessibilityHint="Opens scan actions" accessibilityState={{disabled,busy,expanded}}
  style={({pressed})=>[{width:44,height:44,minWidth:44,minHeight:44,borderRadius:12,borderWidth:1,borderColor:focused?colors.focus:colors.border,backgroundColor:pressed?colors.bgTertiary:colors.bgSecondary,alignItems:'center',justifyContent:'center',opacity:disabled&&!busy?.6:1},style]}>
  {busy?<ActivityIndicator accessibilityLabel="Deleting scan" color={colors.cyan}/>:<Ionicons name="ellipsis-vertical" size={20} color={colors.cyan}/>}
 </Pressable>;
}
