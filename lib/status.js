import { fileSize, memoryFileSpecs } from './companion/doctor.js';
/** 主插件挂到 cordis 上的只读状态服务名。 */
export const STATUS_SERVICE = 'qqCompanionStatus';
/** 快照里最多列出多少个聊天（会话计数仍按全量算）。 */
export const STATUS_SESSION_LIMIT = 50;
/** 跑一个取数函数：抛错 / undefined 一律归一为 null（只影响该字段）。 */
function readSafely(read) {
    try {
        const value = read();
        return value === undefined ? null : value;
    }
    catch {
        return null;
    }
}
/** 有限的非负数原样返回，其余归一为 0。 */
function countOf(value) {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
}
function connectionOf(deps) {
    if (deps.connection === undefined)
        return null;
    const connection = deps.connection();
    const live = deps.liveness === undefined ? undefined : deps.liveness();
    const selfId = typeof connection.selfId === 'string' ? connection.selfId : '';
    const configured = typeof deps.botQQ === 'string' ? deps.botQQ : '';
    return {
        connected: connection.connected === true,
        online: live === undefined || live.online === undefined ? null : live.online === true,
        selfId,
        botQQ: configured !== '' ? configured : selfId,
        host: deps.transport === undefined ? '' : String(deps.transport.host),
        port: deps.transport === undefined ? 0 : countOf(deps.transport.port),
    };
}
function sessionsOf(deps) {
    if (deps.chats === undefined)
        return null;
    const source = deps.chats();
    const merged = [];
    const seen = new Set();
    for (const chat of [...(source.live ?? []), ...(source.mapped ?? [])]) {
        if (chat == null || typeof chat.chatId !== 'string' || chat.chatId === '')
            continue;
        if (seen.has(chat.chatId))
            continue;
        seen.add(chat.chatId);
        merged.push({ chatId: chat.chatId, sessionId: typeof chat.sessionId === 'string' ? chat.sessionId : '' });
    }
    const workspace = deps.workspaceSessionIds === undefined ? undefined : deps.workspaceSessionIds();
    const list = merged.slice(0, STATUS_SESSION_LIMIT).map(chat => {
        // 标题取数失败只影响这一行（整份快照照常返回）。
        const title = readSafely(() => (deps.titleOf === undefined ? undefined : deps.titleOf(chat.chatId, chat.sessionId)));
        const item = {
            chatId: chat.chatId,
            sessionId: chat.sessionId,
            workspaceAttached: workspace === undefined || workspace === null ? null : workspace.has(chat.sessionId),
        };
        if (title !== null && title !== '')
            item.title = title;
        return item;
    });
    let privateCount = 0;
    let groupCount = 0;
    for (const chat of merged) {
        if (chat.chatId.startsWith('private:'))
            privateCount += 1;
        else if (chat.chatId.startsWith('group:'))
            groupCount += 1;
    }
    return { private: privateCount, group: groupCount, list };
}
function proactiveOf(deps) {
    if (deps.proactive === undefined)
        return { enabled: false, doneToday: 0, plannedToday: 0 };
    const proactive = deps.proactive();
    const remaining = Array.isArray(proactive.remaining) ? proactive.remaining.filter(time => typeof time === 'string' && time !== '') : [];
    const doneToday = countOf(proactive.firedToday);
    const status = {
        enabled: proactive.enabled !== false,
        doneToday,
        plannedToday: doneToday + remaining.length,
    };
    if (remaining.length > 0)
        status.nextAt = remaining[0];
    return status;
}
function stickersOf(deps) {
    if (deps.stickers === undefined) {
        return { enabled: false, count: 0, maxCount: 0, today: 0, dailyMax: 0 };
    }
    const stickers = deps.stickers();
    return {
        enabled: true,
        count: countOf(stickers.count),
        maxCount: countOf(stickers.maxCount),
        today: countOf(stickers.today),
        dailyMax: countOf(stickers.dailyMax),
    };
}
/** 「记忆用量」：与 /doctor 同一份记忆文件清单（公开 / 私密 / 每群）+ 文件大小。 */
async function memoryOf(deps) {
    const collected = await memoryFileSpecs({
        memoryFiles: deps.memoryFiles,
        groupMemoryDir: deps.groupMemoryDir,
        groupMemoryMaxBytes: deps.groupMemoryMaxBytes,
    });
    const out = [];
    for (const spec of collected.files) {
        const bytes = await fileSize(spec.path);
        out.push({
            label: spec.label,
            path: spec.path,
            bytes: bytes === undefined ? null : bytes,
            maxBytes: spec.max === undefined ? null : spec.max,
        });
    }
    return out;
}
/** 「功能」卡片：能力开关摘要（缺席 = null；只保留纯 JSON 字段）。 */
function capabilitiesOf(deps) {
    if (deps.capabilities === undefined)
        return null;
    const summary = deps.capabilities();
    const disabled = [];
    for (const item of Array.isArray(summary.disabled) ? summary.disabled : []) {
        if (item == null)
            continue;
        disabled.push({
            id: typeof item.id === 'string' ? item.id : '',
            title: typeof item.title === 'string' ? item.title : '',
            reason: typeof item.reason === 'string' ? item.reason : '',
        });
    }
    return { enabled: countOf(summary.enabled), total: countOf(summary.total), disabled };
}
function scheduledOf(deps) {
    const states = deps.scheduler === undefined ? [] : deps.scheduler();
    const prompts = deps.scheduledPrompts;
    if (prompts === undefined && states.length === 0)
        return null;
    const fired = new Map();
    for (const state of states) {
        if (state != null && typeof state.id === 'string')
            fired.set(state.id, state.firedToday === true);
    }
    const out = [];
    if (prompts !== undefined) {
        for (const prompt of prompts) {
            if (prompt == null || typeof prompt.id !== 'string' || prompt.id === '' || typeof prompt.time !== 'string')
                continue;
            const doneToday = fired.get(prompt.id) === true;
            out.push({
                id: prompt.id,
                time: prompt.time,
                chatId: typeof prompt.chatId === 'string' ? prompt.chatId : '',
                doneToday,
                nextAt: prompt.time,
            });
        }
        return out;
    }
    for (const state of states) {
        if (state == null || typeof state.id !== 'string' || typeof state.time !== 'string')
            continue;
        out.push({ id: state.id, time: state.time, chatId: '', doneToday: state.firedToday === true, nextAt: state.time });
    }
    return out;
}
/**
 * 构建概览快照：任何一部分取数失败只让该字段为 null，整个快照仍然返回。
 * 快照只含连接 / 会话 id / 计数 / 文件大小 / 标题，**不含密钥与聊天正文**。
 */
