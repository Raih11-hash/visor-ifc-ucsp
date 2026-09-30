import {copyFileSync,readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const versions=Object.fromEntries(['@thatopen/fragments','web-ifc'].map(name=>[name,JSON.parse(readFileSync(path.join(root,'node_modules',name,'package.json'),'utf8')).version]));
const assets={};
for(const [source,destination] of [['@thatopen/fragments/dist/Worker/worker.mjs','fragments-worker.mjs'],['web-ifc/web-ifc.wasm','wasm/web-ifc.wasm']]){
  const output=path.join(root,'public',destination);mkdirSync(path.dirname(output),{recursive:true});copyFileSync(path.join(root,'node_modules',source),output);
  const bytes=readFileSync(output);assets[destination]={bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
}
writeFileSync(path.join(root,'public','engine-version.json'),JSON.stringify({appVersion:'2.0.0',versions,assets},null,2)+'\n');
console.log('Motor autoalojado sincronizado:',versions);
