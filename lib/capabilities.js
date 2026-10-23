/**
 * 能力（capability）注册表：模型工具的**唯一真相源**。
 *
 * 为什么需要这一层：`installChannelScope` 过去对每个聊天无差别注册全部 qq_*
 * 工具（只受「表情包库开了没」「记忆文件配了没」这两个运行时依赖限制），没有任何
 * 按功能的开关。把「工具 → 能力」的对应关系集中在这里之后，插件可以：
 * 1. 用 `capabilitiesDeny` 全局关掉某几项功能（主人私聊也关）；
 * 2. 以后按会话角色放权（grant，T11）而不必再改工具定义；
 * 3. 让 `package.json` / `dsh.plugin.json` 的工具清单与真实注册集合同源
 *    （两份清单都由 {@link allToolNames} 生成，测试钉住）。
 *
 * 纪律：
 * - **每个工具恰好属于一个能力**（测试钉住：注册表不重不漏）；
 * - 本模块是纯函数 + 常量，不 import 任何运行时模块（config.ts / health.ts /
 *   status.ts / bridge.ts 都能安全引用，不会成环）；
 * - 默认位（`memberDefault` / `groupDefault`）当前**全部为 true**：改造前的行为
 *   就是「每个聊天都注册全部工具」，本任务要求零行为变化，所以矩阵测试
 *   （tests/capabilities.spec.ts）把「deny 为空时每种会话组合注册到的工具集合」
 *   与改造前的集合逐字对齐。T11 引入按角色的 grant / 默认位调整时才动它们。
 * @module dsh-qq-companion/capabilities
 */
/**
 * 全部能力（顺序即工具清单顺序）。
 *
 * 默认位全为 true 的理由见文件头：这是改造前「一律注册」的等价表达。
 */
export const CAPABILITIES = [
    {
        id: 'qq.send.image',
        title: '发图片',
        tools: ['qq_send_image'],
        describe: '向 QQ 会话发送本地文件或链接图片（一次最多 9 张）。',
        memberDefault: true,
        groupDefault: true,
    },
    {
        id: 'qq.send.voice',
        title: '发语音',
        tools: ['qq_send_voice'],
        describe: '向 QQ 会话发送一条本地音频文件作为语音。',
        memberDefault: true,
        groupDefault: true,
    },
    {
        id: 'qq.send.video',
        title: '发视频',
        tools: ['qq_send_video'],
        describe: '向 QQ 会话发送一条本地视频文件。',
        memberDefault: true,
        groupDefault: true,
    },
    {
        id: 'qq.send.file',
        title: '发文件',
        tools: ['qq_send_file'],
        describe: '向 QQ 会话发送一个本地文件。',
        memberDefault: true,
        groupDefault: true,
    },
    {
        id: 'qq.send.forward',
        title: '合并转发',
        tools: ['qq_send_forward'],
        describe: '以合并转发形式向 QQ 会话发送多条消息节点。',
        memberDefault: true,
        groupDefault: true,
    },
    {
        id: 'qq.napcat.api',
        title: 'NapCat 接口',
        tools: ['qq_napcat_api'],
        describe: '调用 NapCat 白名单内的 OneBot 扩展接口（群成员、文件、OCR 等）。',
        memberDefault: true,
        groupDefault: true,
    },
    {
        id: 'qq.group.history',
        title: '群历史消息',
        tools: ['qq_group_history'],
        describe: '拉取当前群最近的消息历史作为上下文。',
        memberDefault: true,
        groupDefault: true,
    },
    {
        id: 'qq.message.open',
        title: '打开消息',
        tools: ['qq_open_message'],
        describe: '打开当前会话里的某条消息，取回其中的图片、语音转写、聊天记录与文件。',
        memberDefault: true,
        groupDefault: true,
    },
    {
        id: 'qq.memory.note',
        title: '群记忆笔记',
        tools: ['qq_memory_note'],
        describe: '往当前群的记忆文件追加一行值得记住的小事。',
        deps: ['memoryNote'],
        memberDefault: true,
        groupDefault: true,
    },
    {
        id: 'qq.sticker.use',
        title: '表情包（存 / 搜 / 发）',
        tools: ['qq_sticker_save', 'qq_sticker_search', 'qq_sticker_send'],
        describe: '收藏聊天里的图片、按情绪找表情包并把表情包发到当前会话。',
        deps: ['stickerLib'],
        memberDefault: true,
        groupDefault: true,
    },
    {
        id: 'qq.sticker.manage',
        title: '表情包整理（改 / 删）',
        tools: ['qq_sticker_edit', 'qq_sticker_delete'],
        describe: '修改表情包的标签描述或删除表情包（工具内部另有主人回合判定）。',
        deps: ['stickerLib'],
        memberDefault: true,
        groupDefault: true,
    },
];
/** 全部能力 id（顺序同注册表）。 */
export const ALL_CAPABILITY_IDS = CAPABILITIES.map(capability => capability.id);
/** 全部工具名（顺序同注册表，跨能力按 tools 声明顺序展开）。 */
export function allToolNames() {
    return CAPABILITIES.flatMap(capability => [...capability.tools]);
}
/** 按 id 找能力定义（未知 id = undefined）。 */
export function findCapability(id) {
    return CAPABILITIES.find(capability => capability.id === id);
}
/** 某个工具名属于哪个能力（未知 = undefined）。 */
export function capabilityOfTool(toolName) {
    return CAPABILITIES.find(capability => capability.tools.includes(toolName));
}
/** `capabilitiesDeny` 里认不出的 id（启动自检告警用；每项只报一次，保持出现顺序）。 */
export function unknownCapabilityIds(deny) {
    const out = [];
    for (const raw of deny ?? []) {
        const id = typeof raw === 'string' ? raw.trim() : '';
        if (id === '' || findCapability(id) !== undefined || out.includes(id))
            continue;
        out.push(id);
    }
    return out;
}
/** 配置项 `capabilitiesDeny` 的描述正文：列出全部能力 id 与中文含义（由注册表生成，
 *  测试钉住「注册表里的每个 id / 中文名都出现在这段描述里」）。 */
