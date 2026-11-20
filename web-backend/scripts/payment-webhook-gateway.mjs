// Tunnel ONLY this gateway, never the API, AI services, Firebase emulators or Vite.
import express from 'express';
import helmet from 'helmet';
import {pathToFileURL} from 'node:url';
export function webhookGateway(fetcher=fetch){
  const app=express();app.disable('x-powered-by');app.use(helmet());
  app.post('/api/payments/paymongo/webhook',express.raw({type:'application/json',limit:'256kb'}),async(req,res)=>{
    if(!Buffer.isBuffer(req.body)||typeof req.headers['paymongo-signature']!=='string'||req.headers['paymongo-signature'].length>1024)return res.status(400).json({received:false});
    try{
      const response=await fetcher('http://127.0.0.1:5002/api/payments/paymongo/webhook',{method:'POST',body:req.body,redirect:'error',signal:AbortSignal.timeout(25000),headers:{'Content-Type':'application/json','Paymongo-Signature':req.headers['paymongo-signature']}});
      await response.body?.cancel();res.status(response.status>=200&&response.status<300?200:503).json({received:response.ok});
    }catch{res.status(503).json({received:false});}
  });
  app.use((_req,res)=>res.status(404).json({message:'Not found'}));
  app.use((err,_req,res,_next)=>res.status(err.status===413?413:400).json({received:false}));
  return app;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const server=webhookGateway().listen(5006,'127.0.0.1',()=>console.log('Payment webhook-only gateway: http://127.0.0.1:5006. Tunnel this port only; use PayMongo TEST webhooks.'));
  server.on('error',()=>{console.error('Cannot start webhook gateway. Check port 5006.');process.exitCode=1;});
}
