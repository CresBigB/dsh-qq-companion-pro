/**
 * Plugin configuration: the typed shape, the schemastery schema (defaults and
 * descriptions shown in the host's settings), default paths, renamed-key
 * fallbacks, and the access policy derived from config + environment.
 * @module dsh-qq-companion/config
 */
import { homedir } from 'node:os';
import { join } from 'node:path';
import z from '@deepseek-ai/schemastery';
import { capabilityCatalogText, defaultOffNoteText } from './capabilities.js';
import { IMAGE_MAX_BYTES, MEDIA_MAX_BYTES, VOICE_MAX_BYTES } from './media.js';
import { DEFAULT_TTS_MAX_CHARS } from './tts.js';
const ENV = (name) => process.env[name] ?? '';
/** Default media dir: <dsh-home>/media/onebot (dsh-home = $DSH_HOME or ~/.dsh). */
export function defaultMediaDir() {
    // os.homedir() reads $HOME first and falls back to the passwd entry — the
    // systemd service runs without HOME, so `?? '/tmp'` used to resolve to
    // /tmp/.dsh and preset enumeration hit ENOENT (web log line 14429).
    const home = ENV('DSH_HOME') !== '' ? ENV('DSH_HOME') : join(homedir() || '/tmp', '.dsh');
    return join(home, 'media', 'onebot');
}
/** The dsh data home ($DSH_HOME or ~/.dsh); source of the .agent-presets dir. */
export function dshHome() {
    return ENV('DSH_HOME') !== '' ? ENV('DSH_HOME') : join(homedir() || '/tmp', '.dsh');
}
/** schema defaults for the renamed fields (referenced by the deprecated-name fallback). */
const INBOUND_IMAGE_MAX_PX = 2048;
const OUTBOUND_IMAGE_MAX_BYTES = IMAGE_MAX_BYTES;
const INBOUND_FILE_MAX_BYTES = 20 * 1024 * 1024;
/**
 * 四个 grant 描述里共用的那半句「默认关闭的是哪些」。
 *
 * 由注册表生成（{@link defaultOffCapabilityTitles}），不是手写：T14 加了戳一戳 /
 * 点赞两个默认关的能力，手写的那句「三个隐私能力和两个群管理写操作」当场就过时，
 * 而配置描述过时不会有任何测试拦下来。
 */
