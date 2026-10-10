import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,access,rm,symlink} from 'node:fs/promises';
import os from 'node:os';import path from 'node:path';
import {pruneOldCompanions} from '../build/server/companion-cache.js';
const sha='a'.repeat(64);
async function root(t){const dir=await mkdtemp(path.join(os.tmpdir(),'buddy-cache-prune-'));t.after(()=>rm(dir,{recursive:true,force:true}));return dir;}
async function cache(dir,version,arch='arm64',marker={version,arch,sha256:sha}){const target=path.join(dir,`${version}-${arch}`);await mkdir(target,{recursive:true});if(marker)await writeFile(path.join(target,'release.json'),JSON.stringify(marker));return target;}
async function exists(file){try{await access(file);return true;}catch{return false;}}
function running(directory){return path.join(directory,'Paseo Buddy.app/Contents/MacOS/Paseo Buddy');}

test('removes only marked older caches after current-version startup',async(t)=>{
 const dir=await root(t);const current=await cache(dir,'0.1.2');const old=await cache(dir,'0.1.1');const oldIntel=await cache(dir,'0.0.9','x64');
 const future=await cache(dir,'0.1.10');const sameIntel=await cache(dir,'0.1.2','x64');const unknown=await cache(dir,'0.1.0','arm64',null);
 const mismatch=await cache(dir,'0.0.1','x64',{version:'0.0.1',arch:'arm64',sha256:sha});await mkdir(path.join(dir,'.install-other'));await writeFile(path.join(dir,'notes.txt'),'keep');
 const removed=await pruneOldCompanions({cacheRoot:dir,currentVersion:'0.1.2',arch:'arm64',runningCommands:async()=>[running(current)]});
 assert.deepEqual(removed.sort(),['0.0.9-x64','0.1.1-arm64']);assert.equal(await exists(old),false);assert.equal(await exists(oldIntel),false);
 for(const item of [current,future,sameIntel,unknown,mismatch,path.join(dir,'.install-other'),path.join(dir,'notes.txt')])assert.equal(await exists(item),true);
});
test('preserves any old cache with a running app or helper',async(t)=>{
 const dir=await root(t);const current=await cache(dir,'0.1.2');const busy=await cache(dir,'0.1.1');const idle=await cache(dir,'0.1.0');
 const commands=[running(current),path.join(busy,'Paseo Buddy.app/Contents/Frameworks/Paseo Buddy Helper.app/Contents/MacOS/Paseo Buddy Helper')];
 assert.deepEqual(await pruneOldCompanions({cacheRoot:dir,currentVersion:'0.1.2',arch:'arm64',runningCommands:async()=>commands}),['0.1.0-arm64']);
 assert.equal(await exists(busy),true);assert.equal(await exists(idle),false);
});
test('does not delete on failed startup, missing marker, or inaccessible process inventory',async(t)=>{
 const dir=await root(t);const current=await cache(dir,'0.1.2');const old=await cache(dir,'0.1.1');
 const options={cacheRoot:dir,currentVersion:'0.1.2',arch:'arm64'};
 assert.deepEqual(await pruneOldCompanions({...options,runningCommands:async()=>[]}),[]);
 assert.deepEqual(await pruneOldCompanions({...options,runningCommands:async()=>{throw Error('no process visibility');}}),[]);
 await rm(path.join(current,'release.json'));
 assert.deepEqual(await pruneOldCompanions({...options,runningCommands:async()=>[running(current)]}),[]);
 assert.equal(await exists(old),true);
});
test('refuses directory and marker symlinks without touching external files',async(t)=>{
 const dir=await root(t);const external=await root(t);const current=await cache(dir,'0.1.2');
 await writeFile(path.join(external,'release.json'),JSON.stringify({version:'0.1.1',arch:'arm64',sha256:sha}));
 await symlink(external,path.join(dir,'0.1.1-arm64'),'dir');const markerLink=await cache(dir,'0.1.0','arm64',null);await symlink(path.join(external,'release.json'),path.join(markerLink,'release.json'));
 const options={cacheRoot:dir,currentVersion:'0.1.2',arch:'arm64',runningCommands:async()=>[running(current)]};
 assert.deepEqual(await pruneOldCompanions(options),[]);assert.equal(await exists(path.join(external,'release.json')),true);
 const alias=path.join(external,'cache-alias');await symlink(dir,alias,'dir');assert.deepEqual(await pruneOldCompanions({...options,cacheRoot:alias}),[]);
});
test('rechecks current and old processes before each removal',async(t)=>{
 const dir=await root(t);const current=await cache(dir,'0.1.2');const old=await cache(dir,'0.1.1');let reads=0;
 const removed=await pruneOldCompanions({cacheRoot:dir,currentVersion:'0.1.2',arch:'arm64',runningCommands:async()=>++reads===1?[running(current)]:[running(current),running(old)]});
 assert.deepEqual(removed,[]);assert.equal(await exists(old),true);
});
