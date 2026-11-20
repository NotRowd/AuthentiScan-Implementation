import {useEffect,useRef,useState} from 'react';
import {Link} from 'react-router-dom';
import {Mail} from 'lucide-react';
import AuthLayout, {AuthField, AuthAlert} from '../components/layout/AuthLayout';
import {requestPasswordReset} from '../services/api';

export default function ForgotPasswordPage(){
 const [email,setEmail]=useState(''),[sentTo,setSentTo]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[remaining,setRemaining]=useState(0);
 const locked=useRef(false),heading=useRef(null),errorRef=useRef(null);
 useEffect(()=>{if(error&&!busy)errorRef.current?.focus();},[error,busy]);
 useEffect(()=>{if(!remaining)return;const timer=setTimeout(()=>setRemaining(value=>Math.max(0,value-1)),1000);return()=>clearTimeout(timer);},[remaining]);
 useEffect(()=>{if(sentTo)heading.current?.focus();},[sentTo]);
 async function submit(e){
  e.preventDefault();if(locked.current||remaining)return;locked.current=true;setBusy(true);
  try{await requestPasswordReset(email);setError('');setSentTo(email.trim());setRemaining(60);}catch(e){setError(e.message);}finally{locked.current=false;setBusy(false);}
 }
 return <AuthLayout recovery title={sentTo?'Check your email':'Forgot your password?'} subtitle={sentTo?'Follow the link in your password reset email.':'Enter your account email to request a reset link.'} headingRef={heading} footer={<Link to="/login">Back to sign in</Link>}>
  {sentTo?<>
    <p className="auth-copy">If an account is registered with <strong className="auth-address">{sentTo}</strong>, we’ve requested a password reset email.</p>
    <ol className="auth-steps" role="list"><li>Open the password reset email from AuthentiScan.</li><li>Follow the secure link and choose a new password.</li><li>Sign in with your new password.</li></ol>
    <p className="auth-note">No email yet? Check your spam or junk folder. If you request another link, use the newest email.</p>
  </>:<p className="auth-copy">If an account exists for this email, a reset link will be sent. Check your inbox and spam folder after requesting.</p>}
  <form onSubmit={submit} className="auth-form" aria-busy={busy} aria-labelledby="auth-title">
    {!sentTo&&<AuthField id="reset-email" name="email" label="Email address" icon={Mail} type="email" autoComplete="email" inputMode="email" spellCheck={false} placeholder="you@example.com" required maxLength={254} disabled={busy} value={email} onChange={e=>{setEmail(e.target.value);setError('');}}/>}
    <AuthAlert message={error} alertRef={errorRef} pending={busy}/>
    <button type="submit" className={sentTo?'auth-secondary':'auth-primary'} disabled={busy||remaining>0}>{busy?'Sending…':sentTo?(remaining?`Resend available in ${remaining}s`:'Resend reset link'):'Send reset link'}</button>
    {sentTo&&<>
      {remaining>0&&<p className="auth-cooldown"><span role="timer" aria-live="off">You can request another link after {remaining} seconds.</span></p>}
      <button type="button" disabled={busy} onClick={()=>{setSentTo('');setRemaining(0);setError('');}} className="auth-text-button">Use a different email address</button>
    </>}
  </form>
 </AuthLayout>;
}
