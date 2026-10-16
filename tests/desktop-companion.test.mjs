import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { mkdtemp, readFile, readdir, rm, writeFile, chmod, symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { companionAsset, companionDirectory, companionEnvironment, sourceSha256, ensureCompanion, startDesktopCompanion, nativePublisher } from '../build/server/desktop-companion.js';
import { nativeSource } from '../build/server/native-source.js';
import {parseAgentDeepLink} from '@getpaseo/protocol/agent-deep-link';
import {randomUUID} from 'node:crypto';

async function cache(t) { const root=await mkdtemp(path.join(os.tmpdir(),'buddy-native-'));t.after(()=>rm(root,{recursive:true,force:true}));return root; }
function compiler(calls=[]) { return async(command,args,options)=>{
 calls.push({command,args,options});assert.equal(options.shell,false);
 if(command==='/usr/bin/xcrun') {
  assert.equal(await readFile(args.at(-1),'utf8'),nativeSource);
  const binary=args[args.indexOf('-o')+1];await writeFile(binary,'fake native executable');await chmod(binary,0o700);
 }
 return {stdout:'',stderr:''};
}; }
function fakeChild(signal,handshake='READY\n') {
 const child=new EventEmitter();child.exitCode=null;child.signalCode=null;child.stdout=new PassThrough();child.stdin=new PassThrough();
 child.kill=signal=>{queueMicrotask(()=>{child.signalCode=signal;child.emit('exit',null,signal);});return true;};
 signal.addEventListener('abort',()=>child.kill('SIGTERM'),{once:true});
 if(handshake)queueMicrotask(()=>child.stdout.write(handshake));
 return child;
}
const observe=()=>({done:Promise.resolve(),async stop(){}});
test('native companion supports only macOS arm64/x64 and carries no download URL',()=>{
 assert.ok(companionAsset('darwin','arm64','22.0.0'));assert.ok(companionAsset('darwin','x64','22.0.0'));
 assert.equal(companionAsset('linux','x64'),null);assert.equal(companionAsset('darwin','unknown'),null);
 assert.equal(companionAsset('darwin','arm64','21.6.0'),null);
 assert.equal(companionAsset('darwin','arm64','invalid'),null);
 assert.equal(companionAsset('darwin','arm64','22.0.0').url,undefined);
});
test('native child/compiler environment excludes credentials and toolchain overrides',()=>{
 const env=companionEnvironment({HOME:'/Users/test',PATH:'/evil',OPENAI_API_KEY:'secret',PASEO_HOME:'/secret',CPATH:'/bad',DEVELOPER_DIR:'/bad',SDKROOT:'/bad'},123);
 assert.deepEqual(env,{HOME:'/Users/test',PATH:'/usr/bin:/bin:/usr/sbin:/sbin',PASEO_BUDDY_PARENT_PID:'123'});
});
test('activation without consent cannot invoke any compiler or download',async t=>{
 const root=await cache(t);let touched=false;t.mock.method(globalThis,'fetch',()=>{throw Error('No downloads allowed');});
 await assert.rejects(ensureCompanion({arch:'arm64',cacheRoot:root,signal:new AbortController().signal,exec:async()=>{touched=true;}}),/confirmation/);
 assert.equal(touched,false);assert.deepEqual(await readdir(root),[]);
});
test('concurrent confirmed builds compile once, use fixed argv and reuse hashed cache',async t=>{
 const root=await cache(t);const calls=[];const options={allowBuild:true,arch:'arm64',cacheRoot:root,signal:new AbortController().signal,exec:compiler(calls)};
 const [first,second]=await Promise.all([ensureCompanion(options),ensureCompanion(options)]);
 assert.equal(first,second);assert.equal(calls.length,2);
 assert.equal(calls[0].command,'/usr/bin/xcode-select');assert.deepEqual(calls[0].args,['-p']);
 assert.equal(calls[1].command,'/usr/bin/xcrun');assert.ok(calls[1].args.includes('arm64-apple-macosx13.0'));
 assert.equal(await ensureCompanion({...options,allowBuild:false}),first);assert.equal(calls.length,2);
 const directory=companionDirectory(root,'arm64');const marker=JSON.parse(await readFile(path.join(directory,'build.json'),'utf8'));
 assert.equal(marker.sourceSha256,sourceSha256);assert.equal(marker.binarySha256.length,64);
 assert.deepEqual(await readdir(root),[path.basename(directory)]);
});
test('Intel builds target x86_64 without downloading another architecture package',async t=>{
 const root=await cache(t);const calls=[];
 await ensureCompanion({allowBuild:true,arch:'x64',cacheRoot:root,signal:new AbortController().signal,exec:compiler(calls)});
 assert.ok(calls[1].args.includes('x86_64-apple-macosx13.0'));
});
test('modified cache cannot run; confirmed build preserves invalid cache for explicit repair',async t=>{
 const root=await cache(t);const options={allowBuild:true,arch:'arm64',cacheRoot:root,signal:new AbortController().signal,exec:compiler()};
 const binary=await ensureCompanion(options);await writeFile(binary,'tampered');
 await assert.rejects(ensureCompanion({...options,allowBuild:false}),/confirmation/);
 await assert.rejects(ensureCompanion(options),/invalid native cache/);
 assert.equal(await readFile(binary,'utf8'),'tampered');
});
test('symlink cache root and executable are rejected',async t=>{
 const root=await cache(t);const linked=path.join(root,'link');await symlink(root,linked);
 await assert.rejects(ensureCompanion({allowBuild:true,arch:'arm64',cacheRoot:linked,signal:new AbortController().signal}),/real directory/);
 const options={allowBuild:true,arch:'arm64',cacheRoot:root,signal:new AbortController().signal,exec:compiler()};
 const binary=await ensureCompanion(options);await rm(binary);await symlink('/usr/bin/true',binary);
 await assert.rejects(ensureCompanion({...options,allowBuild:false}),/confirmation/);
});
test('compiler failures and cancellation remove private temporary build files and allow retry',async t=>{
 const root=await cache(t);const options={allowBuild:true,arch:'arm64',cacheRoot:root,signal:new AbortController().signal};
 await assert.rejects(ensureCompanion({...options,exec:async()=>{throw Error('compiler missing');}}),/compiler/);
 assert.deepEqual(await readdir(root),[]);
 const controller=new AbortController();let entered;const started=new Promise(r=>entered=r);
 const building=ensureCompanion({...options,signal:controller.signal,exec:async(command,_args,{signal})=>{
  if(command==='/usr/bin/xcode-select')return {stdout:'',stderr:''};
  entered();await new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(Error('aborted')),{once:true}));
 }});
 await started;controller.abort();await assert.rejects(building,/aborted/);assert.deepEqual(await readdir(root),[]);
 await ensureCompanion({...options,exec:compiler()});
});
test('native startup waits for settings and READY before opening SDK observation',async()=>{
 let release;let ensured=false;let options;let publishing;let stopped=0;
 const companion=startDesktopCompanion({platform:'darwin',systemRelease:'22.0.0',arch:'arm64',displayFile:'/private/appearance.json',displayReady:new Promise(r=>release=r),log(){},
  ensure:async input=>{assert.equal(input.allowBuild,false);ensured=true;return '/verified/native';},
  spawn:(command,args,opts)=>{assert.equal(command,'/verified/native');assert.deepEqual(args,[]);options=opts;return fakeChild(opts.signal);},
  observe:input=>{publishing=input.publish;return {done:Promise.resolve(),async stop(){stopped++;}};},
 });
 await Promise.resolve();assert.equal(ensured,false);release();await companion.ready;
 assert.equal(typeof publishing,'function');assert.equal(options.env.PASEO_BUDDY_DISPLAY_FILE,'/private/appearance.json');assert.equal(options.shell,false);
 await companion.stop();assert.ok(stopped>=1);
});