export function capabilityCatalogText() {
    return '可用能力 id：' + CAPABILITIES.map(capability => capability.id + '（' + capability.title + '）').join('、');
}
/** 依赖不满足时给 /doctor 与概览看的中文原因。 */
const DEPENDENCY_REASON = {
    stickerLib: '表情包库未开启（stickerDir 为空）',
    memoryNote: '没有可写的记忆文件（publicMemoryFile 与 groupMemoryDir 都没配）',
};
/**
 * 判定一个聊天能有哪些能力。判定顺序（不可调换，T11 的 grant 会插在 deny 之后）：
 * 1. `capabilitiesDeny` 命中 → 关（主人私聊也关）；
 * 2. 运行时依赖不满足 → 关；
 * 3.（T11：按角色的 grant 命中 → 开，优先于下面的默认位）；
 * 4. 管理员私聊 → 开；
 * 5. 群聊 → `groupDefault`；
 * 6. 非管理员私聊 → `memberDefault`。
 */
export function resolveCapabilities(input) {
    const deny = new Set((input.config.capabilitiesDeny ?? []).map(id => (typeof id === 'string' ? id.trim() : '')));
    const available = new Set(input.deps);
    const { chat } = input;
    const enabled = new Set();
    const reasons = new Map();
    for (const capability of CAPABILITIES) {
        // 1. 全局关闭优先——即使依赖齐全、即使是主人私聊。
        if (deny.has(capability.id)) {
            reasons.set(capability.id, '已在 capabilitiesDeny 里关闭');
            continue;
        }
        // 2. 依赖不满足：能力没有实现，开了也没用（例如表情包库目录没填）。
        const missing = (capability.deps ?? []).find(dep => !available.has(dep));
        if (missing !== undefined) {
            reasons.set(capability.id, DEPENDENCY_REASON[missing]);
            continue;
        }
        // 3（留给 T11 的 grant：命中则直接开启，不再看默认位）。
        // 4–6. 按会话类型与角色默认位判定。
        const open = chat.adminPrivate
            ? true
            : chat.kind === 'group'
                ? capability.groupDefault
                : capability.memberDefault;
        if (open)
            enabled.add(capability.id);
        reasons.set(capability.id, chat.adminPrivate
            ? '管理员私聊默认开启'
            : chat.kind === 'group'
                ? (capability.groupDefault ? '群聊默认开启' : '群聊默认关闭')
                : (capability.memberDefault ? '非管理员私聊默认开启' : '非管理员私聊默认关闭'));
    }
    const tools = [];
    for (const capability of CAPABILITIES) {
        if (!enabled.has(capability.id))
            continue;
        tools.push(...capability.tools);
    }
    return {
        enabled,
        tools,
        why(id) {
            return reasons.get(id) ?? '未知能力 id';
        },
    };
}
/** 把一次判定压成摘要。 */
export function summarizeCapabilities(result) {
    const disabled = [];
    for (const capability of CAPABILITIES) {
        if (result.enabled.has(capability.id))
            continue;
        disabled.push({ id: capability.id, title: capability.title, reason: result.why(capability.id) });
    }
    return { enabled: CAPABILITIES.length - disabled.length, total: CAPABILITIES.length, disabled };
}
/** /doctor 那一行的正文（没有关闭项时只报「已开 N / 共 M」）。 */
export function formatCapabilityLine(summary) {
    const head = '能力：已开 ' + summary.enabled + ' / 共 ' + summary.total;
    if (summary.disabled.length === 0)
        return head;
    return head + '；关闭的：' + summary.disabled.map(item => item.id + '（' + item.reason + '）').join('、');
}
