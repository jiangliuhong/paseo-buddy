import test from 'node:test';
import assert from 'node:assert/strict';
import { observeHost, createHostObserver } from '../build/client/host-observer.js';

const agent = (id, fields = {}) => ({ id, cwd: '/private/project', title: id, provider: 'codex', status: 'running', pendingPermissions: [], ...fields });
const page = agents => ({ entries: agents.map(agent => ({ agent })), pageInfo: { hasMore: false } });
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
function fake(initial = [agent('same')], nextPage) {
  let observer; const timelines = new Map(); let detached = 0; let disposed = 0;
  const api = {
    async dispose() { disposed++; },
    agents: {
      async list(options) {
        if (!options.subscribe) return nextPage(options);
        return { subscription: { subscribe(value) { observer = value; value.snapshot(page(initial)); return () => detached++; } } };
      },
      ref(agent) { return { timeline: { subscribe(handler) { timelines.set(agent.id, handler); const release = () => {};
        release.ready = Promise.resolve(); return release; } } }; },
    },
  };
  return { api, get observer() { return observer; }, get detached() { return detached; }, get disposed() { return disposed; },
    update(value) { observer.update({ type: 'agent_update', payload: value }); },
    terminal(id, turnId, type = 'turn_completed') { timelines.get(id)?.({ agentId: id, event: { type, turnId } }); } };
}
function observe(fixture, overrides = {}) {
  const states = []; const notices = []; let failures = 0;
  const watch = observeHost({ host: { serverId: 'remote', label: 'Remote' }, api: fixture.api, seen: new Set(),
    publish: value => states.push(value), notify: value => notices.push(value), failed: () => failures++, ...overrides });
  return { watch, states, notices, get failures() { return failures; } };
}

test('remote snapshots hydrate silently, follow transitions/metadata, and never expose cwd or dispose borrowed APIs', async () => {
  const api = fake(); const result = observe(api);
  await flush(); assert.equal(result.states.at(-1).agents.length, 1); assert.equal(result.notices.length, 0);
  assert.equal(JSON.stringify(result.states).includes('/private'), false);
  api.update({ kind: 'upsert', agent: agent('same', { pendingPermissions: [{}] }), project: { projectName: 'P', workspaceName: 'W' } });
  assert.equal(result.states.at(-1).agents[0].status, 'waiting_permission');
  api.update({ kind: 'upsert', agent: agent('same', { status: 'idle', requiresAttention: true, attentionReason: 'finished', attentionTimestamp: 'now' }) });
  assert.equal(result.states.at(-1).agents[0].status, 'completed_unread');
  assert.equal(result.states.at(-1).agents[0].projectName, 'P');
  api.update({ kind: 'upsert', agent: agent('same', { status: 'idle' }) });
  assert.equal(result.states.at(-1).agents.length, 0);
  result.watch.stop(); assert.equal(api.detached, 1); assert.equal(api.disposed, 0);
  const count = result.states.length; api.update({ kind: 'upsert', agent: agent('late') }); assert.equal(result.states.length, count);
});

test('buffers updates/removals during pagination and supersedes older snapshots', async () => {
  let resolve; const api = fake([], () => new Promise(done => { resolve = done; })); const result = observe(api);
  await flush();
  api.observer.snapshot({ entries: [{ agent: agent('first') }], pageInfo: { hasMore: true, nextCursor: 'next' } });
  api.update({ kind: 'remove', agentId: 'first' }); api.update({ kind: 'upsert', agent: agent('last') });
  resolve(page([agent('second')])); await flush();
  assert.deepEqual(result.states.at(-1).agents.map(agent => agent.id), ['last', 'second']);
  api.observer.snapshot({ entries: [], pageInfo: { hasMore: true, nextCursor: 'next' } });
  api.observer.snapshot(page([agent('authoritative')])); await flush();
  resolve(page([agent('stale')])); await flush();
  assert.deepEqual(result.states.at(-1).agents.map(agent => agent.id), ['authoritative']); result.watch.stop();
});

test('only live terminal IDs notify and host identity scopes deduplication across reconnects', async () => {
  const seen = new Set(); const a = fake(); const first = observe(a, { seen }); await flush();
  a.terminal('same', undefined); a.terminal('same', 'turn', 'turn_canceled'); assert.equal(first.notices.length, 0);
  a.terminal('same', 'turn'); a.terminal('same', 'turn', 'turn_failed'); assert.equal(first.notices.length, 1);
  first.watch.stop();
  const b = fake(); const second = observe(b, { seen }); await flush(); b.terminal('same', 'turn'); assert.equal(second.notices.length, 0);
  const c = fake(); const third = observe(c, { seen, host: { serverId: 'other', label: 'Other' } }); await flush();
  c.terminal('same', 'turn'); assert.equal(third.notices.length, 1); second.watch.stop(); third.watch.stop();
});

