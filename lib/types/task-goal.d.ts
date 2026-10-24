/**
 * QQ 长任务（宿主 goals）适配层。
 *
 * 长任务 = 宿主目标（dsh-goal 的 `ctx.goals`）+ 宿主自动轮次驱动器。本插件
 * **不复制驱动器**：只经宿主公开的 `goals` 服务写入（create/pause/resume/
 * complete，外加 get 读取），持久化全归宿主的会话日志，插件不碰 DSH 存储文件。
 *
 * 本模块承担四件事：
 * 1. 解析 `/task <目标> [-r N]` 的尾参数（只有**尾部**的 `-r N` 被识别，目标正文里
 *    的普通 `-r` 文本原样保留；非法轮数返回错误、**不触发** create）；
 * 2. 渲染各子命令与生命周期通知的文字（纯函数，测试可直接断言）；
 * 3. 把「本进程内由管理员 `/task` 明确授权」的目标绑定成窄类型 `TaskGoalBinding`
 *    ——绑定**不落盘**，只在内存里存在，进程重启后必须重新 `/task resume`；
 * 4. 从宿主**真实接纳**的 `user/message` 事件来源（`message.source`）分类本轮身份
 *    （见 `classifyAdmittedSource`），不靠 `<goal_round>` 之类的文本包装，也不靠
 *    「当前有活动目标」这种弱信号；`agent/pre-step` 只是提案，被拒绝的提案永远
 *    走不到接纳事件。
 * @module dsh-qq-companion/task-goal
 */
/** 宿主 GoalPhase（dsh-goal 0.2.x：'active' | 'paused' | 'blocked' | 'complete'）。 */
export type GoalPhaseLike = 'active' | 'paused' | 'blocked' | 'complete';
/** 宿主 GoalActivation：'armed' = 已授权自动接力；'disarmed' = 需人类重新 resume。 */
export type GoalActivationLike = 'armed' | 'disarmed';
/** 宿主 GoalBlockReason 的窄面。 */
export interface GoalBlockReasonLike {
    readonly code: string;
    readonly message: string;
}
/** 宿主 GoalRef 的窄面（CAS：revision 必须与当前一致）。 */
export interface GoalRefLike {
    readonly id: string;
    readonly revision: number;
}
/** 宿主 GoalView 的窄面 —— 只列本插件读取的字段。 */
export interface GoalViewLike extends GoalRefLike {
    readonly objective: string;
    readonly phase: GoalPhaseLike;
    readonly blockedReason?: GoalBlockReasonLike;
    readonly maxGoalRounds: number;
    readonly roundsStarted: number;
    readonly activation: GoalActivationLike;
}
/** 宿主 Agent 的窄面（`{ readonly id: SessionId }` 结构兼容）。 */
export interface GoalAgentLike {
    readonly id: string;
}
/**
 * 宿主 goals 服务的窄面：本插件只调用这五个方法，全部是公开服务方法
 * （不是 Inspect 接口，也不是内部字段）。宿主新增方法不影响这里。
 */
export interface GoalsPortLike {
    get(agent: GoalAgentLike): GoalViewLike | undefined;
    create(agent: GoalAgentLike, request: {
        objective: string;
        maxGoalRounds?: number;
    }): GoalViewLike;
    pause(agent: GoalAgentLike, ref: GoalRefLike): GoalViewLike;
    resume(agent: GoalAgentLike, ref: GoalRefLike): GoalViewLike;
    complete(agent: GoalAgentLike, ref: GoalRefLike): GoalViewLike;
    /** 公开的解除自动接力（dsh-goal 0.2.x `disarm`）：不改相位/revision，只把
     * activation 置为 disarmed，返回最新视图（无目标则 undefined）。暂停失败时
     * 用它兜底，确保后续自动轮不会继续跑。 */
    disarm?(agent: GoalAgentLike): GoalViewLike | undefined;
}
/** `-r N` 允许的最大轮数（预算只是为了不把宿主配额烧穿，与宿主上限对齐前先收窄）。 */
export declare const TASK_ROUNDS_MAX = 200;
/** 长任务只允许**管理员私聊**：群聊/他人私聊会继承主人的工具权限，暂不做。 */
export declare const TASK_PRIVATE_ONLY_NOTICE = "\u957F\u4EFB\u52A1\u53EA\u80FD\u5728\u7BA1\u7406\u5458\u79C1\u804A\u91CC\u7528\uFF1A\u7FA4\u804A\u548C\u522B\u4EBA\u7684\u79C1\u804A\u91CC\u7684\u4EFB\u52A1\u4F1A\u7EE7\u627F\u4F60\u7684\u5DE5\u5177\u6743\u9650\uFF0C\u6682\u4E0D\u652F\u6301\u3002";
/** goals 服务缺失的诚实报错（不冒充「创建成功会自动跑」）。 */
export declare const TASK_NO_SERVICE_NOTICE = "\u5F53\u524D\u90E8\u7F72\u6CA1\u6709 goals \u670D\u52A1\uFF08\u5BBF\u4E3B dsh-goal \u672A\u542F\u7528\uFF09\uFF0C\u957F\u4EFB\u52A1\u7528\u4E0D\u4E86\uFF1B\u8BF7\u5148\u5728\u90E8\u7F72\u91CC\u542F\u7528\u8BE5\u670D\u52A1\u3002";
/** 还没有会话时的提示（goals.create 需要 exact live agent）。 */
export declare const TASK_NEEDS_SESSION_NOTICE = "\u5F53\u524D\u804A\u5929\u8FD8\u6CA1\u6709\u4F1A\u8BDD\uFF0C\u5148\u53D1\u4E00\u6761\u6D88\u606F\u5EFA\u7ACB\u4F1A\u8BDD\uFF0C\u518D\u7528 /task\u3002";
/**
 * 创建成功后的部署前提说明。驱动器的存在**无法**在运行时可靠探测
 * （dsh-goal-round-driver 不 provide 任何服务），所以这里把前提说清楚，
 * 而不是假定「create 成功就会自动接力」。
 */
