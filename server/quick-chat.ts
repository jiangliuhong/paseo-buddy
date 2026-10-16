import { createHash, randomBytes, randomUUID } from "node:crypto";
import { buildAgentDeepLink } from "@getpaseo/protocol/agent-deep-link";
import type { PaseoAgentConfig, PaseoAgentHandle, PaseoAgentTimelineSubscription, PaseoWorkspace } from "@getpaseo/client";
import { connectQuickChat, type QuickChatConnection } from "./quick-chat-connection.js";
import { quickChatCommandSchema, quickChatLimits, quickChatMessageSchema, quickChatOptionsSchema,
  type QuickChatCommand, type QuickChatError, type QuickChatMessage, type QuickChatOptions,
  type QuickChatResult, type QuickChatSelection, type QuickChatSession } from "../shared/quick-chat.js";

class ChatFailure extends Error {
  constructor(readonly code: QuickChatError, readonly draftEditable = false) { super(code); }
}
function fail(code: QuickChatError): never { throw new ChatFailure(code); }
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const label = (value: string) => value.replace(/[\x00-\x1f\x7f]/g, " ").slice(0, 160);
type Create = Extract<QuickChatCommand, { type: "quick_chat_create" }>;
type Connected = QuickChatConnection & { controller: AbortController; since: number };
type Session = {
  view: QuickChatSession;
  intent: Create;
  fingerprint: string;
  config?: PaseoAgentConfig;
  sourcePath?: string;
  workspaceAttempted: boolean;
  workspaceReady: boolean;
  workspace?: PaseoWorkspace;
  locked: boolean;
  retired: boolean;
  subscription?: PaseoAgentTimelineSubscription;
  watching?: Connected;
  refresh?: Promise<void>;
  dirty: boolean;
  timer?: ReturnType<typeof setTimeout>;
  deliveries: Map<string, { fingerprint: string; state: "accepted" | "unknown" }>;
};

