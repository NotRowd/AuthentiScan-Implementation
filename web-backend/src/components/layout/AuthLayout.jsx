import {Link} from 'react-router-dom';
import {ArrowRight, LoaderCircle} from 'lucide-react';
import MainLayout from './MainLayout';
import logo from '../../assets/logo.png';
import '../../styles/account-flow.css';

export default function AuthLayout({title, subtitle, recovery=false, headingRef, children, footer}) {
  return <MainLayout compactFooter><div className="account-flow">
    <section className="auth-card" aria-labelledby="auth-title">
      <header className="auth-card-head">
        <Link to="/" aria-label="AuthentiScan home" className="auth-logo-link"><img src={logo} width="44" height="44" alt="AuthentiScan logo"/></Link>
        {recovery && <p className="auth-eyebrow">Account recovery</p>}
        <h1 id="auth-title" ref={headingRef} tabIndex={-1}>{title}</h1>
        {subtitle && <p className="auth-subtitle">{subtitle}</p>}
      </header>
      {children}
      {footer && <footer className="auth-card-foot">{footer}</footer>}
    </section>
  </div></MainLayout>;
}

export function AuthField({id, label, help, error, icon:Icon, aside, children, ...props}) {
  const describedBy = [help && `${id}-help`, error && `${id}-error`].filter(Boolean).join(' ') || undefined;
  return <div className="auth-field">
    <div className="auth-label-row"><label htmlFor={id}>{label}</label>{aside}</div>
    <div className={`auth-control ${children ? 'auth-password' : ''} ${Icon ? 'auth-has-icon' : ''}`}>
      {Icon && <Icon aria-hidden="true" className="auth-input-icon"/>}
      <input {...props} id={id} name={props.name || id} aria-describedby={describedBy} aria-invalid={error ? true : undefined}/>
      {children}
    </div>
    {help && <p id={`${id}-help`} className="auth-help">{help}</p>}
    {error && <p id={`${id}-error`} role="alert" className="auth-error">{error}</p>}
  </div>;
}

export function AuthAlert({message, alertRef, pending=false}) {
  return message ? <p ref={alertRef} tabIndex={pending?undefined:-1} role={pending?undefined:"alert"} aria-hidden={pending?true:undefined} className={`auth-error ${pending?'invisible':''}`}>{message}</p> : null;
}

export function AuthSubmit({busy, label, busyLabel, disabled=false}) {
  return <button type="submit" className="auth-primary" disabled={busy || disabled}>
    {busy ? busyLabel : label}
    {busy ? <LoaderCircle aria-hidden="true" className="h-4 w-4 motion-safe:animate-spin"/> : <ArrowRight aria-hidden="true" className="h-4 w-4"/>}
  </button>;
}
