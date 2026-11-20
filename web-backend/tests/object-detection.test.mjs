import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {normalizeObjects,detectorBase,detectObjects,objectReadiness} from '../server/object-detection.mjs';
import {objectFixture} from './object-fixture.mjs';

test('object contract is bounded, normalized, and separate from authenticity',()=>{
  const input=objectFixture(),output=normalizeObjects(input);assert.deepEqual(output,input);assert.notEqual(output.objects[0],input.objects[0]);
  assert.equal(output.verdict,undefined);assert.equal(normalizeObjects({...input,objects:[]}).objects.length,0);
  for(const change of [{image_width:Infinity},{image_width:1.5},{image_width:16000000,image_height:2},{threshold:.1},{coordinate_space:'pixels'},
    {objects:Array(21).fill(input.objects[0])},{objects:[{...input.objects[0],label:'<script>'}]},{objects:[{...input.objects[0],score:.49}]},
    {objects:[{...input.objects[0],box:[0,0,1.1,1]}]},{objects:[{...input.objects[0],box:[.9,0,.1,1]}]},{objects:[{...input.objects[0],score:NaN}]}])assert.throws(()=>normalizeObjects({...input,...change}));
});
test('detector adapter refuses remote hosts, redirects, oversized and invalid responses',async()=>{
  const original=process.env.OBJECT_DETECTOR_URL;
  try{
    for(const url of ['https://example.com','http://127.0.0.1:5003/path','http://user:pass@localhost:5003']){process.env.OBJECT_DETECTOR_URL=url;assert.throws(detectorBase);}
    let mode='valid';const server=createServer(async(req,res)=>{
      if(req.url==='/health'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({service:'authentiscan-object-detector',model_loaded:true,model_version:objectFixture().model_version}));}
      assert.equal(req.headers['x-authentiscan-detector'],'local-object-detection-v1');
      for await(const _chunk of req){};
      if(mode==='redirect'){res.writeHead(302,{Location:'https://example.com'});return res.end();}
      res.end(mode==='large'?'x'.repeat(33000):JSON.stringify({success:true,data:mode==='invalid'?{}:objectFixture()}));
    }).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
    try{
      process.env.OBJECT_DETECTOR_URL=`http://127.0.0.1:${server.address().port}`;
      assert.equal(await objectReadiness(),'ready');assert.equal((await detectObjects(Buffer.from('fixture'))).objects.length,2);
      for(mode of ['redirect','large','invalid'])await assert.rejects(()=>detectObjects(Buffer.from('fixture')));
    }finally{await new Promise(r=>server.close(r));}
  }finally{if(original===undefined)delete process.env.OBJECT_DETECTOR_URL;else process.env.OBJECT_DETECTOR_URL=original;}
});
