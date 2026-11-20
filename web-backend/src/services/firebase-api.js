import {initializeApp} from 'firebase/app';
import {verifyPasswordResetCode,confirmPasswordReset,EmailAuthProvider,reauthenticateWithCredential,updatePassword} from 'firebase/auth';
import {getAuth,connectAuthEmulator,onAuthStateChanged,setPersistence,browserLocalPersistence,browserSessionPersistence,signInWithEmailAndPassword,signOut,sendPasswordResetEmail} from 'firebase/auth';
// Local builds remain usable over localhost/127.0.0.1. A hosted build must use
// HTTPS; API calls stay same-origin through Firebase Hosting rewrites.
if(!['localhost','127.0.0.1'].includes(location.hostname)&&location.protocol!=='https:')throw new Error('Hosted AuthentiScan must use HTTPS.');
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
  'auth/invalid-email':'Enter a valid email address.',
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
  if(!response.ok){const p=await response.json().catch(()=>({}));if(response.status===401)await clearAuthSession();
    if(p.code==='EMAIL_VERIFICATION_REQUIRED')saveAuthSession({user:{...getStoredUser(),email_verification_required:true,email_verified:false}});
    throw Object.assign(new Error(p.message||'Request could not be completed.'),{status:response.status,code:p.code});}
  return response;
}
async function json(path,options){return (await call(path,options)).json();}
export function fetchEmailVerification(){return json('/v1/auth/email-verification');}
export function sendEmailVerificationCode(){return json('/v1/auth/email-verification/send',{method:'POST',timeout:45000});}
export async function confirmEmailVerificationCode(code){
  const result=await json('/v1/auth/email-verification/confirm',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code})});
  await fetchMe();return result;
}
async function ensureProfile(firstName,lastName){
  await json('/me',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({firstName,lastName})});
  const response=await fetchMe();
  return {user:{...response.data.user,plan:response.data.plan},token:auth.currentUser.uid};
}
async function registrationRequest(action,body,signal){
  const timed=AbortSignal.timeout(45000),combined=signal?AbortSignal.any([signal,timed]):timed;
  const response=await fetch('/api/v1/auth/registration/'+action,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:combined,cache:'no-store'});
  const payload=await response.json().catch(()=>null);
  if(!response.ok||!payload?.success)throw new Error(payload?.message||'Registration service unavailable. Please try again.');
  return payload;
}
export function requestRegistrationCode(email,signal){return registrationRequest('send-code',{email},signal);}
export async function registerAccount({firstName,lastName,email,password,challenge_id,code,accept_terms}){
  if(!challenge_id||!/^\d{6}$/.test(code||''))throw new Error('Verify your email code before creating an account.');
  await registrationRequest('complete',{firstName,lastName,email,password,challenge_id,code,accept_terms});
  try{return await loginAccount({email,password,rememberMe:true});}
  catch{throw new Error('Your verified account was created. Please sign in with your password to continue.');}
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
export async function fetchMe(){
  const ticket=epoch;
  const response=await json('/v1/auth/me');
  if(ticket===epoch&&!blocked&&response.data?.user?.user_id===auth.currentUser?.uid){
    saveAuthSession({user:{...response.data.user,plan:response.data.plan}});
  }
  return response;
}
export async function updateAccountProfile(names){
  const response=await json('/v1/auth/me',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(names)});
  saveAuthSession({user:{...response.data.user,plan:response.data.plan}});
  return response;
}
export async function saveAvatar(file){
  const form=new FormData();form.append('image',file,'avatar.jpg');
  const response=await json('/v1/auth/me/avatar',{method:'PUT',body:form,timeout:45000});
  saveAuthSession({user:{...response.data.user,plan:response.data.plan}});
  return response;
}
export async function removeAvatar(){
  const response=await json('/v1/auth/me/avatar',{method:'DELETE'});
  saveAuthSession({user:{...response.data.user,plan:response.data.plan}});
  return response;
}
export async function requestPasswordReset(email){
  const address=String(email||'').trim();
  if(address.length>254||!/^\S+@\S+\.\S+$/.test(address))throw new Error('Enter a valid email address.');
  try{await sendPasswordResetEmail(auth,address);}
  catch(e){if(e.code!=='auth/user-not-found')throw new Error(friendly(e));}
  // Do not disclose whether an email is registered.
  return {message:isCloudMode?'If an account exists for this email, a reset link will be sent. Check your inbox and spam folder.':'If the test account exists, the reset link is available in the Authentication emulator terminal. No real email is sent.'};
}
export async function changeAccountPassword({currentPassword,newPassword,confirmPassword}){
  if(typeof currentPassword!=='string'||!currentPassword)throw new Error('Enter your current password.');
  if(typeof newPassword!=='string'||newPassword.length<8)throw new Error('Use at least eight characters for your new password.');
  if(newPassword!==confirmPassword)throw new Error('The new passwords do not match.');
  if(newPassword===currentPassword)throw new Error('Choose a new password different from your current password.');
  await ready;
  const user=auth.currentUser;
  if(!user?.email||blocked)throw new Error('Please sign in again to change your password.');
  const sameSession=()=>auth.currentUser===user&&!blocked;
  try{
    await reauthenticateWithCredential(user,EmailAuthProvider.credential(user.email,currentPassword));
    if(!sameSession())throw new Error('Session changed. Please sign in again.');
    await updatePassword(user,newPassword);
  }catch(e){
    if(['auth/invalid-credential','auth/wrong-password'].includes(e.code))throw new Error('Your current password is incorrect.');
    if(e.code==='auth/requires-recent-login')throw new Error('Please sign in again before changing your password.');
    throw new Error(friendly(e));
  }
  // Updating a Firebase password revokes older sessions. Refresh this session's token.
  try{
    if(!sameSession())throw new Error('Session changed.');
    await user.getIdToken(true);
  }catch{
    throw new Error('Your password was updated. Please sign in again using your new password.');
  }
}
function resetError(e){
  if(['auth/expired-action-code','auth/invalid-action-code','auth/user-disabled','auth/user-not-found'].includes(e.code))return new Error('This reset link has expired or has already been used. Request a new link to continue.');
  return new Error(friendly(e));
}
export async function checkPasswordResetLink(code){
  try{return await verifyPasswordResetCode(auth,code);}catch(e){throw resetError(e);}
}
export async function finishPasswordReset(code,password){
  if(password.length<8)throw new Error('Use at least eight characters for your password.');
  try{await confirmPasswordReset(auth,code,password);}catch(e){throw resetError(e);}
}
export function fetchUserStats(signal){return json('/v1/users/stats',{signal});}
export async function fetchBilling(signal){
  const result=await json('/v1/billing',{signal});
  signal?.throwIfAborted();
  const user=getStoredUser();if(user&&result.data?.plan)saveAuthSession({user:{...user,plan:result.data.plan}});
  return result;
}
export function createCheckout(signal){return json('/v1/billing/checkout',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({accept_test_purchase:true}),signal,timeout:30000});}
export function refreshPayment(id,signal){if(!/^[a-f0-9-]{36}$/.test(id))throw new Error('Invalid order ID.');return json(`/v1/billing/orders/${id}/refresh`,{method:'POST',signal,timeout:30000});}
export function fetchSystemReadiness(signal){return json('/v1/system/health',{signal});}
export function fetchUserScans({q='',status='all',limit=20,offset=0,signal}={}){
  return json('/v1/scans?'+new URLSearchParams({q,status,limit:String(limit),offset:String(offset)}),{signal});
}
const validId=id=>{if(!/^[a-f0-9-]{36}$/.test(String(id)))throw new Error('Invalid scan ID.');return id;};
export function fetchScanDetails(id,signal){return json(`/v1/scans/${validId(id)}`,{signal});}
export function fetchScanFeedback(id,signal){return json(`/v1/scans/${validId(id)}/feedback`,{signal});}
export function saveScanFeedback(id,feedback,signal){return json(`/v1/scans/${validId(id)}/feedback`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(feedback),signal});}
export function deleteScan(id,signal){return json(`/v1/scans/${validId(id)}`,{method:'DELETE',signal,timeout:145000});}
export function detectScanObjects(id,signal){return json(`/v1/scans/${validId(id)}/objects`,{method:'POST',signal,timeout:85000});}
// Include the bounded 60-second model queue plus inference and response overhead.
export function explainScanScene(id,signal){return json(`/v1/scans/${validId(id)}/scene`,{method:'POST',signal,timeout:260000});}
export function reviewScanFeatures(id,signal){return json(`/v1/scans/${validId(id)}/features`,{method:'POST',signal,timeout:380000});}
export async function fetchObjectImage(id,signal){return (await call(`/v1/scans/${validId(id)}/object-image`,{signal,timeout:50000})).blob();}
export async function fetchLocalizationImage(id,signal){return (await call(`/v1/scans/${validId(id)}/localization-image`,{signal,timeout:110000})).blob();}
const pendingUploads=new WeakMap();
export async function uploadScanImage(image,signal){
  const id=pendingUploads.get(image)||crypto.randomUUID();pendingUploads.set(image,id);
  const form=new FormData();form.append('image',image);
  const response=await json('/v1/scans',{method:'POST',body:form,headers:{'Idempotency-Key':id},timeout:660000,signal});
  pendingUploads.delete(image);return response;
}
export async function fetchScanImage(id,signal){return (await call(`/v1/scans/${validId(id)}/image`,{signal,timeout:60000})).blob();}
export async function fetchScanHeatmap(id,signal){return (await call(`/v1/scans/${validId(id)}/heatmap`,{signal})).blob();}
export async function fetchScanReport(id,signal){
  const response=await call(`/v1/scans/${validId(id)}/report`,{signal,timeout:30000});
  if(response.headers.get('content-type')?.split(';')[0]!=='application/pdf')throw new Error('The backend did not return a PDF.');
  const blob=await response.blob();
  if(!blob.size||blob.size>16*1024*1024||await blob.slice(0,5).text()!=='%PDF-')throw new Error('Invalid PDF response.');
  return blob;
}