const DEFAULT_OFF_NOTE = defaultOffNoteText();
export const Config = z.object({
    host: z.string().default('127.0.0.1')
        .description('reverse 模式监听地址；跨机部署（NapCat 从其他机器拨入）需显式改为 0.0.0.0'),
    port: z.number().default(8643)
        .description('reverse 模式监听端口'),
    accessToken: z.string().role('secret').default('')
        .description('OneBot access_token（reverse 校验 / forward 发送 Authorization: Bearer）'),
    botQQ: z.string().default('')
        .description('机器人自身 QQ 号；留空则从 meta 事件自动学习'),
    requireMention: z.boolean().default(true)
        .description('群聊是否仅在 @机器人（或回复其消息）时响应'),
    groupTriggerPolicy: z.string().default('{}')
        .description('普通群消息触发策略 JSON；默认 {} 保持既有 requireMention 行为。可填 replyMode=all|related|probability|off、probability=0..1、mentionRequired/replyWithoutMention、botName/botNames/aliases/botAliases/keywords，以及 groups/users 按群号/QQ号覆盖；旧字段名 proactiveEnabled 仍可用但会提示改名；坏 JSON 自动降级为默认行为'),
    unknownCommand: z.union([z.const('intercept'), z.const('passthrough')]).default('intercept')
        .description('未知斜杠命令处理：intercept（默认）=拦截并提示相近命令或 /help；passthrough=透传给模型（旧行为）'),
    sideAskEnabled: z.boolean().default(false)
        .description('任务运行中的新消息是否自动交给独立旁问回答（BTW 式侧道，无指令、主任务不被打断，回答作为另一条消息发回）；默认关闭，不改变现有行为'),
    sideAskConcurrency: z.number().min(1).max(8).default(2)
        .description('每个 QQ 聊天各自的旁问同时运行上限（1–8）；同一个聊天占满时新消息退回排队/插话，不同聊天互不占用'),
    sideAskMaxChars: z.number().min(1).max(8000).default(8000)
        .description('单条消息能进入旁问的最大字符数（1–8000）；超出的按普通排队处理'),
    sideAskContextChars: z.number().min(0).max(20000).default(4000)
        .description('旁问子级能看到的主会话背景字符数（0–20000，默认 4000；0=不带背景，只回答这一条）'),
    newMessagePolicy: z.union([z.const('queue'), z.const('steer')]).default('queue')
        .description('任务运行中的新消息处理策略：queue（默认）=排队——新消息在当前任务结束后按序处理为后续回合，等待期间不发任何提示；steer=插话——运行中收到的新普通纯文字消息作为补充指令加入当前任务（模型在下一步读取）并回复提交提示；图片/文件/语音/带引用消息与带关系绸标的非管理员消息两种模式下都按排队处理，/steer 命令两种模式下均可用'),
    autoSteerPolicy: z.union([z.const('admin'), z.const('all')]).default('admin')
        .description('steer 模式下自动插话的发送者资格：admin（默认）=仅管理员可自动插话；all=所有非受限发送者均可。不具备资格的消息按排队处理；/steer 命令始终仅管理员、不受本项影响；queue 模式行为不变'),
    taskEveryRounds: z.number().min(1).default(1)
        .description('长任务（/task <目标>）自动轮次的回传节奏：每 N 轮回传一次当轮最终文字（N=1 逐轮都回传，默认；N≥2 = 每 N 轮 + 预算最后一轮）；中途轮次不回传文字、只更新进度，预算最后一轮与暂停/恢复/阻塞/完成通知始终照发；插件不汇总、不总结，回传的是当轮真实文字'),
    deferredTimeoutMs: z.number().default(600_000)
        .description('等待模型回复超时阈值（毫秒超时补发）：回合超过该时长没有任何模型输出时提示超时并登记补发跟踪，任务完成后向原聊天自动补发最终文字（走既有出站管线）；发送明确失败最多尝试 3 次（退避），结果不确定时保留记录停止自动重试；/stop 终止该聊天的补发跟踪；0=关闭超时补发'),
    dmPolicy: z.union([z.const('open'), z.const('allowlist'), z.const('disabled')]).default('open')
        .description('私聊策略：open=仅管理员（allowAllUsers 打开则所有人都能私聊）；allowlist=仅 allowFrom；disabled=拒绝所有私聊'),
    groupPolicy: z.union([z.const('open'), z.const('allowlist'), z.const('disabled')]).default('open')
        .description('群聊策略：open=所有群；allowlist=仅 groupAllowFrom；disabled=拒绝所有群'),
    allowFrom: z.array(z.string()).default([])
        .description('dmPolicy=allowlist 时允许私聊的 QQ 号'),
    groupAllowFrom: z.array(z.string()).default([])
        .description('groupPolicy=allowlist 时允许的群号'),
    adminUsers: z.array(z.string()).default([])
        .description('管理员 QQ 号（也可用环境变量 ONEBOT_ALLOWED_USERS 逗号分隔指定）'),
    allowAllUsers: z.boolean().default(false)
        .description('放行所有用户（仅开发用；也可用 ONEBOT_ALLOW_ALL_USERS=true）'),
    autoAcceptAdminRequests: z.boolean().default(false)
        .description('管理员发来的好友申请和进群邀请自动同意（其他人的一律不同意，并私聊告诉管理员）'),
    ownerTitle: z.string().default('管理员')
        .description('机器人在系统提示和通知里对管理员的称呼，例如「主人」'),
    friendUsers: z.array(z.string()).default([])
        .description('好友名单（QQ 号，每行一个）：比群友亲近，但不等同于主人'),
    memberObedience: z.percent().default(0.2)
        .description('非主人（群友 / 陌生人）的服从度：0 = 完全不听，1 = 基本都听。只管“要求要不要照做、拒绝时怎么解释”，不管听不听话；不管多少都不许骂人'),
    friendObedience: z.percent().default(0.5)
        .description('好友的服从度：0 = 完全不听，1 = 基本都听。只管“要求要不要照做、拒绝时怎么解释”，不管听不听话；不管多少都不许骂人'),
    friendIntimacy: z.percent().default(0.6)
        .description('好友的亲密度（影响称呼与语气亲近程度，0.6 = 比群友亲近但不越界）'),
    autoAllowInvitedGroups: z.boolean().default(false)
        .description('管理员拉机器人进的群自动加入群白名单（运行期白名单，保存在 mediaDir/group-allowlist.json）'),
    ignoreSelf: z.boolean().default(true)
        .description('忽略机器人自己发出的消息（防自循环）'),
    interimMessages: z.boolean().default(true)
        .description('是否把模型每步（含工具调用之间的中间回复）的文本立即发出；false 则只发最终回复。true 时：中间消息实时可见、每条在 interimRecallMs 后自动单独撤回、回合结束先发一张整轮 t2i 小结卡再发最终回复'),
    interimRecallMs: z.number().default(90_000)
        .description('中间消息各自发送完成后多久自动单独撤回（毫秒；QQ 撤回时限约 2 分钟，建议 ≤110000）'),
    interimRecall: z.boolean().default(true)
        .description('中间消息撤回开关：true（默认）=每条中间消息在 interimRecallMs 后自动撤回，回合结束先发整轮 t2i 小结卡再立即撤回原消息；false=只发不撤——中间消息照常实时发出但保留在聊天里：不排自动撤回定时器、回合结束不发小结卡也不撤回原消息，只发最终回复'),
    sendErrorNotice: z.boolean().default(true)
        .description('一轮运行出错时向用户发送 ⚠️ 错误提示'),
    rateLimitPerMinute: z.number().default(30)
        .description('每 chat 每分钟允许的普通消息条数上限（60 秒滑动窗口）；命令消息不计入也不受限；超限时每窗口最多提示一次；0=禁用频控'),
    restrictedMemberPrefix: z.boolean().default(true)
        .description('群聊与非管理员私聊的消息前加一条关系绸标（形如 [关系:群友｜语气中性｜服从0.2｜亲密0.2｜不可指挥]，写明关系 / 语气 / 服从度 / 亲密 / 能否指挥；软限制）'),
    sensitivePatterns: z.array(z.string()).default([])
        .description('出站敏感内容审计正则（默认内置 rm -rf/关机/删库/密钥 等模式；留空用默认）'),
    mediaDir: z.string().default('')
        .description('入站媒体与映射文件目录；留空默认 <dsh-home>/media/onebot'),
    tempTtlHours: z.number().default(6)
        .description('入站临时媒体文件保留时长（小时），到期自动清理'),
    outboundImageMaxBytes: z.number().default(OUTBOUND_IMAGE_MAX_BYTES)
        .description('出站图片大小上限（字节）'),
    maxImageBytes: z.number().deprecated()
        .description('[deprecated] 旧名别名（现 outboundImageMaxBytes）：出站图片大小上限（字节）；本版兼容读取，新配置请用新名'),
    inboundImageMaxPx: z.number().default(INBOUND_IMAGE_MAX_PX)
        .description('入站图片长边上限（像素）；超过则等比压缩后交给视觉模型，<=0 禁用'),
    imageMaxSize: z.number().deprecated()
        .description('[deprecated] 旧名别名（现 inboundImageMaxPx）：入站图片长边上限（像素）；本版兼容读取，新配置请用新名'),
    maxVoiceBytes: z.number().default(VOICE_MAX_BYTES)
        .description('出站语音大小上限（字节）'),
    maxFileBytes: z.number().default(MEDIA_MAX_BYTES)
        .description('出站视频/文件大小上限（字节）'),
    sttEnabled: z.boolean().default(false)
        .description('收到语音时转成文字给她看（本机离线识别，需要 ffmpeg 和一个识别引擎；没装或失败时她只看到 [语音]）'),
    sttEngine: z.union([z.const('auto'), z.const('sherpa-onnx'), z.const('whisper-cpp'), z.const('command'), z.const('openai'), z.const('custom')]).default('auto')
        .description('识别引擎：sherpa-onnx = sherpa-onnx-offline + SenseVoice 模型（中文好、CPU 快，推荐）；whisper-cpp = whisper-cli + ggml 模型；command = 自定义命令（stdout 输出文字）；auto = 按 sherpa-onnx、whisper-cpp 的顺序找能用的。旧名 custom = command，openai = auto'),
    sttCommand: z.string().default('')
        .description('command 引擎的程序名或路径'),
    sttArgs: z.array(z.string()).default([])
        .description('command 引擎的参数模板：{wav}（16kHz 单声道 WAV）、{input}（原文件）、{model}、{lang} 会被替换；留空 = 只传 {wav}'),
    sttModel: z.string().default('')
        .description('sherpa-onnx：SenseVoice 模型目录（含 tokens.txt 和 model.int8.onnx）；whisper-cpp：模型名（如 small，找 ggml-small.bin）或 .bin 路径；留空用默认位置'),
    sttLanguage: z.string().default('auto')
        .description('语音的语言：auto 自动判断，或 zh / en / ja 等'),
    sttMaxSeconds: z.number().default(60)
        .description('只转写每条语音的前多少秒'),
    sttTimeoutMs: z.number().default(60_000)
        .description('单次转写超时（毫秒）；超时后她只看到 [语音]'),
    sttReplacements: z.dict(z.string()).default({})
        .description('转写纠错表：识别结果里的“左边”换成“右边”再交给她，用来纠正识别引擎不认识的名字，例如 { 大飞鱼: 大肥鱼 }；长的词优先，替换只做一遍'),
    ttsEnabled: z.boolean().default(false)
        .description('让她能把自己的话念出来发成语音（qq_send_tts 工具）；sherpa-onnx 引擎完全在本机离线跑，command 引擎联不联网取决于你配的那个工具。引擎用不了（程序或模型没找到）时这个工具根本不会出现'),
    ttsEngine: z.union([z.const('sherpa-onnx'), z.const('command')]).default('sherpa-onnx')
        .description('合成引擎：sherpa-onnx = sherpa-onnx-offline-tts + VITS 模型（中文好、CPU 快，推荐）；command = 任意命令行合成工具，按 ttsArgs 模板调用'),
    ttsCommand: z.string().default('')
        .description('command 引擎的程序名或路径（如 piper，或自己写的脚本）；找不到这个程序时 qq_send_tts 不会注册'),
    ttsArgs: z.array(z.string()).default([])
        .description('command 引擎的参数模板：{text}（要念的文字）、{output}（要写出的 WAV 路径）、{model}、{voice}、{lang} 会被替换；留空 = {output} {text}'),
    ttsModel: z.string().default('')
        .description('sherpa-onnx：VITS 模型目录（含 tokens.txt 和 model.onnx；中文模型另带 lexicon.txt，sherpa 会自动用上；dict/ 与 espeak-ng-data/ 不必准备，对应的 CLI 参数上游已废弃）；也可以直接填 .onnx 路径；留空在 ~/.cache/sherpa-onnx/tts 等默认位置找。模型从 https://github.com/k2-fsa/sherpa-onnx/releases/tag/tts-models 下，参数说明见 https://k2-fsa.github.io/sherpa/onnx/tts/pretrained_models/vits.html'),
    ttsVoice: z.string().default('')
        .description('音色：sherpa-onnx 是说话人编号（--sid，多说话人模型填 0/1/2…，单说话人留空）；command 引擎填进 {voice}'),
    ttsMaxChars: z.number().default(DEFAULT_TTS_MAX_CHARS)
        .description('一条语音最多念多少字（默认 200，最多 1000）：超过时工具直接报错让她精简，不会真的合成，免得一条语音念几分钟'),
    ttsTimeoutMs: z.number().default(60_000)
        .description('单次合成超时（毫秒）；超时就杀掉合成进程，这条语音不发'),
    textImageThreshold: z.number().default(150)
        .description('回复正文超过该长度（字符数）时渲染为文字图卡片发送；<=0 禁用卡片路径'),
    splitLines: z.boolean().default(false)
        .description('模型最终回复按行拆成多条消息发送（一句一条），中间按字数停顿模拟打字'),
    splitMaxMessages: z.number().default(6)
        .description('一条回复最多拆成几条；行数超过它（列表、代码等）就整段发送'),
    groupSplitLines: z.boolean().default(true)
        .description('群聊里也一句一条；false = 群里每次回复只发一条（发送量少很多，降低 QQ 风控概率）'),
    humanTypingPace: z.boolean().default(false)
        .description('防风控：所有发出的消息都按真人打字的速度排队（按字数等 typingDelayPerCharMs，夹在 typingDelayMinMs～typingDelayMaxMs 之间）；整个小号同一时间只“打”一条，几个会话同时回复时自然排队'),
    typingDelayPerCharMs: z.number().default(80)
        .description('拆分发送时每个字的打字停顿（毫秒）'),
    typingDelayMinMs: z.number().default(500)
        .description('两条消息之间最短停顿（毫秒）'),
    typingDelayMaxMs: z.number().default(2500)
        .description('两条消息之间最长停顿（毫秒）'),
    cardFooter: z.string().default('dsh')
        .description('文字图卡片页脚品牌文字（"Powered by <brand>"）'),
    fontFiles: z.array(z.string()).default([])
        .description('t2i 渲染器注册的字体文件路径（Linux/自定义字体；macOS 自动用系统字体）'),
    fontFamilies: z.array(z.string()).default([])
        .description('t2i 渲染器优先使用的字体家族名（覆盖平台默认）'),
    agentPreset: z.string().default('')
        .description('QQ 会话加入的 agent 预设 id；留空用部署默认（settings 的 agent-presets.default，当前为 router-flash）。创建时总是解析有效预设并写入会话 header，Web 界面可见；resume 优先恢复会话自己记录的预设'),
    adminPreset: z.string().default('')
        .description('管理员私聊默认使用的 agent preset（留空=同 agentPreset；/preset 覆盖优先）'),
    adminPermission: z.string().default('')
        .description('管理员私聊每个新会话自动切换的宿主权限预设，如 danger-full-access（留空=宿主默认）'),
    memberPermission: z.string().default('')
        .description('非管理员的私聊与所有群聊，每个新会话自动切换的宿主权限预设，建议 read-only（留空=宿主默认预设；如果宿主默认是完整权限，群友和陆生人也会拿到完整权限）。群聊里管理员发言也使用该群会话的权限（一个群只有一个会话）'),
    capabilitiesDeny: z.array(z.string()).default([])
        .description('全局关闭的能力 id 列表（主人私聊也关；留空 = 全部开启）。每项是一个能力，对应一组模型工具：' + capabilityCatalogText()),
    ownerDeny: z.array(z.string()).default([])
        .description('只关闭管理员私聊的能力 id；不影响好友、群聊或陌生人。优先于 ownerGrant，仍受全局 capabilitiesDeny 和运行时依赖限制。' + capabilityCatalogText()),
    friendDeny: z.array(z.string()).default([])
        .description('只不给好友（friendUsers 里的人）用的能力 id 列表——主人私聊、群聊、陌生私聊都照常（留空 = 不额外关）。capabilitiesDeny 是全局关，这里只针对这一档人；两边都写了以 capabilitiesDeny 为准。' + capabilityCatalogText()),
    memberDeny: z.array(z.string()).default([])
        .description('只不给群聊用的能力 id 列表——群聊只有一个会话，所以对所有群成员生效（群里主人发言也按群友档），好友 / 陌生人私聊与主人私聊都照常；留空 = 不额外关。capabilitiesDeny 是全局关，这里只针对这一档人；两边都写了以 capabilitiesDeny 为准。' + capabilityCatalogText()),
    strangerDeny: z.array(z.string()).default([])
        .description('只不给陌生人私聊（不在好友名单里的非管理员）用的能力 id 列表——主人私聊、好友私聊、群聊都照常；留空 = 不额外关。capabilitiesDeny 是全局关，这里只针对这一档人；两边都写了以 capabilitiesDeny 为准。' + capabilityCatalogText()),
    ownerGrant: z.array(z.string()).default([])
        .description('兼容旧配置的管理员私聊 grant；管理员现在默认拥有全部能力许可，无需重复添加。ownerDeny 可单独关闭管理员私聊；全局 capabilitiesDeny、运行时依赖与工具执行守卫仍然生效。' + capabilityCatalogText()),
    friendGrant: z.array(z.string()).default([])
        .description('额外给好友（friendUsers 里的人）开放的能力 id 列表——这是「默认关闭、单独给好友开」：默认位已开启的能力不需要写进来。' + DEFAULT_OFF_NOTE + '，要给好友开就写在这里。要把好友这一档单独关掉用 friendDeny；capabilitiesDeny 里的能力写在这里也仍然关闭；不知道填什么就看 /doctor。' + capabilityCatalogText()),
    memberGrant: z.array(z.string()).default([])
        .description('额外给群聊开放的能力 id 列表——群聊只有一个会话，所以对所有群成员生效（群里主人发言也按群友档）；这是「默认关闭、单独给群开」，默认位已开启的能力不需要写进来。' + DEFAULT_OFF_NOTE + '，要给群开就写在这里（群里一开，谁都能让模型把主人的群和好友念出来，谨慎）。要把群聊这一档单独关掉用 memberDeny；capabilitiesDeny 里的能力写在这里也仍然关闭；不知道填什么就看 /doctor。' + capabilityCatalogText()),
    strangerGrant: z.array(z.string()).default([])
        .description('额外给陌生人私聊（不在好友名单里的非管理员）开放的能力 id 列表——这是「默认关闭、单独给陌生人开」，默认位已开启的能力不需要写进来。' + DEFAULT_OFF_NOTE + '，要给陌生人开就写在这里（等于把主人的社交关系给不认识的人，谨慎）。要把陌生人这一档单独关掉用 strangerDeny；capabilitiesDeny 里的能力写在这里也仍然关闭；不知道填什么就看 /doctor。' + capabilityCatalogText()),
    adminWorkspacePath: z.string().default('')
        .description('管理员私聊的工作目录（私密记忆目录；留空=同 workspacePath）。管理员私聊设置后覆盖 workspacePath（这类会话用本目录）；群聊用 workspacePath，读不到这里的 AGENTS.md'),
    idleResetHours: z.number().default(0)
        .description('超过这么多小时没说话，下一条消息开新会话，并附上最后几句作交接（0=关闭）'),
    sessionTitleTemplate: z.string().default('{kind} {target} · {date}')
        .description('新建 QQ 会话（以及恢复时还没有标题的旧会话）自动命名的模板；可用 {kind} {target} {nickname} {date} {time}（例：QQ私聊 2824149798 · 10-23）。已有标题（比如在网页上手动改过）的会话不会被覆盖；留空 = 不自动命名'),
    publicMemoryFile: z.string().default('')
        .description('qq_memory_note 工具追加的公开记忆文件（留空=不提供该工具）'),
    scheduledPrompts: z.array(z.object({
        id: z.string().required(),
        time: z.string().required(),
        chatId: z.string().required(),
        prompt: z.string().required(),
        includeTodayLog: z.boolean().default(false),
        includeGroupLogs: z.boolean().default(false),
    })).default([])
        .description('每天定时投递给指定会话的任务（写日记等）；time 为本地 HH:MM'),
    publicMemoryMaxBytes: z.number().default(6 * 1024)
        .description('公开记忆文件达到这个大小（字节）后 qq_memory_note 不再追加'),
    privateMemoryMaxBytes: z.number().default(24 * 1024)
        .description('管理员私密记忆（adminWorkspacePath/AGENTS.md）的上限（字节），写进给她的功能说明里，由她自己整理'),
    groupMemoryDir: z.string().default('')
        .description('每个群一份记忆的根目录（已不再决定工作目录）：设了总工作区（workspacePath）时群目录固定为 <总工作区>/companion/groups/<群号>；本项只在总工作区留空时作为群记忆的根目录。留空=所有群共用 publicMemoryFile'),
    groupMemoryMaxBytes: z.number().default(8 * 1024)
        .description('每个群的记忆文件达到这个大小（字节）后 qq_memory_note 不再追加'),
    memoryNoteDenyWords: z.array(z.string()).default([])
        .description('群友让记的群记忆里不能出现的词（管理员的隐私：微信号、真名、住址等）；管理员 QQ 号自动算在内'),
    stickerDir: z.string().default('')
        .description('表情包库目录（图片和 index.json 放在这里）；留空 = 不开表情包功能（没有存/搜/发表情包的工具）'),
    stickerMaxCount: z.number().default(300)
        .description('表情包库最多存多少张；满了要先删再存'),
    stickerMaxBytes: z.number().default(4 * 1024 * 1024)
        .description('一张表情包的最大字节数（默认 4MB；QQ 动图常超过 1MB，所以别按图片的标准卡得太紧，超过就被拒收）'),
    stickerDailyMax: z.number().default(20)
        .description('每天最多新存多少张（控制她看图打标签的花费；合并到已有表情包不算）'),
    privateResetDays: z.number().default(0)
        .description('私聊会话跨过这么多个凌晨 4 点后，下一条消息开新会话（附交接；0=关闭）'),
    privateQuietSeconds: z.number().min(0).max(30).default(0)
        .description('私聊里等发送方安静这么多秒，再把他连着发的几条并成一次交给她（0=关闭，发一条就派发一次；上限 30 秒）'),
    pokeReplyEnabled: z.boolean().default(true)
        .description('有人拍她一下时要不要理会：私聊里当招呼，群里当被 @（拍的是别人则一律不理）'),
    groupResetDays: z.number().default(0)
        .description('群聊会话跨过这么多个凌晨 4 点后，下一条消息开新会话（附交接；0=关闭）'),
    privateSessionKeepDays: z.number().default(0)
        .description('私聊的旧会话（已经不用的）超过这么多天没写入就删掉（0=不删）；正在用的会话永远不删'),
    groupSessionKeepDays: z.number().default(0)
        .description('群聊的旧会话超过这么多天没写入就删掉（0=不删）；正在用的会话永远不删'),
    privateProactiveEnabled: z.boolean().default(false)
        .description('私聊车道：每天在时段内随机叫醒机器人几次，让她决定要不要主动找管理员'),
    privateProactiveTargets: z.array(z.string()).default([])
        .description('私聊车道主动找的 QQ 号（每行一个，不用写 private:）；每个聊天各自一套随机计划与「几条没回就停」计数'),
    privateProactiveWindowStart: z.string().default('09:00')
        .description('私聊车道时段开始（本地 HH:MM）'),
    privateProactiveWindowEnd: z.string().default('22:00')
        .description('私聊车道时段结束（本地 HH:MM）'),
    privateProactiveMinPerDay: z.number().default(4)
        .description('私聊车道每天最少叫醒几次'),
    privateProactiveMaxPerDay: z.number().default(6)
        .description('私聊车道每天最多叫醒几次'),
    privateProactiveMinGapMinutes: z.number().default(90)
        .description('私聊车道两次叫醒至少间隔多少分钟'),
    privateProactiveSkipIfActiveMinutes: z.number().default(30)
        .description('私聊车道：对方这么多分钟内说过话就跳过这次'),
    privateProactiveMaxUnanswered: z.number().default(2)
        .description('私聊车道主动发的消息有这么多条没回，当天就不再叫醒'),
    groupProactiveEnabled: z.boolean().default(false)
        .description('群聊车道：群里冷清时隔一段时间让她主动说一句（群友身份，不能改文件）'),
    groupProactiveTargets: z.array(z.string()).default([])
        .description('群聊车道要主动说话的群号（每行一个，不用写 group:）；群不在白名单里或这个群正在忙就跳过这次'),
    groupProactiveWindowStart: z.string().default('09:00')
        .description('群聊车道时段开始（本地 HH:MM）'),
    groupProactiveWindowEnd: z.string().default('22:00')
        .description('群聊车道时段结束（本地 HH:MM）'),
    groupProactiveMinPerDay: z.number().default(1)
        .description('群聊车道每个群每天最少叫醒几次'),
    groupProactiveMaxPerDay: z.number().default(2)
        .description('群聊车道每个群每天最多叫醒几次'),
    groupProactiveMinGapMinutes: z.number().default(120)
        .description('群聊车道两次叫醒至少间隔多少分钟'),
    groupProactiveSkipIfActiveMinutes: z.number().default(30)
        .description('群聊车道：这个群这么多分钟内有人说过话就跳过这次（刚聊过就不插话）'),
    groupProactiveMaxUnanswered: z.number().default(1)
        .description('群聊车道主动发的消息有这么多条没回，这个群当天就不再叫醒'),
    proactiveEnabled: z.boolean().deprecated()
        .description('[deprecated] 旧的主动聊天总开关：本版仍会把 true 并进两条车道，之后可以删掉这一行'),
    proactiveChatId: z.string().deprecated()
        .description('[deprecated] 旧的单个主动聊天目标（如 private:<管理员QQ>）：本版仍会把它的值并进下面两项，之后可以删掉这一行'),
    proactivePrivateTargets: z.array(z.string()).deprecated()
        .description('[deprecated] 旧名别名（现 privateProactiveTargets）：本版兼容读取，新配置请用新名'),
    proactiveGroupTargets: z.array(z.string()).deprecated()
        .description('[deprecated] 旧名别名（现 groupProactiveTargets）：本版兼容读取，新配置请用新名'),
    proactiveWindowStart: z.string().deprecated()
        .description('[deprecated] 旧名别名（现 privateProactiveWindowStart / groupProactiveWindowStart）'),
    proactiveWindowEnd: z.string().deprecated()
        .description('[deprecated] 旧名别名（现 privateProactiveWindowEnd / groupProactiveWindowEnd）'),
    proactiveMinPerDay: z.number().deprecated()
        .description('[deprecated] 旧名别名（现 privateProactiveMinPerDay / groupProactiveMinPerDay）'),
    proactiveMaxPerDay: z.number().deprecated()
        .description('[deprecated] 旧名别名（现 privateProactiveMaxPerDay / groupProactiveMaxPerDay）'),
    proactiveMinGapMinutes: z.number().deprecated()
        .description('[deprecated] 旧名别名（现 privateProactiveMinGapMinutes / groupProactiveMinGapMinutes）'),
    proactiveSkipIfActiveMinutes: z.number().deprecated()
        .description('[deprecated] 旧名别名（现 privateProactiveSkipIfActiveMinutes / groupProactiveSkipIfActiveMinutes）'),
    proactiveMaxUnanswered: z.number().deprecated()
        .description('[deprecated] 旧名别名（现 privateProactiveMaxUnanswered / groupProactiveMaxUnanswered）'),
    workspacePath: z.string().default('')
        .description('QQ 会话的默认工作区目录（总工作区）：群聊在 <本目录>/companion/groups/<群号>、私聊在 <本目录>/companion/private/<QQ号> 里工作，并自动归入本目录对应的工作区（按「最近的上级工作区」匹配，所以网页会话列表不会显示未分组）；管理员私聊优先用 adminWorkspacePath，单聊 /workspace 覆盖优先且已持久化到会话映射文件；留空时使用宿主进程工作目录并在启动时告警提醒（宿主未提供可编程查询的默认工作区）'),
    attachWorkspaceMode: z.union([z.const('existing'), z.const('auto'), z.const('off')]).default('existing')
        .description('QQ 会话怎么归入 DSH 工作区（网页会话列表按工作区分组）：existing（默认）= 归入聊天目录「最近的上级工作区」，没有上级工作区时只为 workspacePath 自动建一个；auto = 群聊、私聊各自的工作目录也自动建工作区（每个群一个）；off = 不归入。已有会话可发 /workspace attach 立即补挂'),
    inboundFileMaxBytes: z.number().default(INBOUND_FILE_MAX_BYTES)
        .description('QQ 入站文件最大字节数（直链/base64 拉取，0 = 不限制）'),
    maxInboundFileBytes: z.number().deprecated()
        .description('[deprecated] 旧名别名（现 inboundFileMaxBytes）：QQ 入站文件最大字节数；本版兼容读取，新配置请用新名'),
    allowPrivateHosts: z.boolean().default(false)
        .description('下载 SSRF 防护逃生门：默认拒绝解析到私网/环回/链路本地地址的下载目标（协议仅 http/https、重定向逐跳复检仍生效）；NapCat 文件服务器或反代部署在本机/内网时置 true 跳过私网检查'),
    groupReasoningEffort: z.union(['', 'off', 'low', 'high', 'max']).default('')
        .description('群聊会话的思考强度（off/low/high/max；留空 = 和部署默认一样）。私聊不受影响'),
    groupContextLines: z.number().default(0)
        .description('群里叫到她时，附上她没看到的最近几条群聊（只给她看上下文，0=不附）'),
    groupNameTriggers: z.array(z.string()).default([])
        .description('群里说出这些名字也算叫她，不用 @（空=只认 @ 和回复她）'),
    groupFollowupSeconds: z.number().default(0)
        .description('她在群里回了某人之后这么多秒内，这个人接着说话不用 @ 也算在跟她聊（0=关闭）'),
    groupPeekEnabled: z.boolean().default(false)
        .description('群里热闹时隔一段时间让她看一眼最近的聊天，她自己决定插不插话（不插就回 [不发]）'),
    groupPeekGapMinutes: z.number().default(30)
        .description('同一个群两次“看一眼”至少隔多少分钟'),
    groupPeekMinMessages: z.number().default(10)
        .description('上次看过（或她上次说话）以后群里至少有这么多条新消息才看一眼'),
    groupPeekQuietMinutes: z.number().default(10)
        .description('她在这个群里说过话后这么多分钟内不看一眼（正在聊或刚聊完）'),
    groupPeekWindowStart: z.string().default('09:00')
        .description('每天几点开始可以看一眼（HH:MM）'),
    groupPeekWindowEnd: z.string().default('24:00')
        .description('每天几点以后不再看一眼（HH:MM，可以写 24:00）'),
    groupAutoQuote: z.union([z.const('off'), z.const('busy'), z.const('always')]).default('off')
        .description('群里回复时是否自动引用叫她的那条消息：off（默认）= 不自动（她仍可以自己决定引用）；busy = 中间有别人插话时才引用；always = 总是引用。只作用于群聊的最终回复，模型自己写 [引用:消息 id] 时始终以模型为准；私聊不自动引用'),
    groupJumpInJudgeEnabled: z.boolean().default(true).description('群里没有被 @ 到的消息，先让她用一次极短的判断决定要不要接（关掉就是旧行为：按触发策略一律接）'),
    groupJumpInBackoffMaxMinutes: z.number().min(1).max(180).default(30).description('她主动说完没人接时，下一次开口最多等多少分钟（每没人接一次就翻倍，1–180）'),
    protocolMode: z.union([z.const('off'), z.const('on')]).default('off')
        .description('输出协议（B 档）：让模型可以在回复最后一行写【控制】{json} 精确控制是否回应、分几条发、引用哪条。默认关闭（关闭时完全不解析，行为与改造前逐字节相同）；开启前先看 /doctor 里的解析成功率，成功率 <95% 不要全局开'),
    protocolChats: z.array(z.string()).default([])
        .description('只在哪些聊天启用输出协议（private:QQ号 / group:群号，每行一个）；留空 = 开启时对所有聊天生效。用于先灰度一个群'),
    chatIdleEvictDays: z.number().default(7)
        .description('会话空闲淘汰天数：chat 超过该天数无任何活动时，在下一条入站消息处理前清理其 agent（会话先落盘 flush、映射保留，之后同一 chat 的消息可 resume 恢复原会话）；0 = 禁用'),
    dedupWindowSeconds: z.number().default(300)
        .description('入站消息去重窗口（秒）：同一会话内相同 message_id 在该窗口内重投（断线重连重放等）只处理第一条，后续静默跳过并记 debug；仅对会触发回复处理的消息事件生效（notice/meta 类不经过此闸）；0 = 禁用去重'),
    actionAuditEnabled: z.boolean().default(true)
        .description('工具发送审计：她用 qq_send_image/voice/video/file/segments、qq_send_forward 等工具主动发出的每条消息（成功或失败）追加一行 JSON 到 mediaDir/qq-actions.log（含 ts/chatId/action/ok/reason）；写失败只记 warn，不影响发送'),
    traceEnabled: z.boolean().default(false)
        .description('链路追踪：为每条入站消息生成 traceId 并贯穿入站→模型回合→出站，决策事件（含限流/去重/白名单/@ 门控与每个静默丢弃分支的中文 reason）逐行 JSON 落盘 mediaDir/qq-trace.jsonl（4MiB 改名轮转，保留 qq-trace.1/2.jsonl；同一原因 5 分钟限频）；默认关闭——关闭时不生成 traceId、不落盘，行为与开启时完全一致'),
    traceLevel: z.union([z.const('debug'), z.const('warn')]).default('debug')
        .description('追踪事件级别：debug=记录全部决策事件；warn=仅记录 ok:false（被拒/失败/丢弃）事件'),
    logLevel: z.union([z.const('debug'), z.const('info'), z.const('warn'), z.const('error')]).default('info')
        .description('控制台日志级别门槛（debug < info < warn < error）：低于该级别的日志不输出。debug=全部输出（含「session 事件早退」等调试行）；info=常规信息（启动、连接建立、meta 事件等，默认）；warn=仅警告与错误；error=仅错误'),
});
/** Parse and defensively sanitize the optional JSON policy; bad values never block startup. */
export function parseGroupTriggerPolicy(raw) {
    if (raw === undefined || raw === null || raw === '')
        return {};
    const value = typeof raw === 'string' ? (() => {
        try {
            return JSON.parse(raw);
        }
        catch {
            return undefined;
        }
    })() : raw;
    if (value === null || typeof value !== 'object' || Array.isArray(value))
        return {};
    const listKeys = new Set(['botNames', 'aliases', 'botAliases', 'keywords']);
    const mapKeys = new Set(['groups', 'groupDefaults', 'users', 'userOverrides']);
    const booleanKeys = new Set(['mentionRequired', 'replyWithoutMention', 'proactiveEnabled']);
    const scalarKeys = new Set([...booleanKeys, 'replyMode', 'probability', 'botName']);
    const cleanRule = (candidate) => {
        if (candidate === null || typeof candidate !== 'object' || Array.isArray(candidate))
            return {};
        const source = candidate;
        const result = {};
        for (const key of scalarKeys) {
            const item = source[key];
            if (booleanKeys.has(key)) {
                if (typeof item === 'boolean')
                    result[key] = item;
            }
            else if (key === 'probability') {
                if (typeof item === 'number' && Number.isFinite(item))
                    result[key] = item;
            }
            else if (key === 'replyMode') {
                if (item === 'all' || item === 'related' || item === 'probability' || item === 'off')
                    result[key] = item;
            }
            else if (typeof item === 'string')
                result[key] = item;
        }
        if ('proactiveEnabled' in result)
            warnLegacyTriggerField();
        for (const key of listKeys) {
            const item = source[key];
            if (Array.isArray(item))
                result[key] = item.filter((entry) => typeof entry === 'string');
        }
        for (const key of mapKeys) {
            const item = source[key];
            if (item !== null && typeof item === 'object' && !Array.isArray(item)) {
                const map = {};
                for (const [id, rule] of Object.entries(item))
                    map[id] = cleanRule(rule);
                result[key] = map;
            }
        }
        return result;
    };
    return cleanRule(value);
}
let warnedLegacyTriggerField = false;
/** The JSON trigger policy used to carry `proactiveEnabled`, which read the same
 * as the proactive-chat switch. It is now `replyWithoutMention`; the old name
 * still works, but says so once so it can be cleaned up. */
