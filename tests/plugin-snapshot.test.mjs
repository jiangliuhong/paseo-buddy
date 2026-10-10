import test from 'node:test';
import assert from 'node:assert/strict';
import contribute from '../build/index.server.js';

const settings = () => ({async read(){return {status:'ready',revision:'r1',values:{opacity:1,scale:1}};},subscribe(){return ()=>{};}});

test('plugin RPC queries the daemon-scoped SDK and follows snapshot pagination', async (t) => {
  let handler;
  const cleanup=contribute({registerSettings:settings,handle(contract, fn) {assert.equal(contract.name,'agents.snapshot');handler=fn;}}, {startCompanion:()=>({ready:Promise.resolve(),async stop(){}})});
  t.after(cleanup);
  const calls=[];
  const agent=(id)=>({id,cwd:'/work/project',title:id,provider:'codex',status:'running',pendingPermissions:[]});
  const result=await handler({}, {paseo:{agents:{async list(options) {
    calls.push(options);
    return calls.length===1
      ? {entries:[{agent:agent('a'),project:{projectName:'Project A',workspaceName:'Workspace A'}}],pageInfo:{hasMore:true,nextCursor:'next'}}
      : {entries:[{agent:agent('b')}],pageInfo:{hasMore:false,nextCursor:null}};
  }}}});
  assert.deepEqual(result.agents.map(a=>a.id),['a','b']);
  assert.equal(result.agents[0].projectName,'Project A');
  assert.equal(result.agents[0].workspaceName,'Workspace A');
  assert.equal(calls[1].page.cursor,'next');
  assert.equal(calls[0].subscribe,undefined);
  assert.equal(calls[0].filter.statuses,undefined);
});

test('plugin owns companion startup and stops it on disable/reload',async()=>{
  let starts=0;let stops=0;
  const cleanup=contribute({registerSettings:settings,handle(){}},{startCompanion:()=>{starts++;return {ready:Promise.resolve(),async stop(){stops++;}};}});
  assert.equal(starts,1);await cleanup();assert.equal(stops,1);
});