export declare const TASK_DRIVER_CAVEAT = "\u81EA\u52A8\u63A5\u529B\u4F9D\u8D56\u5BBF\u4E3B\u7684 goal-round-driver\uFF1B\u63D2\u4EF6\u65E0\u6CD5\u5728\u8FD0\u884C\u65F6\u63A2\u6D4B\u5B83\u662F\u5426\u542F\u7528\uFF0C\u82E5\u8BE5\u9A71\u52A8\u672A\u542F\u7528\uFF0C\u76EE\u6807\u53EA\u4F1A\u505C\u5728\u5DF2\u521B\u5EFA\u72B6\u6001\u3002";
/** `/task` 用法（错误路径统一复用，避免文案分叉）。 */
export declare const TASK_USAGE: string;
/** 解析 `/task <目标> [-r N]` 的结果。 */
export type TaskDirective = {
    ok: true;
    objective: string;
    maxGoalRounds?: number;
} | {
    ok: false;
    error: string;
};
/**
 * Parse a `/task` objective, honoring only a **tail** `-r N`.
 *
 * 规则（与任务单一致）：
 * - 只在字符串末尾识别 `-r N`（`-r` 与数字之间允许空白）；
 * - 目标正文里的 `-r`（不在尾部）原样保留，不截断；
 * - 尾部的 `-r` 后面不是正整数、或超过 {@link TASK_ROUNDS_MAX} → 解析失败
 *   （调用方据此**不创建**目标）；
 * - 去掉尾参数后目标为空 → 解析失败。
 */
export declare function parseTaskDirective(arg: string): TaskDirective;
/** 从真实消息来源里读出的目标自动轮次（宿主 driver 写入的 source）。 */
export interface GoalRoundSourceLike {
    kind: 'goal';
    goalId: string;
    revision: number;
    round: number;
}
/**
 * Read a goal-round source from a UserMessage.source — the host driver tags
 * goal rounds as `{ kind: 'goal', goalId, revision, round }` (round ≥ 1).
 * Anything else (QQ inbound, web input, tool text, missing/garbled fields)
 * returns undefined so callers fail closed as member.
 */
export declare function readGoalRoundSource(source: unknown): GoalRoundSourceLike | undefined;
/** 本插件（含改名前的 dsh-onebot）自己写入 QQ 入站消息的 producer-owned 来源。 */
export declare const QQ_PRODUCER_SOURCE_KINDS: readonly string[];
/**
 * 一条被宿主接纳的 `user/message` 的来源分类 —— 回合身份判定的唯一依据：
 * - `'qq'`：本插件自己派发的 QQ 入站消息（只按排队凭据对账）；
 * - `'goal'`：宿主 goal-round-driver 灌进来的自动目标轮（字段必须完整）；
 * - `'context'`：上下文/协议来源（不是输入，什么都不改）；
 * - `'foreign'`：其它一切（Web/宿主/他人输入、字段造假的 goal、未知来源）——
 *   调用方必须失败闭合为 member 并清掉旧引用。
 */
export type AdmittedSourceKind = 'qq' | 'goal' | 'context' | 'foreign';
export declare function classifyAdmittedSource(source: unknown): AdmittedSourceKind;
/** `agent/pre-step` 的载荷（只声明本插件读到的字段：agent / messages / turn）。 */
export interface PreStepPayloadLike {
    readonly agent: GoalAgentLike;
    readonly messages: ReadonlyArray<{
        readonly source?: unknown;
    }>;
    readonly turn: number;
}
/** `goal/changed` 的载荷（GoalChanged 的窄视图）。 */
export interface GoalChangedPayloadLike {
    readonly agent: GoalAgentLike;
    readonly change: {
        readonly operation: string;
        readonly ref: GoalRefLike;
        readonly goal?: GoalViewLike;
    };
}
/**
 * 进程内长任务授权绑定：**只在内存**，`ChatAgent` 上挂一份；进程重启即消失
 * （宿主 goal-round-driver 在挂载/卸载边界同样解除自动授权，重启后必须
 * 显式 `/task resume` —— 插件不做后台自动恢复）。
 */
