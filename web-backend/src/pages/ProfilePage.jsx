import {useState,useEffect} from 'react';
import {useNavigate} from 'react-router-dom';
import {Key,AlertCircle,LogOut,Loader2,ShieldCheck} from 'lucide-react';
import DashboardLayout from '../components/layout/DashboardLayout';
import ScanOverview from '../components/common/ScanOverview';
import ProfileEditor from '../components/common/ProfileEditor';
import AvatarEditor from '../components/common/AvatarEditor';
import Avatar from '../components/common/Avatar';
import ChangePasswordForm from '../components/common/ChangePasswordForm';
import {fetchMe,clearAuthSession} from '../services/api';
import './ProfilePage.css';

function accountDate(value,withTime=false){
  if(!value)return 'Not available';
  const date=new Date(value);
  if(!Number.isFinite(date.getTime()))return 'Not available';
  return new Intl.DateTimeFormat(undefined,withTime?{dateStyle:'medium',timeStyle:'short'}:{dateStyle:'medium'}).format(date);
}
export default function ProfilePage(){
  const [profileData,setProfileData]=useState(null),[isLoading,setIsLoading]=useState(true),[error,setError]=useState(''),[attempt,setAttempt]=useState(0);
  const navigate=useNavigate();
  useEffect(()=>{
    let active=true;setIsLoading(true);setError('');
    fetchMe().then(response=>{if(active){setProfileData(response.data);setIsLoading(false);}}).catch(e=>{if(active){setError(e.message||'Could not load your profile.');setIsLoading(false);}});
    return ()=>{active=false;};
  },[attempt]);
  const user=profileData?.user,plan=profileData?.plan;
  const initials=user?.first_name&&user?.last_name?`${user.first_name[0]}${user.last_name[0]}`.toUpperCase():'US';
  return <DashboardLayout><div className="profile-settings">
    <header className="profile-page-heading"><div><p className="profile-eyebrow">Account settings</p><h1>Profile &amp; Settings</h1><p className="profile-page-description">Manage your profile, photo, and password.</p></div><button type="button" className="btn profile-logout" aria-label="Log out" onClick={()=>{clearAuthSession();navigate('/login');}}><LogOut size={17} aria-hidden="true"/><span>Log out</span></button></header>
    {isLoading?<section className="profile-card profile-load" role="status"><Loader2 className="animate-spin motion-reduce:animate-none" size={23} aria-hidden="true"/><p>Loading your profile…</p></section>:error?<section className="profile-card profile-load-error"><div role="alert"><AlertCircle size={20} aria-hidden="true"/><p>{error}</p></div><p>Check your connection, then try again.</p><button className="btn btn-primary" type="button" onClick={()=>setAttempt(n=>n+1)}>Try again</button></section>:<div className="profile-grid">
      <div className="profile-left"><section className="profile-card profile-summary" aria-label="Profile summary"><div className="profile-avatar"><Avatar user={user} initials={initials}/></div><div className="profile-identity"><h2>{user?.first_name} {user?.last_name}</h2><p className="profile-email">{user?.email}</p><span className="profile-plan-badge"><ShieldCheck size={14} aria-hidden="true"/>{plan?.scan_limit===null?'Pro':plan?.name||'Plan unavailable'}{plan?' plan':''}</span><p className="profile-allowance">{plan?.scan_limit===null?'Unlimited scans':plan?.scan_limit!=null?`${plan.scan_limit} scans/day`:'Allowance unavailable'}</p></div><AvatarEditor user={user} onSaved={setProfileData} compact/></section><ScanOverview/></div>
      <div className="profile-right"><section className="profile-card profile-details"><ProfileEditor user={user} onSaved={setProfileData}/><dl className="profile-metadata"><div><dt>Account created</dt><dd>{accountDate(user?.created_at)}</dd></div><div><dt>Last sign-in</dt><dd>{accountDate(user?.last_login_at,true)}</dd></div></dl></section>
        <section className="profile-card profile-security" aria-labelledby="profile-password-heading"><div className="profile-section-heading"><span className="profile-icon"><Key size={19} aria-hidden="true"/></span><h2 id="profile-password-heading">Change password</h2></div><p id="profile-password-guidance" className="profile-password-guidance">Enter your current password to choose a new one. Your saved scans stay in your account.</p><ChangePasswordForm compact/></section>
      </div></div>}
  </div></DashboardLayout>;
}
