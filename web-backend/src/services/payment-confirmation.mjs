// Only server-owned orders and server-verified plans can confirm a return.
// The URL is a trigger to check, never evidence of payment.
function pause(ms,signal){
  return new Promise((resolve,reject)=>{
    signal.throwIfAborted();
    const abort=()=>{clearTimeout(timer);reject(signal.reason);};
    const timer=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve();},ms);
    signal.addEventListener('abort',abort,{once:true});
  });
}
export async function confirmReturnedPayment({initial,signal,refreshPayment,fetchBilling,onUpdate,wait=pause}){
  signal.throwIfAborted();
  if(initial.plan?.scan_limit===null)return 'confirmed';
  if(!initial.enabled)return 'unavailable';
  const order=initial.orders?.find(item=>item.status==='pending');
  if(!order)return 'no_pending';
  let lastError=null;
  for(let attempt=0;attempt<5;attempt++){
    if(attempt)await wait(3000,signal);
    signal.throwIfAborted();
    try{
      await refreshPayment(order.id,signal);
      lastError=null;
    }catch(error){
      signal.throwIfAborted();
      lastError=error;
    }
    try{
      const {data}=await fetchBilling(signal);
      signal.throwIfAborted();
      lastError=null;
      onUpdate(data);
      if(data.plan?.scan_limit===null)return 'confirmed';
      if(!data.enabled||!data.orders?.some(item=>item.id===order.id&&item.status==='pending'))return 'unconfirmed';
    }catch(error){
      signal.throwIfAborted();
      lastError=error;
    }
  }
  if(lastError)throw lastError;
  return 'pending';
}
