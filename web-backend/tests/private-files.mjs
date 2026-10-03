import {createServer} from 'vite';
import {mkdir,writeFile,unlink} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';

const probes=['.secrets','.local-media'].map(folder=>({folder,file:`deny-probe-${randomUUID()}.txt`}));
const secret='non-secret-test-marker-'+randomUUID();let server;
try{
  for(const probe of probes){await mkdir(probe.folder,{recursive:true});await writeFile(path.join(probe.folder,probe.file),secret,{flag:'wx'});}
  server=await createServer({server:{host:'127.0.0.1',port:0,strictPort:false},logLevel:'silent'});await server.listen();
  const base=`http://127.0.0.1:${server.httpServer.address().port}`;
  for(const probe of probes)for(const suffix of ['', '?raw'])for(const url of [`/${probe.folder}/${probe.file}`,`/@fs/${path.resolve(probe.folder,probe.file).replaceAll('\\','/')}`]){
    const response=await fetch(base+url+suffix),body=await response.text();
    assert.equal(response.status,403,url+suffix);assert.equal(body.includes(secret),false);
  }
  console.log('Private-file checks passed: .secrets and .local-media blocked via normal, raw, and @fs URLs.');
}finally{
  if(server)await server.close();
  for(const probe of probes)await unlink(path.join(probe.folder,probe.file)).catch(e=>{if(e.code!=='ENOENT')throw e;});
}
