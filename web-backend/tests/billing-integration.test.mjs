import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHmac} from 'node:crypto';
import {createApp} from '../server/app.mjs';
import {createBilling} from '../server/billing.mjs';
import {db} from '../server/firebase.mjs';
import {reserveScan,finishScan,readAllowance} from '../server/allowance.mjs';
let server,base,clock=Date.now(),failOnce=false,gate=null,gateStarted=null,creates=0;
const sessions=new Map(),byOrder=new Map();
const config={enabled:true,secretKey:'sk_test_fixture',webhookSecret:'test-webhook-secret',price:19900,origin:'http://127.0.0.1:5174',testUsers:[],purchaseType:'one_time'};
const provider={
  async create(order){
    creates++;gateStarted?.();if(gate)await gate;
    let session=byOrder.get(order.id);
    if(!session){session={id:'cs_'+randomUUID().replaceAll('-',''),type:'checkout_session',attributes:{livemode:false,reference_number:order.id,metadata:{authentiscan_order:order.id},checkout_url:'https://checkout.paymongo.com/test',status:'active',payments:[]}};byOrder.set(order.id,session);sessions.set(session.id,session);}
    if(failOnce){failOnce=false;throw new Error('simulated ambiguous timeout');}return structuredClone(session);
  },
  async retrieve(id){assert.ok(sessions.has(id));return structuredClone(sessions.get(id));},
};
const billing=createBilling({db,config,provider,now:()=>clock});
const post=body=>({method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
const api=(user,path,options={})=>fetch(base+path,{...options,headers:{...(user?{Authorization:'Bearer '+user.token}:{}),...options.headers}});
async function account(allow=true){
  const r=await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=local-test-key',post({email:'billing-'+randomUUID()+'@example.test',password:'TestBilling123!',returnSecureToken:true}));
  assert.equal(r.status,200);const info=await r.json(),user={uid:info.localId,token:info.idToken};
  assert.equal((await api(user,'/me',post({firstName:'Billing',lastName:'Test'}))).status,200);
  if(allow){config.testUsers.push(user.uid);process.env.AUTHENTISCAN_BILLING_TEST_USERS=config.testUsers.join(',');}return user;
}
async function order(user){const r=await api(user,'/v1/billing/checkout',post({accept_test_purchase:true}));assert.equal(r.status,200);return (await r.json()).data;}
function paid(o,patch={}){const s=byOrder.get(o.id);s.attributes.payments=[{id:'pay_'+randomUUID().replaceAll('-',''),attributes:{status:'paid',amount:19900,currency:'PHP',livemode:false,source:{type:'gcash'},...patch}}];return s;}
function event(s,{live=false,legacy=true}={}){const payload={type:'checkout_session.payment.paid',livemode:live,data:s};return Buffer.from(JSON.stringify({data:legacy?{id:'evt_test',type:'event',attributes:payload}:payload}));}
async function hook(bytes,{time=clock,signature}={}){
  const t=String(Math.floor(time/1000)),sig=createHmac('sha256',config.webhookSecret).update(t+'.').update(bytes).digest('hex');
  return fetch(base+'/payments/paymongo/webhook',{method:'POST',headers:{'Content-Type':'application/json','Paymongo-Signature':signature||'t='+t+',te='+sig+',li='},body:bytes});
}
before(async()=>{process.env.AUTHENTISCAN_BILLING_MODE='test';server=createApp({billing}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));base='http://127.0.0.1:'+server.address().port+'/api';});
after(async()=>{delete process.env.AUTHENTISCAN_BILLING_MODE;delete process.env.AUTHENTISCAN_BILLING_TEST_USERS;if(server)await new Promise(r=>server.close(r));await db.terminate();});
test('checkout is authenticated, allowlisted, server-priced, cached, and does not grant access on return',async()=>{
  const user=await account(),other=await account(false);
  assert.equal((await api(null,'/v1/billing')).status,401);
  assert.equal((await api(other,'/v1/billing/checkout',post({accept_test_purchase:true}))).status,403);
  for(const body of [{},{accept_test_purchase:false},{accept_test_purchase:true,amount:1},{accept_test_purchase:true,owner_uid:other.uid}])assert.equal((await api(user,'/v1/billing/checkout',post(body))).status,400);
  const before=creates,o=await order(user),again=await order(user);assert.equal(o.id,again.id);assert.equal(creates,before+1);
  assert.equal((await api(other,'/v1/billing/orders/'+o.id+'/refresh',{method:'POST'})).status,403);
  const otherAllowed=await account();assert.equal((await api(otherAllowed,'/v1/billing/orders/'+o.id+'/refresh',{method:'POST'})).status,404);
  assert.equal((await api(user,'/v1/billing/orders/'+o.id+'/refresh',{method:'POST'})).status,200);
  const state=(await (await api(user,'/v1/billing?payment=success')).json()).data;
  assert.equal(state.plan.scan_limit,5);assert.equal(state.orders[0].status,'pending');assert.equal(state.orders[0].amount,19900);
  assert.equal((await (await api(otherAllowed,'/v1/billing')).json()).data.orders.length,0);
});
test('verified payment activates one month of test unlimited access once; expiry and daily refunds remain correct',async()=>{
  const user=await account();for(let i=0;i<5;i++)await reserveScan(db,user.uid,randomUUID(),clock);
  await assert.rejects(()=>reserveScan(db,user.uid,randomUUID(),clock),{code:'DAILY_LIMIT'});
  const o=await order(user),s=paid(o);
  assert.equal((await hook(event(s),{signature:'t=0,te=bad'})).status,401);
  assert.equal((await hook(event(s),{time:clock-301000})).status,401);
  assert.equal((await hook(event(s,{live:true}))).status,400);
  assert.equal((await readAllowance(db,user.uid,clock)).limit,5);
  // Concurrent webhook + manual refresh must not stack months or double-fulfil.
  const responses=await Promise.all([hook(event(s)),hook(event(s,{legacy:false})),api(user,'/v1/billing/orders/'+o.id+'/refresh',{method:'POST'})]);
  assert.ok(responses.every(r=>r.status===200));
  const ref=db.collection('users').doc(user.uid),saved=(await ref.get()).data(),expiry=saved.billing_test.expires_at;
  assert.equal(saved.plan,'Free');assert.equal((await readAllowance(db,user.uid,clock)).remaining,null);
  const id=randomUUID();await reserveScan(db,user.uid,id,clock);await finishScan(db,user.uid,id,'failed');assert.equal((await readAllowance(db,user.uid,clock)).used,5);
  await reserveScan(db,user.uid,randomUUID(),clock);
  clock+=1000;assert.equal((await hook(event(s))).status,200);assert.equal((await ref.get()).data().billing_test.expires_at,expiry);
  assert.equal((await api(user,'/v1/billing/checkout',post({accept_test_purchase:true}))).status,409);
  assert.equal((await (await api(user,'/v1/auth/me')).json()).data.plan.name,'Pro (Test)');
  assert.equal((await (await api(user,'/v1/users/stats')).json()).data.scans_remaining,null);
  assert.equal((await (await api(user,'/v1/billing')).json()).data.orders[0].status,'paid');
  assert.equal((await readAllowance(db,user.uid,expiry)).limit,5);
  const savedEnv=process.env.AUTHENTISCAN_BILLING_MODE;process.env.AUTHENTISCAN_BILLING_MODE='off';assert.equal((await readAllowance(db,user.uid,clock)).limit,5);process.env.AUTHENTISCAN_BILLING_MODE=savedEnv;
});
test('wrong amount, currency, mode, reference and failed payment cannot grant access',async()=>{
  const user=await account(),o=await order(user),s=paid(o);
  const original=structuredClone(s);
  for(const patch of [{amount:1},{currency:'USD'},{livemode:true},{source:{type:'unknown'}},{refunds:[{id:'refund'}]}]){
    s.attributes.payments[0].attributes={...original.attributes.payments[0].attributes,...patch};
    assert.equal((await hook(event(s))).status,400);assert.equal((await readAllowance(db,user.uid,clock)).limit,5);
  }
  s.attributes.payments[0].attributes={...original.attributes.payments[0].attributes,status:'failed'};
  assert.equal((await hook(event(s))).status,200);assert.equal((await readAllowance(db,user.uid,clock)).limit,5);
  s.attributes.payments=original.attributes.payments;s.attributes.metadata={authentiscan_order:randomUUID()};
  assert.equal((await hook(event(s))).status,400);
  s.attributes.metadata=original.attributes.metadata;s.attributes.livemode=true;assert.equal((await hook(event(s))).status,400);
  s.attributes.livemode=false;await db.collection('users').doc(user.uid).update({status:'disabled'});assert.equal((await hook(event(s))).status,409);
});
test('ambiguous creation retries same order, duplicate creation is blocked, and expired checkout can be replaced',async()=>{
  const user=await account();failOnce=true;assert.equal((await api(user,'/v1/billing/checkout',post({accept_test_purchase:true}))).status,503);
  const saved=(await db.collection('users').doc(user.uid).get()).data().billing_pending_order;
  const size=sessions.size,o=await order(user);assert.equal(o.id,saved);assert.equal(sessions.size,size);
  const s=byOrder.get(o.id);s.attributes.status='expired';assert.equal((await api(user,'/v1/billing/orders/'+o.id+'/refresh',{method:'POST'})).status,200);
  assert.equal((await (await api(user,'/v1/billing')).json()).data.orders[0].status,'expired');
  let release;gate=new Promise(r=>{release=r;});const started=new Promise(r=>{gateStarted=r;});const pending=billing.checkout(user.uid);
  try{await started;
    await assert.rejects(()=>billing.checkout(user.uid),{status:409});
  }finally{release();gate=null;gateStarted=null;}const next=await pending;assert.notEqual(next.id,o.id);
});
