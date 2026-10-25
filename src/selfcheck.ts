/**
 * Startup configuration self-check: plain-language warnings for settings
 * that would make the plugin silently do nothing (or something surprising).
 * Pure: takes the resolved config, returns the problems; index.ts logs them
 * once at mount. Never throws, never blocks startup.
 * @module dsh-qq-companion/selfcheck
 */
import { existsSync } from 'node:fs'
import { dirname } from 'node:path'

import { capabilityCatalogText, unknownCapabilityIds } from './capabilities.js'

export interface SelfCheckInput {
  host: string
  accessToken: string
  botQQ: string
  adminUsers: readonly string[]
  dmPolicy: string
  groupPolicy: string
  allowFrom: readonly string[]
  groupAllowFrom: readonly string[]
  allowAllUsers: boolean
  /** 非管理员私聊与所有群聊的新会话自动切换的宿主权限预设（'' = 不动）。 */
  memberPermission: string
  workspacePath: string
  adminWorkspacePath: string
  groupMemoryDir: string
  publicMemoryFile: string
  scheduledPrompts: ReadonlyArray<{ id: string; time: string; chatId: string; prompt: string }>
  proactiveEnabled: boolean
  proactiveChatId: string
  proactiveWindowStart: string
  proactiveWindowEnd: string
  proactiveMinPerDay: number
  proactiveMaxPerDay: number
  splitLines: boolean
  splitMaxMessages: number
  humanTypingPace?: boolean
  typingDelayMinMs?: number
  typingDelayMaxMs?: number
  /** 全局关闭的能力 id（未知 id 在这里告警：写错了不会关掉任何东西）。 */
  capabilitiesDeny?: readonly string[]
  /** 只对好友 / 群聊 / 陌生人关掉的能力 id（T11 r1；未知 id 同样告警）。 */
  friendDeny?: readonly string[]
  memberDeny?: readonly string[]
  strangerDeny?: readonly string[]
  /** 额外给好友 / 群聊 / 陌生人开放的能力 id（未知 id 同样告警：写错了开不出任何东西）。 */
  friendGrant?: readonly string[]
  memberGrant?: readonly string[]
  strangerGrant?: readonly string[]
  /** 额外给主人私聊开放的能力 id（T14 r2；未知 id 同样告警）。 */
  ownerGrant?: readonly string[]
  /** 输出协议 B 档总开关（'on' / 缺省 off）。 */
  protocolMode?: 'off' | 'on'
  /** 输出协议的灰度聊天名单（空 = 开启时对所有聊天生效）。 */
  protocolChats?: readonly string[]
  /** 语音合成（T15）：开启但引擎没配好时，工具照常出现、一调用就报错。 */
  ttsEnabled?: boolean
  ttsEngine?: 'command' | 'sherpa-onnx'
  ttsCommand?: string
  ttsArgs?: readonly string[]
  ttsModel?: string
  ttsMaxChars?: number
  ttsTimeoutMs?: number
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/
const CHAT_ID = /^(private|group):\d{5,12}$/
const QQ = /^\d{5,12}$/

/** All problems found (empty = all good). */
export function selfCheck(c: SelfCheckInput): string[] {
  const problems: string[] = []
  if (c.accessToken === '') problems.push('accessToken 为空：插件会停在「等待配置」状态，QQ 连不上（在设置页填 accessToken，并在 NapCat 的 WebSocket 客户端里填同一个 token）')
  if (c.host === '0.0.0.0' || c.host === '::') problems.push('host 是 ' + c.host + '：反向 WS 对所有网卡开放，确认防火墙已挡住该端口，或改成 127.0.0.1')
  if (c.adminUsers.length === 0 && !c.allowAllUsers) problems.push('adminUsers 为空：没人能私聊、也没人能用斜杠命令')
  for (const id of c.adminUsers) if (!QQ.test(id)) problems.push('adminUsers 里的「' + id + '」不像 QQ 号')
  if (c.botQQ !== '' && !QQ.test(c.botQQ)) problems.push('botQQ「' + c.botQQ + '」不像 QQ 号（留空会自动学习）')
  if (c.dmPolicy === 'allowlist' && c.allowFrom.length === 0) problems.push('dmPolicy 是 allowlist 但 allowFrom 为空：所有私聊都会被拒绝')
  if (c.groupPolicy === 'allowlist' && c.groupAllowFrom.length === 0) problems.push('groupPolicy 是 allowlist 但 groupAllowFrom 为空：在用 /group allow 添加之前，所有群都不会回复')
  // 非管理员能进门（非管理员私聊或群聊）却没有收窄权限预设：这些会话会继承
  // 宿主默认预设——若宿主默认是完整权限，群友和陆生人就能让她执行命令、
  // 读写文件。allowAllUsers 的旧告警紧跟其后，用「上述权限」指回这条。
  const memberReachable = c.allowAllUsers
    || (c.dmPolicy === 'allowlist' && c.allowFrom.some(id => !c.adminUsers.includes(id)))
    || c.groupPolicy !== 'disabled'
  if (memberReachable && c.memberPermission === '') {
    problems.push('群聊 / 非管理员私聊会继承宿主默认权限预设；若默认是完整权限，群友和陆生人能让她执行命令、读写文件。建议设 memberPermission: read-only')
  }
  if (c.allowAllUsers) {
    problems.push('allowAllUsers 已开启：任何人都能私聊她（只适合调试）' + (c.memberPermission === '' ? '，并且拿到上述权限' : ''))
  }
  const dirs: Array<[string, string]> = [['workspacePath', c.workspacePath], ['adminWorkspacePath', c.adminWorkspacePath], ['groupMemoryDir', c.groupMemoryDir]]
  for (const [key, dir] of dirs) if (dir !== '' && !existsSync(dir) && key !== 'groupMemoryDir') problems.push(key + ' 目录不存在：' + dir)
  if (c.groupMemoryDir !== '' && !existsSync(dirname(c.groupMemoryDir))) problems.push('groupMemoryDir 的上级目录不存在：' + dirname(c.groupMemoryDir))
  if (c.publicMemoryFile !== '' && !existsSync(dirname(c.publicMemoryFile))) problems.push('publicMemoryFile 所在目录不存在：' + dirname(c.publicMemoryFile))
  const ids = new Set<string>()
  for (const p of c.scheduledPrompts) {
    if (ids.has(p.id)) problems.push('scheduledPrompts 里 id「' + p.id + '」重复')
    ids.add(p.id)
    if (!HHMM.test(p.time)) problems.push('scheduledPrompts「' + p.id + '」的 time「' + p.time + '」不是 HH:MM，不会触发')
    if (!CHAT_ID.test(p.chatId)) problems.push('scheduledPrompts「' + p.id + '」的 chatId「' + p.chatId + '」格式不对（应为 private:QQ号 或 group:群号）')
    if (p.prompt.trim() === '') problems.push('scheduledPrompts「' + p.id + '」的 prompt 为空，不会触发')
  }
  if (c.proactiveEnabled) {
    if (!CHAT_ID.test(c.proactiveChatId)) problems.push('主动聊天已开启，但 proactiveChatId「' + c.proactiveChatId + '」格式不对，不会叫醒')
    else if (c.proactiveChatId.startsWith('private:') && !c.adminUsers.includes(c.proactiveChatId.slice(8))) problems.push('proactiveChatId 不是管理员的私聊：她会主动去找一个非管理员')
    if (!HHMM.test(c.proactiveWindowStart) || !HHMM.test(c.proactiveWindowEnd)) problems.push('主动聊天时段不是 HH:MM')
    else if (c.proactiveWindowStart >= c.proactiveWindowEnd) problems.push('主动聊天时段开始不早于结束（不支持跨午夜），不会叫醒')
    if (c.proactiveMinPerDay > c.proactiveMaxPerDay) problems.push('proactiveMinPerDay 大于 proactiveMaxPerDay')
  }
  if (c.humanTypingPace === true && (c.typingDelayMinMs ?? 0) > (c.typingDelayMaxMs ?? 0)) problems.push('按真人打字速度已开启，但 typingDelayMinMs 大于 typingDelayMaxMs：每条消息都会按最长时间等')
  if (c.splitLines && c.splitMaxMessages <= 1) problems.push('splitLines 已开启但 splitMaxMessages ≤ 1：实际不会拆分')
  // 语音合成（T15）：这里只看「填了什么」，不搜 PATH、不碰磁盘上的模型（自检是
  // 同步的）。真正的可用性由挂载时那次探测判定（见 src/tts.ts 的 probe 与
  // src/index.ts）：探不出引擎 / 模型时 qq_send_tts 根本不会被注册，所以这里
  // 能报的都是「填错了、必然用不了」的那一类。
  if (c.ttsEnabled === true) {
    if (c.ttsEngine === 'command') {
      if ((c.ttsCommand ?? '').trim() === '') {
        problems.push('语音合成已开启，但引擎是「自定义命令」而 ttsCommand 为空：qq_send_tts 不会被注册（改成 sherpa-onnx，或填上命令）')
      } else if ((c.ttsArgs ?? []).length > 0
        && !(c.ttsArgs ?? []).some(arg => arg.includes('{text}')) && !(c.ttsArgs ?? []).some(arg => arg.includes('{output}'))) {
        problems.push('ttsArgs 里既没有 {text} 也没有 {output}：要念的文字或写出的文件没地方放，合成多半会失败')
      }
    } else if ((c.ttsModel ?? '') !== '' && !existsSync(c.ttsModel ?? '')) {
      problems.push('ttsModel 指向的路径不存在：' + c.ttsModel + '（留空则去 ~/.cache/sherpa-onnx/tts 等默认位置找；找不到模型时 qq_send_tts 不会被注册）')
    }
    if (!Number.isFinite(c.ttsMaxChars ?? 200) || (c.ttsMaxChars ?? 200) <= 0) {
      problems.push('ttsMaxChars ≤ 0：任何文字都会因「太长」被拒，改成正数（默认 200）')
    }
    if (!Number.isFinite(c.ttsTimeoutMs ?? 60_000) || (c.ttsTimeoutMs ?? 60_000) < 1_000) {
      problems.push('ttsTimeoutMs 小于 1 秒：合成还没开始就被杀掉，这条语音永远发不出去')
    }
  }
  // 能力开关写错 id 时不会关掉任何功能（静默无效），启动时点出来。
  for (const id of unknownCapabilityIds(c.capabilitiesDeny)) {
    problems.push('capabilitiesDeny 里的「' + id + '」不是已知能力 id，不会关掉任何功能（' + capabilityCatalogText() + '）')
  }
  // 三个按关系的 deny（T11 r1）同理：写错 id 时那一档不会少任何功能，静默无效。
  const relationDenies: Array<[string, readonly string[] | undefined]> = [
    ['friendDeny', c.friendDeny],
    ['memberDeny', c.memberDeny],
    ['strangerDeny', c.strangerDeny],
  ]
  for (const [key, ids] of relationDenies) {
    for (const id of unknownCapabilityIds(ids)) {
      problems.push(key + ' 里的「' + id + '」不是已知能力 id，不会对任何人关闭功能（可用 id 见 /doctor）')
    }
  }
  // 四个 grant（T11 / T14 r2）同理：写错 id 时不会给任何人加开功能，静默无效。
  const grants: Array<[string, readonly string[] | undefined]> = [
    ['ownerGrant', c.ownerGrant],
    ['friendGrant', c.friendGrant],
    ['memberGrant', c.memberGrant],
    ['strangerGrant', c.strangerGrant],
  ]
  for (const [key, ids] of grants) {
    for (const id of unknownCapabilityIds(ids)) {
      problems.push(key + ' 里的「' + id + '」不是已知能力 id，不会给任何人开放功能（可用 id 见 /doctor）')
    }
  }
  // 输出协议（B 档）的灰度名单：只在协议开启时才有意义，格式错了那个聊天不会生效。
  const protocolChats = c.protocolChats ?? []
  if (c.protocolMode !== 'on') {
    if (protocolChats.length > 0) problems.push('protocolChats 填了 ' + protocolChats.length + ' 个聊天，但输出协议没开启（protocolMode=off）：灰度名单不会生效')
  } else {
    for (const chatId of protocolChats) {
      if (!CHAT_ID.test(chatId)) problems.push('protocolChats 里的「' + chatId + '」格式不对（应为 private:QQ号 或 group:群号），这个聊天不会启用输出协议')
    }
  }
  return problems
}
