import {useEffect,useRef,useState} from 'react';
import {Link,useSearchParams} from 'react-router-dom';
import {Lock} from 'lucide-react';
import AuthLayout, {AuthField, AuthAlert, AuthSubmit} from '../components/layout/AuthLayout';
import PasswordVisibilityToggle from '../components/common/PasswordVisibilityToggle';
import {checkPasswordResetLink,finishPasswordReset} from '../services/api';

export default function ResetPasswordPage(){
 const [params]=useSearchParams(),code=params.get('oobCode'),mode=params.get('mode');
 const [state,setState]=useState('checking'),[email,setEmail]=useState(''),[error,setError]=useState(''),[password,setPassword]=useState(''),[confirmation,setConfirmation]=useState(''),[visible,setVisible]=useState(false),[busy,setBusy]=useState(false);
 const lock=useRef(false),heading=useRef(null),errorRef=useRef(null);
 const [errorField,setErrorField]=useState(null),[confirmationVisible,setConfirmationVisible]=useState(false);
 useEffect(()=>{if(error&&state==='form'&&!errorField&&!busy)errorRef.current?.focus();},[error,state,errorField,busy]);
 useEffect(()=>{let active=true;setState('checking');setError('');
  if(!code||mode!=='resetPassword'){setError('This password reset link is incomplete. Request a new link to continue.');setState('invalid');return;}
  checkPasswordResetLink(code).then(address=>{if(active){setEmail(address);setState('form');}}).catch(e=>{if(active){setError(e.message);setState('invalid');}});
  return()=>{active=false;};
 },[code,mode]);
 useEffect(()=>{if(state!=='checking')heading.current?.focus();},[state]);
 async function submit(e){e.preventDefault();if(lock.current||state!=='form')return;
  if(password.length<8){setErrorField('password');setError('Use at least eight characters.');document.getElementById('new-password')?.focus();return;}
  if(password!==confirmation){setErrorField('confirmation');setError('Your passwords don’t match. Please enter them again.');document.getElementById('confirm-password')?.focus();return;}
  lock.current=true;setBusy(true);setErrorField(null);
  try{await finishPasswordReset(code,password);setPassword('');setConfirmation('');setState('done');}
  catch(e){setError(e.message);}finally{lock.current=false;setBusy(false);}
 }
 const title=state==='done'?'Password updated':state==='invalid'?'Let’s get you a new link':state==='checking'?'Checking your reset link…':'Choose a new password';
 return <AuthLayout recovery title={title} subtitle={state==='done'?'Your password has been changed.':state==='form'?'Create a new password for your account.':null} headingRef={heading} footer={state!=='done'&&state!=='checking'?<Link to="/login">Back to sign in</Link>:null}>
  {state==='checking'&&<p role="status" className="auth-status">Please wait while we check your secure link.</p>}
  {state==='done'&&<><p role="status" className="auth-success">Sign in to AuthentiScan using your new password.</p><Link to="/login" className="auth-primary">Back to sign in</Link></>}
  {state==='invalid'&&<div className="auth-form"><AuthAlert message={error}/><Link to="/forgot-password" className="auth-primary">Request a new reset link</Link></div>}
  {state==='form'&&<>
    <p className="auth-copy">Reset password for <strong className="auth-address">{email}</strong>.</p>
    <form onSubmit={submit} className="auth-form" aria-busy={busy} aria-labelledby="auth-title">
      <AuthField id="new-password" name="newPassword" label="New password" icon={Lock} type={visible?'text':'password'} autoComplete="new-password" required minLength={8} disabled={busy} value={password} onChange={e=>{setPassword(e.target.value);setError('');setErrorField(null);}} help="Use at least 8 characters. A longer, unique password is best." error={errorField==='password'?error:null}>
        <PasswordVisibilityToggle visible={visible} onToggle={()=>setVisible(v=>!v)} inputId="new-password" label="new password"/>
      </AuthField>
      <AuthField id="confirm-password" name="confirmPassword" label="Confirm new password" icon={Lock} type={confirmationVisible?'text':'password'} autoComplete="new-password" required minLength={8} disabled={busy} value={confirmation} onChange={e=>{setConfirmation(e.target.value);setError('');setErrorField(null);}} error={errorField==='confirmation'?error:null}>
        <PasswordVisibilityToggle visible={confirmationVisible} onToggle={()=>setConfirmationVisible(v=>!v)} inputId="confirm-password" label="confirm new password"/>
      </AuthField>
      {!errorField&&<AuthAlert message={error} alertRef={errorRef} pending={busy}/>}
      <AuthSubmit busy={busy} label="Save new password" busyLabel="Saving password…"/>
    </form>
  </>}
 </AuthLayout>;
}