test('quick-chat commands coalesced with READY reach the action bridge without a second launch',async()=>{
 const request={type:'quick_chat_options',requestId:randomUUID()};const received=[];
 const companion=startDesktopCompanion({platform:'darwin',systemRelease:'22.0.0',arch:'arm64',log(){},ensure:async()=>'/verified',
  spawn:(_command,_args,opts)=>fakeChild(opts.signal,'READY\n'+JSON.stringify(request)+'\n'),
  observe:()=>({done:Promise.resolve(),async stop(){}}),
  quickChat:()=>({async handle(command){received.push(command);return {kind:'result',requestId:command.requestId,ok:true,error:null};},async stop(){}}),
 });
 await companion.ready;await new Promise(resolve=>setImmediate(resolve));
 assert.deepEqual(received,[request]);await companion.stop();
});
test('disable cancels pending settings or build without spawning',async()=>{
 let calls=0;
 const settings=startDesktopCompanion({platform:'darwin',systemRelease:'22.0.0',arch:'arm64',displayReady:new Promise(()=>{}),ensure:async()=>{calls++;return '/never';}});
 await settings.stop();assert.equal(calls,0);
 let entered;const started=new Promise(r=>entered=r);
 const building=startDesktopCompanion({platform:'darwin',systemRelease:'22.0.0',arch:'arm64',ensure:async({signal})=>{entered();await new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(Error('aborted'))));return '/never';},spawn:()=>{calls++;}});
 await started;await building.stop();assert.equal(calls,0);
});
test('unsupported platform does not compile, spawn or observe',async()=>{
 let touched=false;
 const companion=startDesktopCompanion({platform:'linux',arch:'x64',ensure:async()=>{touched=true;return '/never';}});
 await companion.ready;await companion.stop();assert.equal(touched,false);
});
test('failed native readiness reports an error and stops the owned process before retry',async()=>{
 let child;let error;let observed=false;
 const companion=startDesktopCompanion({platform:'darwin',systemRelease:'22.0.0',arch:'arm64',readyTimeoutMs:2,ensure:async()=>'/verified',
  spawn:(_command,_args,opts)=>child=fakeChild(opts.signal,''),observe:()=>{observed=true;return observe();},onError:message=>error=message,
 });
 await companion.ready;assert.ok(error);assert.equal(observed,false);assert.equal(child.signalCode,'SIGTERM');await companion.stop();
});

