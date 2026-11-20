import {useTheme} from '../../context/ThemeContext';
import type {ColorPalette} from '../../constants/Colors';
import React,{useEffect,useRef,useState} from 'react';
import {TextInput} from 'react-native';
import {router} from 'expo-router';
import AccountLayout,{AccountField,AccountError} from '../../components/AccountLayout';
import CyberButton from '../../components/ui/CyberButton';
import CyberText from '../../components/ui/CyberText';
import {passwordResetService} from '../../services/auth/passwordResetService';
import {OFFLINE_MODE} from '../../services/api/config';
export default function ForgotPasswordScreen(){
 const {colors:Colors}=useTheme();

 const [email,setEmail]=useState(''),[sentTo,setSentTo]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[remaining,setRemaining]=useState(0);const locked=useRef(false),input=useRef<React.ComponentRef<typeof TextInput>>(null);
 useEffect(()=>{if(!remaining)return;const timer=setTimeout(()=>setRemaining(v=>Math.max(0,v-1)),1000);return()=>clearTimeout(timer);},[remaining]);
 async function submit(){if(locked.current||remaining)return;locked.current=true;setBusy(true);setError('');try{const result=await passwordResetService.requestReset(email.trim().toLowerCase());if(!result.success){setError(result.error);input.current?.focus();}else{setSentTo(email.trim());setRemaining(60);}}catch{setError('Could not request a reset link. Please wait and try again.');}finally{locked.current=false;setBusy(false);}}
 return <AccountLayout title={sentTo?'Check your email':'Forgot your password?'} subtitle={sentTo?'Follow the link in your password reset email.':'Enter your account email to request a reset link.'} footer={<CyberButton label="Back to sign in" variant="ghost" onPress={()=>router.replace('/(auth)/login')}/>}>
  {sentTo?<><CyberText variant="bodySmall">{OFFLINE_MODE?'Offline mode does not send emails. Connect to AuthentiScan to request a reset.':'If an account is registered with '+sentTo+', we’ve requested a password reset email.'}</CyberText><CyberText variant="bodySmall">1. Open the password reset email from AuthentiScan.{ '\n' }2. Follow the secure link and choose a new password.{ '\n' }3. Return here and sign in with your new password.</CyberText><CyberText variant="caption">No email yet? Check spam or junk. If you request another link, use the newest email. The link opens your secure password reset page in the browser.</CyberText></>:<><CyberText variant="bodySmall">If an account exists for this email, a reset link will be sent.</CyberText><AccountField ref={input} label="Email address" value={email} onChangeText={v=>{setEmail(v);setError('');}} autoComplete="email" keyboardType="email-address" maxLength={254} editable={!busy} returnKeyType="send" onSubmitEditing={submit}/></>}
  <AccountError message={error}/><CyberButton label={busy?'Sending…':sentTo?(remaining?'Resend available in '+remaining+'s':'Resend reset link'):'Send reset link'} loading={busy} disabled={busy||remaining>0} onPress={submit}/>
  {!!sentTo&&<CyberButton label="Use a different email address" variant="ghost" disabled={busy} onPress={()=>{setSentTo('');setRemaining(0);setError('');}}/>}
 </AccountLayout>;
}
