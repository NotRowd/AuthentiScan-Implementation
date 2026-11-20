import React,{useEffect,useRef,useState} from 'react';
import {useNavigate} from 'react-router-dom';
import AuthLayout, {AuthField, AuthAlert, AuthSubmit} from '../components/layout/AuthLayout';
import {fetchEmailVerification,sendEmailVerificationCode,confirmEmailVerificationCode,clearAuthSession,fetchMe} from '../services/api';

export default function VerifyEmailPage(){
  const navigate=useNavigate(),started=useRef(false);
  const [status,setStatus]=useState(null),[code,setCode]=useState(''),[busy,setBusy]=useState(true),[error,setError]=useState(''),[message,setMessage]=useState('');
  const [remaining,setRemaining]=useState(0),[codeError,setCodeError]=useState(false);
  const locked=useRef(false),errorRef=useRef(null);
  useEffect(()=>{if(error){if(codeError)document.getElementById('verification-code')?.focus();else errorRef.current?.focus();}},[error,codeError]);
  async function apply(data){setStatus(data);setRemaining(data.resend_after||0);if(data.verified){await fetchMe();navigate('/dashboard',{replace:true});}}
  async function send(){
    if(locked.current)return;locked.current=true;
    setBusy(true);setError('');setCodeError(false);setMessage('');
    try{const response=await sendEmailVerificationCode();await apply(response.data);setCode('');setMessage('Code sent. Check your inbox and spam folder.');}
    catch(e){setError(e.message);try{await apply((await fetchEmailVerification()).data);}catch{}}
    finally{locked.current=false;setBusy(false);}
  }
  useEffect(()=>{
    if(started.current)return;started.current=true;
    (async()=>{try{const {data}=await fetchEmailVerification();await apply(data);
      if(!data.verified&&!data.sent&&!data.resend_after)await send();
    }catch(e){setError(e.message);}finally{setBusy(false);}})();
  },[]);
  useEffect(()=>{if(!remaining)return;const timer=setTimeout(()=>setRemaining(value=>Math.max(0,value-1)),1000);return()=>clearTimeout(timer);},[remaining]);
  async function confirm(event){event.preventDefault();if(locked.current||code.length!==6)return;locked.current=true;setBusy(true);setError('');setCodeError(false);setMessage('');
    try{await apply((await confirmEmailVerificationCode(code)).data);}catch(e){setError(e.message);setCodeError(true);}finally{locked.current=false;setBusy(false);}
  }
  return <AuthLayout title="Verify your email" subtitle="Enter the six-digit code to finish creating your account.">
    <p className="auth-note">Enter the code sent to <strong className="auth-address">{status?.masked_email||'your account email'}</strong>. Codes expire after 10 minutes. Only the newest code works.</p>
    <form onSubmit={confirm} className="auth-form" aria-busy={busy} aria-labelledby="auth-title">
      <AuthField id="verification-code" name="verificationCode" label="Verification code" className="auth-code" inputMode="numeric" autoComplete="one-time-code" spellCheck={false} pattern="[0-9]{6}" maxLength={6} required value={code} onChange={e=>{setCode(e.target.value.replace(/\D/g,''));if(codeError){setError('');setCodeError(false);}}} error={codeError?error:null}/>
      {!codeError&&<AuthAlert message={error} alertRef={errorRef}/>}
      <AuthSubmit busy={busy} disabled={code.length!==6} label="Confirm email" busyLabel="Please wait…"/>
    </form>
    <p role="status" className="auth-status">{message}</p>
    <div className="auth-actions">
      <button type="button" onClick={send} disabled={busy||remaining>0} className="auth-secondary">{remaining>0?`Resend in ${remaining}s`:'Resend code'}</button>
      {remaining>0&&<p className="auth-cooldown"><span role="timer" aria-live="off">You can resend in {remaining} seconds.</span></p>}
      <button type="button" onClick={async()=>{await clearAuthSession();navigate('/login',{replace:true});}} disabled={busy} className="auth-text-button">Sign out / use another account</button>
    </div>
  </AuthLayout>;
}
