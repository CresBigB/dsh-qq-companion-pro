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
/** `-r N` 允许的最大轮数（预算只是为了不把宿主配额烧穿，与宿主上限对齐前先收窄）。 */
export const TASK_ROUNDS_MAX = 200;
/** 长任务只允许**管理员私聊**：群聊/他人私聊会继承主人的工具权限，暂不做。 */
export const TASK_PRIVATE_ONLY_NOTICE = '长任务只能在管理员私聊里用：群聊和别人的私聊里的任务会继承你的工具权限，暂不支持。';
/** goals 服务缺失的诚实报错（不冒充「创建成功会自动跑」）。 */
export const TASK_NO_SERVICE_NOTICE = '当前部署没有 goals 服务（宿主 dsh-goal 未启用），长任务用不了；请先在部署里启用该服务。';
/** 还没有会话时的提示（goals.create 需要 exact live agent）。 */
export const TASK_NEEDS_SESSION_NOTICE = '当前聊天还没有会话，先发一条消息建立会话，再用 /task。';
/**
 * 创建成功后的部署前提说明。驱动器的存在**无法**在运行时可靠探测
 * （dsh-goal-round-driver 不 provide 任何服务），所以这里把前提说清楚，
 * 而不是假定「create 成功就会自动接力」。
 */
export const TASK_DRIVER_CAVEAT = '自动接力依赖宿主的 goal-round-driver；插件无法在运行时探测它是否启用，若该驱动未启用，目标只会停在已创建状态。';
/** `/task` 用法（错误路径统一复用，避免文案分叉）。 */
export const TASK_USAGE = '用法：/task <目标> [-r N] 创建长任务（N = 轮数预算，1～' + TASK_ROUNDS_MAX + '；不传 -r 就用宿主的默认预算，具体轮数以创建回执为准） · /task status 查看 · /task stop 暂停 · /task resume 继续；无参数或带定时任务 id = 旧定时任务列表/立刻执行。';
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
export function parseTaskDirective(arg) {
    const trimmed = arg.trim();
    const tail = /(?:^|\s)-r(?:\s+(\S+))?\s*$/u.exec(trimmed);
    if (tail === null) {
        if (trimmed === '')
            return { ok: false, error: TASK_USAGE };
        return { ok: true, objective: trimmed };
    }
    // 尾部出现 `-r  <单 token>` 但 token 是中文（或含中文标点）：`-r` 只出现
    // 在正文中间、句子还在继续，按普通目标处理（D7「中间 -r 文本保持」）。
    // 例：`把 -r 参数写进报告，再核对一遍` / `写报告 -r 参数`。
    if (tail[1] !== undefined && /[^\x00-\x7f]/u.test(tail[1])) {
        return { ok: true, objective: trimmed };
    }
    const objective = trimmed.slice(0, tail.index).trim();
    const raw = tail[1];
    if (raw === undefined) {
        return { ok: false, error: '「-r」后面要跟轮数（正整数，最多 ' + TASK_ROUNDS_MAX + '）：/task <目标> [-r N]' };
    }
    // 尾部 `-r` 后面的**单个 token 就是轮数参数**（T16 D7）：写法坏掉（abc / NaN /
    // 5x / 2.5 / -2）一律报错、绝不当成正文放过去——否则非法轮数也会 create。
    // 只有不在尾部的 `-r` 文本才属于目标正文。
    if (!/^\d+$/u.test(raw)) {
        return { ok: false, error: '轮数必须是正整数（最多 ' + TASK_ROUNDS_MAX + '）：/task <目标> [-r N]' };
    }
    const rounds = Number(raw);
    if (!Number.isSafeInteger(rounds) || rounds < 1 || rounds > TASK_ROUNDS_MAX) {
        return { ok: false, error: '轮数范围是 1～' + TASK_ROUNDS_MAX + '：/task <目标> [-r N]' };
    }
    if (objective === '')
        return { ok: false, error: '「-r ' + raw + '」前面缺少目标。' + TASK_USAGE };
    return { ok: true, objective, maxGoalRounds: rounds };
}
/**
 * Read a goal-round source from a UserMessage.source — the host driver tags
 * goal rounds as `{ kind: 'goal', goalId, revision, round }` (round ≥ 1).
 * Anything else (QQ inbound, web input, tool text, missing/garbled fields)
 * returns undefined so callers fail closed as member.
 */
