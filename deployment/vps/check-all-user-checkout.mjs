// Run through stdin in the API container; does not create accounts or payments.
import assert from 'node:assert/strict';
import {billingConfig,billingReady,isBillingTester,effectivePlan} from '/app/server/billing-config.mjs';
import {createBilling} from '/app/server/billing.mjs';

const config=billingConfig();
assert.equal(config.enabled,true);
assert.equal(billingReady(config),true);
assert.deepEqual(config.testUsers,['*']);
const uid='deployment-check-unlisted-user';
assert.equal(isBillingTester(uid),true);
assert.equal(isBillingTester(''),false);
const profile={uid,status:'active'};
const db={collection:()=>({doc:()=>({get:async()=>({exists:true,data:()=>profile}),collection:()=>({orderBy:()=>({limit:()=>({get:async()=>({docs:[]})})})})})})};
const billing=createBilling({db,config,provider:{},now:()=>1000});
assert.equal((await billing.state(uid)).enabled,true);
assert.equal((await billing.state(uid)).plan.name,'Free');
profile.billing_test={status:'active',scan_limit:null,source_order:'fixture-paid-order',expires_at:2000};
assert.equal((await billing.state(uid)).plan.scan_limit,null);
assert.equal(effectivePlan(profile,1000).scan_limit,null);
assert.equal(effectivePlan(profile,2000).scan_limit,5);
profile.status='disabled';
await assert.rejects(()=>billing.checkout(uid),{status:403,message:'Account unavailable.'});
console.log('PASS: running API allows unlisted signed-in users, keeps Free until payment, recognizes paid test Pro, expires access, and rejects disabled accounts.');
const response=await fetch(config.origin,{signal:AbortSignal.timeout(15000)});
assert.equal(response.status,200);
console.log('PASS: public HTTPS website responds with HTTP 200.');
