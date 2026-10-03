import {mkdir,writeFile,readFile,link,unlink,access,lstat} from 'node:fs/promises';
import {constants} from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';

// Deliberately implements only the small file interface used by the API.
// There is NO Firebase Cloud Storage client or public static media directory.
export function createLocalMedia(root){
  const directory=path.resolve(root);
  function resolve(name){
    if(typeof name!=='string'||!/^users\/[A-Za-z0-9_-]{1,128}\/(?:scans\/[a-f0-9-]{36}\/(?:original|heatmap\.png)|storage-tests\/[a-f0-9-]{36})$/.test(name))throw new Error('Invalid private media path.');
    return path.join(directory,...name.split('/'));
  }
  async function ensureRoot(){await mkdir(directory,{recursive:true});if((await lstat(directory)).isSymbolicLink())throw new Error('Media root cannot be a link.');}
  async function safeParents(filename){
    await ensureRoot();
    const parts=path.relative(directory,path.dirname(filename)).split(path.sep);let current=directory;
    for(const part of parts){current=path.join(current,part);await mkdir(current,{recursive:false}).catch(e=>{if(e.code!=='EEXIST')throw e;});if((await lstat(current)).isSymbolicLink())throw new Error('Media folders cannot be links.');}
  }
  return {
    async getFiles(){await ensureRoot();await access(directory,constants.W_OK);return [[]];},
    file(name){
      const filename=resolve(name);
      return {
        async save(bytes){
          if(!Buffer.isBuffer(bytes)||!bytes.length||bytes.length>10*1024*1024)throw new Error('Invalid media content or size.');
          await safeParents(filename);
          const temporary=path.join(path.dirname(filename),'.pending-'+randomUUID());
          try{await writeFile(temporary,bytes,{flag:'wx',mode:0o600});await link(temporary,filename);}
          finally{await unlink(temporary).catch(e=>{if(e.code!=='ENOENT')throw e;});}
        },
        async download(){await safeParents(filename);if((await lstat(filename)).isSymbolicLink())throw new Error('Media cannot be a link.');return [await readFile(filename)];},
        async delete({ignoreNotFound=false}={}){await safeParents(filename);await unlink(filename).catch(e=>{if(!ignoreNotFound||e.code!=='ENOENT')throw e;});},
      };
    },
  };
}