test('a child that exits immediately after READY cannot start daemon observation',async()=>{
 let observed=false;let error;
 const companion=startDesktopCompanion({platform:'darwin',systemRelease:'22.0.0',arch:'arm64',ensure:async()=>'/verified',
  spawn:(_command,_args,opts)=>{
   const child=fakeChild(opts.signal,'');
   queueMicrotask(()=>{child.stdout.write('READY\n');child.exitCode=0;child.emit('exit',0,null);});
   return child;
  },observe:()=>{observed=true;return observe();},onError:message=>error=message,
 });
 await companion.ready;assert.equal(observed,false);assert.match(error,/window could not start/);
 await companion.stop();
});
test('native pipe strips unused fields and bounds slow-reader updates to the latest snapshot',()=>{
 const stdin=new EventEmitter();const writes=[];stdin.destroyed=false;stdin.write=value=>{writes.push(value);return writes.length!==1;};
 const publisher=nativePublisher({stdin});
 const state=count=>({connection:'connected',agents:[{id:String(count),name:'Agent',projectName:'Project',workspaceName:'Workspace',status:'running',startedAt:null,cwd:'/private/path',token:'secret'}]});
 publisher.publish(state(1));publisher.publish(state(2));publisher.publish(state(3));
 assert.equal(writes.length,1);stdin.emit('drain');assert.equal(writes.length,2);
 assert.equal(JSON.parse(writes[1]).agents[0].id,'3');assert.ok(!writes.join('').includes('/private/path'));assert.ok(!writes.join('').includes('secret'));
 publisher.publish({connection:'connected',agents:Array(5001).fill(state(1).agents[0])});
 assert.deepEqual(JSON.parse(writes.at(-1)),{connection:'disconnected',agents:[]});
 publisher.stop();publisher.publish(state(4));assert.equal(writes.length,3);
});

