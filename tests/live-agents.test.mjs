import test from 'node:test';
import assert from 'node:assert/strict';
import { startLiveAgents } from '../build/server/live-agents.js';

function fakeClient(initialAgents = []) {
  let status = 'connected';
  let observer;
  const client = {
    async connect() {},
    async close() {status = 'disposed';},
    getConnectionState: () => ({status}),
    agents: {async list(options) {
      assert.deepEqual(options.subscribe, {});
      assert.equal(options.filter.statuses, undefined);
      return {subscription:{subscribe(next) {
        observer = next;
        next.snapshot({entries:initialAgents.map(agent => ({agent})), pageInfo:{hasMore:false}});
        return () => {};
      }}};
    }},
    disconnect() {status='disconnected';},
    update(agent) {observer.update({type:'agent_update',payload:{kind:'upsert',agent}});},
    fail() {observer.error(new Error('subscription failed'));},
    truncate() {observer.snapshot({entries:[],pageInfo:{hasMore:true}});},
  };
  return client;
}
const agent = (id) => ({id,cwd:'/work/project',title:id,provider:'codex',status:'running',pendingPermissions:[]});
async function until(predicate) {
  for(let i=0;i<100;i++) {
    if(predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  assert.fail('Condition did not become true');
}

test('hydrates, follows updates, clears disconnected state and re-reads config on reconnect', async () => {
  const clients = [fakeClient([agent('old')]), fakeClient([agent('new')])];
  const states = [];
  let reads = 0;
  const monitor = startLiveAgents({
    config:() => {reads++; return {url:'ws://127.0.0.1:6767/ws'};},
    createClient:() => clients[reads-1], publish:state => states.push(state),
    retryBaseMs:1, checkIntervalMs:1,
  });
  try {
    await until(() => states.at(-1)?.connection === 'connected');
    assert.equal(states.at(-1).agents[0].id,'old');
    clients[0].update({...agent('old'),status:'idle'});
    assert.deepEqual(states.at(-1).agents,[]);
    clients[0].disconnect();
    await until(() => reads===2 && states.at(-1)?.connection==='connected');
    assert.equal(states.at(-1).agents[0].id,'new');
    clients[0].update(agent('stale'));
    assert.deepEqual(states.at(-1).agents.map(a=>a.id),['new']);
    assert.ok(states.some(s => s.connection==='disconnected' && s.agents.length===0));
  } finally {await monitor.stop();}
  const count=states.length;
  clients[1].update(agent('late'));
  assert.equal(states.length,count);
});

test('subscription failure reconnects with a fresh snapshot', async () => {
  const clients=[fakeClient([agent('old')]),fakeClient([])];let index=0;const states=[];
  const monitor=startLiveAgents({config:()=>({url:'ws://127.0.0.1/ws'}),createClient:()=>clients[index++],publish:s=>states.push(s),retryBaseMs:1,checkIntervalMs:1});
  try {
    await until(()=>states.at(-1)?.connection==='connected');
    clients[0].fail();
    await until(()=>index===2 && states.at(-1)?.connection==='connected');
    assert.deepEqual(states.at(-1).agents,[]);
  } finally {await monitor.stop();}
});

test('failed discovery retries without exposing error contents or stale agents', async () => {
  const states=[];let reads=0;
  const monitor=startLiveAgents({config:()=>{reads++;throw new Error('secret token');},publish:s=>states.push(s),retryBaseMs:1});
  try {await until(()=>reads>=2);}finally{await monitor.stop();}
  assert.ok(states.every(s=>s.agents.length===0));
  assert.ok(!JSON.stringify(states).includes('secret'));
});


test('truncated snapshots clear the old count and cannot publish subsequent updates', async () => {
  const first=fakeClient([agent('old')]);const second=fakeClient([]);let index=0;const states=[];
  const monitor=startLiveAgents({config:()=>({url:'ws://127.0.0.1/ws'}),createClient:()=>index++===0?first:second,publish:s=>states.push(s),retryBaseMs:1,checkIntervalMs:1});
  try {
    await until(()=>states.at(-1)?.connection==='connected');
    first.truncate(); first.update(agent('partial'));
    await until(()=>index===2 && states.at(-1)?.connection==='connected');
    assert.deepEqual(states.at(-1).agents,[]);
    assert.ok(!states.some(s=>s.agents.some(a=>a.id==='partial')));
  } finally {await monitor.stop();}
});


test('completion unread and read updates are observed; reconnect replaces unread counts',async()=>{
  const done={...agent('done'),status:'idle',requiresAttention:true,attentionReason:'finished'};
  const clients=[fakeClient([done]),fakeClient([{...done,requiresAttention:false}])];
  let index=0;const states=[];
  const monitor=startLiveAgents({config:()=>({url:'ws://127.0.0.1/ws'}),createClient:()=>clients[index++],publish:s=>states.push(s),retryBaseMs:1,checkIntervalMs:1});
  try{
    await until(()=>states.at(-1)?.connection==='connected');
    assert.equal(states.at(-1).agents[0].status,'completed_unread');
    clients[0].update({...done,requiresAttention:false});
    assert.deepEqual(states.at(-1).agents,[]);
    clients[0].update(done);
    clients[0].update(done);
    assert.equal(states.at(-1).agents.length,1);
    clients[0].disconnect();
    await until(()=>index===2&&states.at(-1)?.connection==='connected');
    assert.deepEqual(states.at(-1).agents,[]);
  }finally{await monitor.stop();}
});
