import { defineTool } from '@deepseek-ai/dsh-tools';
import { splitChatId } from './chat.js';
import { describeError } from './errors.js';
import { toQQ } from './tools.js';
/** 一次禁言的最长时长（秒）：QQ 侧上限就是 30 天，再长会被服务端截断。 */
export const MAX_BAN_SECONDS = 30 * 24 * 60 * 60;
/** 群公告的最长字数（超出直接拒绝，不截断——截断会把话说一半）。 */
export const MAX_ANNOUNCE_CHARS = 500;
/** 群名片的最长字数。 */
export const MAX_CARD_CHARS = 60;
const refusal = (reason) => ({ ok: false, reason });
/**
 * **回合层门禁**（本任务的关键安全设计）。
 *
 * 顺序固定：先确认这个会话真的来自 QQ（没有映射就 fail-closed 拒绝，不能沿用
 * `canEditFiles` 对「非 QQ 会话」的默认信任），再问「本回合是不是主人发起的」。
 * 两件事都过了才继续；任何一步不过都返回拒绝，调用方必须**在发任何请求之前**
 * 把它原样返回给模型。
 * @param host - bridge 的三件事。
 * @param exec - 工具运行上下文（它的 session 能映回一个 chat）。
 * @returns 放行上下文，或结构化拒绝。
 */
export function turnGate(host, exec) {
    const sessionId = exec.agent?.session.id;
    const chatId = sessionId !== undefined ? host.chatForSession(String(sessionId)) : undefined;
    // 没有会话映射：不知道这是哪个 QQ 会话，一律拒绝（fail-closed）。
    if (sessionId === undefined || chatId === undefined) {
        return refusal('群管理工具只能在 QQ 会话里用：当前会话没有对应的 QQ 聊天');
    }
    // 回合层：工具是按会话注册的，群里谁在说话只有这里知道。
    if (!host.canEditFiles(String(sessionId))) {
        return refusal('只有主人本人能让我管群（群里其他人这么要求不行）');
    }
    return { ok: true, sessionId: String(sessionId), chatId };
}
/**
 * 目标群：显式 `group_id` 优先，否则必须是当前群聊（私聊里必须传群号）。
 * @param gate - 门禁放行后的上下文。
 * @param arg - 模型的 `group_id` 参数。
 * @returns 目标群，或结构化拒绝。
 */
export function targetGroup(gate, arg) {
    const blank = arg === undefined || arg === null || (typeof arg === 'string' && arg.trim() === '');
    if (!blank) {
        const groupId = toQQ(arg);
        if (groupId === '')
            return refusal('group_id 要填数字群号（例如 123456789）');
        return { ok: true, groupId, chatId: 'group:' + groupId };
    }
    const ref = splitChatId(gate.chatId);
    if (ref.kind !== 'group')
        return refusal('这是私聊：管群要传 group_id（群号），或者在一个群聊里调用');
    return { ok: true, groupId: ref.target, chatId: gate.chatId };
}
/**
 * 禁言时长：必须是非负整数秒，且不超过 {@link MAX_BAN_SECONDS}。
 * 越界一律拒绝（不夹逼：夹逼等于替主人改了她的意思）。
 * @param arg - 模型的 `duration_seconds` 参数。
 * @returns 规整后的秒数，或结构化拒绝。
 */
