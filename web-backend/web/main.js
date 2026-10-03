import './style.css';
import {initializeApp} from 'firebase/app';
import {getAuth, connectAuthEmulator, onAuthStateChanged, browserSessionPersistence, setPersistence, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut} from 'firebase/auth';
import {PROJECT_ID} from '../local-config.mjs';

if (!['127.0.0.1','localhost'].includes(location.hostname)) throw new Error('Local test page only.');
const app = initializeApp({projectId:PROJECT_ID,apiKey:'local-test-key',appId:'local-test-app'});
const auth = getAuth(app);
// The page has a persistent, accessible local-only warning of its own.
connectAuthEmulator(auth, 'http://127.0.0.1:9099', {disableWarnings:true});
await setPersistence(auth, browserSessionPersistence);
const $ = id => document.getElementById(id);
let epoch = 0, busy = false;
function message(text='', isError=false) { $('message').textContent=text; $('message').className=isError?'error':''; }
function lock(value) {busy=value; document.querySelectorAll('button').forEach(b=>b.disabled=value);}
function show(id) {for (const panel of ['auth-panel','profile-panel','account-panel']) $(panel).hidden=panel!==id;}
function friendly(e) {
  const messages={'auth/email-already-in-use':'This local test email already exists. Sign in instead.', 'auth/invalid-credential':'Incorrect email or password.', 'auth/wrong-password':'Incorrect email or password.', 'auth/user-not-found':'Incorrect email or password.', 'auth/weak-password':'Use a password of at least eight characters.', 'auth/network-request-failed':'Cannot reach the local Authentication emulator. Check the terminal.', 'auth/too-many-requests':'Too many attempts. Wait a moment and try again.'};
  return messages[e.code] || e.message || 'The local test could not be completed.';
}
async function request(path, options={}) {
  const user=auth.currentUser, ticket=epoch;
  if (!user) throw new Error('Please sign in.');
  const token=await user.getIdToken(); // SDK refreshes expired tokens automatically.
  const response=await fetch('/api'+path,{...options,headers:{...options.headers,Authorization:'Bearer '+token},signal:AbortSignal.timeout(15000)});
  if (ticket!==epoch || auth.currentUser?.uid!==user.uid) throw new Error('Session changed. Please retry.');
  if (!response.ok) {const payload=await response.json().catch(()=>({}));throw Object.assign(new Error(payload.message||'Local service unavailable.'),{status:response.status});}
  return response;
}
async function listFiles() {
  const {files}=await (await request('/files')).json();
  $('files').replaceChildren();
  if (!files.length) {const li=document.createElement('li');li.textContent='No local test images yet.';$('files').append(li);}
  for (const file of files) {
    const li=document.createElement('li'),label=document.createElement('span'),button=document.createElement('button');
    label.textContent=`${file.filename} · ${(file.bytes/1024).toFixed(1)} KB`;
    button.textContent='Download test copy';button.className='secondary';
    button.onclick=()=>perform(async()=>{
      const blob=await (await request('/files/'+encodeURIComponent(file.id))).blob();
      const url=URL.createObjectURL(blob), a=document.createElement('a');
      a.href=url;a.download=file.filename;document.body.append(a);a.click();a.remove();
      setTimeout(()=>URL.revokeObjectURL(url),30000);
      message('Download started. Check your browser downloads.');
    });
    li.append(label,button);$('files').append(li);
  }
}
async function loadProfile() {
  try {
    const {profile,allowance}=await (await request('/me')).json();
    $('greeting').textContent=`Hello, ${profile.first_name}`;
    $('account-email').textContent=profile.email;
    $('remaining').textContent=`${allowance.remaining} / ${allowance.limit} scans available`;
    $('reset').textContent='Next reset: '+new Date(allowance.resets_at).toLocaleString('en-PH',{timeZone:'Asia/Manila'})+' (Philippine time)';
    show('account-panel');await listFiles();
  } catch(e) {if(e.status===404) show('profile-panel'); else throw e;}
}
async function perform(fn) {if(busy)return;lock(true);message();try{await fn();}catch(e){message(friendly(e),true);}finally{lock(false);}}
onAuthStateChanged(auth, async user=>{
  const ticket=++epoch;
  $('files').replaceChildren();$('account-email').textContent='';$('password').value='';
  if(!user){show('auth-panel');return;}
  show(null);
  try {await loadProfile();} catch(e) {if(ticket===epoch){show('profile-panel');message(friendly(e),true);}}
});
async function authenticate(register) {
  if(!$('auth-form').reportValidity())return;
  await perform(async()=>{
    const email=$('email').value.trim(),password=$('password').value;
    if(register) await createUserWithEmailAndPassword(auth,email,password);
    else await signInWithEmailAndPassword(auth,email,password);
    message(register?'Local test account created. Complete your profile below.':'Signed in to the local emulator.');
  });
}
$('auth-form').onsubmit=e=>{e.preventDefault();authenticate(false);};
$('register').onclick=()=>authenticate(true);
$('profile-form').onsubmit=e=>{e.preventDefault();perform(async()=>{
  await request('/me',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({firstName:$('first-name').value,lastName:$('last-name').value})});
  await loadProfile();message('Profile saved to local Firestore.');
});};
for(const button of document.querySelectorAll('.logout')) button.onclick=()=>perform(async()=>{await signOut(auth);$('image').value='';message('Signed out.');});
$('refresh').onclick=()=>perform(async()=>{await loadProfile();message('Local account refreshed.');});
$('upload-form').onsubmit=e=>{e.preventDefault();perform(async()=>{
  const file=$('image').files[0];
  if(!file || !['image/jpeg','image/png','image/webp'].includes(file.type))throw new Error('Choose a JPEG, PNG, or WebP image.');
  if(file.size>10*1024*1024)throw new Error('Maximum image size is 10 MB.');
  const form=new FormData();form.append('image',file);
  const result=await (await request('/files',{method:'POST',body:form})).json();
  await listFiles();$('image').value='';message(result.message);
});};
try {
  const r=await fetch('/api/health',{signal:AbortSignal.timeout(15000)});
  $('health').textContent=r.ok?'Authentication, Firestore, and Storage emulators are ready.':'Some local services are unavailable. Check the terminal.';
} catch {$('health').textContent='Local API unavailable. Run npm start from the firebase-local folder.';}
