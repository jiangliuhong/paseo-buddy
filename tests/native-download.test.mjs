import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ensureCompanion, companionVersion, sourceSha256 } from '../build/server/desktop-companion.js';
import { nativeReleaseBase, nativeAssetName, releaseBytes } from '../build/server/native-download.js';
const bytes=Buffer.from('fixture native executable');
const marker=arch=>({recipe:'appkit-bundle-1',version:companionVersion,sourceSha256,arch,binarySha256:createHash('sha256').update(bytes).digest('hex')});
async function setup(t,arch='arm64') {
 const root=await mkdtemp(path.join(os.tmpdir(),'buddy-download-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const calls=[];
 const options={allowDownload:true,arch,cacheRoot:root,signal:new AbortController().signal,exec:()=>{throw Error('must not compile');},fetch:async(url,opts)=>{
   calls.push(url);assert.equal(opts.credentials,'omit');assert.equal(opts.redirect,'manual');
   assert.ok(url.startsWith(`${nativeReleaseBase}/${nativeAssetName(arch)}`));
   return new Response(url.endsWith('.json')?JSON.stringify(marker(arch)):bytes);
 }};
 return {root,calls,options};
}
for(const arch of ['arm64','x64'])test(`downloads matching ${arch} release once and reuses verified cache`,async t=>{
 const {root,calls,options}=await setup(t,arch);
 const [a,b]=await Promise.all([ensureCompanion(options),ensureCompanion(options)]);
 assert.equal(a,b);assert.deepEqual(await readFile(a),bytes);assert.equal(calls.length,2);
 await ensureCompanion({...options,allowDownload:false});assert.equal(calls.length,2);
 assert.equal((await readdir(root)).length,1);
});
for(const field of ['arch','version','sourceSha256','binarySha256'])test(`rejects wrong ${field} and cleans incomplete download`,async t=>{
 const {root,options}=await setup(t);
 await assert.rejects(ensureCompanion({...options,fetch:async url=>new Response(url.endsWith('.json')?JSON.stringify({...marker('arm64'),[field]:field==='binarySha256'?'a'.repeat(64):'wrong'}):bytes)}),/match|SHA-256/);
 assert.deepEqual(await readdir(root),[]);
 await ensureCompanion(options);
});
test('missing release and aborted download clean temporary files and permit retry',async t=>{
 const {root,options}=await setup(t);
 await assert.rejects(ensureCompanion({...options,fetch:async()=>new Response('',{status:404})}),/not published/);
 const controller=new AbortController();
 await assert.rejects(ensureCompanion({...options,signal:controller.signal,fetch:async()=>{controller.abort();controller.signal.throwIfAborted();}}),/abort/i);
 assert.deepEqual(await readdir(root),[]);await ensureCompanion(options);
});
test('redirects reject external hosts before requesting them, cap assets and honor cancellation',async()=>{
 let calls=0;
 await assert.rejects(releaseBytes(`${nativeReleaseBase}/asset`,10,new AbortController().signal,async()=>{calls++;return new Response(null,{status:302,headers:{location:'https://example.com/evil'}});}),/Untrusted/);
 assert.equal(calls,1);
 await assert.rejects(releaseBytes(`${nativeReleaseBase}/asset`,2,new AbortController().signal,async()=>new Response('oversize')),/size limit/);
 const controller=new AbortController();controller.abort();
 await assert.rejects(releaseBytes(`${nativeReleaseBase}/asset`,10,controller.signal,async()=>new Response('bytes')),/abort/i);
});

test('accepts GitHub asset redirects and rejects HTTP or redirect loops',async()=>{
 const calls=[];
 const result=await releaseBytes(`${nativeReleaseBase}/asset`,16,new AbortController().signal,async url=>{
  calls.push(url);return calls.length===1?new Response(null,{status:302,headers:{location:'https://release-assets.githubusercontent.com/asset'}}):new Response('binary');
 });
 assert.equal(result.toString(),'binary');assert.equal(calls.length,2);
 await assert.rejects(releaseBytes('http://github.com/asset',16,new AbortController().signal,async()=>{throw Error('must not request');}),/Untrusted/);
 await assert.rejects(releaseBytes(`${nativeReleaseBase}/asset`,16,new AbortController().signal,async()=>new Response(null,{status:302,headers:{location:`${nativeReleaseBase}/asset`}})),/Too many/);
});
test('download cannot replace a corrupt existing cache',async t=>{
 const {root,options}=await setup(t);const binary=await ensureCompanion(options);
 const {writeFile}=await import('node:fs/promises');await writeFile(binary,'corrupt');
 await assert.rejects(ensureCompanion(options),/invalid native cache/);
 assert.equal(await readFile(binary,'utf8'),'corrupt');assert.equal((await readdir(root)).length,1);
});
