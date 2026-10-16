import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { createPaseoApi } from '@getpaseo/client';
import { DaemonClient } from '@getpaseo/client/internal/daemon-client';
import { AgentCreateRequestSchema, WorkspaceCreateRequestSchema } from '@getpaseo/protocol/messages';
import { readPaseoConfig } from '../build/server/paseo-connection.js';

// Read-only API audit. Never create agents/workspaces, send prompts, patch config,
// mark attention read, refresh provider configuration, or print payload contents.
const noop = () => {};
const logger = { debug: noop, info: noop, warn: noop, error: noop };
const deadline = setTimeout(() => {
  console.error('Read-only quick-chat API audit timed out.');
  process.exit(2);
}, 45000);
let driver;
let api;
let failed = false;
function report(check, summary) {
  console.log(JSON.stringify({ check, ...summary }));
}
async function read(check, action, summarize) {
  try {
    const result = await action();
    report(check, { ok: true, ...summarize(result) });
    return result;
  } catch {
    failed = true;
    report(check, { ok: false }); // SDK errors can contain endpoints or user data.
    return null;
  }
}
async function checkCreationContracts() {
  // Injected driver: these mutations never reach a socket or the user's daemon.
  const captured = [];
  const workspace = { id: 'wks_0123456789abcdef', projectId: 'audit-project', workspaceDirectory: '/audit/project' };
  const agentId = '12345678-1234-4234-8234-123456789abc';
  const fake = {
    createWorkspace: async input => {
      const parsed = WorkspaceCreateRequestSchema.parse({ ...input, type: 'workspace.create.request', requestId: 'offline-audit' });
      captured.push(parsed);
      return { workspace, error: null };
    },
    createAgent: async input => {
      const parsed = AgentCreateRequestSchema.parse({ ...input, type: 'agent.create.request', requestId: 'offline-audit' });
      captured.push(parsed);
      return { id: agentId, workspaceId: workspace.id };
    },
    sendAgentMessage: async (id, text, options) => captured.push({ id, text, options }),
  };
  const isolated = createPaseoApi(fake);
  try {
    for (const source of [{ kind: 'directory', path: '/audit/project', projectId: 'audit-project' },
      { kind: 'worktree', projectId: 'audit-project' }]) {
      await isolated.workspaces.create({ source, firstAgentContext: { prompt: 'Audit prompt' }, idempotencyKey: `audit-${source.kind}` });
      const request = captured.at(-1);
      assert.equal(request.firstAgentContext.prompt, 'Audit prompt');
      assert.equal(request.title, undefined);
      assert.equal(request.source.branchName, undefined);
      assert.equal(request.source.worktreeSlug, undefined);
    }
    const agent = await isolated.workspaces.ref(workspace).agents.create({
      config: { provider: 'codex/gpt-6.1-sol', modeId: 'auto-review', thinkingOptionId: 'medium', featureValues: { audit: true } },
      idempotencyKey: 'audit-existing-workspace',
    });
    const request = captured.at(-1);
    assert.equal(request.workspaceId, workspace.id);
    assert.equal(request.config.cwd, workspace.workspaceDirectory);
    assert.equal(request.config.provider, 'codex');
    assert.equal(request.config.model, 'gpt-6.1-sol');
    assert.equal(request.config.modeId, 'auto-review');
    assert.equal(request.config.thinkingOptionId, 'medium');
    assert.deepEqual(request.config.featureValues, { audit: true });
    assert.equal(request.initialPrompt, undefined);
    await agent.send('Audit prompt', { messageId: 'audit-message' });
    assert.equal(captured.at(-1).options.messageId, 'audit-message');
    report('creation_contracts_offline', { ok: true, directory: true, worktree: true,
      omittedNames: true, workspaceBinding: true, profileFields: true, messageIdentity: true });
  } finally { await isolated.dispose(); }
}
try {
  try { await checkCreationContracts(); }
  catch (error) {
    // This isolated stage sees only the synthetic constants above.
    console.error('Offline creation contract check failed:', error.message);
    process.exitCode = 1;
    clearTimeout(deadline);
    process.exit(1);
  }
  if (process.argv.includes('--contracts-only')) {
    clearTimeout(deadline);
    process.exit(0);
  }
  driver = new DaemonClient({ ...readPaseoConfig(), clientId: `buddy-api-audit-${randomUUID()}`,
    clientType: 'cli', logger, connectTimeoutMs: 5000, reconnect: { enabled: false } });
  api = createPaseoApi(driver);
  await driver.connect();
  const info = driver.getLastServerInfoMessage();
  const flags = ['agentProfiles', 'agentConfigApply', 'creationLifecycle', 'workspaceRequestReceipts', 'agentRequestReceipts'];
  report('connection', { ok: true,
    features: Object.fromEntries(flags.map(flag => [flag, info?.features?.[flag] === true])) });
  const results = await Promise.allSettled([
    read('profiles', () => api.config.get(), ({ config }) => {
      const profiles = config.agentProfiles ?? [];
      return { count: profiles.length, validIdentities: profiles.every(p => !!p.id && !!p.name && !!p.provider),
        withModel: profiles.filter(p => !!p.model).length,
        withMode: profiles.filter(p => !!p.modeId).length,
        withThinking: profiles.filter(p => !!p.thinkingOptionId).length,
        withFeatureValues: profiles.filter(p => !!p.featureValues).length };
    }),
    read('projects', () => api.projects.list(), result => ({ count: result.projects.length,
      kinds: [...new Set(result.projects.map(p => p.projectKind))] })),
    read('providers', () => api.providers.snapshot(), result => ({ count: result.entries.length,
      enabled: result.entries.filter(entry => entry.enabled !== false).length,
      payloadFields: Object.keys(result) })),
    read('agents', () => api.agents.list({ filter: { includeArchived: false }, page: { limit: 1 } }),
      result => ({ sampleCount: result.entries.length })),
  ]);
  for (const result of results) if (result.status === 'rejected') failed = true;
  const value = index => results[index].status === 'fulfilled' ? results[index].value : null;
  const config = value(0)?.config;
  const projects = value(1)?.projects ?? [];
  const project = projects.find(p => p.projectRootPath === process.cwd()) ?? projects[0];
  if (project) await read('workspaces', () => api.workspaces.list({ filter: { projectId: project.projectId },
    page: { limit: 200 } }), result => ({ sampleCount: result.entries.length,
    projectFilterCorrect: result.entries.every(w => w.projectId === project.projectId),
    hasMore: result.pageInfo.hasMore,
    withDirectory: result.entries.filter(w => !!w.workspaceDirectory).length }));
  else report('workspaces', { skipped: 'no_projects' });
  const availability = await read('available_providers', () => api.providers.listAvailable(), result => {
    if (result.error) failed = true;
    return { count: result.providers.length, available: result.providers.filter(p => p.available).length,
      providerError: !!result.error };
  });
  const provider = availability?.providers.find(p => p.available && p.provider === config?.agentProfiles?.[0]?.provider)?.provider
    ?? availability?.providers.find(p => p.available)?.provider;
  if (provider) {
    const catalog = await Promise.allSettled([
      read('models', () => api.providers.listModels(provider, { cwd: project?.projectRootPath }), result => {
        if (result.error) failed = true;
        return { count: result.models?.length ?? 0, providerError: !!result.error,
          withThinkingOptions: result.models?.filter(m => m.thinkingOptions?.length).length ?? 0 };
      }),
      read('modes', () => api.providers.listModes(provider, { cwd: project?.projectRootPath }), result => {
        if (result.error) failed = true;
        return { count: result.modes?.length ?? 0, providerError: !!result.error };
      }),
    ]);
    for (const result of catalog) if (result.status === 'rejected') failed = true;
    const models = catalog[0].status === 'fulfilled' ? catalog[0].value?.models : null;
    const model = models?.find(m => m.isSelectable !== false);
    if (model) await read('provider_features', () => api.providers.listFeatures({ provider: `${provider}/${model.id}`,
      cwd: project?.projectRootPath ?? process.cwd() }), result => {
      if (result.error) failed = true;
      return { count: result.features?.length ?? 0, providerError: !!result.error };
    });
  } else report('catalog', { skipped: 'no_available_providers' });
  const agent = value(3)?.entries[0]?.agent;
  if (agent) {
    const handle = api.agents.ref(agent);
    await read('timeline_history', () => handle.timeline.refetch({ limit: 3 }), result => {
      if (result.error) failed = true;
      return { sampleCount: result.entries.length, providerError: !!result.error,
        hasEpoch: typeof result.epoch === 'string', payloadFields: Object.keys(result) };
    });
    await read('timeline_live', async () => {
      const subscription = handle.timeline.subscribe(noop);
      try { await subscription.ready; } finally { await subscription.release(); }
    }, () => ({}));
  } else report('timeline', { skipped: 'no_agents' });
  process.exitCode = failed ? 1 : 0;
} catch {
  console.error('Read-only quick-chat API audit failed; check daemon availability and loopback access.');
  process.exitCode = 1;
} finally {
  try { await api?.dispose(); } finally {
    try { await driver?.close(); } finally { clearTimeout(deadline); }
  }
}
