import {useTheme} from '../../context/ThemeContext';
import type {ColorPalette} from '../../constants/Colors';
import React,{useEffect,useRef,useState} from 'react';
import {Pressable,TextInput,View} from 'react-native';
import {router} from 'expo-router';
import AccountLayout,{AccountField,AccountError} from '../../components/AccountLayout';
import CyberButton from '../../components/ui/CyberButton';
import CyberText from '../../components/ui/CyberText';
import {useAuth} from '../../hooks/useAuth';
import {requestRegistrationCode} from '../../services/api/firebaseAuth';
import {OFFLINE_MODE} from '../../services/api/config';
export default function RegisterScreen(){
 const {colors:Colors}=useTheme();

 const {register}=useAuth();const [firstName,setFirstName]=useState(''),[lastName,setLastName]=useState(''),[email,setEmail]=useState(''),[password,setPassword]=useState(''),[confirmation,setConfirmation]=useState(''),[terms,setTerms]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [challenge,setChallenge]=useState<{challenge_id:string;resend_after:number}|null>(null),[code,setCode]=useState(''),[remaining,setRemaining]=useState(0);
 useEffect(()=>{if(!remaining)return;const timer=setTimeout(()=>setRemaining(v=>Math.max(0,v-1)),1000);return()=>clearTimeout(timer);},[remaining]);
 async function sendCode(){const response=await requestRegistrationCode(email.trim());setChallenge(response.data);setCode('');setRemaining(response.data.resend_after);}
 async function resend(){if(locked.current||remaining)return;locked.current=true;setBusy(true);setError('');try{await sendCode();}catch(e){setError(e instanceof Error?e.message:'Could not send a code.');}finally{locked.current=false;setBusy(false);}}
 const locked=useRef(false),first=useRef<React.ComponentRef<typeof TextInput>>(null),last=useRef<React.ComponentRef<typeof TextInput>>(null),mail=useRef<React.ComponentRef<typeof TextInput>>(null),pass=useRef<React.ComponentRef<typeof TextInput>>(null),confirm=useRef<React.ComponentRef<typeof TextInput>>(null);
 async function submit(){if(locked.current)return;setError('');if(!firstName.trim()||!lastName.trim()){setError('Enter your first and last name.');(!firstName.trim()?first:last).current?.focus();return;}if(!/^\S+@\S+\.\S+$/.test(email.trim())){setError('Enter a valid email address.');mail.current?.focus();return;}if(password.length<8){setError('Password must contain at least 8 characters.');pass.current?.focus();return;}if(password!==confirmation){setError('Passwords do not match.');confirm.current?.focus();return;}if(!terms){setError('Accept the academic research terms and privacy guidelines to continue.');return;}
 locked.current=true;setBusy(true);try{if(!OFFLINE_MODE&&!challenge){await sendCode();return;}if(!OFFLINE_MODE&&!/^\d{6}$/.test(code)){setError('Enter the six-digit code.');return;}const result=await register({firstName:firstName.trim(),lastName:lastName.trim(),email:email.trim().toLowerCase(),password,challenge_id:challenge?.challenge_id,code,accept_terms:terms});if(result.error)setError(result.error);else router.replace(result.emailVerificationRequired?'/verify-email':'/(tabs)/dashboard');}catch{setError('Could not create your account. Please try again.');}finally{locked.current=false;setBusy(false);}}
 return <AccountLayout title={challenge?'Verify your email':'Create account'} subtitle={challenge?'Confirm your email before your account is created.':'Create an account to start reviewing images.'} footer={<CyberButton label="Already have an account? Sign in" variant="ghost" onPress={()=>router.replace('/(auth)/login')}/>}>
  {!challenge&&<>
  <AccountField ref={first} label="First name" value={firstName} onChangeText={setFirstName} autoCapitalize="words" autoComplete="given-name" editable={!busy} returnKeyType="next" onSubmitEditing={()=>last.current?.focus()}/>
  <AccountField ref={last} label="Last name" value={lastName} onChangeText={setLastName} autoCapitalize="words" autoComplete="family-name" editable={!busy} returnKeyType="next" onSubmitEditing={()=>mail.current?.focus()}/>
  <AccountField ref={mail} label="Email address" value={email} onChangeText={setEmail} keyboardType="email-address" autoComplete="email" maxLength={254} editable={!busy} returnKeyType="next" onSubmitEditing={()=>pass.current?.focus()} help="We’ll verify this inbox before saving your account. Use an email you can access."/>
  <AccountField ref={pass} label="Password" password value={password} onChangeText={setPassword} autoComplete="new-password" editable={!busy} returnKeyType="next" onSubmitEditing={()=>confirm.current?.focus()} help="Use at least 8 characters. A longer, unique password is best."/>
  <AccountField ref={confirm} label="Confirm password" password value={confirmation} onChangeText={setConfirmation} autoComplete="new-password" editable={!busy} returnKeyType="done" onSubmitEditing={submit} error={confirmation&&password!==confirmation?'Passwords do not match.':undefined}/>
  <Pressable accessibilityRole="checkbox" accessibilityLabel="I accept the academic research terms and privacy guidelines." accessibilityState={{checked:terms,disabled:busy}} disabled={busy} onPress={()=>setTerms(v=>!v)} style={{flexDirection:'row',gap:8,minHeight:44,alignItems:'center'}}><CyberText>{terms?'☑':'☐'}</CyberText><View style={{flex:1}}><CyberText variant="bodySmall">I accept the academic research terms and privacy guidelines.</CyberText></View></Pressable>
  </>}
  {!!challenge&&<><CyberText variant="bodySmall">Enter the newest code sent to {email.trim()}. It expires after 10 minutes. No account or user profile is created until you confirm.</CyberText><AccountField label="Verification code" value={code} onChangeText={v=>{setCode(v.replace(/\D/g,''));setError('');}} keyboardType="number-pad" autoComplete="one-time-code" maxLength={6} editable={!busy}/></>}
  <AccountError message={error}/><CyberButton label={busy?(challenge?'Creating account…':'Sending code…'):challenge?'Verify & create account':OFFLINE_MODE?'Create account':'Send verification code'} loading={busy} disabled={busy} onPress={submit}/>
  {!!challenge&&<><CyberButton label={remaining?`Resend available in ${remaining}s`:'Resend code'} variant="secondary" disabled={busy||remaining>0} onPress={resend}/><CyberButton label="Change registration details" variant="ghost" disabled={busy} onPress={()=>{setChallenge(null);setCode('');setRemaining(0);setError('');}}/></>}
 </AccountLayout>;
}
