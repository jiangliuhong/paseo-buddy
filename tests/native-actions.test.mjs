import test from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { randomUUID } from 'node:crypto';
import { nativeActionBridge } from '../build/server/native-actions.js';

const stamp='2026-10-15T10:00:00.000Z';
const command=(fields={})=>({type:'mark_read',requestId:randomUUID(),agentId:'a',attentionTimestamp:stamp,...fields});
const settle=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(markRead=async()=>{}) {
  const stdout=new PassThrough();const replies=[];const calls=[];
  let state={connection:'connected',serverId:'srv_test',agents:[{id:'a',status:'completed_unread',attentionTimestamp:stamp}]};
  const bridge=nativeActionBridge({stdout},{state:()=>state,reply:r=>replies.push(r),markRead:async options=>{calls.push(options);await markRead(options);}});
  return {bridge,stdout,replies,calls,set state(value){state=value;},send(value){stdout.write(JSON.stringify(value)+'\n');}};
}

test('merely creating/reading a bridge has no side effects; only an explicit completion command writes',async()=>{
  const f=fixture();await settle();assert.equal(f.calls.length,0);
  const request=command();const bytes=Buffer.from(JSON.stringify(request)+'\n');
  f.stdout.write(bytes.subarray(0,20));await settle();assert.equal(f.calls.length,0);
  f.stdout.write(bytes.subarray(20));await settle();
  assert.equal(f.calls.length,1);assert.equal(f.calls[0].agentId,'a');assert.equal(f.calls[0].serverId,'srv_test');
  assert.deepEqual(f.replies,[{requestId:request.requestId,agentId:'a',success:true,error:null}]);
  await f.bridge.stop();
});

test('unknown commands, arbitrary RPC/shell fields, corrupt lines and oversized records cannot execute',async()=>{
  const f=fixture();
  f.send(command({type:'run_agent'}));f.send(command({shell:'rm -rf /'}));f.send(command({requestId:'not-a-uuid'}));
  f.stdout.write('not-json\n');f.stdout.write('x'.repeat(2100));f.stdout.write('\n');
  f.send(command());await settle();
  assert.equal(f.calls.length,1);await f.bridge.stop();
});

test('requests are rejected when disconnected, missing, active, waiting or superseded',async()=>{
  const f=fixture();
  for(const state of [{connection:'disconnected',agents:[]},{connection:'connected',agents:[]},
    {connection:'connected',agents:[{id:'a',status:'running'}]},
    {connection:'connected',agents:[{id:'a',status:'waiting_permission'}]},
    {connection:'connected',agents:[{id:'a',status:'completed_unread',attentionTimestamp:'new'}]}]) {
    f.state=state;f.send(command());
  }
  await settle();assert.equal(f.calls.length,0);assert.equal(f.replies.length,5);
  assert.ok(f.replies.every(reply=>!reply.success));await f.bridge.stop();
});

test('duplicate request IDs and concurrent reads of one agent cannot duplicate the SDK write',async()=>{
  let resolveRead;const f=fixture(()=>new Promise(resolve=>resolveRead=resolve));
  const request=command();f.send(request);f.send(request);await settle();
  f.send(command());assert.equal(f.replies.length,1);assert.equal(f.replies[0].success,false);
  assert.equal(f.calls.length,1);resolveRead();await settle();
  f.send(request);await settle();assert.equal(f.calls.length,1);await f.bridge.stop();
});

test('failures expose only a fixed retry message and never transport credentials',async()=>{
  const f=fixture(async()=>{throw Error('secret credential /private/path');});f.send(command());await settle();
  assert.equal(f.replies[0].success,false);assert.ok(!JSON.stringify(f.replies).includes('secret'));
  assert.match(f.replies[0].error,/try again/);await f.bridge.stop();
});

test('shutdown cancels in-flight reads, detaches output and ignores late commands/replies',async()=>{
  let cancelled=false;
  const f=fixture(({signal})=>new Promise((_,reject)=>signal.addEventListener('abort',()=>{cancelled=true;reject(Error('cancelled'));},{once:true})));
  f.send(command());await settle();await f.bridge.stop();
  assert.equal(cancelled,true);assert.deepEqual(f.replies,[]);assert.equal(f.stdout.listenerCount('data'),0);
  f.send(command());await settle();assert.equal(f.calls.length,1);
});