function warnLegacyTriggerField() {
    if (warnedLegacyTriggerField)
        return;
    warnedLegacyTriggerField = true;
    console.warn('[qq-companion] groupTriggerPolicy "proactiveEnabled" is deprecated; rename it to "replyWithoutMention"');
}
/** the deprecated config names kept for one release, mapped onto their
 * renamed fields. */
const DEPRECATED_CONFIG_ALIASES = [
    ['imageMaxSize', 'inboundImageMaxPx', INBOUND_IMAGE_MAX_PX],
    ['maxImageBytes', 'outboundImageMaxBytes', OUTBOUND_IMAGE_MAX_BYTES],
    ['maxInboundFileBytes', 'inboundFileMaxBytes', INBOUND_FILE_MAX_BYTES],
];
/** Map deprecated config names onto their renamed fields: a legacy value is
 * honored only while the new name still sits at its schema default (the new
 * name wins when both are configured), each legacy use warns once, and the
 * legacy keys never leak into the effective config. */
export function resolveDeprecatedConfig(config) {
    const resolved = { ...config };
    for (const [oldName, newName, defaultValue] of DEPRECATED_CONFIG_ALIASES) {
        const legacy = resolved[oldName];
        if (legacy === undefined)
            continue;
        console.warn('[qq-companion] config "' + oldName + '" is deprecated; rename it to "' + newName + '"');
        delete resolved[oldName];
        if (resolved[newName] === defaultValue)
            resolved[newName] = legacy;
    }
    // 主动聊天拆成私聊/群聊两条车道：旧的一套参数（总开关、目标、窗口、频率）并进
    // 新键后丢掉旧键——它们已不在设置页上，也不该再出现在生效配置里。
    // 只有旧键存在时才动手；某个车道的新键已被改成非默认值时不覆盖（新名优先）。
    const legacy = resolved;
    const laneDefaults = PROACTIVE_LANE_DEFAULTS;
    const atDefault = (key) => {
        const current = resolved[key];
        return current === laneDefaults[key];
    };
    const foldScalar = (value, lanes) => {
        if (value === undefined || value === null)
            return;
        for (const key of lanes) {
            if (!atDefault(key))
                continue;
            resolved[key] = value;
        }
    };
    const foldList = (value, key) => {
        if (!Array.isArray(value))
            return;
        const seen = new Set(resolved[key] ?? []);
        const merged = [...seen];
        for (const entry of value) {
            if (typeof entry !== 'string')
                continue;
            const id = entry.trim().replace(/^(?:private|group):/i, '').trim();
            if (id === '' || seen.has(id))
                continue;
            seen.add(id);
            merged.push(id);
        }
        ;
        resolved[key] = merged;
    };
    const legacyKeys = [
        'proactiveEnabled', 'proactiveChatId',
        'proactivePrivateTargets', 'proactiveGroupTargets',
        'proactiveWindowStart', 'proactiveWindowEnd',
        'proactiveMinPerDay', 'proactiveMaxPerDay', 'proactiveMinGapMinutes',
        'proactiveSkipIfActiveMinutes', 'proactiveMaxUnanswered',
    ];
    const present = (key) => {
        const value = legacy[key];
        if (value === undefined || value === null)
            return false;
        // 数组型旧键在 schemastery 里缺省就是 []，不能当成「用户设过」。
        if (Array.isArray(value))
            return value.length > 0;
        return true;
    };
    const touched = legacyKeys.filter(present);
    if (touched.length > 0) {
        console.warn('[qq-companion] config "' + touched.join('", "') + '" is deprecated; proactive chats are now per-lane (privateProactive* / groupProactive*)');
        if (legacy.proactiveEnabled === true) {
            if (atDefault('privateProactiveEnabled'))
                resolved.privateProactiveEnabled = true;
            if (atDefault('groupProactiveEnabled'))
                resolved.groupProactiveEnabled = true;
        }
        foldList(legacy.proactivePrivateTargets, 'privateProactiveTargets');
        foldList(legacy.proactiveGroupTargets, 'groupProactiveTargets');
        // 旧的单目标：群按群号进群车道，其余按私聊。
        const single = typeof legacy.proactiveChatId === 'string' ? legacy.proactiveChatId.trim() : '';
        if (single !== '') {
            const toGroup = /^group:/i.test(single);
            foldList([single], toGroup ? 'groupProactiveTargets' : 'privateProactiveTargets');
        }
        // 窗口/跳过/未答上限对两条车道都有意义；次数与间隔原本是照私聊节奏调的，
        // 只并进私聊车道，群车道保留自己更保守的默认值。
        const shared = ['proactiveWindowStart', 'proactiveWindowEnd', 'proactiveSkipIfActiveMinutes', 'proactiveMaxUnanswered'];
        const sharedMap = {
            proactiveWindowStart: ['privateProactiveWindowStart', 'groupProactiveWindowStart'],
            proactiveWindowEnd: ['privateProactiveWindowEnd', 'groupProactiveWindowEnd'],
            proactiveSkipIfActiveMinutes: ['privateProactiveSkipIfActiveMinutes', 'groupProactiveSkipIfActiveMinutes'],
            proactiveMaxUnanswered: ['privateProactiveMaxUnanswered', 'groupProactiveMaxUnanswered'],
        };
        for (const key of shared)
            foldScalar(legacy[key], sharedMap[key] ?? []);
        const privateOnly = ['proactiveMinPerDay', 'proactiveMaxPerDay', 'proactiveMinGapMinutes'];
        const privateMap = {
            proactiveMinPerDay: ['privateProactiveMinPerDay'],
            proactiveMaxPerDay: ['privateProactiveMaxPerDay'],
            proactiveMinGapMinutes: ['privateProactiveMinGapMinutes'],
        };
        for (const key of privateOnly)
            foldScalar(legacy[key], privateMap[key] ?? []);
    }
    for (const key of legacyKeys)
        delete legacy[key];
    return resolved;
}
/** 各车道新键的 schema 默认值：迁移旧配置时用来判断「这一项还没被改过」。 */
const PROACTIVE_LANE_DEFAULTS = {
    privateProactiveEnabled: false,
    groupProactiveEnabled: false,
    privateProactiveWindowStart: '09:00',
    privateProactiveWindowEnd: '22:00',
    privateProactiveMinPerDay: 4,
    privateProactiveMaxPerDay: 6,
    privateProactiveMinGapMinutes: 90,
    privateProactiveSkipIfActiveMinutes: 30,
    privateProactiveMaxUnanswered: 2,
    groupProactiveWindowStart: '09:00',
    groupProactiveWindowEnd: '22:00',
    groupProactiveMinPerDay: 1,
    groupProactiveMaxPerDay: 2,
    groupProactiveMinGapMinutes: 120,
    groupProactiveSkipIfActiveMinutes: 30,
    groupProactiveMaxUnanswered: 1,
};
/** Resolve env-var fallbacks into the effective access policy. */
export function resolvePolicy(config) {
    const envAdmins = ENV('ONEBOT_ALLOWED_USERS')
        .split(',')
        .map(v => v.trim())
        .filter(v => v !== '');
    const adminUsers = [...new Set([...config.adminUsers, ...envAdmins])];
    return {
        dmPolicy: config.dmPolicy,
        groupPolicy: config.groupPolicy,
        allowFrom: config.allowFrom,
        groupAllowFrom: config.groupAllowFrom,
        adminUsers,
        allowAllUsers: config.allowAllUsers || ENV('ONEBOT_ALLOW_ALL_USERS').toLowerCase() === 'true',
        requireMention: config.requireMention,
    };
}
