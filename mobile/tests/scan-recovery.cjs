const assert=require('node:assert/strict'),fs=require('node:fs'),Module=require('node:module'),ts=require('typescript');
let revision=1,handler,requests=[];
class ApiError extends Error{constructor(message,status){super(message);this.status=status;}}
const original=Module._load;
Module._load=function(name,parent,main){
 if(name==='../api/client')return {ApiError,apiRequest:async(path,options={})=>{requests.push({path,...options});return handler(path,options);}};
 if(name==='../api/session')return {sessionRevision:()=>revision};
 if(name==='expo-file-system')return {File:class{constructor(uri){this.uri=uri;this.name='fixture.png';this.type='image/png';}}};
 return original.call(this,name,parent,main);
};
require.extensions['.ts']=(module,filename)=>module._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,filename);
process.env.EXPO_PUBLIC_API_MODE='backend';global.FormData=class{append(){}};
const service=require('../services/scan/scanService.ts');
function raw(id,status='completed'){return {scan_id:id,original_file_name:'fixture.png',image_url:'/api/v1/scans/'+id+'/image',created_at:new Date().toISOString(),status,analysis_status:status==='completed'?'completed':'processing',analysis:status==='completed'?{verdict:'authentic',confidence_score:.9,authentic_score:.9,ai_generated_score:.1,readable_explanation:'Saved result.'}:null};}
async function ambiguous(){const image={uri:'file:///fixture.png',fileName:'fixture.png',mimeType:'image/png'};handler=async()=>{throw new Error('Connection interrupted.');};await assert.rejects(service.realScanService.analyzeImage(image),/Connection interrupted/);return image;}
async function main(){
 let image=await ambiguous(),id=service.pendingScanId(image),before=requests.filter(x=>x.method==='POST').length;
 handler=async(path,opts)=>{assert.equal(path,'/api/v1/scans/'+id);assert.equal(opts.method,undefined);return {success:true,data:raw(id)};};
 assert.equal((await service.recoverSubmittedScan(image)).id,id);assert.equal(service.pendingScanId(image),null);assert.equal(requests.filter(x=>x.method==='POST').length,before);assert.equal(await service.recoverSubmittedScan(image),null);
 console.log('PASS lost-response recovery retrieves the exact saved operation using GET and never resubmits an image');
 image=await ambiguous();id=service.pendingScanId(image);handler=async()=>({success:true,data:raw(id,'processing')});const pending=await service.recoverSubmittedScan(image);assert.equal(pending.hasAnalysis,false);assert.equal(pending.status,'processing');assert.equal(service.pendingScanId(image),id);
 handler=async()=>{throw new ApiError('Not found',404);};assert.equal(await service.recoverSubmittedScan(image),null);assert.equal(service.pendingScanId(image),id);
 console.log('PASS processing and missing records do not invent a result or replace the original request ID');
 const controller=new AbortController();controller.abort();before=requests.length;assert.equal(await service.recoverSubmittedScan(image,controller.signal),null);assert.equal(requests.length,before);
 handler=async()=>{revision++;return {success:true,data:raw(id)};};assert.equal(await service.recoverSubmittedScan(image),null);assert.equal(service.pendingScanId(image),null);
 console.log('PASS cancellation and session changes discard recovery without leaking an earlier account result');
 image=await ambiguous();id=service.pendingScanId(image);handler=async()=>({success:true,data:raw('11111111-1111-4111-8111-111111111111')});await assert.rejects(service.recoverSubmittedScan(image),/reference did not match/);
 handler=async()=>{throw new ApiError('Sign in again',401);};await assert.rejects(service.recoverSubmittedScan(image),/Sign in again/);
 console.log('PASS mismatched scan IDs and authentication errors never become recovered reports');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