test('invalid pagination and timeline failures stop subscriptions and request reconnect', async () => {
  const api = fake(); const result = observe(api); await flush();
  api.observer.snapshot({ entries: [], pageInfo: { hasMore: true } }); await flush();
  assert.equal(result.failures, 1); assert.equal(api.detached, 1); assert.equal(api.disposed, 0);
  const other = fake(); const next = observe(other); await flush(); other.terminal('same', undefined, 'error');
  assert.equal(next.failures, 1); assert.equal(other.detached, 1);
});

test('controller isolates offline hosts, reconnects with fresh borrowed API, retains deduplication and removes deleted hosts', async () => {
  let now = 0; const first = fake(); let current = first; const batches = [];
  const monitor = createHostObserver({ now: () => now, intervalMs: 100000,
    getClient: id => { if (id === 'offline') throw Error('secret'); return current.api; },
    publish: async (hosts, notices) => { batches.push(structuredClone({ hosts, notices })); return true; } });
  try {
    monitor.configure([{ serverId: 'remote', label: 'Remote', status: 'online' }, { serverId: 'offline', label: 'Offline', status: 'offline' }]);
    await flush(); await monitor.tick();
    assert.equal(batches.at(-1).hosts[0].agents.length, 1); assert.equal(batches.at(-1).hosts[1].agents.length, 0);
    first.terminal('same', 'turn'); await monitor.tick(); assert.equal(batches.at(-1).notices.length, 1);
    current = fake([agent('replacement')]); await monitor.tick(); await flush(); await monitor.tick();
    assert.equal(first.detached, 1); assert.equal(first.disposed, 0);
    assert.equal(batches.at(-1).hosts[0].agents[0].id, 'replacement');
    current.observer.error(Error('secret')); await monitor.tick(); assert.equal(batches.at(-1).hosts[0].connection, 'disconnected');
    now = 1001; current = fake([agent('fresh')]); await monitor.tick(); await flush(); await monitor.tick();
    assert.equal(batches.at(-1).hosts[0].agents[0].id, 'fresh');
    monitor.configure([]); await flush(); await monitor.tick(); assert.deepEqual(batches.at(-1).hosts, []);
  } finally { monitor.stop(); }
});

test('controller retries failed relays without parallel publishing or duplicate notice delivery', async () => {
  const api = fake(); let accept = false; const batches = [];
  const monitor = createHostObserver({ intervalMs: 100000, getClient: () => api.api,
    publish: async (hosts, notices) => { batches.push(structuredClone({ hosts, notices })); return accept; } });
  try {
    monitor.configure([{ serverId: 'remote', label: 'Remote', status: 'online' }]); await flush();
    api.terminal('same', 'turn'); await monitor.tick(); assert.equal(batches.at(-1).notices.length, 1);
    accept = true; await monitor.tick(); assert.equal(batches.at(-1).notices.length, 1);
    await monitor.tick(); assert.equal(batches.at(-1).notices.length, 0);
  } finally { monitor.stop(); }
});

test('too many configured hosts reports an unavailable aggregate instead of silently truncating it', async () => {
  const batches = []; let borrowed = 0;
  const monitor = createHostObserver({ intervalMs: 100000, getClient: () => { borrowed++; throw Error('unexpected'); },
    publish: async hosts => { batches.push(structuredClone(hosts)); return true; } });
  try {
    monitor.configure(Array.from({ length: 65 }, (_, index) => ({ serverId: String(index), label: String(index), status: 'online' })));
    await flush(); assert.equal(borrowed, 0);
    assert.equal(batches.at(-1).length, 1); assert.match(batches.at(-1)[0].label, /limit exceeded/);
    assert.equal(batches.at(-1)[0].connection, 'disconnected');
  } finally { monitor.stop(); }
});

test('synchronous borrowed API failure recovers after backoff and an aborted page cannot publish late data', async () => {
  let now = 0; let broken = true; const api = fake(); const batches = [];
  const brokenApi = { agents: { list() { throw Error('secret'); } } };
  const monitor = createHostObserver({ now: () => now, intervalMs: 100000, getClient: () => broken ? brokenApi : api.api,
    publish: async hosts => { batches.push(structuredClone(hosts)); return true; } });
  try {
    monitor.configure([{ serverId: 'remote', label: 'Remote', status: 'online' }]); await flush(); await monitor.tick();
    assert.equal(batches.at(-1)[0].connection, 'disconnected');
    broken = false; now = 1001; await monitor.tick(); await flush(); await monitor.tick();
    assert.equal(batches.at(-1)[0].connection, 'connected');
  } finally { monitor.stop(); }
  let complete; let signal;
  const slow = fake([], options => { signal = options.signal; return new Promise(resolve => { complete = resolve; }); });
  const result = observe(slow); await flush();
  slow.observer.snapshot({ entries: [], pageInfo: { hasMore: true, nextCursor: 'next' } });
  result.watch.stop(); const count = result.states.length;
  assert.equal(signal.aborted, true); complete(page([agent('late')])); await flush(); assert.equal(result.states.length, count);
});