export function readGoalRoundSource(source) {
    if (typeof source !== 'object' || source === null)
        return undefined;
    const value = source;
    if (value.kind !== 'goal')
        return undefined;
    if (typeof value.goalId !== 'string' || value.goalId === '')
        return undefined;
    if (typeof value.revision !== 'number' || !Number.isSafeInteger(value.revision))
        return undefined;
    if (typeof value.round !== 'number' || !Number.isSafeInteger(value.round) || value.round < 1)
        return undefined;
    return { kind: 'goal', goalId: value.goalId, revision: value.revision, round: value.round };
}
/** 本插件（含改名前的 dsh-onebot）自己写入 QQ 入站消息的 producer-owned 来源。 */
export const QQ_PRODUCER_SOURCE_KINDS = ['plugin:qq-companion', 'plugin:dsh-onebot'];
/**
 * 宿主的**上下文/协议**来源：它们是这一回合的背景（运行时快照、系统提示、
 * 工具结果、计划模式、定时通知……），不是「谁在说话」。
 *
 * 接纳这类来源既不能抬身份，也**不能**撤销已经由真实输入定下的身份 ——
 * 宿主会在回合末尾追加 runtime-context 快照，若把它当成输入，就会把管理员
 * 私聊里刚刚抬起来的 admin / 引用目标/自动目标轮一并重置（T16 第二轮审查缺陷 1）。
 *
 * 白名单按宿主 `MessageSourceMap`（dsh-llm）逐项列出；未列出的来源一律按
 * 「外部真实输入」失败闭合，绝不默认放行。
 */
const CONTEXT_ONLY_SOURCE_KINDS = new Set([
    'runtime-context', 'system-prompt', 'model-selection', 'model', 'tool',
    'working-directory', 'user-approval', 'ptc-mode', 'tool-registry',
    'compact-checkpoint', 'cordis-host-runner', 'skill-invocation',
    'session-reference', 'subagent-settled', 'plan-mode', 'schedule',
]);
export function classifyAdmittedSource(source) {
    if (typeof source !== 'object' || source === null)
        return 'foreign';
    const kind = source.kind;
    if (typeof kind !== 'string' || kind === '')
        return 'foreign';
    if (QQ_PRODUCER_SOURCE_KINDS.includes(kind))
        return 'qq';
    // 声称 goal 但字段不完整/被伪造：不放行，按外部输入失败闭合。
    if (kind === 'goal')
        return readGoalRoundSource(source) === undefined ? 'foreign' : 'goal';
    if (CONTEXT_ONLY_SOURCE_KINDS.has(kind))
        return 'context';
    return 'foreign';
}
/** Build a binding from a fresh host view (create/resume path). */
export function bindingFrom(view, sessionId, grantedRole) {
    return {
        goalId: view.id,
        sessionId,
        grantedRole,
        objective: view.objective,
        revision: view.revision,
        phase: view.phase,
        activation: view.activation,
        maxGoalRounds: view.maxGoalRounds,
        roundsStarted: view.roundsStarted,
        ...(view.blockedReason !== undefined ? { blockedReason: view.blockedReason } : {}),
    };
}
/** Copy a fresh host view onto an existing binding (mutates and returns it). */
export function applyGoalView(binding, view) {
    binding.objective = view.objective;
    binding.revision = view.revision;
    binding.phase = view.phase;
    binding.activation = view.activation;
    binding.maxGoalRounds = view.maxGoalRounds;
    binding.roundsStarted = view.roundsStarted;
    if (view.blockedReason === undefined)
        delete binding.blockedReason;
    else
        binding.blockedReason = view.blockedReason;
    return binding;
}
/**
 * 撤销进程内的自动接力授权（T16 D3）。
 *
 * 暂停 / 被宿主 disarm / clear / 目标被换掉之后，**旧的管理员授权不能复活**：
 * 即便宿主的相位又变回 active（外部 resume），自动目标轮也只按 member 跑；
 * 只有管理员再次 `/task resume`（重新 `bindingFrom(..., 'admin')`）才回得来。
 */
