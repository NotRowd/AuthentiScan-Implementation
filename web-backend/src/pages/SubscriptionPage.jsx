import {useEffect,useRef,useState} from 'react';
import {useSearchParams,Link} from 'react-router-dom';
import DashboardLayout from '../components/layout/DashboardLayout';
import {Check,CheckCircle2,Clock3,CreditCard,RefreshCw,ArrowRight,ShieldCheck} from 'lucide-react';
import {fetchBilling,createCheckout,refreshPayment,fetchMe,saveAuthSession} from '../services/api';
import {confirmReturnedPayment} from '../services/payment-confirmation.mjs';
import './SubscriptionPage.css';
const money=value=>Number.isSafeInteger(value)?new Intl.NumberFormat('en-PH',{style:'currency',currency:'PHP'}).format(value/100):'Price to be confirmed';
const date=value=>value&&Number.isFinite(new Date(value).getTime())?new Date(value).toLocaleString('en-PH',{timeZone:'Asia/Manila',month:'long',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'}):'Date unavailable';
const card='subscription-card';
const benefits=['Saved scan history','PDF reports at no extra cost','Failed scans do not use a credit'];
function Benefits(){return <ul className="subscription-benefits">{benefits.map(item=><li key={item} className="flex items-start gap-2"><Check aria-hidden="true" size={18} className="shrink-0 text-accent"/>{item}</li>)}</ul>;}
export default function SubscriptionPage(){
  const [data,setData]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[consent,setConsent]=useState(false);
  const [params]=useSearchParams(),active=useRef(null),mounted=useRef(true);
  const returnMode=params.get('payment');
  const isReturn=returnMode==='returned';
  const isCancelled=returnMode==='cancelled';
  const [confirmation,setConfirmation]=useState(isReturn?'checking':'idle');
  useEffect(()=>{
    mounted.current=true;let disposed=false,timedOut=false;
    const controller=new AbortController();
    if(isReturn){active.current=controller;setBusy(true);setConfirmation('checking');}
    else setConfirmation('idle');
    // Bound the entire sequence, including slow network requests.
    const deadline=isReturn?setTimeout(()=>{timedOut=true;controller.abort();},60000):null;
    (async()=>{
      let loaded=false;
      try{
        const result=await fetchBilling(controller.signal);
        if(disposed||controller.signal.aborted)return;
        loaded=true;setData(result.data);
        if(isReturn){
          const status=await confirmReturnedPayment({initial:result.data,signal:controller.signal,
            refreshPayment,fetchBilling,onUpdate:value=>{if(!disposed)setData(value);}});
          if(!disposed&&!controller.signal.aborted)setConfirmation(status);
        }
      }catch(e){
        if(!disposed){
          if(isReturn)setConfirmation('unconfirmed');
          if(!loaded)setError(timedOut?'Loading your subscription took too long. Please retry.':e.message||'Could not load your subscription.');
        }
      }finally{
        clearTimeout(deadline);
        if(active.current===controller)active.current=null;
        if(!disposed){setBusy(false);if(timedOut)setConfirmation('unconfirmed');}
      }
    })();
    return ()=>{disposed=true;mounted.current=false;clearTimeout(deadline);controller.abort();active.current?.abort();active.current=null;};
  },[isReturn,returnMode]);
  async function act(kind,id){
    if(active.current)return;const controller=new AbortController();active.current=controller;setBusy(true);setError('');
    let timedOut=false;
    const deadline=isReturn?setTimeout(()=>{timedOut=true;controller.abort();},60000):null;
    try{
      if(kind==='checkout'){
        if(!consent)throw new Error('Please acknowledge the capstone checkout notice.');
        const result=await createCheckout(controller.signal);
        const url=new URL(result.data.checkout_url);
        if(url.protocol!=='https:'||url.hostname!=='checkout.paymongo.com'||url.port||url.username||url.password)throw new Error('Invalid checkout destination.');
        if(mounted.current&&!controller.signal.aborted)window.location.assign(url.href);
      }else{
        if(id)await refreshPayment(id,controller.signal);
        const result=await fetchBilling(controller.signal);
        if(mounted.current&&!controller.signal.aborted)setData(result.data);
        if(isReturn){
          if(mounted.current&&!controller.signal.aborted)setConfirmation('checking');
          const status=await confirmReturnedPayment({initial:result.data,signal:controller.signal,
            refreshPayment,fetchBilling,onUpdate:value=>{if(mounted.current&&!controller.signal.aborted)setData(value);}});
          if(mounted.current&&!controller.signal.aborted)setConfirmation(status);
        }else{
          const me=await fetchMe(controller.signal);
          if(mounted.current&&!controller.signal.aborted)saveAuthSession({user:{...me.data.user,plan:me.data.plan}});
        }
      }
    }catch(e){if(mounted.current&&!controller.signal.aborted){setError(e.message||'Payment service unavailable.');if(isReturn)setConfirmation('unconfirmed');}}
    finally{clearTimeout(deadline);if(active.current===controller){active.current=null;if(mounted.current){setBusy(false);if(timedOut){setConfirmation('unconfirmed');setError('Payment confirmation took too long. Please use “Check payment” to try again.');}}}}
  }
  const pro=data?.plan?.scan_limit===null;
  const pending=data?.orders?.find(o=>['pending','creating'].includes(o.status));
  const unavailableMessage=data?.message||'Checkout is currently unavailable. Please try again later.';
  const checkoutHelp=!data?.enabled?unavailableMessage:busy?'A payment request is in progress. Please wait.':!consent?'Tick the acknowledgement above to enable checkout.':pending?'Resume the existing purchase. If you already paid, do not make another payment.':'Acknowledgement received. You can continue to simulated checkout.';
  return <DashboardLayout><div className="subscription-page">
    <header className="subscription-heading"><p className="subscription-eyebrow">Your subscription</p><h1>Plans &amp; payments</h1><p>Your plan, your scan allowance, and your payment history in one place.</p></header>
    <p className="subscription-notice"><ShieldCheck size={18} aria-hidden="true"/>Capstone demonstration · Payments are simulated. No real money is charged.</p>
    {error&&<div role="alert" className="subscription-error">{error}<button type="button" className="subscription-text-button" disabled={busy} onClick={()=>act('refresh')}>Retry loading</button></div>}
    {!data&&!error&&<p role="status" className={card}>Loading your subscription…</p>}
    {data&&<>
      <section aria-label="Current subscription" className="subscription-banner">
        <div className="subscription-banner-copy"><span className="subscription-tile"><ShieldCheck aria-hidden="true" size={22}/></span><div><p className="subscription-eyebrow">Your current plan</p><h2>{pro?'Pro':'Free'}</h2><p>{pro?'Unlimited scans during your active month.':'5 free scans every day. Resets at midnight Philippine time.'}</p></div></div>
        <Link to={pro?'/scan':'/dashboard'} className="subscription-secondary">{pro?'Scan an image':'View remaining scans'}<ArrowRight size={16} aria-hidden="true"/></Link>
        {pro&&<div className="subscription-expiry"><p role="status"><strong>Pro is active until {date(data.plan.expires_at)} (Philippine time).</strong></p><p>No automatic renewal. After your pass expires, you return to Free and can buy another month. Your saved scans remain available.</p></div>}
      </section>
      {(isReturn||isCancelled)&&!pro&&<div role="status" className="subscription-return"><Clock3 size={20} aria-hidden="true" className="shrink-0 text-accent"/><div><p className="font-semibold">{isCancelled?'Checkout cancelled':confirmation==='checking'?'Confirming your payment…':'Payment not confirmed yet'}</p><p className="mt-1">{isCancelled?'Your plan has not changed. If you completed payment before returning, use “Check payment” below to verify it.':confirmation==='checking'?'We’re checking with PayMongo. Your plan will update automatically when payment is confirmed. Please don’t pay again.':pending?'Confirmation is taking longer than expected. Use “Check payment” below to try again. If you already paid, do not make another payment.':'No paid upgrade has been confirmed. Refresh your payment history to see the latest status.'}</p></div></div>}
      <div className="subscription-plan-grid">
        <section aria-label="Free plan" className={card}><div className="subscription-plan-heading"><h2>Free</h2>{!pro&&<span className="subscription-tag">Current plan</span>}</div><p className="subscription-price">₱0</p><p className="subscription-price-caption">No payment needed</p><p className="subscription-allowance">5 scans per day</p><Benefits/><p className="subscription-plan-foot">For occasional image checks. Your daily allowance resets at midnight Philippine time.</p></section>
        <section aria-label="Pro plan" className={card+' subscription-pro'}><div className="subscription-plan-heading"><h2>Pro</h2><span className="subscription-tag subscription-tag-pro">{pro?'Current plan':'Monthly pass'}</span></div>
          <p className="subscription-price">{money(data.offer?.amount)}</p><p className="subscription-price-caption">For one calendar month</p><p className="subscription-allowance">Unlimited scans</p><Benefits/>
          <p className="subscription-plan-foot">{data.offer?.purchase_type==='one_time'?'Pay once for a month. No automatic renewal.':'Purchase details are currently unavailable.'}</p>
          {pro?<div className="subscription-active"><p className="flex items-center gap-2 font-semibold"><ShieldCheck size={18} aria-hidden="true"/>Your Pro pass is active</p><p>No automatic renewal. You can buy another month after this pass expires.</p></div>:<>
            {!data.enabled&&<p className="subscription-unavailable">{unavailableMessage}</p>}
            <label htmlFor="checkout-acknowledgement" className="subscription-ack"><input id="checkout-acknowledgement" name="acknowledgement" type="checkbox" required checked={consent} onChange={e=>setConsent(e.target.checked)} disabled={!data.enabled||busy}/><span>I understand this capstone checkout simulates payment. No real money will be charged.</span></label>
            <button type="button" className="subscription-checkout" aria-describedby="checkout-help" disabled={!data.enabled||!consent||busy} onClick={()=>act('checkout')}>{busy?'Please wait…':data.enabled?(pending?'Resume checkout':'Continue to checkout'):'Checkout unavailable'}{busy?<RefreshCw size={16} aria-hidden="true" className="animate-spin motion-reduce:animate-none"/>:<ArrowRight size={16} aria-hidden="true"/>}</button>
            <p id="checkout-help" className="subscription-checkout-help" aria-live="polite">{checkoutHelp}</p>
            <div className="subscription-methods"><p className="flex items-center gap-2"><CreditCard size={15} aria-hidden="true"/>Checkout with PayMongo</p><p>GCash · Maya · Cards, when available</p></div>
          </>}
        </section>
      </div>
      <p className="subscription-analysis-note">Both plans use the same AI analysis. Pro increases your scan allowance, not prediction accuracy.</p>
      <section className="subscription-history" aria-labelledby="payment-history-heading"><div className="subscription-history-heading"><div><h2 id="payment-history-heading">Payment history</h2><p>Your latest 20 orders. All times are Philippine time.</p></div><button type="button" className="subscription-text-button" disabled={busy} onClick={()=>act('refresh')}><RefreshCw size={16} aria-hidden="true" className={busy?'animate-spin motion-reduce:animate-none':''}/>Refresh history</button></div>
        {!data.orders?.length?<div className="subscription-history-empty"><CreditCard size={24} aria-hidden="true" className="shrink-0 text-ink-muted"/><div><h3>No payments yet.</h3><p>Your orders will appear here when you start checkout.</p></div></div>:<table className="subscription-history-table"><thead><tr><th scope="col">Purchase</th><th scope="col">Started (PH)</th><th scope="col">Amount</th><th scope="col">Status</th><th scope="col">Actions</th></tr></thead><tbody>{data.orders.map(o=><tr key={o.id}><td>Pro monthly pass</td><td data-label="Started" className="subscription-order-date">{date(o.created_at)}</td><td data-label="Amount" className="tabular-nums whitespace-nowrap">{money(o.amount)}</td><td data-label="Status"><span className={'subscription-order-status '+(o.status==='paid'?'subscription-paid':o.status==='expired'?'subscription-expired':'subscription-pending')}>{o.status==='paid'?<CheckCircle2 size={14} aria-hidden="true"/>:<Clock3 size={14} aria-hidden="true"/>}{o.status==='paid'?'Payment confirmed':o.status==='pending'?'Awaiting payment confirmation':o.status==='expired'?'Checkout expired':'Checkout preparation incomplete'}</span></td><td><div className="subscription-order-actions">{o.status==='pending'&&<button type="button" className="subscription-secondary" disabled={busy} onClick={()=>act('check',o.id)}>{busy?'Checking…':'Check payment'}</button>}{['pending','creating'].includes(o.status)&&!pro&&<button type="button" className="subscription-text-button" aria-describedby="checkout-help" disabled={busy||!consent||!data.enabled} onClick={()=>act('checkout')}>Resume checkout</button>}</div></td></tr>)}</tbody></table>}
      </section>
    </>}
  </div></DashboardLayout>;
}
