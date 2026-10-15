import test from 'node:test';
import assert from 'node:assert/strict';
import { createHostRelay } from '../build/server/host-relay.js';
import { hostRelayRpc } from '../build/shared/host-relay.js';
import { agentKey } from '../build/shared/agents.js';

const agent = (id = 'same') => ({ id, projectName: 'Project', workspaceName: 'Workspace', name: 'Agent', status: 'running', turnId: null, startedAt: null });
const host = (serverId, connection = 'connected') => ({ serverId, label: serverId, connection, agents: [agent()] });
const input = (sequence, hosts = [host('local'), host('remote')], session = 'desktop') => ({ session, sequence, hosts, notices: [] });

test('merges online hosts with authoritative local state, namespaces collisions, isolates failures and removes expired remote state', async t => {
  let now = 0; let local; const states = [];
  const relay = createHostRelay({ now: () => now, leaseMs: 20, observe: options => {
    local = options; return { done: Promise.resolve(), async stop() {} };
  } });
  t.after(() => relay.stop());
  const watcher = relay.observe({ config: () => ({}), serverId: () => 'local', publish: state => states.push(state) });
  t.after(() => watcher.stop());
  local.publish({ connection: 'connected', serverId: 'local', agents: [{ ...agent(), cwd: '/private' }] });
  assert.equal(relay.handle(input(1)).accepted, true);
  assert.equal(states.at(-1).agents.length, 2);
  assert.notEqual(agentKey(states.at(-1).agents[0]), agentKey(states.at(-1).agents[1]));
  assert.equal(states.at(-1).agents[1].cwd, '');
  relay.handle(input(2, [host('remote', 'disconnected'), host('other')]));
  assert.deepEqual(states.at(-1).agents.map(agent => agent.serverId), ['local', 'other']);
  assert.equal(states.at(-1).hosts.find(host => host.serverId === 'remote').connection, 'disconnected');
  now = 21;
  await new Promise(resolve => setTimeout(resolve, 25));
  assert.deepEqual(states.at(-1).agents.map(agent => agent.serverId), ['local']);
});

test('serialized publisher lease rejects stale/replayed sessions and releases without leaving remote counts', t => {
  let now = 0; const relay = createHostRelay({ now: () => now }); t.after(() => relay.stop());
  assert.equal(relay.handle(input(2)).accepted, true);
  assert.equal(relay.handle(input(1)).accepted, false);
  assert.equal(relay.handle(input(3, [], 'phone')).accepted, false);
  assert.equal(relay.handle({ ...input(3), release: true }).accepted, true);
  assert.equal(relay.handle(input(4)).accepted, false);
  assert.equal(relay.handle(input(1, [], 'phone')).accepted, true);
  now = 16000;
  assert.equal(relay.handle(input(1, [], 'new-desktop')).accepted, true);
  relay.stop(); assert.equal(relay.handle(input(2, [], 'new-desktop')).accepted, false);
});

test('completion identities include host and deduplicate outcomes, retries and observer restarts', async t => {
  const notices = [];
  const relay = createHostRelay({ observe: () => ({ done: Promise.resolve(), async stop() {} }) });
  t.after(() => relay.stop());
  const watcher = relay.observe({ config: () => ({}), publish() {}, notify: value => notices.push(value) });
  t.after(() => watcher.stop());
  const notice = { serverId: 'a', agentId: 'same', turnId: 'turn', agentName: 'Agent', outcome: 'completed' };
  relay.handle({ ...input(1, [host('a'), host('b')]), notices: [notice, { ...notice, outcome: 'failed' }, { ...notice, serverId: 'b' }] });
  assert.equal(notices.length, 2); assert.notEqual(notices[0].id, notices[1].id);
  relay.handle({ ...input(2, [host('a')]), notices: [notice] });
  assert.equal(notices.length, 2);
  relay.handle({ ...input(3, [host('a', 'disconnected')]), notices: [{ ...notice, turnId: 'late' }] });
  assert.equal(notices.length, 2);
});

test('relay contract rejects duplicate hosts, oversized aggregate directories and arbitrary credentials', () => {
  assert.equal(hostRelayRpc.input.safeParse(input(1, [host('a'), host('a')])).success, false);
  assert.equal(hostRelayRpc.input.safeParse(input(1, [{ ...host('a'), agents: Array.from({ length: 2501 }, () => agent()) },
    { ...host('b'), agents: Array.from({ length: 2501 }, () => agent()) }])).success, false);
  const result = hostRelayRpc.input.parse({ ...input(1), token: 'secret', hosts: [{ ...host('a'), url: 'secret' }] });
  assert.equal(JSON.stringify(result).includes('secret'), false);
});
