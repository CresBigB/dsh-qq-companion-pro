import { RELATIONS, RELATION_NAMES } from './relation.js';
/**
 * 全部能力（顺序即工具清单顺序）。
 *
 * 默认位的来历见文件头：改造前的 11 项全为 true（零行为变化的等价表达），
 * T12 新增的三个隐私能力（群列表 / 好友列表 / 私聊历史）两个默认位都是 false，
 * T13 的两个群管理写操作同样是 false（`ownerDefault` 省略 = 主人私聊仍开），
 * 管理员私聊对全部能力默认授权（仍受 deny、依赖与执行守卫限制）。
 */
export const CAPABILITIES = [
    {
        id: 'qq.send.image',
        title: '发图片',
        tools: ['qq_send_image', 'qq_gif_frames'],
        // T32：查看动图与发图同一档——都只是「把图拿到眼前」，不改 QQ 上任何东西。
        // 抽帧拼图本身不发送，只有显式 send 才会发出去（同一条出站管线）。
        describe: '向 QQ 会话发送本地文件或链接图片（一次最多 9 张）；以及把动图抽帧拼成一张静态图看清楚它怎么动。',
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
        id: 'qq.voice.tts',
        title: '语音念出来',
        tools: ['qq_send_tts'],
        describe: '把一句短话用语音念出来，发在当前会话里（音色与引擎由主人配置；引擎不可用时这个工具不会出现）。',
        deps: ['tts'],
        memberDefault: false,
        groupDefault: false,
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
        describe: '改表情包的标签、描述，或把表情包删掉（只在和主人私聊时能改能删，群里做不了）。',
        deps: ['stickerLib'],
        memberDefault: true,
        groupDefault: true,
    },
    // ---- T12 · 隐私类查询（默认关：群友一句「列一下你的好友」就能把主人的社交关系发到群里）
    {
        id: 'qq.list.groups',
        title: '群列表 / 群资料',
        tools: ['qq_list_groups', 'qq_group_info'],
        describe: '列出自己所在的群、查某个群的资料（成员数、群主、公告摘要）。这是主人账号的群关系，属于隐私数据：默认只在主人私聊里可用，需要时由主人按关系显式授权。',
        memberDefault: false,
        groupDefault: false,
    },
    {
        id: 'qq.list.friends',
        title: '好友列表',
        tools: ['qq_list_friends'],
        describe: '列出自己 QQ 上的好友（QQ 号、昵称、备注）。这是主人的社交关系，属于隐私数据：默认只在主人私聊里可用，需要时由主人按关系显式授权。',
        memberDefault: false,
        groupDefault: false,
    },
    {
        id: 'qq.history.private',
        title: '私聊历史',
        tools: ['qq_private_history'],
        describe: '拉取自己与某个好友的私聊历史（只取文本与发送者）。这是主人账号的私聊记录，属于隐私数据：默认只在主人私聊里可用，工具本身也只在管理员私聊里放行。',
        memberDefault: false,
        groupDefault: false,
    },
    // ---- T13 · 群管理写操作（会真的改变群状态；默认关，且只由主人本人发起的回合执行）
    {
        id: 'qq.group.manage',
        title: '群管理（禁言/群名片）',
        tools: ['qq_group_ban', 'qq_group_card'],
        describe: '写操作，会真的改变群状态：禁言或解除禁言（某个成员或全体）、改群成员的群名片。默认关闭；即使按关系开启，也只有主人本人发起的这一回合能真的执行，群里其他人要求一律拒绝。',
        memberDefault: false,
        groupDefault: false,
    },
    {
        id: 'qq.group.notice',
        title: '群公告与精华',
        tools: ['qq_group_announce', 'qq_group_essence'],
        describe: '写操作，会真的改变群状态：发布或修改群公告（群里所有人都能看到）、把一条消息设为精华或取消精华。默认关闭；即使按关系开启，也只有主人本人发起的这一回合能真的执行。',
        memberDefault: false,
        groupDefault: false,
    },
    // ---- 轻互动：管理员私聊默认授权，非主人默认仅开放表情回应。
    // 戳与点赞仍受执行体中的会话绑定与回合主人守卫约束。
    {
        id: 'qq.interact.react',
        title: '表情回应',
        tools: ['qq_emoji_react'],
        describe: '给当前聊天里的一条消息贴一个 QQ 表情回应（不动消息本身、不发言）。',
        memberDefault: true,
        groupDefault: true,
        ownerDefault: true,
    },
    {
        id: 'qq.interact.poke',
        title: '戳一戳',
        tools: ['qq_poke'],
        describe: '戳一戳当前聊天里的人：私聊里只能戳正在和她说这个话的那个人，群里只能戳这个群的成员（参数里没有聊天 id，做不到跨聊天）。默认关闭（非管理员私聊与群聊默认关闭，管理员私聊默认授权）；即使按关系开启，也只有主人本人发起的这一回合能真的戳。',
        memberDefault: false,
        groupDefault: false,
    },
    {
        id: 'qq.interact.like',
        title: '点赞',
        tools: ['qq_send_like'],
        describe: '给正在私聊的对方点名片赞（一次 1-10 个，只能点当前私聊的对方；群聊里没有唯一目标所以不可用）。默认关闭（非管理员私聊与群聊默认关闭，管理员私聊默认授权）；即使按关系开启，也只有主人本人发起的这一回合能真的点。',
        memberDefault: false,
        groupDefault: false,
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
/** 一个能力 id 列表里认不出的 id（启动自检告警用；capabilitiesDeny、四个按关系
 *  的 deny 与四个 grant 共用这一份校验；每项只报一次，保持出现顺序）。 */
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
/**
 * 默认关闭的能力（`memberDefault` / `groupDefault` / `ownerDefault` 里有 false）
 * 的中文名清单。
 *
 * 存在理由：四个 grant 的描述（`src/config.ts`）与设置页 hint（`src/client/fields.ts`）
 * 都要回答「默认关闭的是哪些」。这句话以前是手写的（「三个隐私能力和两个群管理写
 * 操作」），T14 一加戳 / 点赞就过时了，而配置 prose 过时没人会被测试拦下来——所以
 * 改成由注册表生成，加能力时这份清单自动跟上。
 *
 * 三个默认位任一为 false 就算：只关主人私聊的能力同样属于「默认关闭」。
 *
 * 只列 `title`、不含能力 id：id 由 {@link capabilityCatalogText} 独占（设置页那张
 * 测试钉住「id 只能出现在清单里」）。
 */
export function defaultOffCapabilityTitles() {
    return CAPABILITIES
        .filter(capability => !capability.memberDefault || !capability.groupDefault || capability.ownerDefault === false)
        .map(capability => capability.title);
}
/**
 * 四个 grant 的描述 / hint 里那句「默认关闭的是哪些」的完整句子（注册表生成）。
 *
 * 配置描述（`src/config.ts`）与设置页 hint（`src/client/fields.ts`）共用这一句：
 * 两处各手写一遍，正是它们上次一起过时的原因。
 */
export function defaultOffNoteText() {
    return '默认关闭的是' + defaultOffCapabilityTitles().join('、')
        + '（即使按关系开了，其中会真的改动外部状态的也只有主人本人发起的回合能真的执行）';
}
/** 依赖不满足时给 /doctor 与概览看的中文原因。 */
const DEPENDENCY_REASON = {
    stickerLib: '表情包库未开启（stickerDir 为空）',
    memoryNote: '没有可写的记忆文件（publicMemoryFile 与 groupMemoryDir 都没配）',
    tts: '语音合成没开，或引擎用不了（ttsEnabled 为 false、ttsCommand 为空、找不到该程序，或 sherpa-onnx 与 VITS 模型没装好）',
};
/** 四个 grant 命中时的中文原因（点出配置键名，改了配置一眼能对上）。 */
const GRANT_REASONS = {
    ownerGrant: '主人 grant（ownerGrant）已开放',
    friendGrant: '好友 grant（friendGrant）已开放',
    memberGrant: '群聊 grant（memberGrant）已开放',
    strangerGrant: '陌生人 grant（strangerGrant）已开放',
};
/** 四个按关系的 deny 命中时的中文原因。 */
const RELATION_DENY_REASONS = {
    ownerDeny: '主人关系 deny（ownerDeny）已关闭',
    friendDeny: '好友关系 deny（friendDeny）已关闭',
    memberDeny: '群聊关系 deny（memberDeny）已关闭',
    strangerDeny: '陌生人关系 deny（strangerDeny）已关闭',
};
/**
 * 把会话视角归一成一个关系：**relation 优先**（生产代码都走这条）；只有老调用点
 * 只给了 adminPrivate 时才由它推导——`adminPrivate === true` 即管理员私聊。
 * @param chat - 会话视角。
 * @returns 关系档。
 */
export function chatRelationOf(chat) {
    if (chat.relation !== undefined)
        return chat.relation;
    if (chat.adminPrivate === true)
        return 'owner';
    return chat.kind === 'group' ? 'groupMember' : 'stranger';
}
/** 一个关系档的代表会话视角（群友档用群聊视角，其余用私聊视角；/doctor 与概览按它算）。 */
export function chatViewOf(relation) {
    return relation === 'groupMember' ? { kind: 'group', relation } : { kind: 'private', relation };
}
/**
 * 一个关系档在「按关系的配置键」上的槽位：群聊恒走群聊键，好友 / 陌生私聊各走
 * 自己的键；主人私聊走 `owner` 键。
 *
 * grant 与 deny 共用这一套分档，于是「哪些人算哪一档」只有一处定义：改档位归属
 * 不会只改一半。
 * @param chat - 会话视角。
 * @param relation - 归一后的关系档。
 * @param keys - 各关系槽位对应的配置键（`owner` 可选，未提供时无槽位）。
 * @returns 该视角的键；null = 这个视角没有这个槽位。
 */
function relationSlotKey(chat, relation, keys) {
    if (chat.kind === 'group')
        return keys.groupMember;
    if (relation === 'owner')
        return keys.owner ?? null;
    if (relation === 'friend')
        return keys.friend;
    if (relation === 'stranger')
        return keys.stranger;
    return null;
}
/**
 * 这个会话视角该看哪个 grant。
 *
 * 群聊恒看 `memberGrant`：会话级注册看不到具体发言人，群里主人发言也算群友档。
 * 主人私聊看兼容的 `ownerGrant`；主人以外私聊按关系分好友 / 陌生人两个 grant。
 * @param chat - 会话视角。
 * @param relation - 归一后的关系档。
 * @returns 要看的 grant 键；null = 这个视角没有 grant。
 */
function grantKeyOf(chat, relation) {
    return relationSlotKey(chat, relation, {
        owner: 'ownerGrant',
        friend: 'friendGrant',
        groupMember: 'memberGrant',
        stranger: 'strangerGrant',
    });
}
/**
 * 这个会话视角该看哪个按关系的 deny（T11 r1）。
 *
 * 与 {@link grantKeyOf} **同一套分档**（群聊 → memberDeny，好友私聊 → friendDeny，
 * 陌生人私聊 → strangerDeny，主人私聊 → ownerDeny）。
 * @param chat - 会话视角。
 * @param relation - 归一后的关系档。
 * @returns 要看的 deny 键；null = 这个视角没有按关系的 deny。
 */
function denyKeyOf(chat, relation) {
    return relationSlotKey(chat, relation, { owner: 'ownerDeny', friend: 'friendDeny', groupMember: 'memberDeny', stranger: 'strangerDeny' });
}
/** 把一份 id 列表读成集合（裁空白；空串丢弃）。 */
function idSet(ids) {
    const out = new Set();
    for (const raw of ids ?? []) {
        const id = typeof raw === 'string' ? raw.trim() : '';
        if (id !== '')
            out.add(id);
    }
    return out;
}
/**
 * **一个**能力的判定——五步顺序就写在这里（**不可调换**，测试逐条钉住）：
 * 1. `capabilitiesDeny` 命中 → 关（全局，最高优先；grant 也绕不过它）；
 * 2. 运行时依赖不满足 → 关（能力没实现，开了也没用；grant 写了也开不了）；
 * 3. **按关系的 deny 命中 → 关**（T11 r1，新增；why 点出是哪个键关的，例如
 *    「群聊关系 deny（memberDeny）已关闭」）——比 grant 硬，比全局 deny 软；
 * 4. 按关系的 grant 命中 → 开（优先于下面的默认位；**包括**主人私聊的 `ownerGrant`）；
 * 5. 默认位：主人私聊 → `ownerDefault`（省略 = true）；群聊 → `groupDefault`；
 *    其他私聊 → `memberDefault`。
 *
 * 也就是说「关」的三个来源优先级递减：全局 deny > 依赖缺失 > 按关系 deny；
 * 任何来源的「关」都压过 grant。
 * @param input - 判定上下文。
 * @returns 开着 / 关着与原因。
 */
export function decideCapability(input) {
    const { capability, deny, available, relationDeny, grant, chat, relation } = input;
    // 1. 全局关闭优先——即使依赖齐全、即使是主人私聊、即使写了 grant。
    if (deny.has(capability.id))
        return { open: false, reason: '已在 capabilitiesDeny 里关闭' };
    // 2. 依赖不满足：能力没有实现，开了也没用（例如表情包库目录没填）。
    const missing = (capability.deps ?? []).find(dep => !available.has(dep));
    if (missing !== undefined)
        return { open: false, reason: DEPENDENCY_REASON[missing] };
    // 3. 按关系的 deny 命中 → 关，不再看 grant 与默认位（deny 优先于 grant）。
    if (relationDeny !== undefined && relationDeny !== null && relationDeny.ids.has(capability.id)) {
        return { open: false, reason: RELATION_DENY_REASONS[relationDeny.key] };
    }
    // 4. 按关系的 grant 命中 → 开，不再看默认位。
    if (grant !== null && grant.ids.has(capability.id))
        return { open: true, reason: GRANT_REASONS[grant.key] };
    // 5. 按会话类型与关系档的默认位判定。
    if (chat.kind === 'group') {
        return capability.groupDefault
            ? { open: true, reason: '群聊默认开启' }
            : { open: false, reason: '群聊默认关闭' };
    }
    if (relation === 'owner') {
        // 当前注册表中管理员默认全部授权；ownerGrant 保留兼容，deny 与依赖优先。
        return (capability.ownerDefault ?? true)
            ? { open: true, reason: '管理员私聊默认开启' }
            : { open: false, reason: '管理员私聊默认关闭' };
    }
    return capability.memberDefault
        ? { open: true, reason: '非管理员私聊默认开启' }
        : { open: false, reason: '非管理员私聊默认关闭' };
}
/**
 * 判定一个聊天能有哪些能力。
 *
 * 判定顺序见 {@link decideCapability}（全局 deny → 依赖 → 按关系 deny → 按关系
 * grant → 默认位）：群的 deny / grant 只用 `memberDeny` / `memberGrant`——会话级
 * 注册看不到具体发言人。
 */
export function resolveCapabilities(input) {
    const deny = idSet(input.config.capabilitiesDeny);
    const available = new Set(input.deps);
    const { chat } = input;
    const relation = chatRelationOf(chat);
    const denyKey = denyKeyOf(chat, relation);
    const relationDeny = denyKey === null ? null : { key: denyKey, ids: idSet(input.config[denyKey]) };
    const grantKey = grantKeyOf(chat, relation);
    const grant = grantKey === null ? null : { key: grantKey, ids: idSet(input.config[grantKey]) };
    const enabled = new Set();
    const reasons = new Map();
    for (const capability of CAPABILITIES) {
        const decision = decideCapability({ capability, deny, available, relationDeny, grant, chat, relation });
        if (decision.open)
            enabled.add(capability.id);
        reasons.set(capability.id, decision.reason);
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
/** 四个关系各自的已开数（每个关系用 {@link chatViewOf} 的代表会话视角各算一遍）。 */
function countByRelation(config, deps) {
    const out = {};
    for (const relation of RELATIONS) {
        out[relation] = resolveCapabilities({ config, deps, chat: chatViewOf(relation) }).enabled.size;
    }
    return out;
}
/**
 * 把一份配置（+ 当前进程的依赖）压成摘要。
 *
 * `enabled` / `disabled` 取**主人私聊视角**——主人的私聊是权限最高的一类会话，
 * 缺什么就是全局 deny、ownerDeny 或运行时依赖关闭了什么。
 * `byRelation` 另外给出四个关系各自的已开数（T11），供 /doctor 与设置页概览展示
 * 差异：`memberDeny` 写一项，群友数少 1、其余三个不变。
 */
export function summarizeCapabilities(input) {
    const deps = [...input.deps];
    const owner = resolveCapabilities({ config: input.config, deps, chat: chatViewOf('owner') });
    const disabled = [];
    for (const capability of CAPABILITIES) {
        if (owner.enabled.has(capability.id))
            continue;
        disabled.push({ id: capability.id, title: capability.title, reason: owner.why(capability.id) });
    }
    return {
        enabled: CAPABILITIES.length - disabled.length,
        total: CAPABILITIES.length,
        disabled,
        byRelation: countByRelation(input.config, deps),
    };
}
/** 已开数 → 文案（缺数按 0：老快照 / 手搓的摘要不会把 /doctor 打出 undefined）。 */
function countText(value) {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? String(value) : '0';
}
/** /doctor 那一行的正文：四个关系各自的已开数 + 总数；有关闭项时另附原因。 */
export function formatCapabilityLine(summary) {
    const counts = RELATIONS
        .map(relation => RELATION_NAMES[relation] + ' ' + countText(summary.byRelation?.[relation]))
        .join(' / ');
    const head = '能力：' + counts + '（共 ' + summary.total + '）';
    if (summary.disabled.length === 0)
        return head;
    return head + '；关闭的：' + summary.disabled.map(item => item.id + '（' + item.reason + '）').join('、');
}
/** 群管理写操作的两个能力（/doctor 提示行只关心这两项，顺序即能力注册表顺序）。 */
export const GROUP_WRITE_CAPABILITY_IDS = ['qq.group.manage', 'qq.group.notice'];
/** 提示行里给每个写操作能力配的一句短说明。 */
const GROUP_WRITE_LABELS = {
    'qq.group.manage': '禁言/群名片',
    'qq.group.notice': '公告/精华',
};
/**
 * /doctor 的群管理提示行（T13）。
 *
 * 判据：这两个能力里**只要有任意一个在非主人档（好友 / 群友 / 陌生人）真的开着**，
 * 就出一句警告。为什么不算主人私聊那一档：这两个能力的 `ownerDefault` 省略 = true，
 * 若把主人也算进来，这句提示会在任何配置下都出现（包括刚装好、什么都没授权的时候），
 * 提示就废了。
 * 也就是说「全关」（默认配置 / 只写在 capabilitiesDeny 里关掉）时这里返回空串，
 * /doctor 不出这一行。
 * @param input - 配置 + 当前进程具备的运行时依赖。
 * @returns 一行提示；空串 = 不提。
 */
export function groupWriteWarningLine(input) {
    const deps = [...input.deps];
    const open = [];
    for (const relation of ['friend', 'groupMember', 'stranger']) {
        const resolved = resolveCapabilities({ config: input.config, deps, chat: chatViewOf(relation) });
        for (const id of GROUP_WRITE_CAPABILITY_IDS) {
            if (resolved.enabled.has(id) && !open.includes(id))
                open.push(id);
        }
    }
    if (open.length === 0)
        return '';
    const list = open.map(id => id + '（' + GROUP_WRITE_LABELS[id] + '）').join('、');
    return '⚠ 群管理写操作已开启：' + list + '——群友要求时也会被拒，但请确认这是你要的';
}
/** 轻互动里两个默认关的能力（T14；/doctor 提示行只关心这两项）。 */
export const INTERACTION_CAPABILITY_IDS = ['qq.interact.poke', 'qq.interact.like'];
/** 提示行里给每个互动能力配的一句短说明。 */
const INTERACTION_LABELS = {
    'qq.interact.poke': '戳一戳',
    'qq.interact.like': '点赞',
};
/**
 * /doctor 的轻互动提示行（T14）。
 *
 * 判据与 {@link groupWriteWarningLine} 相同：这两个能力里**只要有任意一个在非主人档
 * （好友 / 群友 / 陌生人）真的开着**就出一句警告。不算主人私聊那一档的理由也一样
 * ——管理员私聊默认授权，但「主人自己要用」不该被当成事故，所以这一档不进警告。
 *
 * 为什么值得提示：戳与点赞会真的在对方（或群里某个人）的账号上留痕。第二道闸
 * （只有主人本人的回合才会真的执行）挡的是「群友让她戳人」，挡不住「主人自己
 * 在群里说了句『戳一下他』」——那是主人的意思，不是事故，所以这里只提示、不阻止。
 * @param input - 配置 + 当前进程具备的运行时依赖。
 * @returns 一行提示；空串 = 不提。
 */
export function interactionWarningLine(input) {
    const deps = [...input.deps];
    const open = [];
    for (const relation of ['friend', 'groupMember', 'stranger']) {
        const resolved = resolveCapabilities({ config: input.config, deps, chat: chatViewOf(relation) });
        for (const id of INTERACTION_CAPABILITY_IDS) {
            if (resolved.enabled.has(id) && !open.includes(id))
                open.push(id);
        }
    }
    if (open.length === 0)
        return '';
    const list = open.map(id => id + '（' + INTERACTION_LABELS[id] + '）').join('、');
    return '⚠ 戳一戳 / 点赞已对非主人会话开启：' + list + '——只有主人本人的回合会真的执行，其余一律拒绝，但请确认这是你要的';
}
