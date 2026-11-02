# dsh-qq-companion-pro

给 [dsh（DeepSeek Harness）](https://github.com/deepseek-ai/deepseek-harness) 接**个人 QQ 号**的陪伴型通道插件。

本仓库是 `dsh-qq-companion` 的 **-pro** 发行版：npm 包名和插件 id 都是 `dsh-qq-companion-pro`，宿主里挂载用的 config 行 id 仍沿用上游的 `dsh-onebot`（见下面「安装」），所以从上游版本换过来时 config 覆盖行不用改。

基于 [mario841859784/dsh-onebot](https://github.com/mario841859784/dsh-onebot)（BSD-3-Clause）修改：保留原版的全部功能（OneBot 11、NapCat、私聊群聊、图片语音、斜杠命令、设置页……），在此之上补了稳定性，并加了一套“让 AI 像个真人朋友”的陪伴功能。

```
你的 QQ ⇄ QQ 服务器 ⇄ NapCat（登录一个 QQ 小号）⇄ OneBot 11 WebSocket ⇄ dsh-qq-companion-pro ⇄ dsh agent
```

> ⚠️ 个人号接机器人用的是非官方协议（NapCat），**有被风控的风险**，请只用小号。

## 和原版 dsh-onebot 相比

**稳定性**

- 所有状态文件（会话映射、退休会话、可切回会话、超时补发、群白名单、聊天活动……）统一排队写 + fsync + 原子替换：不会出现写坏的半个文件，也不会出现旧数据覆盖新数据。
- QQ 在线监视：读取 OneBot 心跳里的 `status.online` 和 NapCat 的 `bot_offline` 通知，小号被挤下线时醒目报错；连接还在但心跳停了（“假在线”）会主动断开让 NapCat 重连。
- 断线时排队的回复存到磁盘，dsh 重启也不丢；定时任务、主动聊天计划、群记忆条数也是重启后接着算（停机错过的定时任务 3 小时内补执行）。
- `/preset` 的选择持久化（原版只在内存里）。
- 启动时配置自检，用中文逐条指出会导致“不工作”的配置。
- 长回复转图片卡片重写：标题、列表、引用、代码块、表格都能排好，中文、英文、彩色表情混排不会乱码或被切坏。
- 语音转写重写（默认关闭）：本机离线识别（sherpa-onnx + SenseVoice / whisper.cpp / 自定义命令），语音不出服务器。
- 语音合成（默认关闭）：sherpa-onnx 的 VITS 模型完全在本机离线念，念的文字不经过任何在线服务、也不用 API key；也可以接自己的命令行合成工具（联不联网由那个工具决定）。引擎用不了（程序或模型没找到）时这个工具根本不会出现，而不是每次调用都失败。
- 修复：`/preset` 后新会话挂错预设；日志里不再写消息正文。

**陪伴功能**（全部默认关闭，按需在配置里打开）

| 功能 | 说明 |
|---|---|
| 一句一条 | 最终回复按行拆成多条消息发出，中间有按字数的“打字”停顿；行数太多（列表、代码）就整段发 |
| 管理员私聊默认权限 | 管理员私聊可以自动切到指定预设和宿主权限（比如完整权限）；**群聊和其他人的权限默认不动**，要限制得自己配 `memberPermission`（见下），配之前别以为它已经受限 |
| 运行期群白名单 | `/group allow / remove / list` 随时增删，重启不丢 |
| 只认管理员的进群 / 加好友 | 管理员的邀请和好友申请自动同意、自动加白名单；别人的一律不同意并私聊告诉管理员；被踢出群自动移出白名单 |
| 分开的工作目录 | 管理员私聊、每个群各用自己的工作目录，配合 dsh 自动读取的 `AGENTS.md`，实现“私密记忆只有私聊读得到、群记忆只有本群读得到” |
| `qq_memory_note` | 群里唯一能写记忆的工具：只能往本群记忆追加一句，有字数、次数、文件大小上限，拒绝像“改规则 / 认身份”的内容 |
| 陪伴功能说明 | 按配置自动写给她：认人、群里什么时候会收到消息、记忆文件和上限、主动聊天、表情包规则；人设只写性格 |
| 每日定时任务 | 每天 HH:MM 往指定会话投递一个任务（比如写日记），可附当天聊天节选，也可附各群当天节选；这张表在设置页「会话与任务」页里直接增删（时间、目标会话、内容、两个附带开关都在页面上），改完保存即生效 |
| 旧会话自动清理 | 换下来的私聊 / 群聊旧会话超过设定天数没用就删掉（`privateSessionKeepDays` / `groupSessionKeepDays`），正在用的永远不删 |
| 主动聊天 | 私聊与群聊各自一套开关与节奏：每天在时段内随机叫醒几次，由模型决定要不要主动说话；回复 `[不发]` 就什么都不发；刚聊过就跳过，连续没回就当天停止。每个聊天各有自己的时间表与计数；群里的回合固定是群友身份，不会拿到改文件的权限 |
| 定期 / 空闲换新会话 | 私聊、群聊分别每 N 天换一次新会话，或空闲 N 小时后换；新会话附上最后几句“交接” |
| `/task` 定时任务 | 仅管理员私聊：列出定时任务和今天剩余的主动聊天时间；`/task <id>`、`/task checkin` 立刻执行 |
| 长任务（自动接力） | 管理员私聊发 `/task 写一份 3000 字的报告`，她会开一个带预算的长任务，之后宿主自己一轮轮驱动她接着做，不用人再催：它在宿主的 goals 里跑，**只有宿主把目标标成完成/暂停/阻塞才算结束**——她自己说“做完了”不等于结束。`-r N`（1～200）显式给预算，不传就用宿主的默认预算（多少轮以创建回执里宿主给的数为准）；`/task status` 看进度、`/task stop` 暂停（进度保留）、`/task resume` 继续；新会话 / 换工作目录 / 重开会话都会撤销授权，不会偷偷换地方接着做 |
| 记忆库搜索 | 每个 QQ 号 / 群号一个独立的 SQLite 记忆库，放在总工作区下面的 `memorys/`（文件名就是号码，彼此看不到对方）。群友让记的事在写进记忆文件的同时也进这个库，同一句重复记只累加次数；管理员发 `/memory <关键词>` 就在**当前这个聊天**自己的库里模糊搜索，按出现次数和最近时间排序——一个字的词也能搜到 |
| `/doctor` 陪伴状态 | QQ 账号是否真在线、定时任务今天执行没有、主动聊天计划、每个记忆文件占上限多少 |
| 群聊怎么触发 | 默认「必须 @ 才回」（`requireMention`）。要更细就配 `groupTriggerPolicy`（JSON）：按群、按人分别设要不要 @、没 @ 要不要主动接话（`replyWithoutMention`，旧写法 `proactiveEnabled` 仍可用但会提示改名）、只回相关的 / 按概率回 / 不回（`replyMode=related|probability|off`，`probability` 0–1）；不配仍是原来的行为 |
| 群里先判要不要接 | 打开 `groupJumpInJudgeEnabled` 后，群里**没被 @、也不是接着她的话**的消息会先过一道极短的判断（要不要接），判为不接就整条不派发——用来治「不需要 @ 也能回复」开了以后被闲聊刷屏。她说完没人接会逐步退避（1 分钟起、最多 `groupJumpInBackoffMaxMinutes` 默认 30 分钟），有人接着她说话就立刻恢复正常。被 @、接着她的话、私聊与命令都不受影响；这个群还没有她的会话时（第一条消息）无法判断，照旧接话 |
| 忙的时候排队 | 任务还在跑时又发来的消息默认排队（当前任务结束后按序处理），**不再发「已排队」提示**——她处理完会直接答复那条消息；想改成「插话」就把 `newMessagePolicy` 设成 `steer`，插话会回一句「已插话」回执 |
| 旁问（自动） | 打开 `sideAskEnabled` 后，任务还在跑时又发来的纯文字消息**不用加任何指令**，会自动交给一个独立的旁问子代理（宿主 subagent，`spawn` 提供方 + 调用方投递，**不是** fork 会话副本：不会给会话库添前缀副本，也不会向父会话投递完成通知）立刻回答，回答作为另一条消息发回，主任务完全不受影响（既不排队也不被插话）。`sideAskConcurrency`（1–8，默认 2）是**每个聊天各自**的并发上限（一个热闹的群不会占用你私聊的名额），同一个聊天占满或消息超长时静默退回原来的排队/插话策略；宿主自己的子代理名额满时会明确回一句可操作提示。子代理不复制会话历史，所以插件会把主会话最近的一段纯文字对话（你的指令 + 她已说出的内容）当背景塞进提示词：`sideAskContextChars`（0–20000，默认 4000，0 = 完全不带背景）。带图片/文件/引用/转发的消息仍按排队处理 |
| 私聊等你打完 | 打开 `privateQuietSeconds`（0–30，默认 0 = 关闭）后，你在私聊里连着发的几条会先攒着：等你安静这么多秒，才按发送顺序并成**一次**交给她（每条各自保留自己的发言边界，她答的是第一条）。斜杠命令立刻执行；带图片/文件/语音/引用/转发的消息会先把攒着的文字发出去；群聊不受影响。每条消息仍各占一次每分钟频率名额 |
| 拍一拍 | 有人拍她一下（QQ 的「拍了拍」）时，这一下会被当成一次**没写字的招呼**，正常走完整流程：私聊里按私聊策略与白名单判断，群里等同被 **@**（因此会绕过「群聊必须 @ 机器人」）。拍的是别人、或她拍自己，一律不理。开关 `pokeReplyEnabled`（默认开）；她看到的内容是 `[拍了拍你]`，回不回、怎么回由她决定 |
| 设置页 | 在 dsh 网页的设置里有这个插件的**概览 + 11 个配置子页**（功能权限、连接、私聊、群聊、谁能找她、她、说话方式、会话与任务、记忆、媒体与语音、诊断）：私聊页与群聊页各自带着自己的主动聊天设置，改完保存即写回 profile |
| 表情包库 | 她把收到的表情包、照片存进自己的库（带标签），聊天时按情绪找一张发出去，每次回复最多 1 张；改和删只有主人能让她做 |
| 防风控 | 所有消息按真人打字速度发（整个小号同一时间只打一条）、群里不拆句；`/doctor` 显示发送量 |
| 语音念出来 | 她能把要说的话念成一条 QQ 语音发出来：sherpa-onnx 的 VITS 模型在本机离线合成（不联网、不花钱），也可以接自备的命令行工具；这条语音只能发在当前会话里，一条最多几百字，超了会让她精简而不是硬念 |

## 安装

前提：dsh ≥ 0.2.0-rc.1（已在 0.2.1-rc.2 上测试），Node ≥ 22，NapCat 已登录小号（插件运行所需）。安装插件本身走宿主的受管渠道，手改 profile 文件不是推荐路径。

本仓库没有发布到 npm registry，装的是**本地目录**。顺序是「先查、再问、最后装」：

1. **先查**用受管插件界面（dsh 网页里的插件页）或宿主的插件工具，看当前 profile 到底装了什么，拿到**精确的插件 id / 包名**。要确认的是：里面没有 `dsh-qq-companion`、`dsh-qq-companion-pro`、`dsh-onebot`、`dsh-onebot-qq` 中的任何一份在挂着——同一插件文件被挂两次 = 双实例冲突（设置页会互相覆盖、注册表重复、日志刷崩溃）。
2. **再问**：装本地目录这一步会改 profile 的依赖与 patch，属于写宿主配置的操作，先看清楚它要写什么再点头。
3. **最后装**：在同一个受管界面中安装本仓库所在目录；Agent 使用宿主 `plugin_manager` 的 `install_bundle` 操作，目标为本仓库绝对路径。**不要**另外把 `lib/index.js` 再 insert 一次，也不要手工往 profile 的 `pnpm-workspace.yaml` / `cordis.patch.yml` 里补条——这两个文件归宿主的安装流程管。
4. 以受管安装返回的应用状态、警告和后续步骤为准，按提示重启或刷新。随后核对主插件只有一个连接实例、设置页正常，必要时完成真实消息冒烟测试；日志出现连接成功不能替代这些验证。

Linux 上要装中文字体（文字图卡片用）：

```sh
sudo apt install fonts-noto-cjk fonts-wqy-zenhei fonts-noto-color-emoji fonts-dejavu-core
```

**从上游 dsh-qq-companion / dsh-onebot-qq 迁移**：先用同一个受管界面把原来的那份卸载掉（两个同时挂载会冲突——`dsh-onebot` 这个挂载 id 会撞在一起；`dsh-onebot` 与 `dsh-qq-companion-pro` 也绝不能同时挂），再按上面三步装本插件。config 行 id 仍然是 `dsh-onebot`（沿用上游），但包名已改为 `dsh-qq-companion-pro`：需核查旧覆盖是否仍指向上游 name，不能直接断言旧覆盖完全无需调整。遇到冲突请通过宿主支持的配置流程处理，不手写 profile。默认媒体目录仍为 `<dsh-home>/media/onebot`；迁移后核对配置、会话映射与单实例状态，不手改内部数据。

### NapCat 侧

在 NapCat 网络设置里加一个 **WebSocket 客户端**：地址 `ws://127.0.0.1:8643/ws`，token 与插件的 `accessToken` 相同，消息格式选“数组”。

### 配置字段参考

实际改配置请走 dsh 网页的设置页（这个插件有概览 + 11 个配置子页），或宿主提供的其他受支持界面——设置在界面里改完保存即写回 profile，**不要手写 profile 的 `cordis.patch.yml`**。

**功能权限**：从概览的「管理功能权限」进入，或在左侧打开「功能权限」。每行显示功能名称、对应工具及说明，按管理员、私聊、群组三列勾选，改完再保存。管理员列对应管理员私聊，默认全部允许；群组列对整群生效，群内管理员发言也按该列注册工具。非管理员私聊合并好友与陌生人；旧规则不一致时显示「部分开启」，未点击不会覆盖旧差异。原始按关系规则保留在折叠的高级设置里。勾选表示配置允许，不会绕过引擎依赖、工具只群聊/只私聊限制或写操作的管理员回合检查；关闭语音合成引擎时，管理员勾选也不会启用语音合成。升级后若提示后端版本过旧，完整退出并重启 DSH，不能只刷新页面。

下面这段只用来对照字段形态（挂载 id 沿用上游的 `dsh-onebot`，`name` 是包名 `dsh-qq-companion-pro`）。它不是一条要你抄进文件的命令：

```yaml
# 字段参考，不是「写 profile」的操作
- id: dsh-onebot
  name: 'dsh-qq-companion-pro'
  config:
    host: 127.0.0.1
    port: 8643
    accessToken: !!js process.env.ONEBOT_ACCESS_TOKEN   # 建议用环境变量，不把 token 写进文件
    botQQ: '小号的 QQ 号'
    adminUsers: ['你的 QQ 号']
    groupPolicy: allowlist
    groupAllowFrom: []          # 之后用 /group allow 群号 添加
```

在设置页里填好这几项保存，重启 dsh 后日志里出现 `[qq-companion] mounted`、`配置自检通过`、`OneBot connected` 就好了。

## 陪伴功能配置

下面都是同一份 `config` 里的键（同样只是字段参考，改配置请走设置页）。一个完整的例子：

```yaml
    ownerTitle: 主人                       # 系统提示和通知里怎么称呼管理员（默认“管理员”）
    agentPreset: my-chat                   # 默认（群聊、其他人）用只能聊天的预设
    adminPreset: my-full                   # 管理员私聊用完整预设
    adminPermission: danger-full-access    # 管理员私聊每个新会话自动切换的宿主权限
    memberPermission: read-only            # 其他会话（群聊、非管理员私聊）新会话自动切换的宿主权限
    autoAcceptAdminRequests: true
    autoAllowInvitedGroups: true
    splitLines: true
    splitMaxMessages: 6
    textImageThreshold: 0                  # 长回复不转图片
    workspacePath: /home/bot/memory          # 总工作区：群在 companion/groups/<群号>、私聊在 companion/private/<QQ号>
    adminWorkspacePath: /home/bot/memory/private
    groupMemoryDir: ''                       # 已不再决定工作目录，只在没设总工作区时当群记忆根
    groupMemoryMaxBytes: 10240
    publicMemoryFile: /home/bot/memory/AGENTS.md
    publicMemoryMaxBytes: 24576
    privateResetDays: 5
    privateQuietSeconds: 3                 # 私聊里等你安静 3 秒再合并派发（0=关闭）
    pokeReplyEnabled: true                 # 有人拍她一下时当成招呼（群里等同被 @）
    groupJumpInJudgeEnabled: true          # 群里没被 @ 的消息先判断要不要接
    groupJumpInBackoffMaxMinutes: 30       # 说完没人接时逐次翻倍，最多这么久
    groupResetDays: 2
    idleResetHours: 168
    scheduledPrompts:                       # 也可以完全在设置页「会话与任务」里编辑
      - id: diary                          # 短名字：/task diary 立刻执行一次；也是「今天执行过没」的键
        time: '01:30'                       # 本地时间 HH:MM（24 小时制）
        chatId: 'private:你的QQ号'           # private:<QQ号> 或 group:<群号>
        includeTodayLog: true               # 附上这个会话当天的聊天节选
        includeGroupLogs: true              # 附上各群当天她参与的聊天（每群最多 80 句）
        prompt: 现在是写日记的时间……
    privateProactiveEnabled: true
    privateProactiveTargets: ['你的QQ号']
    privateProactiveWindowStart: '09:00'
    privateProactiveWindowEnd: '22:00'
    privateProactiveMinPerDay: 4
    privateProactiveMaxPerDay: 6
    groupProactiveEnabled: true
    groupProactiveTargets: ['群号']
    groupProactiveMinPerDay: 1
    groupProactiveMaxPerDay: 2
```

| 键 | 默认 | 说明 |
|---|---|---|
| `ownerTitle` | `管理员` | 系统提示和通知里对管理员的称呼 |
| `splitLines` | `false` | 最终回复按行拆成多条消息 |
| `splitMaxMessages` | `6` | 最多拆几条；行数超过就整段发 |
| `typingDelayPerCharMs` / `typingDelayMinMs` / `typingDelayMaxMs` | `80` / `500` / `2500` | 打字速度：开 `humanTypingPace` 时每条消息都按它等，关时只用在拆句的后续几行之间 |
| `adminPreset` | 空 | 管理员私聊默认预设（`/preset` 覆盖优先） |
| `adminPermission` | 空 | 管理员私聊每个新会话自动执行的宿主 `/permission` 预设 |
| `memberPermission` | 空 | 非管理员私聊与所有群聊每个新会话自动执行的宿主 `/permission` 预设，建议 `read-only`；留空 = 继承宿主默认预设（默认是完整权限的话群友也能让她执行命令、读写文件） |
| `adminWorkspacePath` | 空 | 管理员私聊的工作目录 |
| `groupMemoryDir` | 空 | 每个群一份记忆文件 `<根>/<群号>/AGENTS.md`（不再决定工作目录）；设了总工作区时群目录固定为 `<总工作区>/companion/groups/<群号>` |
| `groupMemoryMaxBytes` | `8192` | 群记忆满了就拒绝追加 |
| `publicMemoryFile` / `publicMemoryMaxBytes` | 空 / `6144` | 没有群专属记忆文件时，群里的记忆追加写到这里 |
| `autoAcceptAdminRequests` | `false` | 管理员的好友申请 / 进群邀请自动同意 |
| `autoAllowInvitedGroups` | `false` | 管理员拉进的群自动加白名单 |
| `idleResetHours` | `0` | 空闲这么多小时后换新会话 |
| `privateResetDays` / `groupResetDays` | `0` | 会话跨过这么多个凌晨 4 点后换新会话 |
| `privateQuietSeconds` | `0` | 私聊里等发送方安静这么多秒（0–30），再把他连着发的几条并成一次交给她；只作用于私聊纯文字，命令/媒体/引用/转发会先把攒着的文字发出去 |
| `pokeReplyEnabled` | `true` | 有人拍她一下时是否理会：私聊里当招呼、群里等同被 @；拍的是别人或她自己拍自己时一律不理 |
| `groupJumpInJudgeEnabled` | `true` | 群里没被 @ 的消息先过一道极短判断再决定接不接（关掉就回到「一条条都接」） |
| `groupJumpInBackoffMaxMinutes` | `30` | 她说完没人接时的最长退避（1–180 分钟；每没人接一次翻倍，有人接立刻恢复） |
| `scheduledPrompts` | `[]` | 每日定时任务：`id`、`time`（HH:MM）、`chatId`、`prompt`、`includeTodayLog`（附这个会话当天的聊天节选）、`includeGroupLogs`（附各群当天她参与的聊天，每群最多 80 句）。设置页里的「每天定时投递的任务」就是这张表，可以直接增删；页面上和 host 用同一套校验（时间要 HH:MM、目标要带 `private:`/`group:` 前缀、内容不能空、`id` 不能重复），不合格的行会拦在保存之前 |
| `privateProactiveEnabled` | `false` | 开启私聊主动聊天（与群聊各自独立开关） |
| `privateProactiveTargets` | `[]` | 要主动找的私聊：每行一个 QQ 号（不带前缀） |
| `privateProactiveWindowStart` / `privateProactiveWindowEnd` | `09:00` / `22:00` | 私聊时段（不跨午夜） |
| `privateProactiveMinPerDay` / `privateProactiveMaxPerDay` | `4` / `6` | 私聊每天叫醒次数 |
| `privateProactiveMinGapMinutes` | `90` | 私聊两次之间至少隔多久 |
| `privateProactiveSkipIfActiveMinutes` | `30` | 私聊里对方这么多分钟内说过话就跳过 |
| `privateProactiveMaxUnanswered` | `2` | 私聊主动消息这么多条没回就当天停止 |
| `groupProactiveEnabled` | `false` | 开启群聊主动聊天：群里冷清时她自己说一句 |
| `groupProactiveTargets` | `[]` | 要主动说话的群：每行一个群号；群里按群友身份说话（不能改文件），不在白名单或正忙时跳过 |
| `groupProactiveWindowStart` / `groupProactiveWindowEnd` | `09:00` / `22:00` | 群聊时段（不跨午夜） |
| `groupProactiveMinPerDay` / `groupProactiveMaxPerDay` | `1` / `2` | 每个群每天叫醒次数（默认比私聊保守） |
| `groupProactiveMinGapMinutes` | `120` | 同一个群两次之间至少隔多久 |
| `groupProactiveSkipIfActiveMinutes` | `30` | 群里这么多分钟内有人说过话就跳过 |
| `groupProactiveMaxUnanswered` | `1` | 群里主动说了几句没人接就当天停止该群 |
| `proactiveEnabled` / `proactivePrivateTargets` / `proactiveGroupTargets` / `proactiveWindowStart` … | 已废弃 | 旧的单套主动聊天配置：仍会被读取并按车道并入上面的新键（窗口/跳过/未答上限两条车道都并，次数与间隔只并进私聊车道），同时打一条警告；请改用新键 |

全部配置项（连接、权限、媒体、语音转写、文字图卡片、诊断……）的类型、默认值和说明见 [docs/CONFIG.md](docs/CONFIG.md)。

### 长任务 `/task`

- **只能在管理员私聊里用**：群聊里直接拒绝（一个群共用一个会话，长任务会继承主人的权限），非管理员也调不动这条命令。
- **前提是宿主开着自动轮驱动**：目标交给宿主的 goals 服务后，靠 `goal-round-driver` 一轮轮接着跑。插件在运行时探测不到这个驱动是否启用；没启用时目标只会停在“已创建”，她会如实说明“宿主没开自动轮”，而不是假装在跑。
- **预算**：`/task <目标> -r N`，N 是 1～200（插件这边的保守上限）。不传 `-r` 就用宿主的默认预算——具体多少轮以**创建回执**里宿主给的数为准，插件不假定某个默认值。`-r` 只认写在末尾的那个，正文中间的 `-r` 原样留在目标里；末尾 `-r` 后面跟的不是合法正整数会直接报错，不会悄悄当正文去建目标。
- **什么时候算结束**：只有宿主把目标标成完成 / 暂停 / 阻塞才算结束。她自己说“做完了”不等于结束，目标和进度都在宿主那边，`/task status` 看的就是宿主的实时投影。
- **回传节奏**：`taskEveryRounds`（默认 1）控制每几轮回传一次当轮真实文字；中间几轮只更新进度不发消息，预算最后一轮一定回传。插件不额外总结，回传的就是她当轮说的话。

### 叫醒和定时任务发给模型的是什么

- 定时任务：`[定时任务 HH:MM｜这条不是{ownerTitle}发的，是系统按时叫你]` + 你写的 `prompt`（+ 当天聊天节选）。
- 主动聊天：`[主动聊天的机会 HH:MM｜这条不是{ownerTitle}发的，是系统叫醒你]` + 对方多久没说话、有几条没回 + “想找就直接写，不想就只回复 `[不发]`”。

在人设里告诉模型收到这两种消息该怎么做（写日记的步骤、什么时候值得主动找人）。

## 安全建议

- `host` 保持 `127.0.0.1`，NapCat 的 WebUI 也只监听本机；`accessToken` 用随机值，放环境变量。
- 群聊和其他人用一个**没有命令行、没有文件写入**的预设，并且**显式**把它配成 `memberPermission`（例如 `read-only`）：这一项留空 = 不切，会话继承宿主默认预设，宿主默认若是完整权限，群友也能让她执行命令、读写文件。改这项只影响之后新建的会话，已经在用的旧会话要自己核查（或换掉）。只有管理员私聊给完整权限。
- 用小号；别让它短时间大量发消息、进很多群。

## 开发

需要 Node ≥ 22。宿主（dsh）最好在 PATH 上：编译和类型检查都要用它的 `@deepseek-ai/*` 包，`link-host` 负责把这些包链进来（Windows 上是目录 junction）。

```sh
npm.cmd ci --include=dev --legacy-peer-deps   # Linux/macOS 用 npm ci --include=dev --legacy-peer-deps
npm.cmd run link-host        # 链宿主 @deepseek-ai 包（需要 dsh 在 PATH 上）
npm.cmd run build            # 链宿主 → 清 lib/ → tsc 编译 src → lib → 打包设置页前端 → 客户端类型检查
npm.cmd run build:client     # 只重建设置页前端（src/client → lib/client.js）
npm.cmd test                 # 全部测试（vitest run；pretest 会先跑 link-host）
npm.cmd run coverage         # 测试 + 覆盖率（低于门槛会失败）
npm.cmd run e2e              # 端到端：真实 dsh + 假 DeepSeek 接口 + 假 NapCat，不需要网络和 API Key
npm.cmd run docs:config      # 改了配置项后重新生成 docs/CONFIG.md（测试会检查）
```

编译和类型检查是分开的两件事，别拿裸 `tsc` 当构建命令：
- 服务端代码按宿主类型编译（`npm.cmd run build` 用 tsconfig.json，宿主没带 `.d.ts` 时脚本会自己准备同版本类型副本）；
- 设置页前端是浏览器代码，单独用 tsconfig.client.json 检查；
- 没先 `link-host` 就裸跑 `tsc -p tsconfig.json`，会因为解析不到宿主的 `@deepseek-ai/*` 报一堆与源码无关的错。

代码地图：

| 位置 | 内容 |
|---|---|
| `src/index.ts` / `src/config.ts` | 插件入口；配置定义（默认值、说明） |
| `src/bridge.ts` / `src/registry.ts` / `src/session-ledger.ts` | QQ 会话 ↔ dsh 会话；会话映射、恢复、切换；退休会话和可切回列表 |
| `src/inbound.ts` / `src/outbound.ts` / `src/interim.ts` | 收消息（权限、媒体、引用）；发消息（拆句、打字节奏、离线补发）；中间消息 |
| `src/commands.ts` / `src/commands/` | 斜杠命令表和各命令 |
| `src/task-goal.ts` | 长任务：目标轮来源校验、回传节奏、`/task` 的命令解析与文案 |
| `src/companion/` | 陪伴功能：换新会话、记忆、定时任务、主动聊天、打字节奏、表情包库、/doctor 陪伴状态 |
| `src/sticker-tools.ts` | 表情包的存、搜、发、改、删工具 |
| `src/t2i/` | 长回复转图片卡片（解析、排版、绘制、字体） |
| `src/stt.ts` | 语音转写（引擎探测、调用、媒体落地） |
| `src/tts.ts` | 语音合成（引擎探测、WAV 校验、进程树回收、大小上限） |
| `src/connection.ts` / `src/liveness.ts` | OneBot 连接；QQ 在线监视 |
| `src/persist.ts` / `src/selfcheck.ts` | 状态文件原子写；启动配置自检 |

## 许可

BSD-3-Clause，见 [LICENSE](LICENSE)。

上游版权归 dsh-external contributors（dsh-onebot）与 mario841859784，原样保留；本仓库（`dsh-qq-companion-pro`）的修改部分版权归 Geng-zy。第三方组件的许可与声明见 [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)。
