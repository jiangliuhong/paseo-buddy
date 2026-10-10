import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { companionAsset, companionEnvironment, checksumFor, companionVersion, downloadArchive, ensureCompanion, startDesktopCompanion } from '../build/server/desktop-companion.js';

async function cache(t) {
  const dir=await mkdtemp(path.join(os.tmpdir(),'buddy-companion-'));
  t.after(()=>rm(dir,{recursive:true,force:true}));return dir;
}
const sha='a'.repeat(64);

test('selects only published macOS architectures and exact checksum filenames',()=>{
  const asset=companionAsset('darwin','arm64');
  assert.ok(asset.url.startsWith(`https://github.com/jiangliuhong/paseo-buddy/releases/download/v${companionVersion}/`));
  assert.equal(checksumFor(`${sha}  ${asset.name}\n` ,asset.name),sha);
  assert.throws(()=>checksumFor(`${sha}  other.zip`,asset.name));
  assert.equal(companionAsset('linux','x64'),null);
  assert.equal(companionAsset('darwin','unknown'),null);
});

test('child receives daemon home and parent identity but no provider credentials',()=>{
  assert.deepEqual(companionEnvironment({HOME:'/Users/test',PASEO_HOME:'/test/daemon',OPENAI_API_KEY:'secret',TOKEN:'secret',ELECTRON_RUN_AS_NODE:'1'},123),{
    HOME:'/Users/test',PASEO_HOME:'/test/daemon',PASEO_BUDDY_PARENT_PID:'123',
  });
});

test('verifies archive bytes before any extraction',async(t)=>{
  const root=await cache(t);const body=Buffer.from('verified-archive');
  t.mock.method(globalThis,'fetch',async()=>{
    const response=new Response(body);Object.defineProperty(response,'url',{value:'https://release-assets.githubusercontent.com/release/asset'});return response;
  });
  const hash=createHash('sha256').update(body).digest('hex');
  await downloadArchive('https://github.com/asset',path.join(root,'good.zip'),hash,new AbortController().signal);
  assert.equal((await readFile(path.join(root,'good.zip'))).toString(),body.toString());
  await assert.rejects(downloadArchive('https://github.com/asset',path.join(root,'bad.zip'),sha,new AbortController().signal),/checksum/);
});

test('downloads and validates once, then reuses the verified app cache',async(t)=>{
  const root=await cache(t);let downloads=0;let extracts=0;
  const options={arch:'arm64',cacheRoot:root,signal:new AbortController().signal,
    checksum:async()=>sha,
    download:async(_url,file)=>{downloads++;await writeFile(file,'archive');},
    extract:async()=>{extracts++;},validate:async directory=>path.join(directory,'Paseo Buddy.app/Contents/MacOS/Paseo Buddy'),
  };
  const executable=await ensureCompanion(options);
  assert.ok(executable.includes(`${companionVersion}-arm64`));
  assert.equal(await ensureCompanion(options),executable);
  assert.equal(downloads,1);assert.equal(extracts,1);
  assert.ok(!(await readdir(root)).some(f=>f.startsWith('.install-')));
});

test('failed verification cannot extract or publish a partially downloaded app',async(t)=>{
  const root=await cache(t);let extracted=false;
  await assert.rejects(ensureCompanion({arch:'arm64',cacheRoot:root,signal:new AbortController().signal,
    checksum:async()=>sha,download:async()=>{throw Error('checksum failure');},extract:async()=>{extracted=true;},validate:async()=>'/unused',
  }),/checksum/);
  assert.equal(extracted,false);assert.deepEqual(await readdir(root),[]);
});

function fakeChild(signal) {
  const child=new EventEmitter();child.exitCode=null;child.signalCode=null;
  child.kill=signal=>{child.signalCode=signal;queueMicrotask(()=>child.emit('exit',null,signal));return true;};
  signal.addEventListener('abort',()=>child.kill('SIGTERM'));
  queueMicrotask(()=>child.emit('spawn'));return child;
}

