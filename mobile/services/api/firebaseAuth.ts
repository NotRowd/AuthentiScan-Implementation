import { API_BASE_URL, validateBaseUrl } from './config';

type Credentials = { idToken: string; refreshToken: string; expiresIn: string; displayName?: string; localId?: string };
let apiKey: Promise<string> | undefined;

async function request(url: string, options?: RequestInit) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(url, { ...options, redirect: 'error', signal: controller.signal });
    const data = await response.json();
    if (!response.ok) {
      const code = String(data.error?.message || '').split(' : ')[0];
      const messages: Record<string, string> = {
        EMAIL_EXISTS: 'This email already has an account. Try signing in.',
        INVALID_LOGIN_CREDENTIALS: 'Invalid email or password.',
        INVALID_PASSWORD: 'Invalid email or password.',
        EMAIL_NOT_FOUND: 'Invalid email or password.',
        TOO_MANY_ATTEMPTS_TRY_LATER: 'Too many attempts. Please wait and retry.',
      };
      throw Object.assign(new Error(messages[code] || 'Authentication could not be completed.'), { code });
    }
    return data;
  } finally { clearTimeout(timer); }
}

function getApiKey() {
  const origin = validateBaseUrl(API_BASE_URL);
  if (origin.protocol !== 'https:') throw new Error('Connected mobile builds require the AuthentiScan HTTPS address.');
  apiKey ??= request(origin.origin + '/api/config').then(data => {
    if (data.mode !== 'cloud-hybrid' || data.firebase?.projectId !== 'authentiscan-bc704' ||
        data.authEmulatorUrl !== null || typeof data.firebase.apiKey !== 'string' || !data.firebase.apiKey) {
      throw new Error('The configured server is not the AuthentiScan Firebase backend.');
    }
    return data.firebase.apiKey as string;
  }).catch(error => { apiKey = undefined; throw error; });
  return apiKey;
}

async function account(action: string, body: object) {
  const key = await getApiKey();
  return request('https://identitytoolkit.googleapis.com/v1/accounts:' + action + '?key=' + encodeURIComponent(key), {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
}

export function signIn(email: string, password: string): Promise<Credentials> {
  return account('signInWithPassword', { email, password, returnSecureToken: true });
}

export function signUp(email: string, password: string): Promise<Credentials> {
  return account('signUp', { email, password, returnSecureToken: true });
}

export function setDisplayName(idToken: string, displayName: string) {
  return account('update', { idToken, displayName });
}
export function updatePassword(idToken: string, password: string): Promise<Credentials> {
  return account('update', { idToken, password, returnSecureToken: true });
}

export async function sendPasswordReset(email: string) {
  try { await account('sendOobCode', { requestType: 'PASSWORD_RESET', email }); }
  catch (error) { if ((error as { code?: string }).code !== 'EMAIL_NOT_FOUND') throw error; }
}

export async function refreshCredentials(refreshToken: string): Promise<Credentials> {
  const key = await getApiKey();
  const data = await request('https://securetoken.googleapis.com/v1/token?key=' + encodeURIComponent(key), {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=refresh_token&refresh_token=' + encodeURIComponent(refreshToken),
  });
  return { idToken: data.id_token, refreshToken: data.refresh_token, expiresIn: data.expires_in };
}

async function registrationRequest(action:string,body:object){
  await getApiKey();
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),45000);
  try{
    const response=await fetch(API_BASE_URL+'/api/v1/auth/registration/'+action,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:controller.signal,redirect:'error'});
    const payload=await response.json();
    if(!response.ok||!payload?.success)throw new Error(payload?.message||'Registration service unavailable.');
    return payload;
  }finally{clearTimeout(timer);}
}
export function requestRegistrationCode(email:string):Promise<{data:{challenge_id:string;resend_after:number}}>{return registrationRequest('send-code',{email});}
export function completeRegistration(payload:{email:string;password:string;firstName:string;lastName:string;challenge_id:string;code:string;accept_terms:true}){return registrationRequest('complete',payload);}
