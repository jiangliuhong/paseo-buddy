import test from 'node:test';
import assert from 'node:assert/strict';
import { observeTurnNotifications } from '../build/server/turn-notifications.js';

const agent=(id,fields={})=>({id,title:`Agent ${id}`,provider:'codex',status:'running',pendingPermissions:[],...fields});
function fixture(seen=new Set(),ready=Promise.resolve()) {
  const handlers=new Map();const notices=[];const released=[];let errors=0;
  const observer=observeTurnNotifications({seen,notify:n=>notices.push(n),onError:()=>errors++,client:{agents:{ref:a=>({timeline:{subscribe(handler){
    handlers.set(a.id,handler);
    const unsubscribe=()=>released.push(a.id);unsubscribe.ready=ready;return unsubscribe;
  }}})}}});
  return {observer,notices,handlers,released,get errors(){return errors;},event(id,type,turnId='turn-1',fields={}){
    handlers.get(id)?.({agentId:id,event:{type,turnId,provider:'codex',...fields}});
  }};
}

test('hydration is silent; only live completed/failed events with turn identity notify',()=>{
  const f=fixture();
  f.observer.hydrate([agent('a'),agent('idle',{status:'idle',requiresAttention:true}),agent('failed',{status:'error'})]);
  assert.deepEqual([...f.handlers.keys()],['a']);assert.deepEqual(f.notices,[]);
  for(const type of ['turn_started','turn_canceled','attention_required','replacement','subscription_restored'])f.event('a',type);
  f.handlers.get('a')({agentId:'a',event:{type:'turn_completed',provider:'codex'}});
  assert.equal(f.notices.length,0);
  f.event('a','turn_completed');
  f.event('a','turn_failed','turn-2',{error:'sensitive diagnostic',diagnostic:'secret'});
  assert.deepEqual(f.notices.map(n=>n.outcome),['completed','failed']);
  assert.ok(f.notices.every(n=>/^[a-f0-9]{64}$/.test(n.id)));
  assert.ok(!JSON.stringify(f.notices).includes('secret'));
  f.observer.stop();
});

test('deduplicates by agent and turn across outcomes and reconnect observers',()=>{
  const seen=new Set();const first=fixture(seen);
  first.observer.hydrate([agent('a'),agent('b')]);
  first.event('a','turn_completed');first.event('a','turn_completed');first.event('a','turn_failed');
  first.event('b','turn_completed');
  assert.equal(first.notices.length,2);assert.notEqual(first.notices[0].id,first.notices[1].id);
  first.observer.stop();
  const second=fixture(seen);second.observer.hydrate([agent('a')]);second.event('a','turn_completed');
  assert.equal(second.notices.length,0);
  second.event('a','turn_completed','turn-2');assert.equal(second.notices.length,1);
  second.observer.stop();
});

test('status updates do not infer completion; removed/archived/stopped watches ignore late events',()=>{
  const f=fixture();f.observer.hydrate([agent('a')]);
  f.observer.update({kind:'upsert',agent:agent('a',{status:'idle',title:'Renamed'})});
  assert.equal(f.notices.length,0);
  f.event('a','turn_completed');assert.equal(f.notices[0].agentName,'Renamed');
  f.observer.update({kind:'upsert',agent:agent('a',{archivedAt:'today'})});
  f.event('a','turn_completed','turn-2');assert.equal(f.notices.length,1);
  f.observer.update({kind:'upsert',agent:agent('b')});
  f.observer.update({kind:'remove',agentId:'b'});f.event('b','turn_failed');
  f.observer.hydrate([agent('c')]);f.observer.stop();f.event('c','turn_completed');
  assert.equal(f.notices.length,1);assert.deepEqual(f.released,['a','b','c']);
});

test('subscription establishment and live errors request recovery without exposing details',async()=>{
  const f=fixture(new Set(),Promise.reject(Error('secret')));f.observer.hydrate([agent('a')]);
  await Promise.resolve();assert.equal(f.errors,1);
  f.event('a','error','unused',{error:'secret'});assert.equal(f.errors,2);
  assert.deepEqual(f.notices,[]);f.observer.stop();
});
