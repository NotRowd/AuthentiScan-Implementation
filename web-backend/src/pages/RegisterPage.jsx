import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { User, Mail, Lock, ArrowRight } from 'lucide-react';
import AuthLayout, {AuthField, AuthAlert, AuthSubmit} from '../components/layout/AuthLayout';
import PasswordVisibilityToggle from '../components/common/PasswordVisibilityToggle';
import { registerAccount, requestRegistrationCode, saveAuthSession } from '../services/api';

export default function RegisterPage() {
  const navigate = useNavigate();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword,setShowPassword]=useState(false);
  const [showConfirmPassword,setShowConfirmPassword]=useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [fields, setFields] = useState({});
  const [challenge,setChallenge]=useState(null),[code,setCode]=useState(''),[remaining,setRemaining]=useState(0),[notice,setNotice]=useState('');
  useEffect(()=>{if(!remaining)return;const timer=setTimeout(()=>setRemaining(value=>Math.max(0,value-1)),1000);return()=>clearTimeout(timer);},[remaining]);
  async function sendCode(){
    const response=await requestRegistrationCode(email.trim());
    setChallenge(response.data);setCode('');setRemaining(response.data.resend_after);setNotice('Code requested. Check your inbox and spam folder. Your account has not been created yet.');
  }
  async function resend(){if(locked.current||remaining)return;locked.current=true;setIsSubmitting(true);setError('');try{await sendCode();}catch(e){setError(e.message);}finally{locked.current=false;setIsSubmitting(false);}}

  const locked = useRef(false), errorRef = useRef(null);
  useEffect(() => {if (error) errorRef.current?.focus();}, [error]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (locked.current) return;
    setFields({});

    if (!firstName.trim() || !lastName.trim()) {
      setFields({first:!firstName.trim()?'Enter your first name.':'',last:!lastName.trim()?'Enter your last name.':''});
      document.getElementById(!firstName.trim()?'register-first':'register-last')?.focus();
      return;
    }

    if (password.length < 8) {
      setFields({password:'Password must contain at least 8 characters.'});
      document.getElementById('register-password')?.focus();
      return;
    }

    if(password!==confirmPassword){setFields({confirm:'Passwords do not match.'});document.getElementById('confirm-password')?.focus();return;}
    if(challenge&&!/^\d{6}$/.test(code)){setFields({code:'Enter the six-digit code.'});document.getElementById('registration-code')?.focus();return;}
    locked.current = true;
    setIsSubmitting(true);

    try {
      if(!challenge){await sendCode();return;}
      const response = await registerAccount({
        firstName,
        lastName,
        email,
        password, challenge_id:challenge.challenge_id, code, accept_terms:true
      });

      saveAuthSession(response.data, true);
      navigate(response.data.user.email_verification_required&&!response.data.user.email_verified?'/verify-email':'/dashboard', { replace: true });
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      locked.current = false;
      setIsSubmitting(false);
    }
  };

  return <AuthLayout title={challenge?'Verify your email':'Create account'} subtitle={challenge?'Confirm your email before your account is created.':'Create an account to start reviewing images.'} footer={<>Already have an account? <Link to="/login">Sign in</Link></>}>
    <form onSubmit={handleSubmit} className="auth-form" aria-busy={isSubmitting} aria-labelledby="auth-title">
      {!challenge&&<>
      <div className="auth-form-row">
        <AuthField id="register-first" name="firstName" label="First name" icon={User} type="text" autoComplete="given-name" value={firstName} onChange={e=>{setFirstName(e.target.value);setFields({});setError('');}} required error={fields.first}/>
        <AuthField id="register-last" name="lastName" label="Last name" icon={User} type="text" autoComplete="family-name" value={lastName} onChange={e=>{setLastName(e.target.value);setFields({});setError('');}} required error={fields.last}/>
      </div>
      <AuthField id="register-email" name="email" label="Email address" icon={Mail} type="email" autoComplete="email" inputMode="email" spellCheck={false} maxLength={254} value={email} onChange={e=>{setEmail(e.target.value);setFields({});setError('');}} required help="We’ll verify this inbox before saving your account. Use an email you can access."/>
      <AuthField id="register-password" name="password" label="Password" icon={Lock} type={showPassword?'text':'password'} autoComplete="new-password" minLength={8} value={password} onChange={e=>{setPassword(e.target.value);setFields({});setError('');}} required error={fields.password} help="Use at least 8 characters. A longer, unique password is best.">
        <PasswordVisibilityToggle visible={showPassword} onToggle={()=>setShowPassword(value=>!value)} inputId="register-password"/>
      </AuthField>
      <AuthField id="confirm-password" name="confirmPassword" label="Confirm password" icon={Lock} type={showConfirmPassword?'text':'password'} autoComplete="new-password" minLength={8} value={confirmPassword} onChange={e=>{setConfirmPassword(e.target.value);setFields({});setError('');}} required error={fields.confirm}>
        <PasswordVisibilityToggle visible={showConfirmPassword} onToggle={()=>setShowConfirmPassword(value=>!value)} inputId="confirm-password" label="confirm password"/>
      </AuthField>
      <label className="auth-check"><input type="checkbox" name="terms" required/><span>I accept the academic research terms and privacy guidelines.</span></label>
      </>}
      {challenge&&<>
        <p className="auth-note">Enter the code sent to <strong className="auth-address">{email.trim()}</strong>. Only the newest code works; it expires after 10 minutes. No account or user profile is created until you confirm.</p>
        <AuthField id="registration-code" name="code" label="Verification code" autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={e=>{setCode(e.target.value.replace(/\D/g,''));setError('');setFields({});}} error={fields.code}/>
      </>}
      <AuthAlert message={error} alertRef={errorRef} pending={isSubmitting}/>
      <AuthSubmit busy={isSubmitting} label={challenge?'Verify & create account':'Send verification code'} busyLabel={challenge?'Creating account…':'Sending code…'}/>
      {!!notice&&<p role="status" className="auth-copy">{notice}</p>}
      {challenge&&<>
        <button type="button" className="auth-secondary" disabled={isSubmitting||remaining>0} onClick={resend}>{remaining?`Resend available in ${remaining}s`:'Resend code'}</button>
        <button type="button" className="auth-text-button" disabled={isSubmitting} onClick={()=>{setChallenge(null);setCode('');setRemaining(0);setNotice('');setError('');}}>Change registration details</button>
      </>}
    </form>
  </AuthLayout>;
}
