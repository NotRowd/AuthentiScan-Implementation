import {initializeApp} from 'firebase/app';
import {getAuth,connectAuthEmulator,onAuthStateChanged,setPersistence,browserLocalPersistence,browserSessionPersistence,createUserWithEmailAndPassword,signInWithEmailAndPassword,signOut,updateProfile} from 'firebase/auth';
if(!['localhost','127.0.0.1'].includes(location.hostname))throw new Error('This Firebase build is local-only.');
const configResponse=await fetch('/api/config',{cache:'no-store',signal:AbortSignal.timeout(10000)});
if(!configResponse.ok)throw new Error('Cannot read backend configuration. Start the correct backend.');
const config=await configResponse.json();
export const isCloudMode=config.mode==='cloud-hybrid';
export const usesCloudMedia=isCloudMode&&config.media==='cloudinary';
if(isCloudMode?(config.firebase?.projectId!=='authentiscan-bc704'||config.authEmulatorUrl!==null):(config.mode!=='emulator'||config.firebase?.projectId!=='demo-authentiscan-local'||config.authEmulatorUrl!=='http://127.0.0.1:9099'))throw new Error('Backend Firebase configuration does not match the selected environment.');
const app=initializeApp(config.firebase,isCloudMode?'authentiscan-cloud-web':'authentiscan-web');
const auth=getAuth(app);
if(!isCloudMode)connectAuthEmulator(auth,config.authEmulatorUrl,{disableWarnings:true});
const USER_KEY='authentiscan_profile_'+config.firebase.projectId;
let blocked=false,epoch=0;
onAuthStateChanged(auth,()=>{epoch++;window.dispatchEvent(new Event('auth-session-expired'));});
export const ready=auth.authStateReady();
const friendly=e=>({
  'auth/email-already-in-use':'This email already has an account in this Firebase environment. Try signing in.',
  'auth/invalid-credential':'Invalid email or password.',
  'auth/wrong-password':'Invalid email or password.',
  'auth/user-not-found':'Invalid email or password.',
  'auth/weak-password':'Use at least eight characters for your password.',
  'auth/network-request-failed':isCloudMode?'Cannot reach Firebase Authentication. Check your internet connection.':'Cannot reach Firebase Authentication. Start the local emulators.',
  'auth/operation-not-allowed':'Enable Email/Password sign-in in Firebase Authentication first.',
  'auth/too-many-requests':'Too many attempts. Please wait and retry.',
}[e.code]||e.message||'The request could not be completed.');
export function getAuthToken(){return blocked?null:auth.currentUser?.uid||null;}
export function getStoredUser(){
  if(!getAuthToken())return null;
  try{const user=JSON.parse(sessionStorage.getItem(USER_KEY));if(user?.user_id===auth.currentUser.uid)return user;}catch{}
  return {user_id:auth.currentUser.uid,first_name:auth.currentUser.displayName?.split(' ')[0]||'User',last_name:'',email:auth.currentUser.email,plan:{name:'Free',scan_limit:5}};
}
export function saveAuthSession(data){sessionStorage.setItem(USER_KEY,JSON.stringify(data.user));blocked=false;window.dispatchEvent(new Event('auth-session-expired'));}
export function clearAuthSession(){blocked=true;epoch++;sessionStorage.removeItem(USER_KEY);window.dispatchEvent(new Event('auth-session-expired'));return signOut(auth);}
async function call(path,{signal,headers={},timeout=20000,...options}={}){
  await ready;
  const user=auth.currentUser,ticket=epoch;
  if(!user||blocked)throw new Error('Please sign in.');
  const token=await user.getIdToken();
  const timed=AbortSignal.timeout(timeout), combined=signal?AbortSignal.any([signal,timed]):timed;
  let response;
  try{response=await fetch('/api'+path,{...options,headers:{...headers,Authorization:'Bearer '+token},signal:combined,cache:'no-store'});}
  catch(e){if(signal?.aborted)throw e;throw new Error(timed.aborted?(path==='/v1/scans'&&options.method==='POST'?'Request timed out. Check History before submitting another scan.':'Request timed out. Check local services and retry.'):'Cannot reach the local backend. Check the terminal and try again.');}
  if(epoch!==ticket||auth.currentUser?.uid!==user.uid||blocked)throw new Error('Session changed. Please retry.');
  if(!response.ok){const p=await response.json().catch(()=>({}));if(response.status===401)await clearAuthSession();throw Object.assign(new Error(p.message||'Request could not be completed.'),{status:response.status});}
  return response;
}
async function json(path,options){return (await call(path,options)).json();}
async function ensureProfile(firstName,lastName){
  await json('/me',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({firstName,lastName})});
  const response=await fetchMe();
  return {user:{...response.data.user,plan:response.data.plan},token:auth.currentUser.uid};
}
export async function registerAccount({firstName,lastName,email,password}){
  if(!firstName?.trim()||!lastName?.trim()||firstName.length>100||lastName.length>100||password.length<8)throw new Error('Provide names up to 100 characters and a password of at least eight characters.');
  try{
    await setPersistence(auth,browserLocalPersistence);
    const credential=await createUserWithEmailAndPassword(auth,email.trim(),password);blocked=false;
    await updateProfile(credential.user,{displayName:firstName.trim()+' '+lastName.trim()});
    const data=await ensureProfile(firstName.trim(),lastName.trim());return {success:true,data};
  }catch(e){throw new Error(friendly(e));}
}
export async function loginAccount({email,password,rememberMe=false}){
  try{
    await setPersistence(auth,rememberMe?browserLocalPersistence:browserSessionPersistence);
    await signInWithEmailAndPassword(auth,email.trim(),password);blocked=false;
    let response;
    try{response=await fetchMe();}
    catch(e){
      if(e.status!==404)throw e;
      // Recover an interrupted signup using the name already stored by Auth.
      const [first,...last]=(auth.currentUser.displayName||'Local User').split(' ');
      return {success:true,data:await ensureProfile(first,last.join(' ')||'User')};
    }
    return {success:true,data:{user:{...response.data.user,plan:response.data.plan},token:auth.currentUser.uid}};
  }catch(e){throw new Error(friendly(e));}
}
export function fetchMe(){return json('/v1/auth/me');}
export function fetchUserStats(signal){return json('/v1/users/stats',{signal});}
export function fetchSystemReadiness(signal){return json('/v1/system/health',{signal});}
export function fetchUserScans({q='',status='all',limit=20,offset=0,signal}={}){
  return json('/v1/scans?'+new URLSearchParams({q,status,limit:String(limit),offset:String(offset)}),{signal});
}
const validId=id=>{if(!/^[a-f0-9-]{36}$/.test(String(id)))throw new Error('Invalid scan ID.');return id;};
export function fetchScanDetails(id,signal){return json(`/v1/scans/${validId(id)}`,{signal});}
const pendingUploads=new WeakMap();
export async function uploadScanImage(image){
  const id=pendingUploads.get(image)||crypto.randomUUID();pendingUploads.set(image,id);
  const form=new FormData();form.append('image',image);
  const response=await json('/v1/scans',{method:'POST',body:form,headers:{'Idempotency-Key':id},timeout:155000});
  pendingUploads.delete(image);return response;
}
export async function fetchScanImage(id,signal){return (await call(`/v1/scans/${validId(id)}/image`,{signal})).blob();}
export async function fetchScanHeatmap(id,signal){return (await call(`/v1/scans/${validId(id)}/heatmap`,{signal})).blob();}
export async function fetchScanReport(id,signal){
  const response=await call(`/v1/scans/${validId(id)}/report`,{signal,timeout:30000});
  if(response.headers.get('content-type')?.split(';')[0]!=='application/pdf')throw new Error('The backend did not return a PDF.');
  const blob=await response.blob();
  if(!blob.size||blob.size>16*1024*1024||await blob.slice(0,5).text()!=='%PDF-')throw new Error('Invalid PDF response.');
  return blob;
}
