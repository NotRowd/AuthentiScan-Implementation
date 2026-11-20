import {randomUUID} from 'node:crypto';
import {FieldValue} from 'firebase-admin/firestore';
import {billingConfig,billingReady,billingUserAllowed,addCalendarMonth,effectivePlan} from './billing-config.mjs';
import {paymongoClient,checkoutUrl,verifyPaymongoSignature} from './paymongo.mjs';
const fail=(status,message)=>Object.assign(new Error(message),{status});
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const publicOrder=o=>({id:o.id,status:o.status,amount:o.amount,currency:'PHP',created_at:o.created_at,paid_at:o.paid_at||null,expires_at:o.expires_at||null,mode:'test',checkout_url:o.status==='pending'?o.checkout_url:null});

export function createBilling({db,config=billingConfig(),provider=paymongoClient(config),now=()=>Date.now()}={}){
  const allowed=uid=>billingUserAllowed(uid,config.testUsers);
  const orders=db.collection('billing_test_orders');
  function enabled(uid){if(!billingReady(config))throw fail(503,'Test checkout is not configured.');if(!allowed(uid))throw fail(403,'Test checkout is limited to designated test accounts.');}
  async function account(uid){const ref=db.collection('users').doc(uid),snap=await ref.get();if(!snap.exists||snap.data().status!=='active')throw fail(403,'Account unavailable.');return {ref,data:snap.data()};}
  async function state(uid){
    const {ref,data}=await account(uid);
    const history=await ref.collection('billing_test_history').orderBy('created_at','desc').limit(20).get();
    return {mode:'test',enabled:billingReady(config)&&allowed(uid),plan:effectivePlan(data,now(),config.enabled&&allowed(uid)),
      offer:{name:'Pro',amount:config.price,currency:'PHP',scan_limit:null,duration:'One calendar month',purchase_type:config.purchaseType||null,methods:['GCash','Maya','Cards']},
      message:!billingReady(config)?'Test checkout is not configured yet. No real payments are accepted.':!allowed(uid)?'Checkout is currently available only to designated test accounts.':'Test mode only. No real money is charged. Access does not renew automatically.',
      orders:history.docs.map(d=>publicOrder(d.data()))};
  }
  async function checkout(uid){
    enabled(uid);const {ref}=await account(uid),operation=randomUUID(),id=randomUUID(),time=now();
    const order=await db.runTransaction(async tx=>{
      const user=await tx.get(ref);if(user.data()?.status!=='active')throw fail(403,'Account unavailable.');
      if(effectivePlan(user.data(),time,true).scan_limit===null)throw fail(409,'Your test Pro access is already active.');
      const pendingId=user.data().billing_pending_order;
      const prior=pendingId?await tx.get(orders.doc(pendingId)):null;
      let row=prior?.data();
      if(row&&['creating','pending'].includes(row.status)){
        if(row.owner_uid!==uid)throw fail(409,'Payment record needs review.');
        if(row.status==='pending')return row;
        if(row.lease_until>time)throw fail(409,'Checkout is being prepared. Please wait and refresh.');
      }else row={id,owner_uid:uid,amount:config.price,currency:'PHP',origin:config.origin,status:'creating',created_at:new Date(time).toISOString()};
      tx.set(orders.doc(row.id),{...row,operation,lease_until:time+60000});
      tx.set(ref.collection('billing_test_history').doc(row.id),publicOrder(row));
      tx.update(ref,{billing_pending_order:row.id});return {...row,operation};
    });
    if(order.status==='pending')return publicOrder(order);
    try{
      const session=await provider.create(order);const url=checkoutUrl(session.attributes.checkout_url);
      if(session.attributes.livemode!==false||!/^cs_[A-Za-z0-9]+$/.test(session.id||''))throw new Error('Invalid test checkout');
      await db.runTransaction(async tx=>{
        const user=await tx.get(ref),record=await tx.get(orders.doc(order.id));
        if(user.data()?.status!=='active')throw fail(403,'Account unavailable.');
        if(record.data()?.operation!==operation)throw fail(409,'Checkout changed. Refresh to continue.');
        tx.update(orders.doc(order.id),{status:'pending',session_id:session.id,checkout_url:url,lease_until:0});
        tx.set(ref.collection('billing_test_history').doc(order.id),publicOrder({...order,status:'pending',checkout_url:url}));
      });
      return publicOrder({...order,status:'pending',session_id:session.id,checkout_url:url});
    }catch(e){
      // An ambiguous provider timeout must reuse the SAME order and idempotency key.
      await db.runTransaction(async tx=>{const snap=await tx.get(orders.doc(order.id));if(snap.data()?.operation===operation)tx.update(snap.ref,{lease_until:0});}).catch(()=>{});
      if(e.status)throw e;throw fail(503,'Test checkout could not be prepared. Retry the same purchase.');
    }
  }
  async function settle(orderId,session){
    if(!uuid.test(orderId))throw fail(400,'Invalid payment reference.');
    const orderRef=orders.doc(orderId),time=now();
    return db.runTransaction(async tx=>{
      const snapshot=await tx.get(orderRef);if(!snapshot.exists)throw fail(404,'Payment reference not found.');
      const o=snapshot.data(),s=session?.attributes;
      if(!s||s.livemode!==false||session.id!==o.session_id||s.reference_number!==o.id||s.metadata?.authentiscan_order!==o.id)throw fail(400,'Payment reference mismatch.');
      const userRef=db.collection('users').doc(o.owner_uid),user=await tx.get(userRef);
      if(o.status==='paid')return o;
      if(o.status!=='pending')throw fail(409,'Checkout is not ready for confirmation.');
      if(user.data()?.status!=='active'||!allowed(o.owner_uid))throw fail(409,'Test account unavailable for confirmation.');
      const payments=Array.isArray(s.payments)?s.payments.filter(p=>p.attributes?.status==='paid'):[];
      if(payments.length!==1){
        if(payments.length>1)throw fail(400,'Unexpected payment count.');
        if(s.status==='expired'){
          tx.update(orderRef,{status:'expired'});if(user.data().billing_pending_order===o.id)tx.update(userRef,{billing_pending_order:FieldValue.delete()});
          tx.set(userRef.collection('billing_test_history').doc(o.id),publicOrder({...o,status:'expired'}));
          return {...o,status:'expired'};
        }return o;
      }
      const payment=payments[0],p=payment.attributes;
      if(!/^pay_[A-Za-z0-9]+$/.test(payment.id||'')||p.amount!==o.amount||p.currency!=='PHP'||p.livemode===true||p.refunded===true||(p.refunds?.length>0)||!['card','gcash','paymaya'].includes(p.source?.type))throw fail(400,'Payment details mismatch.');
      const receipt=db.collection('billing_test_payments').doc(payment.id),used=await tx.get(receipt);
      if(used.exists&&used.data().order_id!==o.id)throw fail(409,'Payment was already assigned.');
      const expires=addCalendarMonth(time),paid_at=new Date(time).toISOString();
      tx.set(receipt,{order_id:o.id,owner_uid:o.owner_uid});
      tx.update(orderRef,{status:'paid',payment_id:payment.id,method:p.source.type,paid_at,expires_at:new Date(expires).toISOString()});
      tx.set(userRef.collection('billing_test_history').doc(o.id),publicOrder({...o,status:'paid',paid_at,expires_at:new Date(expires).toISOString()}));
      tx.update(userRef,{billing_pending_order:FieldValue.delete(),billing_test:{status:'active',scan_limit:null,expires_at:expires,source_order:o.id}});
      return {...o,status:'paid',paid_at,expires_at:new Date(expires).toISOString()};
    });
  }
  async function refresh(uid,id){
    enabled(uid);await account(uid);if(!uuid.test(id))throw fail(400,'Invalid order ID.');
    const snap=await orders.doc(id).get(),o=snap.data();if(!o||o.owner_uid!==uid)throw fail(404,'Payment not found.');
    if(o.status!=='pending')return publicOrder(o);
    return publicOrder(await settle(id,await provider.retrieve(o.session_id)));
  }
  async function webhook(bytes,signature){
    if(!billingReady(config))throw fail(503,'Test billing unavailable.');
    try{verifyPaymongoSignature(bytes,signature,config.webhookSecret,now());}catch{throw fail(401,'Invalid payment signature.');}
    let event;try{event=JSON.parse(bytes.toString('utf8')).data;}catch{throw fail(400,'Invalid payment event.');}
    const payload=event?.type==='event'?event.attributes:event;
    if(payload?.livemode!==false)throw fail(400,'Only test payment events are accepted.');
    if(payload.type!=='checkout_session.payment.paid')return;
    const session=payload.data,orderId=session?.attributes?.reference_number;
    if(!uuid.test(orderId||''))throw fail(400,'Invalid payment reference.');
    const snap=await orders.doc(orderId).get();if(!snap.exists)return; // Unrelated checkout in this merchant account.
    if(!snap.data().session_id)throw fail(409,'Checkout is still being recorded. Retry delivery.');
    // Retrieve through our test merchant key, not just the event/browser payload.
    await settle(orderId,await provider.retrieve(snap.data().session_id));
  }
  return {state,checkout,refresh,webhook};
}
