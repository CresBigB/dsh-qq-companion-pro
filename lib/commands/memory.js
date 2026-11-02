/** Usage line shared by the empty-argument branch and /help. */
export const MEMORY_USAGE = '/memory <关键词>';
export async function handleMemoryCommand(ctx, chatId, arg) {
    const search = ctx.searchMemory;
    if (search === undefined) {
        await ctx.sendToChat(chatId, '记忆库没有启用：需要先在设置里填「工作目录」，记忆库会放在它下面的 memorys 目录里。');
        return;
    }
    const query = arg.trim();
    if (query === '') {
        await ctx.sendToChat(chatId, '用法：' + MEMORY_USAGE
            + '\n在当前这个聊天自己的记忆库里模糊搜索（每个 QQ 号 / 群号一个库），结果按出现次数和最近时间排序。');
        return;
    }
    const hits = await search(chatId, query, 10);
    if (hits.length === 0) {
        await ctx.sendToChat(chatId, '这个聊天的记忆库里没有匹配「' + query + '」的条目。');
        return;
    }
    const lines = hits.map((hit, index) => (index + 1) + '. ' + hit.text
        + '（' + hit.hits + ' 次，最近 ' + hit.updatedAt.slice(0, 10) + '）');
    await ctx.sendToChat(chatId, '记忆库里找到 ' + hits.length + ' 条：\n' + lines.join('\n'));
}
