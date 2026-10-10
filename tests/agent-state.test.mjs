import test from 'node:test';
import assert from 'node:assert/strict';
import { AgentState, normalizeAgent } from '../build/server/agent-state.js';

const agent = (id, fields = {}) => ({
  id, cwd: '/work/paseo-buddy', title: 'Fix tests', provider: 'codex',
  status: 'running', pendingPermissions: [],
  activeTurn: { turnId: 'turn-1', startedAt: '2026-10-10T01:00:00Z' },
  ...fields,
});

test('counts executing turns, separates permission waits, excludes inactive/archived agents', () => {
  const state = new AgentState();
  state.replace([agent('1'), agent('2'), agent('3'), agent('idle', {status:'idle'}), agent('closed', {status:'closed'}), agent('archived', {archivedAt:'today'})]);
  assert.equal(state.snapshot().length, 3);
  state.update({kind:'upsert', agent:agent('2', {pendingPermissions:[{id:'permission'}]})});
  assert.equal(state.snapshot().filter(a => a.status === 'running').length, 2);
  assert.equal(state.snapshot().find(a => a.id === '2').status, 'waiting_permission');
  state.update({kind:'upsert', agent:agent('2')});
  state.update({kind:'upsert', agent:agent('1', {status:'idle', activeTurn:null})});
  assert.deepEqual(state.snapshot().map(a => a.id), ['2','3']);
  state.update({kind:'upsert', agent:agent('2', {status:'error'})});
  state.update({kind:'remove', agentId:'3'});
  assert.deepEqual(state.snapshot(), []);
});

test('authoritative snapshots replace stale agents and duplicate updates are idempotent', () => {
  const state = new AgentState();
  state.replace([agent('old')]);
  state.replace([agent('new')]);
  const update = {kind:'upsert',agent:agent('new')};
  state.update(update); state.update(update);
  assert.deepEqual(state.snapshot().map(a => a.id), ['new']);
  state.replace([]);
  assert.deepEqual(state.snapshot(), []);
});

test('metadata comes from SDK fields; unavailable turn time is not fabricated', () => {
  assert.deepEqual(normalizeAgent(agent('1', {activeTurn:null, title:null})), {
    id:'1', projectName:'paseo-buddy', workspaceName:'—', cwd:'/work/paseo-buddy', name:'codex', status:'running', turnId:null, startedAt:null,
  });
});


test('uses separate daemon project/workspace names and preserves metadata on status-only updates', () => {
  const state=new AgentState();
  const project={projectName:'My project',workspaceName:'Feature workspace'};
  state.replaceEntries([{agent:agent('1',{workspaceId:'workspace-1'}),project}]);
  assert.equal(state.snapshot()[0].projectName,'My project');
  assert.equal(state.snapshot()[0].workspaceName,'Feature workspace');
  assert.equal(state.snapshot()[0].name,'Fix tests');
  state.update({kind:'upsert',agent:agent('1',{workspaceId:'workspace-1',title:'Renamed agent'})});
  assert.equal(state.snapshot()[0].workspaceName,'Feature workspace');
  assert.equal(state.snapshot()[0].name,'Renamed agent');
  state.update({kind:'upsert',agent:agent('1',{workspaceId:'workspace-1'}),project:{...project,workspaceName:'Renamed workspace'}});
  assert.equal(state.snapshot()[0].workspaceName,'Renamed workspace');
  state.update({kind:'upsert',agent:agent('1',{workspaceId:'workspace-2'})});
  assert.equal(state.snapshot()[0].workspaceName,'—');
});

test('reconnect snapshot replaces old names; explicit null metadata clears the labels',()=>{
  const state=new AgentState();
  state.replaceEntries([{agent:agent('1'),project:{projectName:'Old',workspaceName:'Old workspace'}}]);
  state.replaceEntries([{agent:agent('1'),project:{projectName:'New',workspaceName:'New workspace'}}]);
  assert.equal(state.snapshot()[0].projectName,'New');
  assert.equal(state.snapshot()[0].workspaceName,'New workspace');
  state.update({kind:'upsert',agent:agent('1'),project:null});
  assert.equal(state.snapshot()[0].projectName,'paseo-buddy');
  assert.equal(state.snapshot()[0].workspaceName,'—');
});


test('completed unread agents hydrate from daemon attention state and clear on read', () => {
  const state=new AgentState();
  const completed=agent('done',{status:'idle',activeTurn:null,requiresAttention:true,attentionReason:'finished'});
  state.replace([completed]);
  assert.equal(state.snapshot()[0].status,'completed_unread');
  state.update({kind:'upsert',agent:completed});
  state.update({kind:'upsert',agent:completed});
  assert.equal(state.snapshot().length,1);
  state.update({kind:'upsert',agent:{...completed,requiresAttention:false,attentionReason:null}});
  assert.deepEqual(state.snapshot(),[]);
});

test('running to completed unread, reread, restart and archive use authoritative state',()=>{
  const state=new AgentState();
  state.replace([agent('1')]);
  const done=agent('1',{status:'idle',requiresAttention:true,attentionReason:'finished'});
  state.update({kind:'upsert',agent:done});
  assert.equal(state.snapshot()[0].status,'completed_unread');
  state.replace([done]);
  assert.equal(state.snapshot()[0].status,'completed_unread');
  state.update({kind:'upsert',agent:agent('1',{requiresAttention:true,attentionReason:'finished'})});
  assert.equal(state.snapshot()[0].status,'running');
  state.update({kind:'upsert',agent:{...done,archivedAt:'2026-10-10'}});
  assert.deepEqual(state.snapshot(),[]);
});

test('only finished attention counts as green; errors, cancellation/read, and permission waits do not',()=>{
  const state=new AgentState();
  state.replace([
    agent('failed',{status:'error',requiresAttention:true,attentionReason:'error'}),
    agent('permission',{pendingPermissions:[{}],requiresAttention:true,attentionReason:'permission'}),
    agent('read',{status:'idle',requiresAttention:false,attentionReason:'finished'}),
    agent('idle',{status:'idle'}),
    agent('stored',{status:'closed',requiresAttention:true,attentionReason:'finished'}),
  ]);
  assert.deepEqual(state.snapshot().map(a=>[a.id,a.status]),[['permission','waiting_permission'],['stored','completed_unread']]);
});