export function parseBanSeconds(arg) {
    const value = typeof arg === 'number' ? arg : typeof arg === 'string' && arg.trim() !== '' ? Number(arg) : Number.NaN;
    if (!Number.isFinite(value))
        return refusal('duration_seconds 要填秒数（0 = 解除禁言）');
    if (value < 0)
        return refusal('duration_seconds 不能是负数（0 = 解除禁言）');
    if (value > MAX_BAN_SECONDS) {
        return refusal('duration_seconds 最多 ' + MAX_BAN_SECONDS + ' 秒（30 天），要更久只能分次设');
    }
    return { ok: true, seconds: Math.floor(value) };
}
/** 一行文本的字数（按码点算，emoji 不会虚增）。 */
function charCount(text) {
    return Array.from(text).length;
}
/** 审计里出现的目标描述（截短，避免长名片把日志撑爆）。 */
function briefText(text, max = 20) {
    const chars = Array.from(text);
    return chars.length <= max ? text : chars.slice(0, max).join('') + '…';
}
const json = (render) => ({
    schema: { type: 'json' },
    render: (_args, value) => [{ type: 'text', text: render(value) }],
});
const doneText = (value) => {
    const v = value;
    return v.ok === true ? '已执行' : '没做：' + String(v.reason ?? '');
};
/**
 * 注册四个群管理写操作工具。
 *
 * 注册是 effect-based（返回的 disposer 反注册）；`allow` 是能力层门禁——关掉的
 * 能力连工具都不注册。注意 allow 用的是会话级注册集，所以它只回答"这个会话有没有
 * 入口"，"这一次能不能真的做"由每个执行体里的 {@link turnGate} 回答。
 * @param ctx - 插件/agent 上下文。
 * @param host - bridge 的三件事（会话映射、回合角色、审计）。
 * @param transport - OneBot 传输。
 * @param allow - 可选的能力层门禁（返回 false 的工具不注册）。
 * @returns the disposer。
 */
