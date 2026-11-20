// Run inside the API container. Checks private service identity, not model accuracy.
const expected=[
  [5001,h=>h.model_loaded===true],
  [5014,h=>h.service==='authentiscan-localizer'&&h.device==='cpu'&&h.model_loaded===true],
  [5005,h=>h.service==='authentiscan-scene'&&h.model_loaded===true],
];
let failed=false;
for(const [port,valid] of expected){
  try{
    const r=await fetch(`http://127.0.0.1:${port}/health`,{signal:AbortSignal.timeout(10000)});
    const h=await r.json();
    if(!r.ok||!valid(h))throw Error('Not ready or unexpected health response');
    console.log(`Port ${port}: ready`);
  }catch(e){failed=true;console.error(`Port ${port}: ${e.message}`);}
}
if(failed)process.exitCode=1;
