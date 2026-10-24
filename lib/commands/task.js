import { handleTaskCommand as handleLegacyTask } from '../companion/task-command.js';
import { applyGoalView, bindingFrom, parseTaskDirective, renderTaskConflict, renderTaskCreated, renderTaskPaused, renderTaskResumed, renderTaskStatus, revokeGoalGrant, TASK_DRIVER_CAVEAT, TASK_NEEDS_SESSION_NOTICE, TASK_NO_SERVICE_NOTICE, TASK_PRIVATE_ONLY_NOTICE, } from '../task-goal.js';
/** 长任务动词（小写比较；中文别名照收）。 */
const GOAL_VERBS = new Set(['status', 'state', '状态', 'stop', 'pause', '暂停', 'resume', '继续']);
/** `/task` 入口（commands.ts 的 COMMANDS['task'].handler 指到这里）。 */
export async function handleTaskCommand(ctx, chatId, arg) {
    const run = { ctx, chatId, reply: text => ctx.sendToChat(chatId, text) };
    const trimmed = arg.trim();
    if (trimmed === '') {
        await handleLegacy(run, '');
        return;
    }
    const head = (trimmed.split(/\s+/u)[0] ?? '').toLowerCase();
    // 旧定时任务命名空间优先：已知 id 与 checkin 的历史行为一分不改。
    const prompts = ctx.scheduledPrompts?.() ?? [];
    if (head === 'checkin' && ctx.proactive !== undefined) {
        await handleLegacy(run, 'checkin');
        return;
    }
    if (prompts.some((prompt) => prompt.id.toLowerCase() === head)) {
        await handleLegacy(run, head);
        return;
    }
    if (!GOAL_VERBS.has(head)) {
        await createTask(run, trimmed);
        return;
    }
    if (head === 'status' || head === 'state' || head === '状态') {
        await showStatus(run);
        return;
    }
    if (head === 'stop' || head === 'pause' || head === '暂停') {
        await pauseTask(run);
        return;
    }
    await resumeTask(run);
}
/** 旧定时任务委派（行为与 T16 之前完全一致）。 */
async function handleLegacy(run, arg) {
    await handleLegacyTask({
        ...(run.ctx.scheduledPrompts !== undefined ? { scheduledPrompts: run.ctx.scheduledPrompts } : {}),
        ...(run.ctx.proactive !== undefined ? { proactive: run.ctx.proactive } : {}),
        ...(run.ctx.fireScheduled !== undefined ? { fireScheduled: run.ctx.fireScheduled } : {}),
    }, arg, run.reply);
}
/** 长任务前置检查：私聊 + goals 服务 + 当前会话。返回 undefined 表示可继续。 */
async function requireLongTask(run) {
    const { ctx, chatId, reply } = run;
    if (chatId.startsWith('group:')) {
        await reply(TASK_PRIVATE_ONLY_NOTICE);
        return undefined;
    }
    const goals = ctx.goals;
    if (goals === undefined) {
        await reply(TASK_NO_SERVICE_NOTICE);
        return undefined;
    }
    const chat = ctx.getChat(chatId);
    if (chat === undefined) {
        await reply(TASK_NEEDS_SESSION_NOTICE);
        return undefined;
    }
    // 绑定按 ChatAgent.sessionId 记：换会话（/new、/session）后授权自动失效。
    return { agent: chat.agent, sessionId: chat.sessionId, goals };
}
/** `/task <目标> [-r N]` —— 创建并授权（有未完成目标时只报告，不覆盖）。 */
async function createTask(run, arg) {
    const ready = await requireLongTask(run);
    if (ready === undefined)
        return;
    const directive = parseTaskDirective(arg);
    if (!directive.ok) {
        await run.reply(directive.error);
        return;
    }
    const port = run.ctx.taskGoal;
    if (port === undefined) {
        await run.reply(TASK_NO_SERVICE_NOTICE);
        return;
    }
    // 已有未完成目标：刷新进度后如实报告，绝不覆盖。
    const current = readGoal(ready.goals, ready.agent);
    if (!current.ok) {
        // 读不到 != 没有目标（T16 D4）：这种情况绝不能落到 create 覆盖宿主里的目标。
        await run.reply(goalReadFailed(current.detail));
        return;
    }
    const bound = port.binding(run.chatId);
    if (current.view !== undefined && current.view.phase !== 'complete') {
        if (bound !== undefined)
            applyGoalView(bound, current.view);
        await run.reply(renderTaskConflict(current.view));
        return;
    }
    let created;
    try {
        created = ready.goals.create(ready.agent, {
            objective: directive.objective,
            ...(directive.maxGoalRounds !== undefined ? { maxGoalRounds: directive.maxGoalRounds } : {}),
        });
    }
    catch (error) {
        await run.reply('❌ 创建长任务失败：' + errorMessage(error) + '\n' + TASK_DRIVER_CAVEAT);
        return;
    }
    port.bind(run.chatId, bindingFrom(created, ready.sessionId, 'admin'));
    port.noteOperation('create', created.id);
    await run.reply(renderTaskCreated(created));
}
/** `/task status` —— 以宿主当前投影为准（不信任内存里的旧 revision）。 */
async function showStatus(run) {
    const ready = await requireLongTask(run);
    if (ready === undefined)
        return;
    const read = readGoal(ready.goals, ready.agent);
    if (!read.ok) {
        await run.reply(goalReadFailed(read.detail));
        return;
    }
    const view = read.view;
    const port = run.ctx.taskGoal;
    if (view === undefined) {
        port?.unbind(run.chatId);
        await run.reply('没有长任务。发 /task <目标> [-r N] 创建。');
        return;
    }
    let bound = port?.binding(run.chatId);
    // 宿主里的当前目标不是授权里那个 → 旧授权作废（T16 D3），绝不把目标 B 的
    // 相位/轮次套到目标 A 的授权上。
    if (bound !== undefined && bound.goalId !== view.id) {
        port?.unbind(run.chatId);
        bound = undefined;
    }
    if (bound !== undefined) {
        applyGoalView(bound, view);
        // 宿主里已经不是「进行中 + 仍授权自动接力」→ 进程内授权**当场作废**，不等
        // 异步 goal/changed：那条通知可能被去重、被别的目标认领或根本没人认领，
        // 等它就会让旧的管理员授权在外部暂停之后继续生效（T16 第二轮审查缺陷 3）。
        if (bound.phase !== 'active' || bound.activation !== 'armed')
            revokeGoalGrant(bound);
    }
    const head = bound === undefined
        ? '宿主里有目标，但插件尚未授权它自动接力（进程重启后授权不保留，发 /task resume 重新授权）：'
        : '';
    await run.reply(head + renderTaskStatus(view));
}
/** `/task stop` —— 暂停（保留目标与进度）。 */
async function pauseTask(run) {
    const ready = await requireLongTask(run);
    if (ready === undefined)
        return;
    const read = readGoal(ready.goals, ready.agent);
    if (!read.ok) {
        await run.reply(goalReadFailed(read.detail));
        return;
    }
    const view = read.view;
    if (view === undefined) {
        run.ctx.taskGoal?.unbind(run.chatId);
        await run.reply('没有长任务，没什么可暂停的。');
        return;
    }
    try {
        const port = run.ctx.taskGoal;
        // 「这是我发的」必须在 pause **之前**记账：宿主的 goal/changed 可能同步
        // 重入，晚记就会把自家改动当成外部改动再播报一遍（T16 D4）。
        port?.noteOperation('pause', view.id);
        const paused = ready.goals.pause(ready.agent, { id: view.id, revision: view.revision });
        if (port !== undefined) {
            const bound = port.binding(run.chatId);
            if (bound !== undefined && bound.goalId === paused.id) {
                applyGoalView(bound, paused);
                // 暂停 = 授权结束：显式撤销进程内授权（不能只靠异步 goal/changed——
                // 自家发的 pause 已被 noteOperation 去重，通知也可能压根不到）。否则
                // 宿主之后把目标 resume 成 active 时，旧的管理员授权会跟着复活
                // （T16 第二轮审查缺陷 3）。要恢复自动接力只能 /task resume 重新授权。
                revokeGoalGrant(bound);
            }
        }
        await run.reply(renderTaskPaused(paused));
    }
    catch (error) {
        await run.reply('❌ 暂停失败：' + errorMessage(error));
    }
}
/** `/task resume` —— 重新授权并继续（也是进程重启后唯一的恢复入口）。 */
async function resumeTask(run) {
    const ready = await requireLongTask(run);
    if (ready === undefined)
        return;
    const read = readGoal(ready.goals, ready.agent);
    if (!read.ok) {
        // 读失败时 0 创建、0 恢复（T16 D4）。
        await run.reply(goalReadFailed(read.detail));
        return;
    }
    const view = read.view;
    if (view === undefined) {
        run.ctx.taskGoal?.unbind(run.chatId);
        await run.reply('没有可继续的长任务。发 /task <目标> [-r N] 创建。');
        return;
    }
    if (view.phase === 'complete') {
        await run.reply('这个长任务已经完成了，不能再继续；要新任务请发 /task <目标> [-r N]。');
        return;
    }
    try {
        const port = run.ctx.taskGoal;
        // 同 pause：先记账再动手，防宿主同步重入的 goal/changed 被当成外部改动（T16 D4）。
        port?.noteOperation('resume', view.id);
        const resumed = ready.goals.resume(ready.agent, { id: view.id, revision: view.revision });
        if (port !== undefined) {
            // 授权永远按**实时 view** 重建：不复用可能属于别的目标的旧绑定（T16 D3）。
            port.bind(run.chatId, bindingFrom(resumed, ready.sessionId, 'admin'));
        }
        await run.reply(renderTaskResumed(resumed));
    }
    catch (error) {
        await run.reply('❌ 继续失败：' + errorMessage(error));
    }
}
function readGoal(goals, agent) {
    try {
        return { ok: true, view: goals.get(agent) };
    }
    catch (error) {
        return { ok: false, detail: errorMessage(error) };
    }
}
/** 读取失败的回执：明确说明「什么都没做」，绝不退化成 create/resume。 */
function goalReadFailed(detail) {
    return '❌ 读不到长任务的实时状态：' + detail
        + '\n这次**没有做任何改动**（没有创建、也没有恢复目标）。请稍后重试，或到宿主里确认目标状态。';
}
/** 失败文案只取 message（宿主/结构错误的 message 已足够可读）。 */
function errorMessage(error) {
    if (error instanceof Error)
        return error.message;
    return String(error);
}
