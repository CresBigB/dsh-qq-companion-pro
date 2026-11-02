import type { ChatId } from './chat.js';
import type { SwitchableSession } from './session-ledger.js';
export * from './registry-types.js';
export type { SwitchableSession } from './session-ledger.js';
import { ChatAgent, ChatSettings, RegistryDeps, SessionSwitchOutcome, WorkspaceAttachOutcome } from './registry-types.js';
/**
 * The chat↔session registry: dual index, persistence pair, per-chat settings
 * and the shared create/resume assembly. Created by the ChatBridge
 * constructor; the bridge delegates its same-name registry methods here.
 */
export declare class ChatRegistry {
    private readonly deps;
    /** Live chats by chat id. */
    readonly chats: Map<string, ChatAgent>;
    /** Reverse index: session id → chat id (routes session events to chats). */
    readonly bySession: Map<string, string>;
    /** Per-chat settings (workspace/preset/goal), lazy-created. */
    private readonly chatSettings;
    /** Retired / broken session ids and the /session switch-back lists. */
    private readonly ledger;
    private mappingSaveTimer;
    /** Resolves once the on-disk chat mapping has been loaded (wired by the bridge's start()). */
    mappingLoaded: Promise<void>;
    constructor(deps: RegistryDeps);
    /** Every retired session id (the ledger's live set). */
    get retiredSessionIds(): Set<string>;
    /** Session ids some chat still uses: live chats, evicted-but-resumable
     * chats, and anything routed to a chat (never deleted by cleanup). */
    sessionIdsInUse(): Set<string>;
    /** A session's logs were deleted (old-session cleanup). */
    forgetSession(sessionId: string): void;
    /** 设置页概览用：live 会话 + 空闲已释放的聊天（只读浅拷贝，按 chatId 去重，
     *  live 优先；不触发任何 IO）。 */
    chatSnapshot(): Array<{
        chatId: string;
        sessionId: string;
        live: boolean;
    }>;
    /** Session ids whose logs are unusable (the ledger's live set). */
    get brokenSessions(): Set<string>;
    /** The (lazy-created) settings entry for one chat. */
    getSettings(chatId: ChatId): ChatSettings;
    /** default-model wiring shared by the create and resume assembly paths
     * — agent options for the registry call plus the mutable per-agent
     * selection ref (undefined when the deployment has no default model).
     * Group chats take groupReasoningEffort when it is set. */
    private modelWiring;
    /** the AgentSetup closure shared by the create and resume assembly
     * paths. The only difference between the callers is the preset: a resumed
     * session rejoins the preset it recorded itself; a fresh create reuses the
     * config/default resolution already recorded in its header meta. */
    private buildSetup;
    /** the ChatAgent literal shared by the create and resume assembly
     * paths — every field starts at its neutral initial value. `nickname` is
     * the one deliberate divergence between the callers (create seeds it from
     * the inbound message, resume starts with ''). */
    private createChatAgent;
    /** in-flight creates keyed by chat id — concurrent first messages for
     * one chat join a single create instead of racing (otherwise two dispatches
     * could both pass the empty-map check and agents.create ran twice with the
     * same derived session id; the second chats.set won and the first agent
     * leaked). */
    private readonly pendingCreates;
    /** chats evicted for idleness, kept resumable (chat id → last session
     * id plus the persisted-settings snapshot, since chatSettings is cleared
     * on eviction). NOT retired: saveMapping keeps writing them, so the mapping
     * file never drops an evicted chat and a later message resumes its session. */
    private readonly evictedChats;
    /** Get (or create) the agent for a chat. */
    ensureChat(chatId: ChatId, nickname: string): Promise<ChatAgent>;
    private createChat;
    /** apply a persisted-settings snapshot (mode/goal/workspace override)
     * onto a chat's settings entry — used for mapping entries read from disk
     * and for the snapshots of evicted / reset chats. */
    private restoreSettings;
    /** The persisted-settings snapshot of a chat under one session id: the
     * live settings win, `known` (an earlier snapshot) fills the gaps. */
    private settingsSnapshot;
    /** Wait for a fresh agent to settle; when that fails, dispose it (no
     * orphan agent) and rethrow the original error. */
    private settle;
    /** Take a chat out of the live indexes: typing stopped, interim recall
     * timers cleared. The agent itself is disposed by the caller. */
    private detachChat;
    /** Dispose a detached chat's agent; a failure only logs. */
    private disposeChat;
    /** Resume persisted chats from the mapping file (best-effort). */
    loadMapping(): Promise<void>;
    /** Resume one persisted chat from its recorded session id (shared by
     * loadMapping and the evicted-chat resume). */
    private resumeChat;
    private mappingPath;
    /** Make a just-set /workspace override durable even when the
     * chat is not live (before its first message, or after a failed resume).
     * saveMapping covers chats/evictedChats plus a settings-only
     * fallback, so the settings survive either way — the snapshot still pins
     * the chat's real mapping session id over the derived bare id. Snapshots
     * the chat into evictedChats under its mapping session id — or the derived bare id
     * when the chat never went live (the resume then fails harmlessly and a
     * fresh session is created with the settings intact). No-op for a live
     * chat: the normal save path covers it. */
    noteWorkspaceOverride(chatId: ChatId): void;
    /** Lazily created serialized writers (deps are assigned in the constructor). */
    private writers;
    private writer;
    /**
     * Persist the chat↔session mapping. Saves are fire-and-forget from several
     * paths; they queue on one writer, each renders the mapping when it runs
     * (the last write is always the latest state), and the file is replaced
     * atomically (see persist.ts).
     */
    saveMapping(): Promise<void>;
    private buildMapping;
    saveMappingDebounced(): void;
    /** dispose chats whose last activity is older than chatIdleEvictDays
     * (0 disables; default 7). Called before each inbound message: the session
     * is flushed, the agent disposed, and the chat removed from
     * chats/bySession/settings — NOT retired, the mapping keeps the pair so a
     * later message (or a restart) resumes the same session. */
    sweepIdleChats(): Promise<void>;
    private evictChat;
    /** Whether the persistence layer already owns a durable log for this id —
     * true means reusing the id would collide (stale on-disk log or live entry).
     * A read failure counts as no log so the caller falls back to the normal
     * path rather than blocking an id on a transient error. */
    private hasPersistedLog;
    loadRetired(): Promise<void>;
    private presetsPath;
    /** Set (or clear with '') a chat's /preset override and persist it, so the
     * choice survives restarts (it used to live in memory only). */
    setPresetOverride(chatId: ChatId, presetId: string): void;
    /** Restore persisted /preset overrides (missing / corrupt file = none). */
    loadPresetOverrides(): Promise<void>;
    loadSwitchable(): Promise<void>;
    /** The chat's switchable retired sessions (a copy; newest first). */
    switchableSessions(chatId: ChatId): SwitchableSession[];
    /**
     * /session <序号>: switch a chat back to one of its switchable (soft-retired)
     * sessions. Validation is per-chat (chat A's history is invisible to chat
     * B) and refuses broken ids. With a live chat the current session is
     * soft-retired into the list first (the retire half of resetChat — the
     * settings carrier included — so a failed resume still rebuilds cleanly);
     * with no live chat the switch is carried through evictedChats like
     * noteWorkspaceOverride. On success the target is un-retired and leaves the
     * list (it is the current session); on resume failure the target is
     * hard-retired, dropped from the list, and the chat falls back to a fresh
     * session on its next message — it never gets stuck.
     */
    switchSession(chatId: ChatId, targetSessionId: string): Promise<SessionSwitchOutcome>;
    /** carry the chat's persisted settings across a reset, a session
     * switch or a collision heal — snapshot them into evictedChats under the
     * (about-to-be-retired) session id, so the trailing saveMapping keeps the
     * entry instead of dropping the chat's workspace/goal on a restart.
     * Only persisted fields trigger the snapshot (a plain /new or heal drops
     * the entry); the recorded session id is retired by the caller, so the
     * carrier is never resumed. */
    private snapshotRetainedSettings;
    /**
     * Recover from a session-log collision: the live session cannot append to
     * the mismatched on-disk log, so dispose the agent and rebuild the chat on
     * a fresh session id. The user is asked to resend.
     */
    healSessionCollision(chatId: ChatId): Promise<void>;
    /**
     * Effective workspace directory for a chat's sessions: the per-chat
     * /workspace override when set, else the configured workspacePath, falling
     * back to the host process cwd.
     */
    effectiveCwd(chatId?: ChatId): string;
    /**
     * The per-chat directory under the global workspace (T28): groups under
     * `companion/groups`, private chats under `companion/private`. Exported for
     * the settings-page hint and for tests, so the layout has one definition.
     */
    companionSubdir(chatId: ChatId): string;
    /** The global default directory: the configured workspacePath, else the host
     * process cwd. Everything a chat does NOT specialize (no /workspace
     * override, no admin private dir, no group memory dir) lands here — and it
     * is the one directory the default attach mode may auto-create. */
    private globalWorkspacePath;
    /**
     * The preset id a NEW session records and joins: the configured id when set,
     * else the deployment default — the same resolution the Web surface applies,
     * so cross-channel sessions carry the same header fact. A roster that cannot
     * resolve the effective id leaves the header bare and the session uncomposed,
     * exactly like a failed mount.
     */
    resolvePresetId(chatId: ChatId): Promise<string | undefined>;
    /**
     * The preset id a persisted session recorded for itself (newest logged
     * selection wins, else the creation header), or undefined when it recorded
     * none or the record cannot be read — a legacy session resumes under the
     * config/default, preserving its original behavior.
     */
    private recordedPresetFor;
    /**
     * Join the QQ agent to the configured agent preset (the deployment default
     * when unset) so its tools/prompt sections/skill catalog resolve against the
     * preset composition instead of the empty global layer. `preferred` — the
     * preset the session itself recorded — overrides the config (its history was
     * produced under that composition; replaying it differently would break the
     * recorded tool calls); a conflicting config only logs. Best-effort: a
     * broken preset falls back to the previous behavior rather than failing the
     * chat.
     */
    private joinPreset;
    /**
     * Give a just-created / just-resumed session a human title from the
     * configured template ("QQ私聊 10001 · 10-23"). The host only
     * auto-titles `user`-sourced messages and this plugin's messages are
     * plugin-sourced, so without this a QQ session shows its raw session id in
     * the Web session list. Entirely best-effort: an absent sessionTitle service,
     * a blank template or any failure inside titleSession leaves the session
     * exactly as it would have been (see session-title.ts).
     */
    private applySessionTitle;
    /**
     * Attach a chat session to the workspace owning its header cwd, so QQ
     * sessions group under a workspace in the GUI instead of "Ungrouped".
     * Best-effort: failure only logs, the chat itself is never affected.
     *
     * `chatId` says which directory the chat is supposed to use today
     * (effectiveCwd(chatId)); `attachWorkspaceMode` decides whether a missing
     * workspace may be created for it:
     * - existing (default): a directory a workspace already owns is attached; a
     *   missing one is created only for the global workspacePath — the pre-mode
     *   behavior, so group / private-memory dirs never spawn workspaces.
     * - auto: when the header cwd IS what this chat should use
     *   (headerCwd === effectiveCwd(chatId)) a missing workspace is created and
     *   titled after the chat ("QQ群 <群号>" / "QQ私聊 <QQ号>").
     * - off: the workspace registry is never touched.
     * A session whose cwd is NOT what the chat should use today (a legacy /
     * foreign session directory) is only attached to an existing workspace —
     * never given a new one, in any mode.
     */
    private attachToWorkspace;
    /**
     * The already-registered workspace whose directory contains `dir` (deepest
     * match wins), or undefined. T28 relies on this: every chat gets its own
     * subdirectory of the configured workspace, so "the workspace that owns this
     * session" is an ancestor lookup rather than an exact path match. Path
     * comparison is case-insensitive because Windows paths are.
     */
    private findEnclosingWorkspace;
    /**
     * /workspace attach: re-run the workspace attach for a chat's live session
     * right now. The plugin otherwise only attaches at create/resume, so a
     * workspace added later in the DSH UI would wait for the next restart —
     * this is the manual escape hatch. `allowCreate` (default true) lets the
     * manual command create the chat's OWN directory even in the default
     * 'existing' mode; mode 'off' still wins.
     */
    attachChatToWorkspace(chatId: ChatId, options?: {
        allowCreate?: boolean;
    }): Promise<WorkspaceAttachOutcome>;
    /** The one attach implementation behind create/resume and /workspace
     * attach; returns a structured outcome the command layer phrases. */
    private attachSessionToWorkspace;
    /**
     * /new: dispose the current chat agent and retire its session id, so the
     * next inbound message creates a brand-new session (fresh history; the old
     * conversation stays on disk). The chat's settings (workspace/preset/
     * goal) all survive — they key the NEXT session of this chat.
     */
    resetChat(chatId: ChatId): Promise<void>;
    /** Every chat with a session: live ones and idle-evicted ones. */
    knownChatIds(): ChatId[];
    /**
     * Retire a chat's session for good (e.g. a group that left the allowlist):
     * a live chat is reset like /new; an idle-evicted one has its recorded
     * session retired so it is never resumed. Either way the next message
     * starts a fresh session (with the current preset). History stays on disk.
     * @returns whether there was a session to retire.
     */
    retireChat(chatId: ChatId): Promise<boolean>;
    /** Read the chat→session mapping file (for /id and /status when no live chat). */
    sessionIdFromMapping(chatId: ChatId): Promise<string | undefined>;
    /** Clear every pending interim auto-recall timer for a chat (dispose path). */
    private clearInterimTimers;
    /** Stop everything registry-owned: cancel the debounce timer, save the
     * mapping, dispose every agent, clear both indexes. */
    stop(): Promise<void>;
}
