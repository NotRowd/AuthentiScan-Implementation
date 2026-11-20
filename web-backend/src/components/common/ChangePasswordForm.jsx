import {useRef,useState} from 'react';
import {Eye,EyeOff} from 'lucide-react';
import {changeAccountPassword} from '../../services/api';

export default function ChangePasswordForm({compact=false}){
  const [values,setValues]=useState({currentPassword:'',newPassword:'',confirmPassword:''});
  const [visible,setVisible]=useState({}),[busy,setBusy]=useState(false);
  const [error,setError]=useState(''),[message,setMessage]=useState('');
  const submitting=useRef(false);
  async function submit(event){
    event.preventDefault();
    if(submitting.current)return;
    setError('');setMessage('');
    if(values.newPassword!==values.confirmPassword){setError('The new passwords do not match.');return;}
    if(values.currentPassword===values.newPassword){setError('Choose a new password different from your current password.');return;}
    submitting.current=true;setBusy(true);
    try{
      await changeAccountPassword(values);
      setValues({currentPassword:'',newPassword:'',confirmPassword:''});setVisible({});
      setMessage('Password updated successfully. Use your new password the next time you sign in.');
    }catch(e){
      setError(e.message||'Could not update your password. Please try again.');
      setValues({currentPassword:'',newPassword:'',confirmPassword:''});setVisible({});
    }finally{submitting.current=false;setBusy(false);}
  }
  return <form onSubmit={submit} className={compact?"profile-password-form":"mt-6 space-y-4"} aria-label="Change password" aria-busy={busy} aria-describedby={compact?"profile-password-guidance":undefined}>
    {[
      ['currentPassword','Current password','current-password'],
      ['newPassword','New password','new-password'],
      ['confirmPassword','Confirm new password','new-password'],
    ].map(([name,label,autoComplete])=><div key={name}>
      <label htmlFor={'change-'+name} className="block text-sm font-medium text-ink-secondary">{label}</label>
      <div className="relative mt-2">
        <input id={'change-'+name} name={name} type={visible[name]?'text':'password'} autoComplete={autoComplete}
          value={values[name]} onChange={e=>{setValues({...values,[name]:e.target.value});setError('');setMessage('');}}
          required minLength={name==='currentPassword'?undefined:8} disabled={busy}
          aria-describedby={name==='newPassword'?'change-password-hint':undefined}
          className="w-full rounded-xl border border-control bg-surface p-3 pr-12 text-sm text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-focus disabled:bg-canvas"/>
        <button type="button" aria-label={(visible[name]?'Hide ':'Show ')+label.toLowerCase()} aria-pressed={!!visible[name]}
          disabled={busy} onClick={()=>setVisible({...visible,[name]:!visible[name]})}
          className="absolute inset-y-0 right-0 rounded-r-xl px-3 text-ink-muted hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus">
          {visible[name]?<EyeOff size={18} aria-hidden="true"/>:<Eye size={18} aria-hidden="true"/>}
        </button>
      </div>
      {name==='newPassword'&&!compact&&<p id="change-password-hint" className="mt-2 text-xs text-ink-muted">Use at least 8 characters and a password different from your current one.</p>}
    </div>)}
    {compact&&<p id="change-password-hint" className="text-xs text-ink-muted">Use at least 8 characters and a password different from your current one.</p>}
    {error&&<p role="alert" className="rounded-xl bg-danger-soft p-3 text-sm text-danger">{error}</p>}
    {message&&<p role="status" className="rounded-xl bg-success-soft p-3 text-sm text-success">{message}</p>}
    <button type="submit" disabled={busy} className="theme-action rounded-xl bg-action px-5 py-3 text-sm font-semibold text-on-action hover:bg-action-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-100 disabled:bg-disabled disabled:text-disabled-ink disabled:border-line">{busy?'Updating password…':'Update password'}</button>
  </form>;
}
