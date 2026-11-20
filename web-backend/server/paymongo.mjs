import {createHmac,timingSafeEqual} from 'node:crypto';
export function verifyPaymongoSignature(bytes,header,secret,now=Date.now()){
  if(!Buffer.isBuffer(bytes)||typeof header!=='string'||header.length>1024||!secret)throw new Error('Invalid webhook signature');
  const fields={};for(const part of header.split(',')){
    const match=part.trim().match(/^(t|te|li)=(.*)$/);if(!match||Object.hasOwn(fields,match[1]))throw new Error('Invalid webhook signature');fields[match[1]]=match[2];
  }
  if(!/^\d{10}$/.test(fields.t||'')||Math.abs(now/1000-Number(fields.t))>300||!/^[a-f0-9]{64}$/.test(fields.te||''))throw new Error('Invalid webhook signature');
  const expected=createHmac('sha256',secret).update(fields.t+'.').update(bytes).digest();
  if(!timingSafeEqual(expected,Buffer.from(fields.te,'hex')))throw new Error('Invalid webhook signature');
}
export function checkoutUrl(value){
  const url=new URL(value);if(url.protocol!=='https:'||url.hostname!=='checkout.paymongo.com'||url.port||url.username||url.password)throw new Error('Invalid checkout URL');return url.href;
}
export function paymongoClient(config,fetcher=fetch){
  async function request(path,options={}){
    if(!/^sk_test_[A-Za-z0-9]+$/.test(config.secretKey))throw new Error('Test credentials required');
    const response=await fetcher('https://api.paymongo.com'+path,{...options,redirect:'error',signal:AbortSignal.timeout(20000),headers:{Authorization:'Basic '+Buffer.from(config.secretKey+':').toString('base64'),'Content-Type':'application/json',...options.headers}});
    if(!response.ok)throw new Error('Payment provider unavailable');
    const chunks=[];let size=0;for await(const chunk of response.body){size+=chunk.length;if(size>262144)throw new Error('Payment response too large');chunks.push(Buffer.from(chunk));}
    const data=JSON.parse(Buffer.concat(chunks).toString('utf8')).data;
    if(data?.type!=='checkout_session'||!/^cs_[A-Za-z0-9]+$/.test(data.id||'')||data.attributes?.livemode!==false)throw new Error('Invalid test checkout');
    return data;
  }
  return {
    create:order=>request('/v2/checkout_sessions',{method:'POST',headers:{'Idempotency-Key':'authentiscan-test-'+order.id},body:JSON.stringify({data:{attributes:{
      line_items:[{name:'AuthentiScan Pro — one month (TEST)',amount:order.amount,currency:'PHP',quantity:1}],
      payment_method_types:['gcash','paymaya','card'],reference_number:order.id,metadata:{authentiscan_order:order.id},
      success_url:order.origin+'/subscription?payment=returned',cancel_url:order.origin+'/subscription?payment=cancelled',
      send_email_receipt:false,pass_on_fees:false,
    }}})}),
    retrieve:id=>{if(!/^cs_[A-Za-z0-9]+$/.test(id))throw new Error('Invalid checkout ID');return request('/v1/checkout_sessions/'+id);},
  };
}
