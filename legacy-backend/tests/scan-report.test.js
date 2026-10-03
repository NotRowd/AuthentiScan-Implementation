const test=require('node:test');
const assert=require('node:assert/strict');
const {buildScanReport,loadReportHeatmap,percent}=require('../src/services/scanReport');
const sample={scan_id:19,result_id:1,original_file_name:'demo.png',status:'completed',created_at:new Date('2026-09-14T01:00:00Z'),analyzed_at:new Date('2026-09-14T01:00:10Z'),verdict:'ai_generated',confidence_score:0.7481,authentic_score:0.2519,ai_generated_score:0.7481,model_version:'curated-v1-candidate-v1-dev'};
// Valid 1x1 PNG; test resource only, not evidence of a real scan.
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');
test('score formatting preserves zero and does not invent invalid scores',()=>{
 assert.equal(percent(0),'0.00%');assert.equal(percent('0.7481'),'74.81%');
 for(const value of [null,undefined,'',NaN,-1,2])assert.equal(percent(value),'Not available');
});
test('PDF builds for completed, pending, failed and long Unicode filenames',async()=>{
 for(const status of ['completed','queued','processing','failed']){
  const pdf=await buildScanReport({...sample,status,original_file_name:'café-測試-'.repeat(30)+'.png'});
  assert.equal(pdf.subarray(0,5).toString(),'%PDF-');assert.ok(pdf.length>1000);
 }
 assert.equal((await buildScanReport(sample,png)).subarray(0,5).toString(),'%PDF-');
 assert.equal((await buildScanReport(sample,Buffer.from('not an image'))).subarray(0,5).toString(),'%PDF-');
});
test('heatmap uses only configured origin, no JWT and no redirects',async()=>{
 const fetchImpl=async(url,options)=>{
  assert.equal(url,'http://ai.example.test/heatmaps/abc-123.png');assert.equal(options.redirect,'error');
  assert.equal(options.headers.Authorization,undefined);
  return new Response(png,{headers:{'content-type':'image/png'}});
 };
 assert.deepEqual(await loadReportHeatmap('/heatmaps/abc-123.png',{fetchImpl,baseUrl:'http://ai.example.test'}),png);
 let calls=0;const deny=async()=>{calls++;throw Error('must not request');};
 for(const value of ['https://evil.test/a.png','/heatmaps/../secret.png','/heatmaps/a.png?token=1','/heatmaps/a.svg',null]){
  assert.equal(await loadReportHeatmap(value,{fetchImpl:deny,baseUrl:'http://ai.example.test'}),null);
 }
 assert.equal(calls,0);
});
test('heatmap failure, invalid content, oversized and timed-out responses are optional',async()=>{
 const options={baseUrl:'http://ai.example.test',timeoutMs:10};
 for(const mock of [async()=>{throw Error('offline');},async()=>new Response('error',{status:404}),async()=>new Response('html',{headers:{'content-type':'text/html'}}),async()=>new Response(png,{headers:{'content-type':'image/png','content-length':'99999999'}}),async()=>new Response('broken',{headers:{'content-type':'image/png'}})]){
  assert.equal(await loadReportHeatmap('/heatmaps/a.png',{...options,fetchImpl:mock}),null);
 }
 assert.equal(await loadReportHeatmap('/heatmaps/a.png',{...options,fetchImpl:(url,{signal})=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(Error('timeout'))))}),null);
});
test('report HTTP endpoint enforces ownership and is SELECT-only',async()=>{
 process.env.JWT_SECRET='report-test-only';process.env.NODE_ENV='test';
 const {pool}=require('../src/config/db');const original=pool.execute;let queries=0;
 pool.execute=async(sql,params)=>{
  queries++;assert.match(sql,/^SELECT/);assert.match(sql,/s.scan_id = \? AND s.user_id = \? AND s.is_deleted = FALSE/);
  return [params[0]===19&&params[1]===17?[sample]:[]];
 };
 const app=require('../src/app');const jwt=require('jsonwebtoken');const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const base=`http://127.0.0.1:${server.address().port}/api/v1/scans/`;
 const auth=id=>({Authorization:'Bearer '+jwt.sign({userId:id},process.env.JWT_SECRET)});
 try{
  assert.equal((await fetch(base+'19/report')).status,401);assert.equal(queries,0);
  for(const id of ['-1','1e2','9007199254740992'])assert.equal((await fetch(base+id+'/report',{headers:auth(17)})).status,400);
  assert.equal(queries,0);
  assert.equal((await fetch(base+'19/report',{headers:auth(99)})).status,404);
  assert.equal((await fetch(base+'999/report',{headers:auth(17)})).status,404);
  const r=await fetch(base+'19/report',{headers:auth(17)});
  assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'no-store');
  assert.equal(r.headers.get('content-type'),'application/pdf');
  assert.match(r.headers.get('content-disposition'),/AuthentiScan-scan-19.pdf/);
  assert.equal(Buffer.from(await r.arrayBuffer()).subarray(0,5).toString(),'%PDF-');
 }finally{pool.execute=original;server.closeAllConnections();await new Promise(r=>server.close(r));await pool.end();}
});