export async function buildCompanionStatusSnapshot(deps = {}) {
    const now = deps.now ?? (() => Date.now());
    const snapshot = {
        connection: readSafely(() => connectionOf(deps)),
        sessions: readSafely(() => sessionsOf(deps)),
        today: readSafely(() => {
            if (deps.sendCounter === undefined)
                return null;
            return { sent: countOf(deps.sendCounter().today) };
        }),
        proactive: readSafely(() => proactiveOf(deps)),
        stickers: readSafely(() => stickersOf(deps)),
        memory: null,
        scheduled: readSafely(() => scheduledOf(deps)),
        permissions: readSafely(() => {
            if (deps.permissions === undefined)
                return null;
            return { admin: String(deps.permissions.admin ?? ''), member: String(deps.permissions.member ?? '') };
        }),
        capabilities: readSafely(() => capabilitiesOf(deps)),
        generatedAt: now(),
    };
    try {
        snapshot.memory = await memoryOf(deps);
    }
    catch {
        snapshot.memory = null;
    }
    return snapshot;
}
/**
 * 把只读状态服务挂到 cordis 上，返回撤销函数。
 *
 * `ctx.provide()` 内部走 `ctx.fiber.effect()`：fiber 卸载时服务自动注销并唤醒
 * 依赖方（reflect.ts 的 provide 实现），所以插件被禁用 / 重载后
 * `ctx.get('qqCompanionStatus')` 立即回到 undefined（设置页据此显示
 * 「QQ 主插件未运行」横幅）。这里仍返回 dispose，供调用方显式提前撤销。
 */
export function provideCompanionStatus(ctx, service) {
    const dispose = ctx.provide(STATUS_SERVICE, service);
    return typeof dispose === 'function' ? dispose : () => undefined;
}