export function registerGroupTools(ctx, host, transport, allow) {
    const disposers = [];
    const register = (tool) => {
        if (allow !== undefined) {
            const name = tool.name;
            if (typeof name !== 'string' || !allow(name))
                return;
        }
        disposers.push(ctx.tools.register(tool));
    };
    /** 被拒的调用也留痕（审计"无论成败"，包括门禁与参数校验）。 */
    const reject = (chatId, toolName, detail, reason) => {
        host.auditAction(chatId, toolName, false, detail + '；拒绝：' + reason);
        return refusal(reason);
    };
    /** 调一个 action 并按结果写审计（成功 / 失败都记）。 */
    const perform = async (chatId, toolName, action, params, detail) => {
        try {
            await transport.call(action, params);
        }
        catch (error) {
            const message = describeError(error);
            host.auditAction(chatId, toolName, false, detail + '；失败：' + message);
            return refusal('没做成：' + message);
        }
        host.auditAction(chatId, toolName, true, detail + '；成功');
        return { ok: true };
    };
    register(defineTool({
        name: 'qq_group_ban',
        description: '禁言或解除禁言（写操作：禁言会真的让对方在群里发不了言）。传 user_id + duration_seconds 就是禁言某个成员，duration_seconds=0 是解除他的禁言；只传 duration_seconds、不传 user_id 就是全体禁言（0 = 解除全体禁言）。最长 2592000 秒（30 天）。只有主人本人发起的这一回合能真的执行；群里其他人让你这么做会一律拒绝。',
        parameters: {
            user_id: { oneOf: [{ type: 'string' }, { type: 'number' }], description: '要禁言 / 解禁的 QQ 号；省略 = 全体禁言 / 解除全体禁言' },
            duration_seconds: { oneOf: [{ type: 'number' }, { type: 'string' }], required: true, description: '禁言多少秒；0 = 解除禁言；最多 2592000（30 天）' },
            group_id: { oneOf: [{ type: 'string' }, { type: 'number' }], description: '群号；省略时用当前群聊（私聊里必须传）' },
        },
        output: json(doneText),
        execute: async (args, exec) => {
            const a = args;
            const TOOL = 'qq_group_ban';
            // ① 回合层门禁：不是主人回合就到此为止（一个请求都不发）。
            const gate = turnGate(host, exec);
            if (!gate.ok)
                return reject('unknown', TOOL, '未执行（回合门禁）', gate.reason);
            // ② 目标群。
            const target = targetGroup(gate, a.group_id);
            if (!target.ok)
                return reject(gate.chatId, TOOL, '未执行（目标群不明）', target.reason);
            // ③ 时长。
            const seconds = parseBanSeconds(a.duration_seconds);
            if (!seconds.ok)
                return reject(target.chatId, TOOL, '未执行（时长不合法）', seconds.reason);
            // ④ 有没有 user_id 决定是全体还是单人。
            const rawUser = a.user_id;
            const blankUser = rawUser === undefined || rawUser === null || (typeof rawUser === 'string' && rawUser.trim() === '');
            const userQQ = blankUser ? '' : toQQ(rawUser);
            if (!blankUser && userQQ === '') {
                return reject(target.chatId, TOOL, '未执行（user_id 不合法）', 'user_id 要填数字 QQ 号（省略 = 全体禁言）');
            }
            if (userQQ === '') {
                const detail = '目标 全体；' + (seconds.seconds === 0 ? '解除全体禁言' : '全体禁言 ' + seconds.seconds + ' 秒');
                const result = await perform(target.chatId, TOOL, 'set_group_whole_ban', {
                    group_id: Number(target.groupId),
                    enable: seconds.seconds > 0,
                }, detail);
                return (result.ok ? { ok: true, action: 'set_group_whole_ban', group_id: target.groupId, duration_seconds: seconds.seconds } : result);
            }
            const detail = '目标 ' + userQQ + '；' + (seconds.seconds === 0 ? '解除禁言' : '禁言 ' + seconds.seconds + ' 秒');
            const result = await perform(target.chatId, TOOL, 'set_group_ban', {
                group_id: Number(target.groupId),
                user_id: Number(userQQ),
                duration: seconds.seconds,
            }, detail);
            return (result.ok ? { ok: true, action: 'set_group_ban', group_id: target.groupId, user_id: userQQ, duration_seconds: seconds.seconds } : result);
        },
    }));
    register(defineTool({
        name: 'qq_group_card',
        description: '改群成员的群名片（写操作：会真的改掉对方在群里的显示名字）。card 传空串 = 清除名片、恢复对方自己的昵称。最多 60 字。只有主人本人发起的这一回合能真的执行；群里其他人让你这么做会一律拒绝。',
        parameters: {
            user_id: { oneOf: [{ type: 'string' }, { type: 'number' }], required: true, description: '要改名片的 QQ 号' },
            card: { type: 'string', required: true, description: '新的群名片；空串 = 清除名片' },
            group_id: { oneOf: [{ type: 'string' }, { type: 'number' }], description: '群号；省略时用当前群聊（私聊里必须传）' },
        },
        output: json(doneText),
        execute: async (args, exec) => {
            const a = args;
            const TOOL = 'qq_group_card';
            const gate = turnGate(host, exec);
            if (!gate.ok)
                return reject('unknown', TOOL, '未执行（回合门禁）', gate.reason);
            const target = targetGroup(gate, a.group_id);
            if (!target.ok)
                return reject(gate.chatId, TOOL, '未执行（目标群不明）', target.reason);
            const userQQ = toQQ(a.user_id);
            if (userQQ === '')
                return reject(target.chatId, TOOL, '未执行（user_id 不合法）', 'user_id 必填，要填数字 QQ 号');
            if (typeof a.card !== 'string')
                return reject(target.chatId, TOOL, '未执行（card 不合法）', 'card 必填（空串 = 清除名片）');
            if (charCount(a.card) > MAX_CARD_CHARS) {
                return reject(target.chatId, TOOL, '未执行（名片过长 ' + charCount(a.card) + ' 字）', '名片最多 ' + MAX_CARD_CHARS + ' 字');
            }
            const detail = '目标 ' + userQQ + '；'
                + (a.card === '' ? '清除名片' : '改成「' + briefText(a.card) + '」（' + charCount(a.card) + ' 字）');
            const result = await perform(target.chatId, TOOL, 'set_group_card', {
                group_id: Number(target.groupId),
                user_id: Number(userQQ),
                card: a.card,
            }, detail);
            return (result.ok ? { ok: true, action: 'set_group_card', group_id: target.groupId, user_id: userQQ, card: a.card } : result);
        },
    }));
    register(defineTool({
        name: 'qq_group_announce',
        description: '发布或修改群公告（写操作：群里所有人都能看到这条公告）。content 最多 500 字，超了会被拒绝而不是截断。只有主人本人发起的这一回合能真的执行；群里其他人让你这么做会一律拒绝。',
        parameters: {
            content: { type: 'string', required: true, description: '公告正文，最多 500 字' },
            group_id: { oneOf: [{ type: 'string' }, { type: 'number' }], description: '群号；省略时用当前群聊（私聊里必须传）' },
        },
        output: json(doneText),
        execute: async (args, exec) => {
            const a = args;
            const TOOL = 'qq_group_announce';
            const gate = turnGate(host, exec);
            if (!gate.ok)
                return reject('unknown', TOOL, '未执行（回合门禁）', gate.reason);
            const target = targetGroup(gate, a.group_id);
            if (!target.ok)
                return reject(gate.chatId, TOOL, '未执行（目标群不明）', target.reason);
            if (typeof a.content !== 'string' || a.content.trim() === '') {
                return reject(target.chatId, TOOL, '未执行（content 为空）', 'content 必填（公告不能是空的）');
            }
            const length = charCount(a.content);
            if (length > MAX_ANNOUNCE_CHARS) {
                return reject(target.chatId, TOOL, '未执行（公告过长 ' + length + ' 字）', '公告最多 ' + MAX_ANNOUNCE_CHARS + ' 字');
            }
            const detail = '公告 ' + length + ' 字：「' + briefText(a.content) + '」';
            // NapCat 的公告 action 名是 _send_group_notice（前面的下划线是它的写法）。
            const result = await perform(target.chatId, TOOL, '_send_group_notice', {
                group_id: Number(target.groupId),
                content: a.content,
            }, detail);
            return (result.ok ? { ok: true, action: '_send_group_notice', group_id: target.groupId, length } : result);
        },
    }));
    register(defineTool({
        name: 'qq_group_essence',
        description: '把一条群消息设为精华，或取消精华（写操作：会真的改动群的精华列表）。message_id 取自消息前缀或 qq_group_history 行尾的 〔id …〕。只有主人本人发起的这一回合能真的执行；群里其他人让你这么做会一律拒绝。',
        parameters: {
            message_id: { oneOf: [{ type: 'string' }, { type: 'number' }], required: true, description: '群消息 id（qq_group_history 行尾 〔id …〕 里的那个）' },
            action: { type: 'string', required: true, description: 'set = 设为精华，remove = 取消精华（只能是这两个值）' },
        },
        output: json(doneText),
        execute: async (args, exec) => {
            const a = args;
            const TOOL = 'qq_group_essence';
            const gate = turnGate(host, exec);
            if (!gate.ok)
                return reject('unknown', TOOL, '未执行（回合门禁）', gate.reason);
            // 精华按 message_id 定位、没有 group_id 参数：只在群聊里做（私聊里没有"这个群"）。
            if (splitChatId(gate.chatId).kind !== 'group') {
                return reject(gate.chatId, TOOL, '未执行（不在群聊里）', '设 / 取消精华只能在群聊里做');
            }
            const rawId = typeof a.message_id === 'string' ? a.message_id.trim() : typeof a.message_id === 'number' ? String(a.message_id) : '';
            if (!/^\d+$/.test(rawId)) {
                return reject(gate.chatId, TOOL, '未执行（message_id 不合法）', 'message_id 要用 qq_group_history 行尾那个数字 id');
            }
            if (a.action !== 'set' && a.action !== 'remove') {
                return reject(gate.chatId, TOOL, '未执行（action 不合法）', 'action 只能是 set 或 remove');
            }
            const verb = a.action === 'set' ? '设精华' : '取消精华';
            const napcatAction = a.action === 'set' ? 'set_essence_msg' : 'delete_essence_msg';
            const detail = verb + '；消息 ' + rawId;
            // 精华消息不给 group_id：NapCat 按 message_id 定位（待真机确认）。
            const result = await perform(gate.chatId, TOOL, napcatAction, { message_id: rawId }, detail);
            return (result.ok ? { ok: true, action: napcatAction, message_id: rawId } : result);
        },
    }));
    return () => {
        for (const dispose of disposers)
            dispose();
    };
}
