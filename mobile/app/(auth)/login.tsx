import {useTheme} from '../../context/ThemeContext';
import type {ColorPalette} from '../../constants/Colors';
import React,{useRef,useState} from 'react';
import {TextInput} from 'react-native';
import {router} from 'expo-router';
import AccountLayout,{AccountField,AccountError} from '../../components/AccountLayout';
import CyberButton from '../../components/ui/CyberButton';
import {useAuth} from '../../hooks/useAuth';
export default function LoginScreen(){
 const {colors:Colors}=useTheme();

 const {login}=useAuth();const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const locked=useRef(false),emailInput=useRef<React.ComponentRef<typeof TextInput>>(null),passwordInput=useRef<React.ComponentRef<typeof TextInput>>(null);
 async function submit(){if(locked.current)return;setError('');if(!/^\S+@\S+\.\S+$/.test(email.trim())){setError('Enter a valid email address.');emailInput.current?.focus();return;}if(!password){setError('Enter your password.');passwordInput.current?.focus();return;}locked.current=true;setBusy(true);
 try{const result=await login({email:email.trim().toLowerCase(),password});if(result.error)setError(result.error);else router.replace(result.emailVerificationRequired?'/verify-email':'/(tabs)/dashboard');}catch{setError('Could not sign in. Please try again.');}finally{locked.current=false;setBusy(false);}}
 return <AccountLayout title="Sign in" subtitle="Welcome back to AuthentiScan." footer={<CyberButton label="Create account" variant="ghost" onPress={()=>router.push('/(auth)/register')}/>}>
  <AccountField ref={emailInput} label="Email address" value={email} onChangeText={v=>{setEmail(v);setError('');}} autoComplete="email" textContentType="emailAddress" keyboardType="email-address" maxLength={254} editable={!busy} returnKeyType="next" onSubmitEditing={()=>passwordInput.current?.focus()} placeholder="you@example.com"/>
  <AccountField ref={passwordInput} label="Password" password value={password} onChangeText={v=>{setPassword(v);setError('');}} autoComplete="current-password" textContentType="password" editable={!busy} returnKeyType="go" onSubmitEditing={submit}/>
  <CyberButton label="Forgot password?" variant="ghost" onPress={()=>router.push('/(auth)/forgot-password')}/><AccountError message={error}/><CyberButton label={busy?'Signing in…':'Sign in'} loading={busy} disabled={busy} onPress={submit}/>
 </AccountLayout>;
}