test('starts one owned child and plugin cleanup terminates only that child',async()=>{
  let count=0;let child;let stopSignal;
  const companion=startDesktopCompanion({platform:'darwin',arch:'arm64',log(){},ensure:async()=>'/verified/Paseo Buddy',
    spawn:(command,args,options)=>{
      assert.equal(command,'/verified/Paseo Buddy');assert.deepEqual(args,[]);assert.equal(options.shell,false);
      assert.equal(options.env.PASEO_BUDDY_PARENT_PID,String(process.pid));
      count++;stopSignal=options.signal;return child=fakeChild(options.signal);
    },
  });
  await companion.ready;assert.equal(count,1);
  await companion.stop();assert.equal(stopSignal.aborted,true);assert.equal(child.signalCode,'SIGTERM');
});

test('disable during a pending download aborts without spawning a desktop',async()=>{
  let entered;const started=new Promise(r=>entered=r);let spawned=false;
  const companion=startDesktopCompanion({platform:'darwin',arch:'arm64',log(){},ensure:async({signal})=>{
    entered();await new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(Error('aborted'))));return '/never';
  },spawn:()=>{spawned=true;}});
  await started;await companion.stop();assert.equal(spawned,false);
});

test('unsupported hosts do not download or spawn',async()=>{
  let touched=false;
  const companion=startDesktopCompanion({platform:'linux',arch:'x64',log(){},ensure:async()=>{touched=true;return '/never';}});
  await companion.ready;await companion.stop();assert.equal(touched,false);
});

test('temporary release errors retry and can be cancelled cleanly',async()=>{
  let attempts=0;
  const companion=startDesktopCompanion({platform:'darwin',arch:'arm64',log(){},retryMs:1,
    ensure:async()=>{attempts++;if(attempts===1)throw Error('release pending');return '/verified/app';},
    spawn:(_cmd,_args,options)=>fakeChild(options.signal),
  });
  await companion.ready;assert.equal(attempts,2);await companion.stop();
});

test('display mirror readiness gates startup and its path is passed only to the owned child',async()=>{
  let release;let ensured=false;let env;
  const companion=startDesktopCompanion({platform:'darwin',arch:'arm64',log(){},displayFile:'/private/display.json',displayReady:new Promise(r=>release=r),
    ensure:async()=>{ensured=true;return '/verified/app';},spawn:(_cmd,_args,options)=>{env=options.env;return fakeChild(options.signal);},
  });
  await Promise.resolve();assert.equal(ensured,false);release();await companion.ready;
  assert.equal(env.PASEO_BUDDY_DISPLAY_FILE,'/private/display.json');await companion.stop();
});
test('cleanup aborts while waiting for initial display settings',async()=>{
  let spawned=false;
  const companion=startDesktopCompanion({platform:'darwin',arch:'arm64',log(){},displayReady:new Promise(()=>{}),ensure:async()=>{spawned=true;return '/never';}});
  await companion.stop();assert.equal(spawned,false);
});

test('successful startup schedules guarded old-cache cleanup without blocking the window',async()=>{
 let cleared;const called=new Promise(r=>cleared=r);let options;
 const companion=startDesktopCompanion({platform:'darwin',arch:'arm64',cacheRoot:'/private/cache',log(){},cleanupDelayMs:0,
  ensure:async()=>'/verified/app',spawn:(_cmd,_args,opts)=>fakeChild(opts.signal),
  cleanup:async opts=>{options=opts;cleared();return ['0.1.1-arm64'];},
 });
 await companion.ready;await called;assert.equal(options.cacheRoot,'/private/cache');assert.equal(options.currentVersion,companionVersion);
 await companion.stop();
});
test('failed preparation never schedules destructive cache cleanup',async()=>{
 let attempted;const first=new Promise(r=>attempted=r);let cleaned=false;
 const companion=startDesktopCompanion({platform:'darwin',arch:'arm64',log(){},retryMs:1,cleanupDelayMs:0,
  ensure:async()=>{attempted();throw Error('download failed');},cleanup:async()=>{cleaned=true;return [];},
 });
 await first;await companion.stop();assert.equal(cleaned,false);
});
test('stopping before the cleanup grace period cancels pruning',async()=>{
 let cleaned=false;const companion=startDesktopCompanion({platform:'darwin',arch:'arm64',log(){},cleanupDelayMs:50,
  ensure:async()=>'/verified/app',spawn:(_cmd,_args,opts)=>fakeChild(opts.signal),cleanup:async()=>{cleaned=true;return [];},
 });
 await companion.ready;await companion.stop();await new Promise(r=>setTimeout(r,70));assert.equal(cleaned,false);
});