export interface TaskGoalBinding {
    /** 宿主目标 id（exact 绑定，不按「当前有目标」放宽）。 */
    readonly goalId: string;
    /** 绑定时该聊天的会话 id：换会话后绑定失效。 */
    readonly sessionId: string;
    /** 明确授权这个目标自动续跑的 QQ 角色（只有管理员 /task 能授予；暂停、disarm、
     * clear、换目标都会把它降回 member —— 见 revokeGoalGrant）。 */
    grantedRole: 'admin' | 'member';
    objective: string;
    revision: number;
    phase: GoalPhaseLike;
    activation: GoalActivationLike;
    maxGoalRounds: number;
    roundsStarted: number;
    blockedReason?: GoalBlockReasonLike;
}
/**
 * 命令层操作长任务授权的窄端口（bi: bridge 实现，句柄只活在本进程内存里）。
 * 命令处理器不直接摸 ChatAgent，也不写任何存储。
 */
export interface TaskGoalPort {
    /** 该聊天当前的长任务授权绑定（无则 undefined）。 */
    binding(chatId: string): TaskGoalBinding | undefined;
    /** 建立授权绑定（只接受管理员已授权创建/恢复的目标）。 */
    bind(chatId: string, binding: TaskGoalBinding): void;
    /** 撤销绑定（不留任何持久化痕迹）。 */
    unbind(chatId: string): void;
    /** 标记「这个目标操作是本插件刚发出的」，供 goal/changed 通知去重。 */
    noteOperation(operation: string, goalId: string): void;
}
/** 当前自动目标轮的冻结身份：`user/message` 接纳时记账、turn/end 收尾，不读可变状态反推上一轮。 */
export interface TaskGoalTurn {
    readonly goalId: string;
    readonly revision: number;
    readonly round: number;
    /** 本轮是否按 taskEveryRounds 节奏回传最终文字。 */
    readonly reportDue: boolean;
    /** 该目标的轮数预算（回传前缀要写清第 N/M 轮）。 */
    readonly maxRounds: number;
    /** 本轮已处理过的 assistant 消息 id：流式/usage 重发会重复投递同一条
     * message，累加/回传都必须按 id 去重（否则同一段文字被重复回传）。 */
    readonly seen: string[];
}
/** Build a binding from a fresh host view (create/resume path). */
export declare function bindingFrom(view: GoalViewLike, sessionId: string, grantedRole: 'admin' | 'member'): TaskGoalBinding;
/** Copy a fresh host view onto an existing binding (mutates and returns it). */
export declare function applyGoalView(binding: TaskGoalBinding, view: GoalViewLike): TaskGoalBinding;
/**
 * 撤销进程内的自动接力授权（T16 D3）。
 *
 * 暂停 / 被宿主 disarm / clear / 目标被换掉之后，**旧的管理员授权不能复活**：
 * 即便宿主的相位又变回 active（外部 resume），自动目标轮也只按 member 跑；
 * 只有管理员再次 `/task resume`（重新 `bindingFrom(..., 'admin')`）才回得来。
 */
export declare function revokeGoalGrant(binding: TaskGoalBinding): TaskGoalBinding;
/**
 * 本轮回传节奏：`taskEveryRounds` 默认 1（逐轮回传）。N>1 时每 N 轮回传一次
 * **当轮最终文字**（不是汇总、不是总结——文案不许冒充），此外预算最后一轮
 * 与之后的生命周期/错误通知始终照发。
 */
export declare function reportDueFor(round: number, everyRounds: number, maxGoalRounds: number): boolean;
/** 预算/相位的中文短语（'第 3/12 轮 · 进行中'，预算来自宿主视图）。 */
export declare function describeBudget(view: {
    roundsStarted: number;
    maxGoalRounds: number;
    phase: GoalPhaseLike;
}): string;
/** 相位中文。 */
export declare function describePhase(phase: GoalPhaseLike): string;
/** create 成功的回执。 */
export declare function renderTaskCreated(view: GoalViewLike): string;
/** /task status 的回执。 */
export declare function renderTaskStatus(view: GoalViewLike | TaskGoalBinding): string;
/** /task stop（= pause，保留目标）的回执。 */
export declare function renderTaskPaused(view: GoalViewLike | TaskGoalBinding): string;
/**
 * 自动目标轮回传的轮次前缀（T16 D6）。
 *
 * 它必须是**独立的一行**、在出站协议解析**之后**才拼上（见 `sendToChat` 的
 * `header` 选项）：模型文字可能以 `[引用:id]`、`[不回]`、`【控制】{…}` 等输出
 * 协议开头，把前缀拼到它前面会让整条协议失效（引用丢了、不回变成照发）。
 */
export declare function renderGoalRoundHeader(round: number, maxRounds: number): string;
/** /task resume 的回执。 */
export declare function renderTaskResumed(view: GoalViewLike | TaskGoalBinding): string;
/** 已有未完成目标、不覆盖的提示（含 pause/resume 指引）。 */
export declare function renderTaskConflict(view: GoalViewLike): string;
/** 生命周期通知（goal/changed 的对外文案；create 由命令回执承担，不重复）。 */
export declare function renderGoalChangeNotice(operation: string, view: GoalViewLike | undefined): string | undefined;
