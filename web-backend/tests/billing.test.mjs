import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {billingConfig,billingReady,billingUserAllowed,isBillingTester,effectivePlan,addCalendarMonth} from '../server/billing-config.mjs';
import {verifyPaymongoSignature,checkoutUrl,paymongoClient} from '../server/paymongo.mjs';
import {webhookGateway} from '../scripts/payment-webhook-gateway.mjs';
import {createBilling} from '../server/billing.mjs';

test('explicit wildcard enables other accounts for checkout and paid Pro access only in test mode',async()=>{
  const env={AUTHENTISCAN_BILLING_MODE:'test',AUTHENTISCAN_BILLING_TEST_USERS:' * ',PAYMONGO_TEST_SECRET_KEY:'sk_test_fixture',PAYMONGO_TEST_WEBHOOK_SECRET:'fixture'};
  const config=billingConfig(env);
  assert.equal(billingReady(config),true);
  assert.equal(isBillingTester('new-user',env),true);
  assert.equal(isBillingTester('new-user',{...env,AUTHENTISCAN_BILLING_MODE:'off'}),false);
  assert.equal(isBillingTester('other',{...env,AUTHENTISCAN_BILLING_TEST_USERS:'selected'}),false);
  assert.equal(isBillingTester('selected',{...env,AUTHENTISCAN_BILLING_TEST_USERS:'selected'}),true);
  for(const uid of [undefined,null,'','   '])assert.equal(billingUserAllowed(uid,['*']),false);
  assert.equal(billingUserAllowed('new-user',[]),false);
  const profile={uid:'new-user',status:'active',billing_test:{status:'active',scan_limit:null,source_order:'paid-order',expires_at:2000}};
  const db={collection:()=>({doc:()=>({get:async()=>({exists:true,data:()=>profile}),collection:()=>({orderBy:()=>({limit:()=>({get:async()=>({docs:[]})})})})})})};
  const billing=createBilling({db,config,provider:{},now:()=>1000});
  const state=await billing.state('new-user');
  assert.equal(state.enabled,true);
  assert.equal(state.plan.scan_limit,null);
  assert.equal(effectivePlan(profile,1000,isBillingTester(profile.uid,env)).scan_limit,null);
  // Checkout reaches the account check rather than rejecting an unlisted UID.
  profile.status='disabled';
  await assert.rejects(()=>billing.checkout('new-user'),{status:403,message:'Account unavailable.'});
});
test('billing is off by default; live keys, renewal and incomplete configuration cannot enable checkout',()=>{
  assert.equal(billingReady(billingConfig({})),false);
  assert.equal(billingConfig({}).price,19900);
  assert.equal(billingConfig({}).purchaseType,'one_time');
  for(const env of [{AUTHENTISCAN_BILLING_MODE:'live'},{PAYMONGO_TEST_SECRET_KEY:'sk_live_x'},{AUTHENTISCAN_PURCHASE_TYPE:'recurring'},{AUTHENTISCAN_PRO_PRICE_CENTAVOS:'0'},{AUTHENTISCAN_PRO_PRICE_CENTAVOS:'20.1'},{AUTHENTISCAN_CHECKOUT_ORIGIN:'https://evil.test'}])assert.throws(()=>billingConfig(env));
  const good={AUTHENTISCAN_BILLING_MODE:'test',PAYMONGO_TEST_SECRET_KEY:'sk_test_fixture',PAYMONGO_TEST_WEBHOOK_SECRET:'fixture',AUTHENTISCAN_PRO_PRICE_CENTAVOS:'19900',AUTHENTISCAN_BILLING_TEST_USERS:'test-user',AUTHENTISCAN_PURCHASE_TYPE:'one_time'};
  assert.equal(billingReady(billingConfig(good)),true);
  for(const key of Object.keys(good)){const bad={...good,[key]:''};assert.equal(billingReady(billingConfig(bad)),false,key);}
  const defaults={...good};delete defaults.AUTHENTISCAN_PRO_PRICE_CENTAVOS;delete defaults.AUTHENTISCAN_PURCHASE_TYPE;
  assert.equal(billingReady(billingConfig(defaults)),true);
});
test('hosted test checkout requires the exact production HTTPS app origin',()=>{
  const env={NODE_ENV:'production',AUTHENTISCAN_ALLOWED_ORIGINS:'https://app.example.com',AUTHENTISCAN_CHECKOUT_ORIGIN:'https://app.example.com'};
  assert.equal(billingConfig(env).origin,'https://app.example.com');
  assert.equal(billingReady(billingConfig(env)),false);
  for(const origin of ['http://app.example.com','https://evil.example.com','https://app.example.com/','https://app.example.com/path','https://app.example.com?next=x','https://user@app.example.com','http://127.0.0.1:5174'])assert.throws(()=>billingConfig({...env,AUTHENTISCAN_CHECKOUT_ORIGIN:origin}));
  assert.throws(()=>billingConfig({...env,NODE_ENV:'development'}));
  assert.throws(()=>billingConfig({...env,PAYMONGO_TEST_SECRET_KEY:'sk_live_wrong'}));
});
test('test Pro is allowlisted, expires exactly, and calendar month clamps the day',()=>{
  assert.equal(new Date(addCalendarMonth(Date.parse('2028-01-31T01:02:03Z'))).toISOString(),'2028-02-29T01:02:03.000Z');
  assert.equal(new Date(addCalendarMonth(Date.parse('2026-01-31T01:02:03Z'))).toISOString(),'2026-02-28T01:02:03.000Z');
  assert.equal(new Date(addCalendarMonth(Date.parse('2026-01-30T20:00:00Z'))).toISOString(),'2026-02-27T20:00:00.000Z');
  const profile={billing_test:{status:'active',scan_limit:null,source_order:'test',expires_at:2000}};
  assert.equal(effectivePlan(profile,1000,true).scan_limit,null);assert.equal(effectivePlan(profile,2000,true).scan_limit,5);
  assert.equal(effectivePlan(profile,1000,false).scan_limit,5);assert.equal(effectivePlan({plan:'Pro'},1000,true).scan_limit,5);
});
test('webhook verification uses exact raw bytes, timestamp, test signature and timing-safe comparison',()=>{
  const now=Date.now(),t=String(Math.floor(now/1000)),bytes=Buffer.from('{"a": 1}'),secret='test-only';
  const sig=createHmac('sha256',secret).update(t+'.').update(bytes).digest('hex'),header='t='+t+',te='+sig+',li=';
  verifyPaymongoSignature(bytes,header,secret,now);
  for(const [body,h,s,n] of [[Buffer.from('{"a":1}'),header,secret,now],[bytes,header,'wrong',now],[bytes,header,secret,now+301000],[bytes,header.replace('te=','li='),secret,now],[bytes,header+',te='+sig,secret,now],[bytes,'t='+t+',te=x',secret,now]])assert.throws(()=>verifyPaymongoSignature(body,h,s,n));
});
test('provider uses test Basic auth, server price, stable idempotency and no unsafe redirects',async()=>{
  const order={id:'order',amount:19900,origin:'http://127.0.0.1:5174'};let calls=0;
  const api=paymongoClient({secretKey:'sk_test_fixture'},async(url,options)=>{
    calls++;assert.equal(options.redirect,'error');assert.equal(options.headers.Authorization,'Basic '+Buffer.from('sk_test_fixture:').toString('base64'));
    if(options.method==='POST'){
      assert.equal(url,'https://api.paymongo.com/v2/checkout_sessions');assert.equal(options.headers['Idempotency-Key'],'authentiscan-test-order');
      const body=JSON.parse(options.body).data.attributes;assert.equal(body.line_items[0].amount,19900);assert.deepEqual(body.payment_method_types,['gcash','paymaya','card']);assert.equal(body.pass_on_fees,false);
    }else assert.equal(url,'https://api.paymongo.com/v1/checkout_sessions/cs_test');
    return Response.json({data:{id:'cs_test',type:'checkout_session',attributes:{livemode:false,checkout_url:'https://checkout.paymongo.com/test'}}});
  });
  await api.create(order);await api.retrieve('cs_test');assert.equal(calls,2);assert.throws(()=>api.retrieve('../secret'));assert.equal(calls,2);
  for(const url of ['http://checkout.paymongo.com/a','https://checkout.paymongo.com.evil.test/a','https://evil.test','javascript:alert(1)','https://user@checkout.paymongo.com/a'])assert.throws(()=>checkoutUrl(url));
  assert.equal(checkoutUrl('https://checkout.paymongo.com/a'),'https://checkout.paymongo.com/a');
  for(const response of [()=>new Response('bad',{status:500}),()=>new Response('x'.repeat(262145)),()=>Response.json({data:{id:'cs_test',type:'checkout_session',attributes:{livemode:true}}})])await assert.rejects(()=>paymongoClient({secretKey:'sk_test_fixture'},async()=>response()).create(order));
});
test('public gateway exposes only webhook forwarding, no accounts, scans or AI',async()=>{
  let calls=0;const server=webhookGateway(async(url,opts)=>{calls++;assert.equal(url,'http://127.0.0.1:5002/api/payments/paymongo/webhook');assert.equal(opts.body.toString(),'{}');return Response.json({received:true});}).listen(0,'127.0.0.1');
  await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port;
  try{
    for(const path of ['/api/v1/scans','/api/config','/health','/api/payments/paymongo/webhook'])assert.equal((await fetch(base+path)).status,404);
    assert.equal((await fetch(base+'/api/payments/paymongo/webhook',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,400);
    assert.equal((await fetch(base+'/api/payments/paymongo/webhook',{method:'POST',headers:{'Content-Type':'application/json','Paymongo-Signature':'test'},body:'{}'})).status,200);assert.equal(calls,1);
  }finally{await new Promise(r=>server.close(r));}
});