export function revokeGoalGrant(binding) {
    binding.grantedRole = 'member';
    return binding;
}
/**
 * 本轮回传节奏：`taskEveryRounds` 默认 1（逐轮回传）。N>1 时每 N 轮回传一次
 * **当轮最终文字**（不是汇总、不是总结——文案不许冒充），此外预算最后一轮
 * 与之后的生命周期/错误通知始终照发。
 */
export function reportDueFor(round, everyRounds, maxGoalRounds) {
    const every = Number.isFinite(everyRounds) ? Math.floor(everyRounds) : 1;
    // 0（或负数）= 只在预算最后一轮回传；1 = 逐轮；N>1 = 每 N 轮 + 最后一轮。
    if (every < 1)
        return round >= maxGoalRounds;
    if (every === 1)
        return true;
    if (round >= maxGoalRounds)
        return true;
    return round % every === 0;
}
/** 预算/相位的中文短语（'第 3/12 轮 · 进行中'，预算来自宿主视图）。 */
export function describeBudget(view) {
    return '第 ' + view.roundsStarted + '/' + view.maxGoalRounds + ' 轮 · ' + describePhase(view.phase);
}
/** 相位中文。 */
export function describePhase(phase) {
    if (phase === 'active')
        return '进行中';
    if (phase === 'paused')
        return '已暂停';
    if (phase === 'blocked')
        return '已阻塞';
    return '已完成';
}
/** create 成功的回执。 */
export function renderTaskCreated(view) {
    return '🎯 长任务已创建：' + view.objective + '\n'
        + describeBudget(view) + '\n'
        + TASK_DRIVER_CAVEAT + '\n'
        + '随时 /task status 查看、/task stop 暂停、/task resume 继续。';
}
/** /task status 的回执。 */
export function renderTaskStatus(view) {
    const lines = [
        '🎯 长任务：' + view.objective,
        describeBudget(view),
        '自动接力：' + (view.activation === 'armed' ? '已授权' : '未授权（/task resume 重新授权）'),
    ];
    if (view.blockedReason !== undefined)
        lines.push('阻塞原因：' + view.blockedReason.message);
    lines.push('revision ' + view.revision);
    return lines.join('\n');
}
/** /task stop（= pause，保留目标）的回执。 */
export function renderTaskPaused(view) {
    return '⏸ 长任务已暂停（' + describeBudget(view) + '），目标保留；/task resume 继续。';
}
/**
 * 自动目标轮回传的轮次前缀（T16 D6）。
 *
 * 它必须是**独立的一行**、在出站协议解析**之后**才拼上（见 `sendToChat` 的
 * `header` 选项）：模型文字可能以 `[引用:id]`、`[不回]`、`【控制】{…}` 等输出
 * 协议开头，把前缀拼到它前面会让整条协议失效（引用丢了、不回变成照发）。
 */
export function renderGoalRoundHeader(round, maxRounds) {
    return '🎯 长任务 · 第 ' + round + '/' + maxRounds + ' 轮';
}
/** /task resume 的回执。 */
export function renderTaskResumed(view) {
    return '▶ 长任务已恢复（' + describeBudget(view) + '）。';
}
/** 已有未完成目标、不覆盖的提示（含 pause/resume 指引）。 */
export function renderTaskConflict(view) {
    return '已经有长任务了：' + view.objective + '\n'
        + describeBudget(view) + '\n'
        + '不会覆盖它：要暂停用 /task stop，要接着跑用 /task resume；换目标请先在宿主里完成或清除当前目标。';
}
/** 生命周期通知（goal/changed 的对外文案；create 由命令回执承担，不重复）。 */
export function renderGoalChangeNotice(operation, view) {
    if (operation === 'create')
        return undefined;
    if (operation === 'clear')
        return '🗑 长任务已清除（进程内授权一并撤销）。';
    if (view === undefined)
        return undefined;
    if (operation === 'pause')
        return '⏸ 长任务已暂停（' + describeBudget(view) + '）。需要继续就 /task resume。';
    if (operation === 'resume')
        return '▶ 长任务已恢复（' + describeBudget(view) + '）。';
    if (operation === 'complete')
        return '✅ 长任务已完成（共 ' + view.roundsStarted + ' 轮）。';
    if (operation === 'block') {
        const why = view.blockedReason?.message ?? '宿主未给出原因';
        return '⛔ 长任务被阻塞：' + why + '。处理后可用 /task resume 重试。';
    }
    return undefined;
}
