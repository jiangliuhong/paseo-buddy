import test from 'node:test';
import assert from 'node:assert/strict';
import { markAgentRead } from '../build/server/agent-attention.js';

const stamp='2026-10-15T10:00:00.000Z';
const completed=fields=>({id:'a',cwd:'/project',title:'Agent',provider:'codex',status:'idle',pendingPermissions:[],requiresAttention:true,attentionReason:'finished',attentionTimestamp:stamp,...fields});
function fixture(fields={},overrides={}) {
  const calls=[];let configuration;
  const client={
    async connect(){calls.push('connect');},async close(){calls.push('close');},
    getLastServerInfoMessage:()=>({serverId:'srv_test'}),
    async fetchAgent({agentId}){calls.push(['fetch',agentId]);return {agent:completed(fields)};},
    async clearAgentAttention(id){calls.push(['read',id]);},...overrides,
  };
  return {calls,client,get configuration(){return configuration;},options:{agentId:'a',attentionTimestamp:stamp,serverId:'srv_test',signal:new AbortController().signal,
    config:()=>({url:'ws://127.0.0.1/ws',authHeader:'Bearer local-only'}),createClient:config=>{configuration=config;return client;}}};
}

test('explicit read verifies current completion and uses the installed SDK attention operation',async()=>{
  const f=fixture();await markAgentRead(f.options);
  assert.deepEqual(f.calls,['connect',['fetch','a'],['read','a'],'close']);
  assert.equal(f.configuration.reconnect.enabled,false);assert.equal(f.configuration.clientType,'cli');
});

test('read refuses new completions, running/permission/read/archived agents and another daemon',async()=>{
  for(const fields of [{attentionTimestamp:'new-completion'},{status:'running'},{pendingPermissions:[{}]},
    {requiresAttention:false},{attentionReason:'error'},{archivedAt:'today'}]) {
    const f=fixture(fields);await assert.rejects(markAgentRead(f.options),/Completion changed/);
    assert.ok(!f.calls.some(call=>Array.isArray(call)&&call[0]==='read'));
    assert.equal(f.calls.at(-1),'close');
  }
  const f=fixture({}, {getLastServerInfoMessage:()=>({serverId:'srv_other'})});
  await assert.rejects(markAgentRead(f.options),/identity/);assert.ok(!f.calls.some(Array.isArray));
});

test('cancelled reads close their client and late fetch results cannot issue a write',async()=>{
  let resolveFetch;let entered;
  const fetching=new Promise(resolve=>entered=resolve);
  const f=fixture({}, {fetchAgent:()=>{entered();return new Promise(resolve=>resolveFetch=resolve);}});
  const controller=new AbortController();
  const task=markAgentRead({...f.options,signal:controller.signal});
  await fetching;controller.abort();await assert.rejects(task,/cancelled/);
  resolveFetch({agent:completed({})});await new Promise(resolve=>setImmediate(resolve));
  assert.ok(!f.calls.some(call=>Array.isArray(call)&&call[0]==='read'));
  assert.ok(f.calls.includes('close'));
});

test('read timeouts are bounded even when SDK connect never settles',async()=>{
  const f=fixture({}, {connect:()=>new Promise(()=>{})});
  await assert.rejects(markAgentRead({...f.options,timeoutMs:2}),/timed out/);
  assert.ok(f.calls.includes('close'));
});

test('already aborted requests never discover credentials or create a client',async()=>{
  const controller=new AbortController();controller.abort();let created=false;
  await assert.rejects(markAgentRead({agentId:'a',attentionTimestamp:null,signal:controller.signal,config:()=>{created=true;throw Error('never');}}));
  assert.equal(created,false);
});