/** Node-only, local, opt-in service. It never emits completion notifications or changes attention. */
export function createQuickChatService(options: {
  publish: (message: QuickChatMessage) => void;
  connect?: (signal: AbortSignal) => Promise<QuickChatConnection>;
  timeoutMs?: number;
  pollMs?: number;
  retryBaseMs?: number;
  syncDelayMs?: number;
}) {
  let stopped = false;
  let connection: Connected | undefined;
  let connecting: Promise<Connected> | undefined;
  let connectingController: AbortController | undefined;
  let serverId: string | undefined;
  let poll: ReturnType<typeof setInterval> | undefined;
  let nextRetry = 0;
  let failures = 0;
  let recovering = false;
  const sessions = new Map<string, Session>();
  const requests = new Map<string, { fingerprint: string; result: Promise<QuickChatResult>; pending: boolean }>();
  let pending = 0;
  const timeoutMs = options.timeoutMs ?? 15000;

  function emit(message: QuickChatMessage) {
    if (stopped) return;
    const parsed = quickChatMessageSchema.safeParse(message);
    if (!parsed.success || Buffer.byteLength(JSON.stringify(parsed.data)) > quickChatLimits.outputBytes) {
      options.publish({ kind: "resync_required" }); return;
    }
    options.publish(parsed.data);
  }
  function publish(session: Session) {
    session.view.connection = connection?.connected() ? "connected" : "disconnected";
    emit({ kind: "session", session: structuredClone(session.view) });
  }
  function unwatch(session: Session) {
    clearTimeout(session.timer); session.timer = undefined;
    const subscription = session.subscription;
    session.subscription = undefined; session.watching = undefined;
    if (subscription) void subscription.release().catch(() => {});
  }
  function invalidate(current: Connected) {
    if (connection !== current) return;
    connection = undefined;
    current.controller.abort();
    void current.close().catch(() => {});
    if (Date.now() - current.since >= 30000) failures = 0;
    nextRetry = Date.now() + Math.min((options.retryBaseMs ?? 1000) * 2 ** failures++, 30000);
    for (const session of sessions.values()) {
      unwatch(session);
      if (session.view.delivery === "sending") session.view.delivery = "unknown";
      session.view.error = "unavailable";
      publish(session); // Retain transcript as explicitly disconnected history.
    }
  }
  function guard(current: Connected) {
    if (stopped) fail("stopped");
    if (current !== connection || !current.connected() || current.controller.signal.aborted) fail("unavailable");
  }
  async function run<T>(current: Connected, action: () => Promise<T>): Promise<T> {
    guard(current);
    let timer: ReturnType<typeof setTimeout> | undefined;
    let abort: () => void = () => {};
    const cancelled = new Promise<never>((_, reject) => {
      abort = () => reject(new ChatFailure(stopped ? "stopped" : "unavailable"));
      current.controller.signal.addEventListener("abort", abort, { once: true });
      timer = setTimeout(() => { invalidate(current); abort(); }, timeoutMs);
    });
    try {
      const result = await Promise.race([action(), cancelled]);
      guard(current);
      return result;
    } finally {
      clearTimeout(timer);
      current.controller.signal.removeEventListener("abort", abort);
    }
  }
  async function getConnection(): Promise<Connected> {
    if (stopped) fail("stopped");
    if (connection?.connected()) return connection;
    if (connection) invalidate(connection);
    if (connecting) return connecting;
    if (Date.now() < nextRetry) fail("unavailable");
    const controller = new AbortController();
    connectingController = controller;
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    connecting = (async () => {
      let abort: () => void = () => {};
      const cancelled = new Promise<never>((_, reject) => {
        abort = () => reject(new ChatFailure(stopped ? "stopped" : "unavailable"));
        controller.signal.addEventListener("abort", abort, { once: true });
      });
      const opening = Promise.resolve().then(() => (options.connect ?? connectQuickChat)(controller.signal)).then(opened => {
        if (controller.signal.aborted || stopped) { void opened.close().catch(() => {}); fail("stopped"); }
        return opened;
      });
      try {
        const opened = await Promise.race([opening, cancelled]);
        if (!opened.serverId || (serverId && opened.serverId !== serverId)) {
          void opened.close().catch(() => {}); fail("unavailable");
        }
        serverId ??= opened.serverId;
        connection = { ...opened, connected: () => opened.connected(), close: () => opened.close(), controller, since: Date.now() };
        poll ??= setInterval(() => { void recover(); }, options.pollMs ?? 1000);
        return connection;
      } catch (error) {
        controller.abort();
        nextRetry = Date.now() + Math.min((options.retryBaseMs ?? 1000) * 2 ** failures++, 30000);
        throw error;
      } finally {
        clearTimeout(timer); controller.signal.removeEventListener("abort", abort);
        connecting = undefined; connectingController = undefined;
      }
    })();
    return connecting;
  }
  async function recover() {
    if (stopped || recovering) return;
    if (connection && !connection.connected()) invalidate(connection);
    if (!sessions.size || Date.now() < nextRetry) return;
    recovering = true;
    try {
      const current = await getConnection();
      for (const session of sessions.values()) {
        if (session.view.agentReady && !session.retired && !session.locked && session.watching !== current) {
          try {
            await watch(session, current); await refresh(session, current);
          } catch (error) {
            // A successful watch is not proof that missed history was recovered.
            // Retry transient read failures with connection backoff, even without new events.
            if (!(error instanceof ChatFailure && error.code === "not_found")) {
              invalidate(current); throw error;
            }
          }
        }
      }
    } catch { /* Recovery never creates resources or replays messages. */ }
    finally { recovering = false; }
  }
  async function listWorkspaces(current: Connected, projectId: string) {
    const all: PaseoWorkspace[] = [];
    const cursors = new Set<string>();
    let cursor: string | undefined;
    do {
      const page = await run(current, () => current.api.workspaces.list({ filter: { projectId }, page: { limit: 100, ...(cursor ? { cursor } : {}) } }));
      if (page.entries.some(workspace => workspace.projectId !== projectId)) fail("invalid_selection");
      all.push(...page.entries);
      if (all.length > quickChatLimits.directory) fail("limit_exceeded");
      if (!page.pageInfo.hasMore) return all;
      const next = page.pageInfo.nextCursor;
      if (!next || cursors.has(next) || cursors.size >= quickChatLimits.directory) fail("unavailable");
      cursors.add(next); cursor = next;
    } while (true);
  }
  async function context(current: Connected, projectId?: string) {
    const reads = await Promise.allSettled([
      run(current, () => current.api.projects.list()),
      current.hasProfiles ? run(current, () => current.api.config.get()).then(result => result.config.agentProfiles ?? []) : Promise.resolve([]),
      run(current, () => current.api.providers.listAvailable()),
    ]);
    const [projects, profiles, available] = reads.map(result => {
      if (result.status === "rejected") throw result.reason;
      return result.value;
    }) as [Awaited<ReturnType<typeof current.api.projects.list>>,
      NonNullable<Awaited<ReturnType<typeof current.api.config.get>>["config"]["agentProfiles"]>,
      Awaited<ReturnType<typeof current.api.providers.listAvailable>>];
    if (projects.projects.length > quickChatLimits.directory || profiles.length > 128 || available.providers.length > 64) fail("limit_exceeded");
    if (available.error) fail("unavailable");
    const project = projectId ? projects.projects.find(item => item.projectId === projectId) : undefined;
    if (projectId && !project) fail("invalid_selection");
    return { projects: projects.projects, profiles, available: available.providers.filter(item => item.available), project };
  }
  async function catalog(current: Connected, providerId: string, cwd: string) {
    const models = await run(current, () => current.api.providers.listModels(providerId, { cwd }));
    if (models.error) fail("unavailable");
    if ((models.models?.length ?? 0) > 256) fail("limit_exceeded");
    return models.models?.filter(model => model.isSelectable !== false) ?? [];
  }
  async function loadOptions(current: Connected, command: Extract<QuickChatCommand, { type: "quick_chat_options" }>): Promise<QuickChatOptions> {
    const data = await context(current, command.projectId);
    if (command.providerId && (!data.project || !data.available.some(item => item.provider === command.providerId))) fail("invalid_selection");
    const workspaces = data.project ? await listWorkspaces(current, data.project.projectId) : [];
    const models = command.providerId ? await catalog(current, command.providerId, data.project!.projectRootPath) : [];
    const result = quickChatOptionsSchema.safeParse({
      projects: data.projects.map(project => ({ id: project.projectId, name: label(project.projectCustomName || project.projectDisplayName) })),
      workspaces: workspaces.filter(workspace => workspace.workspaceDirectory).map(workspace => ({ id: workspace.id, projectId: workspace.projectId, name: label(workspace.title || workspace.name) })),
      profiles: data.profiles.map(profile => ({ id: profile.id, name: label(profile.name), providerId: profile.provider,
        ...(profile.model ? { modelId: profile.model } : {}), ...(profile.modeId ? { modeId: profile.modeId } : {}),
        ...(profile.thinkingOptionId ? { thinkingOptionId: profile.thinkingOptionId } : {}) })),
      providers: data.available.map(provider => ({ id: provider.provider, name: label(provider.provider) })),
      models: models.map(model => ({ id: model.id, name: label(model.label), isDefault: model.isDefault === true,
        thinkingOptions: model.thinkingOptions?.map(item => ({ id: item.id, name: label(item.label) })) ?? [],
        ...(model.defaultThinkingOptionId ? { defaultThinkingOptionId: model.defaultThinkingOptionId } : {}) })),
    });
    if (!result.success) fail("limit_exceeded");
    return result.data;
  }
  async function resolveConfig(current: Connected, selection: QuickChatSelection, data: Awaited<ReturnType<typeof context>>) {
    const profile = selection.kind === "profile" ? data.profiles.find(profile => profile.id === selection.profileId) : undefined;
    if (selection.kind === "profile" && !profile) fail("invalid_selection");
    const provider = profile?.provider ?? (selection.kind === "model" ? selection.providerId : "");
    if (!data.available.some(item => item.provider === provider)) fail("invalid_selection");
    const models = await catalog(current, provider, data.project!.projectRootPath);
    const modelId = profile?.model ?? (selection.kind === "model" ? selection.modelId : undefined);
    const model = modelId ? models.find(model => model.id === modelId) : models.find(model => model.isDefault);
    if (!model) fail("invalid_selection");
    const modes = await run(current, () => current.api.providers.listModes(provider, { cwd: data.project!.projectRootPath }));
    if (modes.error) fail("unavailable");
    if (profile?.modeId && !modes.modes?.some(mode => mode.id === profile.modeId)) fail("invalid_selection");
    if (profile?.thinkingOptionId && !model.thinkingOptions?.some(item => item.id === profile.thinkingOptionId)) fail("invalid_selection");
    const config: PaseoAgentConfig = { provider: `${provider}/${model.id}`,
      ...(profile?.modeId ? { modeId: profile.modeId } : {}),
      ...(profile?.thinkingOptionId ? { thinkingOptionId: profile.thinkingOptionId } : {}),
      ...(profile?.featureValues ? { featureValues: structuredClone(profile.featureValues) } : {}) };
    if (Buffer.byteLength(JSON.stringify(config)) > 16384) fail("limit_exceeded");
    return config;
  }
  function handleFor(session: Session, current: Connected): PaseoAgentHandle {
    return current.api.agents.ref(session.view.agentId);
  }
  async function watch(session: Session, current: Connected) {
    guard(current);
    if (session.watching === current && session.subscription) return;
    unwatch(session);
    session.watching = current;
    const subscription = handleFor(session, current).timeline.subscribe(message => {
      if (stopped || connection !== current || session.watching !== current || message.agentId !== session.view.agentId) return;
      if (message.event.type === "error") { invalidate(current); return; }
      // Canonical tail reads also cover projected replacements and missed reconnect events.
      session.dirty = true;
      session.timer ??= setTimeout(() => {
        session.timer = undefined;
        void refresh(session, current).catch(error => {
          if (connection === current && !(error instanceof ChatFailure && error.code === "not_found")) invalidate(current);
        });
      }, options.syncDelayMs ?? 80);
    });
    session.subscription = subscription;
    try { await run(current, () => subscription.ready); }
    catch (error) { unwatch(session); throw error; }
  }
  async function refresh(session: Session, current: Connected): Promise<void> {
    if (session.refresh) { session.dirty = true; return session.refresh; }
    session.refresh = (async () => {
      {
        session.dirty = false;
        const history = await run(current, () => handleFor(session, current).timeline.refetch({ direction: "tail", projection: "projected", limit: quickChatLimits.historyRows }));
        if (history.error) fail("unavailable");
        if (!history.agent || history.agent.archivedAt || history.agent.id !== session.view.agentId || history.agent.workspaceId !== session.view.workspaceId) fail("not_found");
        const agent = history.agent;
        session.view.status = agent.pendingPermissions.length ? "waiting_permission" : agent.status === "running" ? "running" : agent.status === "error" ? "failed" : "idle";
        session.view.epoch = history.epoch;
        const messages: QuickChatSession["messages"] = [];
        let bytes = 0;
        session.view.partial = history.hasOlder || history.hasNewer || history.gap || history.staleCursor;
        for (const entry of [...history.entries].reverse()) {
          const item = entry.item;
          if (item.type !== "user_message" && item.type !== "assistant_message") continue;
          if (messages.length >= quickChatLimits.messages) { session.view.partial = true; break; }
          const messageId = item.type === "user_message" ? item.clientMessageId ?? item.messageId : item.messageId;
          const message = { key: `${history.epoch}:${entry.seqStart}:${entry.seqEnd}`, role: item.type === "user_message" ? "user" as const : "assistant" as const,
            text: item.text.slice(0, 4096), ...(messageId ? { messageId: messageId.slice(0, 256) } : {}), truncated: item.text.length > 4096 };
          bytes += Buffer.byteLength(JSON.stringify(message));
          if (bytes > 96 * 1024) { session.view.partial = true; break; }
          messages.unshift(message);
          if (item.type === "user_message") {
            const receipt = session.deliveries.get(item.clientMessageId ?? item.messageId ?? "");
            if (receipt) receipt.state = "accepted";
          }
        }
        session.view.messages = messages;
        if ([...session.deliveries.values()].some(receipt => receipt.state === "unknown")) session.view.delivery = "unknown";
        else if (session.deliveries.size) session.view.delivery = "accepted";
        session.view.error = session.view.delivery === "unknown" ? "outcome_unknown" : null;
        publish(session);
      }
    })();
    try { await session.refresh; }
    catch (error) {
      if (error instanceof ChatFailure && error.code === "not_found") {
        session.retired = true; session.view.status = "failed"; session.view.error = "not_found";
        unwatch(session); publish(session);
      }
      throw error;
    } finally {
      session.refresh = undefined;
      if (session.dirty && !session.retired && !stopped && connection === current) session.timer ??= setTimeout(() => {
        session.timer = undefined;
        void refresh(session, current).catch(error => {
          if (connection === current && !(error instanceof ChatFailure && error.code === "not_found")) invalidate(current);
        });
      }, options.syncDelayMs ?? 80);
    }
  }
  async function send(session: Session, current: Connected, messageId: string, text: string) {
    const fingerprint = hash(text);
    const previous = session.deliveries.get(messageId);
    if (previous) {
      if (previous.fingerprint !== fingerprint) fail("request_conflict");
      await refresh(session, current);
      if (previous.state === "unknown") fail("outcome_unknown");
      return;
    }
    if ([...session.deliveries.values()].some(receipt => receipt.state === "unknown")) fail("outcome_unknown");
    if (session.deliveries.size >= 256) fail("limit_exceeded");
    await refresh(session, current);
    if (session.view.status === "running" || session.view.status === "waiting_permission") fail("busy");
    guard(current);
    const receipt = { fingerprint, state: "unknown" as const };
    session.deliveries.set(messageId, receipt);
    session.view.delivery = "sending"; session.view.error = null; publish(session);
    try {
      await run(current, () => handleFor(session, current).send(text, { messageId }));
      session.deliveries.set(messageId, { fingerprint, state: "accepted" });
      session.view.delivery = "accepted";
    } catch {
      session.view.delivery = "unknown"; session.view.error = "outcome_unknown"; publish(session);
      fail("outcome_unknown");
    }
    await refresh(session, current);
  }
  async function create(current: Connected, command: Create) {
    if (!current.canCreate) fail("unsupported");
    const { requestId: _requestId, ...intent } = command;
    const fingerprint = hash(intent);
    let session = sessions.get(command.draftId);
    if (session && session.fingerprint !== fingerprint) fail("request_conflict");
    if (!session) {
      if (sessions.size >= quickChatLimits.sessions) fail("limit_exceeded");
      session = { intent: structuredClone(command), fingerprint, locked: false, retired: false, dirty: false, workspaceReady: false, workspaceAttempted: false, deliveries: new Map(),
        view: { sessionId: command.draftId, projectId: command.projectId,
          workspaceId: command.workspaceId ?? `wks_${randomBytes(8).toString("hex")}`, agentId: randomUUID(), workspaceName: "",
          agentReady: false, connection: "connected", status: "creating", delivery: "none", epoch: null, messages: [], partial: false, error: null } };
      sessions.set(command.draftId, session);
    }
    if (session.retired) fail("not_found");
    if (session.locked) fail("busy");
    session.locked = true;
    try {
      if (!session.workspaceReady) {
        const data = await context(current, command.projectId);
        session.config ??= await resolveConfig(current, command.selection, data);
        session.sourcePath ??= data.project!.projectRootPath;
        if (command.workspaceId) {
          const workspaces = await listWorkspaces(current, command.projectId);
          const workspace = workspaces.find(workspace => workspace.id === command.workspaceId && !!workspace.workspaceDirectory && !workspace.archivingAt);
          if (!workspace) fail("invalid_selection");
          session.workspace = workspace;
        } else {
          guard(current);
          session.workspaceAttempted = true;
          const workspace = await run(current, () => current.api.workspaces.create({ workspaceId: session!.view.workspaceId,
            source: { kind: "directory", projectId: command.projectId, path: session!.sourcePath! },
            firstAgentContext: { prompt: command.text }, idempotencyKey: `buddy:${command.draftId}:workspace` })).catch(() => {
              invalidate(current); fail("outcome_unknown");
            });
          session.workspace = workspace.current() ?? undefined;
        }
        if (!session.workspace || session.workspace.id !== session.view.workspaceId || session.workspace.projectId !== command.projectId || !session.workspace.workspaceDirectory) fail("invalid_selection");
        session.workspaceReady = true;
        session.view.workspaceName = label(session.workspace.title || session.workspace.name);
      }
      if (!session.view.agentReady) {
        const workspace = await run(current, () => current.api.workspaces.ref(session!.view.workspaceId).refresh());
        if (!workspace || workspace.archivingAt || workspace.projectId !== command.projectId || !workspace.workspaceDirectory) fail("not_found");
        guard(current);
        const agent = await run(current, () => current.api.workspaces.ref(workspace).agents.create({ agentId: session!.view.agentId,
          config: session!.config!, idempotencyKey: `buddy:${command.draftId}:agent` })).catch(() => {
            invalidate(current); fail("outcome_unknown");
          });
        if (agent.id !== session.view.agentId) fail("not_found");
        session.view.agentReady = true; session.view.status = "syncing";
        session.view.conversationUrl = buildAgentDeepLink({ serverId: current.serverId, agentId: session.view.agentId });
      }
      await watch(session, current);
      await send(session, current, command.messageId, command.text);
      return structuredClone(session.view);
    } catch (error) {
      session.view.error = error instanceof ChatFailure ? error.code : "outcome_unknown";
      publish(session);
      if (!session.workspaceReady && !session.workspaceAttempted) {
        sessions.delete(command.draftId);
        // No workspace/Agent creation or send has been attempted. Native may safely
        // abandon this identity and edit the original text and launch selection.
        throw new ChatFailure(error instanceof ChatFailure ? error.code : "unavailable", true);
      }
      throw error;
    } finally { session.locked = false; }
  }
  async function execute(command: QuickChatCommand): Promise<QuickChatResult> {
    try {
      const current = await getConnection();
      if (command.type === "quick_chat_options") return { kind: "result", requestId: command.requestId, ok: true, error: null, options: await loadOptions(current, command) };
      if (command.type === "quick_chat_create") return { kind: "result", requestId: command.requestId, ok: true, error: null, session: await create(current, command) };
      const session = sessions.get(command.sessionId);
      if (!session?.view.agentReady || session.retired) fail("not_found");
      if (session.locked) fail("busy");
      session.locked = true;
      try {
        await watch(session, current);
        if (command.type === "quick_chat_send") await send(session, current, command.messageId, command.text);
        else {
          const workspaces = await listWorkspaces(current, session.view.projectId);
          const workspace = workspaces.find(workspace => workspace.id === session.view.workspaceId && !workspace.archivingAt);
          if (!workspace) fail("not_found");
          session.view.workspaceName = label(workspace.title || workspace.name);
          await refresh(session, current);
        }
        return { kind: "result", requestId: command.requestId, ok: true, error: null, session: structuredClone(session.view) };
      } finally { session.locked = false; }
    } catch (error) {
      const code = stopped ? "stopped" : error instanceof ChatFailure ? error.code : "unavailable";
      return { kind: "result", requestId: command.requestId, ok: false, error: code,
        ...(error instanceof ChatFailure && error.draftEditable ? { draftEditable: true } : {}) };
    }
  }
  return {
    async handle(input: QuickChatCommand): Promise<QuickChatResult> {
      const command = quickChatCommandSchema.parse(input);
      const fingerprint = hash(command);
      const previous = requests.get(command.requestId);
      if (previous) return previous.fingerprint === fingerprint ? previous.result : { kind: "result", requestId: command.requestId, ok: false, error: "request_conflict" };
      if (stopped || pending >= 8) return { kind: "result", requestId: command.requestId, ok: false, error: stopped ? "stopped" : "busy" };
      // Bound replay retention without evicting in-flight identities.
      if (requests.size >= 64) {
        const oldest = [...requests].find(([, entry]) => !entry.pending);
        if (oldest) requests.delete(oldest[0]);
      }
      pending++;
      const entry = { fingerprint, pending: true, result: execute(command).then(result => {
        const parsed = quickChatMessageSchema.safeParse(result);
        if (!parsed.success || parsed.data.kind !== "result" || Buffer.byteLength(JSON.stringify(parsed.data)) > quickChatLimits.outputBytes) {
          return { kind: "result", requestId: command.requestId, ok: false, error: "limit_exceeded" } as QuickChatResult;
        }
        return parsed.data;
      }) };
      requests.set(command.requestId, entry);
      try {
        return await entry.result;
      } finally {
        entry.pending = false; pending--;
        // Read responses and failures must be refreshable with the same request ID.
        if (command.type === "quick_chat_options" || command.type === "quick_chat_resume" || !(await entry.result).ok) requests.delete(command.requestId);
      }
    },
    async stop() {
      if (stopped) return;
      stopped = true; clearInterval(poll); connectingController?.abort();
      for (const session of sessions.values()) unwatch(session);
      const current = connection;
      connection = undefined; current?.controller.abort();
      // SDK operations race connection cancellation; late continuations fail their guards.
      await current?.close().catch(() => {});
      await Promise.allSettled([...requests.values()].map(entry => entry.result));
      sessions.clear(); requests.clear();
    },
  };
}
export type QuickChatService = ReturnType<typeof createQuickChatService>;
