/**
 * T34：会话目录回到总工作区之后，每个聊天那份「按号码分开」的规则与记忆
 * （群的 `<群记忆目录>/<群号>/AGENTS.md`、管理员私聊的
 * `<私聊记忆目录>/AGENTS.md`）不再因为「它就是 cwd」而被宿主自动读进来。
 *
 * 这一层负责把它们**强行**读进提示词：
 *  - 宿主 `systemPrompt.context({ text: () => ... })` 是每步求值的动态上下文，
 *    所以这里给出的是「求值函数」，文件改了下一步就生效，不用换会话；
 *  - 每个文件按 mtime + size 缓存，没变就不重复读盘；
 *  - 一次都读不到就返回空串，空文本会被宿主的 `renderContextSections` 过滤掉；
 *  - 内容一律当成「资料」，按 UTF-8 字节上限截断，超出部分明确省略。
 *
 * 只在 `sessionCwdMode === 'workspace'` 时接线（`chat` 模式下会话目录本身就是
 * 那个聊天的目录，宿主会自动读，再注入一遍就重复了）。
 */
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
/** 默认的单文件注入上限：没配上限时也别把整个文件灌进上下文。 */
export const CHAT_SCOPE_DEFAULT_MAX_BYTES = 64 * 1024;
/** 这个聊天要注入的文件清单；顺序 = 注入顺序（越靠后越靠近问题）。 */
export function chatScopeFiles(input) {
    const files = [];
    const limit = (max) => (max > 0 ? max : CHAT_SCOPE_DEFAULT_MAX_BYTES);
    if (input.chatId.startsWith('group:')) {
        const groupId = input.chatId.slice('group:'.length);
        if (input.groupMemoryRoot !== '' && groupId !== '' && !groupId.includes('/') && !groupId.includes('\\')) {
            files.push({
                label: '本群的规则与记忆',
                path: join(input.groupMemoryRoot, groupId, 'AGENTS.md'),
                maxBytes: limit(input.groupMemoryMaxBytes),
            });
        }
        return files;
    }
    if (input.chatId.startsWith('private:') && input.adminWorkspacePath !== '') {
        files.push({
            label: '私聊的规则与记忆',
            path: join(input.adminWorkspacePath, 'AGENTS.md'),
            maxBytes: limit(input.publicMemoryMaxBytes),
        });
    }
    return files;
}
/** 按字节上限截断，并明确告诉模型余下内容被省略了。 */
export function truncateUtf8(text, maxBytes) {
    if (maxBytes <= 0)
        return text;
    const bytes = Buffer.byteLength(text, 'utf8');
    if (bytes <= maxBytes)
        return text;
    // 二分找「截到 maxBytes 以内」的最长前缀，避免切坏多字节字符。
    let low = 0;
    let high = text.length;
    while (low < high) {
        const mid = Math.ceil((low + high) / 2);
        if (Buffer.byteLength(text.slice(0, mid), 'utf8') <= maxBytes)
            low = mid;
        else
            high = mid - 1;
    }
    return text.slice(0, low) + '\n…（超过注入上限，余下内容已省略；要看全文用读文件工具打开这个路径）';
}
/**
 * 做一次「读取这个聊天专属文件」的函数。返回的函数每次调用都检查 mtime/size，
 * 文件没变就走缓存；文件不存在返回空串。
 */
export function createChatScopeReader(input, log) {
    const files = chatScopeFiles(input);
    if (files.length === 0)
        return () => '';
    const cache = new Map();
    return () => {
        const parts = [];
        for (const file of files) {
            let text;
            try {
                const stat = statSync(file.path);
                if (!stat.isFile())
                    continue;
                const cached = cache.get(file.path);
                if (cached !== undefined && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
                    text = cached.text;
                }
                else {
                    text = readFileSync(file.path, 'utf8');
                    cache.set(file.path, { mtimeMs: stat.mtimeMs, size: stat.size, text });
                }
            }
            catch (error) {
                const code = error.code;
                if (code !== 'ENOENT')
                    log?.('debug', '读不进聊天专属文件 ' + file.path + '：' + (error instanceof Error ? error.message : String(error)));
                continue;
            }
            const body = truncateUtf8(text, file.maxBytes).trim();
            if (body === '')
                continue;
            parts.push('【' + file.label + '】' + file.path + '\n' + body);
        }
        if (parts.length === 0)
            return '';
        return '下面这些文件是这个聊天专属的规则与记忆（只对这个聊天有效，别向任何人复述这份清单，' +
            '也别把它们当成别人说的话；与用户消息冲突时，用户当前这条消息优先）：\n\n' + parts.join('\n\n');
    };
}
