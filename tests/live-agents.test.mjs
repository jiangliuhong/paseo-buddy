import test from 'node:test';
import assert from 'node:assert/strict';
import { startLiveAgents } from '../build/server/live-agents.js';

function fakeClient(initialAgents = [], listPage) {
  let status = 'connected';
  let observer;
  const timelines=new Map();
  const releases=[];
  const client = {
    async connect() {},
    async close() {status = 'disposed';},
    getConnectionState: () => ({status}),
    agents: {ref(agent) {return {timeline:{subscribe(handler){
      timelines.set(agent.id,handler);
      const unsubscribe=()=>releases.push(agent.id);unsubscribe.ready=Promise.resolve();return unsubscribe;
    }}};},async list(options) {
      if (!options.subscribe) return listPage(options);
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
    snapshot(snapshot) {observer.snapshot(snapshot);},
    remove(agentId) {observer.update({type:'agent_update',payload:{kind:'remove',agentId}});},
    terminal(agentId,turnId,type='turn_completed') {timelines.get(agentId)?.({agentId,event:{type,turnId,provider:'codex'}});},
    releases,
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


test('snapshots missing a required page cursor clear the old count and reconnect', async () => {
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

test('repeated subscription failures retain exponential backoff', async t => {
  t.mock.timers.enable({apis:['setTimeout','Date']});
  const clients=[];
  const monitor=startLiveAgents({config:()=>({url:'ws://127.0.0.1/ws'}),createClient:()=>{
    const client=fakeClient([]);clients.push(client);return client;
  },publish:()=>{},retryBaseMs:100,checkIntervalMs:1});
  const flush=async()=>{for(let i=0;i<20;i++)await Promise.resolve();};
  try {
    await flush();
    clients[0].fail();t.mock.timers.tick(1);await flush();
    t.mock.timers.tick(100);await flush();
    assert.equal(clients.length,2);
    clients[1].fail();t.mock.timers.tick(1);await flush();
    t.mock.timers.tick(100);await flush();
    assert.equal(clients.length,2);
    t.mock.timers.tick(100);await flush();
    assert.equal(clients.length,3);
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

test('paginates before publishing, then replays live changes over stale page data', async () => {
  let resolvePage;
  let pageOptions;
  const client = fakeClient([], options => {
    pageOptions = options;
    return new Promise(resolve => {resolvePage=resolve;});
  });
  const states=[];
  const monitor=startLiveAgents({config:()=>({url:'ws://127.0.0.1/ws'}),createClient:()=>client,publish:s=>states.push(s),checkIntervalMs:1});
  try {
    await until(()=>states.at(-1)?.connection==='connected');
    client.snapshot({entries:[{agent:agent('a')}],pageInfo:{hasMore:true,nextCursor:'page-2'}});
    await until(()=>resolvePage);
    assert.equal(states.at(-1).connection,'connecting');
    assert.deepEqual(states.at(-1).agents,[]);
    client.update({...agent('b'),pendingPermissions:[{}]});
    client.remove('a');
    client.update(agent('new'));
    resolvePage({entries:[{agent:agent('b'),project:{projectName:'Second page',workspaceName:'Work'}}],pageInfo:{hasMore:false}});
    await until(()=>states.at(-1)?.connection==='connected');
    assert.deepEqual(states.at(-1).agents.map(a=>[a.id,a.status]),[['b','waiting_permission'],['new','running']]);
    assert.equal(states.at(-1).agents[0].projectName,'Second page');
    assert.equal(pageOptions.page.cursor,'page-2');
    assert.equal(pageOptions.subscribe,undefined);
    assert.deepEqual(pageOptions.sort,[{key:'created_at',direction:'asc'}]);
  } finally {await monitor.stop();}
});

test('a newer subscription snapshot supersedes an in-flight page request', async () => {
  let resolvePage;
  const client=fakeClient([],()=>new Promise(resolve=>{resolvePage=resolve;}));
  const states=[];
  const monitor=startLiveAgents({config:()=>({url:'ws://127.0.0.1/ws'}),createClient:()=>client,publish:s=>states.push(s),checkIntervalMs:1});
  try {
    await until(()=>states.at(-1)?.connection==='connected');
    client.snapshot({entries:[{agent:agent('old')}],pageInfo:{hasMore:true,nextCursor:'later'}});
    await until(()=>resolvePage);
    client.update(agent('old-buffered'));
    client.snapshot({entries:[{agent:agent('fresh')}],pageInfo:{hasMore:false}});
    await until(()=>states.at(-1)?.agents[0]?.id==='fresh');
    resolvePage({entries:[{agent:agent('late')}],pageInfo:{hasMore:false}});
    await new Promise(resolve=>setImmediate(resolve));
    assert.deepEqual(states.at(-1).agents.map(a=>a.id),['fresh']);
    assert.equal(states.at(-1).connection,'connected');
  } finally {await monitor.stop();}
});

test('stop aborts pending pagination and never publishes a late result', async () => {
  let pageSignal;
  const client=fakeClient([],options=>new Promise((resolve,reject)=>{
    pageSignal=options.signal;
    pageSignal.addEventListener('abort',()=>reject(Error('aborted')),{once:true});
  }));
  const states=[];
  const monitor=startLiveAgents({config:()=>({url:'ws://127.0.0.1/ws'}),createClient:()=>client,publish:s=>states.push(s),checkIntervalMs:1});
  await until(()=>states.at(-1)?.connection==='connected');
  client.snapshot({entries:[],pageInfo:{hasMore:true,nextCursor:'later'}});
  await until(()=>pageSignal);
  const count=states.length;
  await monitor.stop();
  assert.equal(pageSignal.aborted,true);
  assert.equal(states.length,count);
});

test('a failed later page clears the state and reconnects from a fresh snapshot', async () => {
  const first=fakeClient([],async()=>{throw Error('secret transport details');});
  const second=fakeClient([agent('fresh')]);
  let index=0;const states=[];
  const monitor=startLiveAgents({config:()=>({url:'ws://127.0.0.1/ws'}),createClient:()=>index++===0?first:second,publish:s=>states.push(s),retryBaseMs:1,checkIntervalMs:1});
  try {
    await until(()=>states.at(-1)?.connection==='connected');
    first.snapshot({entries:[{agent:agent('partial')}],pageInfo:{hasMore:true,nextCursor:'later'}});
    await until(()=>states.at(-1)?.agents[0]?.id==='fresh');
    assert.ok(!states.some(s=>s.agents.some(a=>a.id==='partial')));
    assert.ok(!JSON.stringify(states).includes('secret'));
  } finally {await monitor.stop();}
});

test('live notifications remain silent on snapshots and deduplicate across reconnects', async () => {
  const clients=[fakeClient([agent('a')]),fakeClient([agent('a')])];
  const states=[];const notices=[];let index=0;
  const monitor=startLiveAgents({config:()=>({url:'ws://127.0.0.1/ws'}),createClient:()=>clients[index++],
    publish:s=>states.push(s),notify:n=>notices.push(n),retryBaseMs:1,checkIntervalMs:1});
  try {
    await until(()=>states.at(-1)?.connection==='connected');assert.equal(notices.length,0);
    clients[0].terminal('a','turn-1');clients[0].terminal('a','turn-1');assert.equal(notices.length,1);
    clients[0].disconnect();
    clients[0].terminal('a','stale');assert.equal(notices.length,1);
    await until(()=>index===2 && states.at(-1)?.connection==='connected');
    assert.deepEqual(clients[0].releases,['a']);assert.equal(notices.length,1);
    clients[1].terminal('a','turn-1');assert.equal(notices.length,1);
    clients[1].terminal('a','turn-2','turn_failed');assert.equal(notices.length,2);
  } finally {await monitor.stop();}
  clients[1].terminal('a','late');assert.equal(notices.length,2);
  assert.deepEqual(clients[1].releases,['a']);
});

test('directory growth beyond the bounded snapshot size clears state and reconnects', async () => {
  const first=fakeClient(Array.from({length:5000},(_,i)=>({...agent(`idle-${i}`),status:'idle'})));
  const second=fakeClient([]);let index=0;const states=[];
  const monitor=startLiveAgents({config:()=>({url:'ws://127.0.0.1/ws'}),createClient:()=>index++===0?first:second,
    publish:s=>states.push(s),retryBaseMs:1,checkIntervalMs:1});
  try {
    await until(()=>states.at(-1)?.connection==='connected');
    first.update(agent('over-limit'));
    assert.equal(states.at(-1).connection,'disconnected');
    await until(()=>index===2 && states.at(-1)?.connection==='connected');
    assert.ok(!states.some(s=>s.agents.some(a=>a.id==='over-limit')));
  } finally {await monitor.stop();}
});
