// Test checkout only. An explicit * enables all signed-in accounts.
export function billingConfig(env=process.env){
  const enabled=env.AUTHENTISCAN_BILLING_MODE==='test';
  if(env.AUTHENTISCAN_BILLING_MODE&&!['off','test'].includes(env.AUTHENTISCAN_BILLING_MODE))throw new Error('Live billing is not implemented. Use off or test.');
  const secretKey=env.PAYMONGO_TEST_SECRET_KEY||'',webhookSecret=env.PAYMONGO_TEST_WEBHOOK_SECRET||'';
  if(secretKey&&!/^sk_test_[A-Za-z0-9]+$/.test(secretKey))throw new Error('Only a PayMongo test secret key is permitted.');
  // Approved introductory offer. Explicit blank overrides still disable checkout.
  const raw=env.AUTHENTISCAN_PRO_PRICE_CENTAVOS??'19900';
  const price=/^\d+$/.test(raw)?Number(raw):null;
  if(raw&&(!Number.isSafeInteger(price)||price<2000||price>10000000))throw new Error('Set a valid test price in centavos (at least PHP 20).');
  const origin=env.AUTHENTISCAN_CHECKOUT_ORIGIN||'http://127.0.0.1:5174';
  const local=['http://127.0.0.1:5174','http://localhost:5174'].includes(origin);
  let hosted=false;
  try{
    const url=new URL(origin);
    const allowed=(env.AUTHENTISCAN_ALLOWED_ORIGINS||'').split(',').map(x=>x.trim());
    hosted=env.NODE_ENV==='production'&&url.protocol==='https:'&&url.origin===origin&&
      !url.username&&!url.password&&allowed.includes(origin);
  }catch{}
  if(env.NODE_ENV==='production'?!hosted:!local)throw new Error('Checkout must return to the configured app origin; production requires allowed HTTPS.');
  const testUsers=(env.AUTHENTISCAN_BILLING_TEST_USERS||'').split(',').map(x=>x.trim()).filter(Boolean);
  const purchaseType=env.AUTHENTISCAN_PURCHASE_TYPE??'one_time';
  if(purchaseType&&!['one_time'].includes(purchaseType))throw new Error('Automatic renewal is not implemented.');
  return {enabled,secretKey,webhookSecret,price,origin,testUsers,purchaseType};
}
export function billingReady(c){return Boolean(c.enabled&&c.secretKey&&c.webhookSecret&&c.price&&c.purchaseType==='one_time'&&c.testUsers.length);}
export function billingUserAllowed(uid,testUsers=[]){return typeof uid==='string'&&uid.trim().length>0&&(testUsers.includes('*')||testUsers.includes(uid));}
export function isBillingTester(uid,env=process.env){return env.AUTHENTISCAN_BILLING_MODE==='test'&&billingUserAllowed(uid,(env.AUTHENTISCAN_BILLING_TEST_USERS||'').split(',').map(x=>x.trim()).filter(Boolean));}
export function effectivePlan(profile,now=Date.now(),testAllowed=isBillingTester(profile?.uid)){
  const p=profile?.billing_test;
  if(testAllowed&&p?.status==='active'&&p?.scan_limit===null&&Number.isFinite(p.expires_at)&&p.expires_at>now&&p.source_order)
    return {name:'Pro (Test)',scan_limit:null,billing_cycle:'daily',payment_mode:'test',expires_at:new Date(p.expires_at).toISOString()};
  return {name:'Free',scan_limit:5,billing_cycle:'daily'};
}
export function addCalendarMonth(time){
  const offset=8*3600000,d=new Date(time+offset),day=d.getUTCDate();d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+1);
  const last=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();d.setUTCDate(Math.min(day,last));return d.getTime()-offset;
}
