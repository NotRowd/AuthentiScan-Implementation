import {useEffect,useRef,useState} from 'react';
import {User} from 'lucide-react';
import {updateAccountProfile} from '../../services/api';
const valid=value=>typeof value==='string'&&value.trim().length>=1&&value.trim().length<=100&&!/[\u0000-\u001f\u007f]/.test(value);
export default function ProfileEditor({user,onSaved}){
  const [editing,setEditing]=useState(false),[firstName,setFirst]=useState(user.first_name),[lastName,setLast]=useState(user.last_name),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),[invalid,setInvalid]=useState({});
  const submitting=useRef(false),first=useRef(null),last=useRef(null),editButton=useRef(null),focusEdit=useRef(false);
  useEffect(()=>{if(!editing){setFirst(user.first_name);setLast(user.last_name);if(focusEdit.current){editButton.current?.focus();focusEdit.current=false;}}else first.current?.focus();},[editing,user.first_name,user.last_name]);
  const dirty=editing&&(firstName!==user.first_name||lastName!==user.last_name);
  useEffect(()=>{if(!dirty)return;const warn=e=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[dirty]);
  async function save(e){
    e.preventDefault();if(submitting.current)return;setError('');setMessage('');
    const errors={firstName:!valid(firstName),lastName:!valid(lastName)};setInvalid(errors);
    if(errors.firstName||errors.lastName){(errors.firstName?first:last).current?.focus();return;}
    submitting.current=true;setBusy(true);
    try{const response=await updateAccountProfile({firstName:firstName.trim(),lastName:lastName.trim()});onSaved(response.data);focusEdit.current=true;setEditing(false);setMessage('Profile changes saved. Your web and mobile account use these names.');}
    catch(e){setError(e.message||'Could not save your profile. Check your connection and select Save changes to retry.');}finally{submitting.current=false;setBusy(false);}
  }
  return <form onSubmit={save} noValidate aria-label="Personal details" aria-busy={busy}>
    <div className="profile-details-heading"><div className="profile-section-heading"><span className="profile-icon"><User size={19} aria-hidden="true"/></span><div><h2>Personal details</h2><p>Your registered account information</p></div></div>{!editing&&<button ref={editButton} type="button" className="btn" onClick={()=>{setEditing(true);setMessage('');setError('');setInvalid({});}}>Edit profile</button>}</div>
    <div className="profile-fields">{[['First name',firstName,setFirst,'firstName',first],['Last name',lastName,setLast,'lastName',last]].map(([label,value,setValue,name,ref])=><div className="profile-field" key={name}>{editing?<><label htmlFor={'profile-'+name}>{label}</label><input ref={ref} id={'profile-'+name} name={name} value={value} onChange={e=>{setValue(e.target.value);setInvalid(current=>({...current,[name]:false}));setError('');}} disabled={busy} maxLength={100} required autoComplete={name==='firstName'?'given-name':'family-name'} aria-invalid={invalid[name]||undefined} aria-describedby={invalid[name]?'profile-'+name+'-error':undefined}/>{invalid[name]&&<p id={'profile-'+name+'-error'} className="profile-field-error">Enter your {label.toLowerCase()} (1–100 characters).</p>}</>:<><span className="profile-field-label">{label}</span><p className="profile-field-value">{value}</p></>}</div>)}<div className="profile-readonly-email"><span className="profile-field-label">Email address <span className="profile-readonly-badge">Read-only</span></span><p className="profile-field-value">{user.email}</p></div></div>
    {error&&<p role="alert" className="profile-feedback profile-feedback-error">{error}</p>}{message&&<p role="status" className="profile-feedback">{message}</p>}
    {editing&&<div className="profile-edit-actions"><button disabled={busy} className="btn btn-primary" type="submit">{busy?'Saving changes…':'Save changes'}</button><button disabled={busy} type="button" className="btn" onClick={()=>{focusEdit.current=true;setFirst(user.first_name);setLast(user.last_name);setEditing(false);setError('');setInvalid({});}}>Cancel</button></div>}
  </form>;
}
