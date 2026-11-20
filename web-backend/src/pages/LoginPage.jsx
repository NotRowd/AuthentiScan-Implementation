import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Mail, Lock, ArrowRight } from 'lucide-react';
import AuthLayout, {AuthField, AuthAlert, AuthSubmit} from '../components/layout/AuthLayout';
import PasswordVisibilityToggle from '../components/common/PasswordVisibilityToggle';
import { loginAccount, saveAuthSession } from '../services/api';

export default function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword,setShowPassword]=useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const locked = useRef(false), errorRef = useRef(null);
  useEffect(() => {if (error && !isSubmitting) errorRef.current?.focus();}, [error, isSubmitting]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (locked.current) return;
    locked.current = true;
    setIsSubmitting(true);

    try {
      const response = await loginAccount({ email, password, rememberMe });
      saveAuthSession(response.data, rememberMe);
      navigate(response.data.user.email_verification_required&&!response.data.user.email_verified?'/verify-email':'/dashboard', { replace: true });
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      locked.current = false;
      setIsSubmitting(false);
    }
  };

  return <AuthLayout title="Sign in" subtitle="Welcome back to AuthentiScan." footer={<>Don’t have an account? <Link to="/register">Create account</Link></>}>
    <form onSubmit={handleSubmit} className="auth-form" aria-busy={isSubmitting} aria-labelledby="auth-title">
      <AuthField id="login-email" name="email" label="Email address" icon={Mail} type="email" autoComplete="username" inputMode="email" spellCheck={false} value={email} onChange={e=>{setEmail(e.target.value);setError('');}} placeholder="you@example.com" required/>
      <AuthField id="login-password" name="password" label="Password" icon={Lock} type={showPassword?'text':'password'} autoComplete="current-password" value={password} onChange={e=>{setPassword(e.target.value);setError('');}} required aside={<Link to="/forgot-password">Forgot password?</Link>}>
        <PasswordVisibilityToggle visible={showPassword} onToggle={()=>setShowPassword(value=>!value)} inputId="login-password"/>
      </AuthField>
      <label className="auth-check"><input type="checkbox" name="rememberMe" checked={rememberMe} onChange={e=>setRememberMe(e.target.checked)}/>Remember me on this device</label>
      <AuthAlert message={error} alertRef={errorRef} pending={isSubmitting}/>
      <AuthSubmit busy={isSubmitting} label="Sign in" busyLabel="Signing in…"/>
    </form>
  </AuthLayout>;
}