test('notification messages survive snapshot coalescing and are bounded and stripped',()=>{
 const stdin=new EventEmitter();const writes=[];stdin.destroyed=false;
 stdin.write=value=>{writes.push(JSON.parse(value));return writes.length!==1;};
 const publisher=nativePublisher({stdin});
 publisher.publish({connection:'connecting',agents:[]});
 publisher.notify({id:'a'.repeat(64),agentName:'First',outcome:'completed',error:'secret'});
 publisher.publish({connection:'disconnected',agents:[]});
 publisher.notify({id:'b'.repeat(64),agentName:'Second',outcome:'failed'});
 publisher.publish({connection:'connected',agents:[]});
 stdin.emit('drain');
 assert.deepEqual(writes,[{connection:'connecting',agents:[]},{connection:'connected',agents:[]},
  {notification:{id:'a'.repeat(64),agentName:'First',outcome:'completed'}},
  {notification:{id:'b'.repeat(64),agentName:'Second',outcome:'failed'}}]);
 assert.ok(!JSON.stringify(writes).includes('secret'));
 publisher.stop();publisher.notify({id:'c'.repeat(64),agentName:'Late',outcome:'completed'});
 assert.equal(writes.length,4);
 assert.doesNotThrow(()=>stdin.emit('error',Error('late EPIPE')));
});

test('a stalled native reader cannot grow the notification queue indefinitely',()=>{
 const stdin=new EventEmitter();const writes=[];stdin.destroyed=false;
 stdin.write=value=>{writes.push(JSON.parse(value));return writes.length!==1;};
 const publisher=nativePublisher({stdin});
 publisher.publish({connection:'connected',agents:[]});
 for(let i=0;i<300;i++)publisher.notify({id:i.toString(16).padStart(64,'0'),agentName:'Agent',outcome:'completed'});
 stdin.emit('drain');assert.equal(writes.length,257);
 publisher.stop();
});

test('conversation routes use the official builder and only a known server identity',()=>{
 const stdin=new EventEmitter();const writes=[];stdin.destroyed=false;stdin.write=value=>{writes.push(JSON.parse(value));return true;};
 const publisher=nativePublisher({stdin});
 const agent={id:'agent / ?#中文',projectName:'Project',workspaceName:'Work',name:'Agent',status:'running',startedAt:null};
 publisher.publish({connection:'connected',agents:[agent],serverId:'srv /?#中文'});
 assert.deepEqual(parseAgentDeepLink(writes[0].agents[0].conversationUrl),{serverId:'srv /?#中文',agentId:agent.id});
 publisher.publish({connection:'connected',agents:[agent]});
 assert.equal(writes[1].agents[0].conversationUrl,undefined);
 publisher.stop();
});

test('action results have their own queue and survive snapshot coalescing and notice backlog',()=>{
 const stdin=new EventEmitter();const writes=[];stdin.destroyed=false;
 stdin.write=value=>{writes.push(JSON.parse(value));return writes.length!==1;};
 const publisher=nativePublisher({stdin});
 publisher.publish({connection:'connecting',agents:[]});
 publisher.notify({id:'a'.repeat(64),agentName:'Agent',outcome:'completed'});
 const result={requestId:'request',agentId:'agent',success:true,error:null};
 publisher.actionResult(result);publisher.publish({connection:'connected',agents:[]});stdin.emit('drain');
 assert.deepEqual(writes[1],{connection:'connected',agents:[]});assert.deepEqual(writes[2],{actionResult:result});
 assert.equal(writes[3].notification.outcome,'completed');publisher.stop();
});

test('multi-host cards preserve routing identity, unique UI keys and local-only read controls without exposing paths',()=>{
 const stdin=new EventEmitter();const writes=[];stdin.destroyed=false;stdin.write=value=>{writes.push(JSON.parse(value));return true;};
 const publisher=nativePublisher({stdin});
 const agent={id:'same',projectName:'P',workspaceName:'W',name:'Agent',status:'completed_unread',startedAt:null,cwd:'/secret'};
 publisher.publish({connection:'connected',serverId:'local',hosts:[{serverId:'remote',label:'Remote',connection:'connected'}],
  agents:[{...agent,serverId:'local',hostLabel:'This Mac'},{...agent,serverId:'remote',hostLabel:'Remote'}]});
 const [local,remote]=writes[0].agents;
 assert.notEqual(local.id,remote.id);assert.equal(local.canMarkRead,true);assert.equal(remote.canMarkRead,false);
 assert.deepEqual(parseAgentDeepLink(remote.conversationUrl),{serverId:'remote',agentId:'same'});
 assert.equal(remote.conversationAgentId,'same');assert.equal(remote.hostLabel,'Remote');
 assert.equal(writes[0].hosts[0].serverId,'remote');assert.ok(!JSON.stringify(writes).includes('/secret'));
 publisher.stop();
});
