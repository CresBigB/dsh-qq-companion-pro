#!/usr/bin/env node
// 设置页静态预览（不进构建流程，仅给 Lead 人工看效果用）。
//
// 用法：node scripts/preview-client.mjs   （先跑 npm run build 生成 lib/client.js）
// 产物：preview/settings-<子页>.html（每个子页一个文件），含
//   · 完整的 §6.2 参考 CSS（bundle 里的同一份字符串）
//   · :root 上 §6.1 的宿主主题令牌一组浅色演示值
//   · @media (prefers-color-scheme: dark) 一组深色演示值
// 演示用的令牌取值与假快照只存在于本脚本产物中，绝不进 bundle。
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const CLIENT_JS = join(ROOT, 'lib', 'client.js')
const OUT_DIR = join(ROOT, 'preview')

/** 宿主主题令牌的浅色演示值（仅预览）。 */
const TOKENS_LIGHT = {
  '--dsw-alias-bg-base': '#ffffff',
  '--dsw-alias-bg-layer-1': '#f7f8fa',
  '--dsw-alias-bg-layer-2': '#eceff4',
  '--dsw-alias-bg-overlay': '#ffffff',
  '--dsw-alias-border-l1': '#e2e6ec',
  '--dsw-alias-border-l2': '#ccd2dc',
  '--dsw-alias-label-primary': '#1b1f24',
  '--dsw-alias-label-secondary': '#5b6472',
  '--dsw-alias-brand-primary': '#2f6fed',
  '--dsw-alias-state-success-primary': '#17864a',
  '--dsw-alias-state-warn-primary': '#b25e00',
  '--dsw-alias-state-error-primary': '#c4293b',
  '--dsw-alias-state-idle-primary': '#8a93a2',
}

/** 同一组令牌的深色演示值（仅预览）。 */
const TOKENS_DARK = {
  '--dsw-alias-bg-base': '#16181d',
  '--dsw-alias-bg-layer-1': '#1d2026',
  '--dsw-alias-bg-layer-2': '#262a32',
  '--dsw-alias-bg-overlay': '#1f232a',
  '--dsw-alias-border-l1': '#2e333d',
  '--dsw-alias-border-l2': '#3c424e',
  '--dsw-alias-label-primary': '#e6e8eb',
  '--dsw-alias-label-secondary': '#9aa3b0',
  '--dsw-alias-brand-primary': '#6f9bff',
  '--dsw-alias-state-success-primary': '#4bc07f',
  '--dsw-alias-state-warn-primary': '#e0a34a',
  '--dsw-alias-state-error-primary': '#ef6b7b',
  '--dsw-alias-state-idle-primary': '#6b7381',
}

/** 令牌块 → CSS 声明。 */
function tokenBlock(tokens) {
  return Object.entries(tokens).map(([name, value]) => '  ' + name + ': ' + value + ';').join('\n')
}

/** 假快照（含若干非默认值，accessToken 已设置）。 */
function demoConfig(DEFAULTS) {
  return Object.assign({}, DEFAULTS, {
    botQQ: '2564812526',
    dmPolicy: 'allowlist',
    allowFrom: ['2824149798'],
    adminUsers: ['2824149798'],
    groupPeekEnabled: true,
    groupAutoQuote: 'busy',
    sessionTitleTemplate: '{kind} {target} · {date}',
    stickerDir: 'E:\\To DeepSeek\\companion\\stickers',
    traceEnabled: true,
    logLevel: 'warn',
    memberPermission: 'read-only',
    cardFooter: 'dsh · QQ 陪伴',
    textImageThreshold: 200,
    groupNameTriggers: ['小陪', '在吗'],
    sensitivePatterns: ['\\b\\d{17}[\\dXx]\\b'],
  })
}

/** 假快照上的草稿：留两三处未保存改动，方便看「已改动」竖条 / 徽标 / 保存条。 */
function demoDraft(client, config) {
  const draft = client.draftFromSnapshot({ config: config })
  draft.port = '8645'
  draft.typingDelayPerCharMs = '95'
  draft.proactiveEnabled = true
  return draft
}

/** 载入浏览器 bundle（模拟 window.__ModuleLoader__.load + require('react')）。 */
function loadClientModule() {
  const source = readFileSync(CLIENT_JS, 'utf8')
  const packageName = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).name
  const factories = {}
  globalThis.window = {
    __ModuleLoader__: {
      load(entry) {
        factories[entry.id] = entry.factory
      },
    },
  }
  new Function(source)()
  const factory = factories[packageName]
  if (factory === undefined) throw new Error('lib/client.js 未注册 ' + packageName + ' 模块')
  return factory((specifier) => {
    if (specifier !== 'react') throw new Error('unexpected external require: ' + specifier)
    return React
  })
}

/** 把视图渲染成整页 HTML（含令牌与完整 CSS；extraCss 只用于演示态覆盖）。 */
function pageHtml(title, css, bodyHtml, extraCss = '') {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>QQ 陪伴设置页预览 · ${title}</title>
<style>
/* 演示用宿主主题令牌（浅色）。仅预览，不进 bundle。 */
:root {
${tokenBlock(TOKENS_LIGHT)}
  color-scheme: light dark;
}
/* 演示用宿主主题令牌（深色）。仅预览，不进 bundle。 */
@media (prefers-color-scheme: dark) {
  :root {
${tokenBlock(TOKENS_DARK)}
  }
}
html, body { margin: 0; padding: 0; }
body {
  min-height: 100vh;
  padding: 24px;
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-primary);
  font-family: system-ui, -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif;
}
.qqc-root { max-width: 1100px; margin: 0 auto; }
</style>
<style data-plugin="preview-css">
${css}
</style>
${extraCss === '' ? '' : `<style data-plugin="preview-states-css">
${extraCss}
</style>`}
</head>
<body>
${bodyHtml}
</body>
</html>
`
}

const client = loadClientModule()
const DEFAULTS = client.DEFAULTS
const config = demoConfig(DEFAULTS)
const draft = demoDraft(client, config)
const t = (key) => (client.zh[key] != null ? client.zh[key] : key)

/** 全部交互回调的占位（静态 HTML 不交互）。 */
const noop = () => {}

const workspace = {
  loaded: true,
  available: true,
  workspaces: [
    { id: 'ws-1', path: 'E:\\To DeepSeek', sessionCount: 5 },
    { id: 'ws-2', path: 'E:\\Vibe Coding\\dsh-qq-companion-魔改', sessionCount: 2 },
  ],
  selectedId: 'ws-1',
}

/** 面板视图的公共 props（每个子页 / 每个演示态都在此之上覆盖）。 */
function baseProps(overrides = {}) {
  return Object.assign({
    t: t,
    page: 'connection',
    query: '',
    changedOnly: false,
    draft: draft,
    config: config,
    botQQ: String(config.botQQ),
    // F3 概览：默认不带状态快照（各子页与交互态预览用不到），概览页单独覆盖。
    status: null,
    statusAvailable: true,
    statusError: null,
    onRefreshStatus: noop,
    secretSet: true,
    clearSecret: false,
    tagInputs: {},
    workspace: workspace,
    busy: false,
    saveState: 'idle',
    conflict: false,
    conflictShowMine: false,
    riskDialog: null,
    loading: false,
    error: null,
    notice: null,
    entryActive: true,
    onPageChange: noop,
    onQueryChange: noop,
    onChangedOnlyChange: noop,
    onRetry: noop,
    onSave: noop,
    onRevert: noop,
    onReload: noop,
    onToggleMine: noop,
    onRiskCancel: noop,
    onRiskConfirm: noop,
    onChange: noop,
    onSecretChange: noop,
    onClearSecretChange: noop,
    onResetField: noop,
    onTagInput: noop,
    onTagCommit: noop,
    onTagRemove: noop,
    onTagBackspace: noop,
    onWorkspaceSelectedChange: noop,
    onWorkspaceApply: noop,
    // workspacePath 行下方的「快速填入 workspace」（面板里由 panel.ts 接线到同一份纯函数）
    renderExtraRow: (field) => field.key !== 'workspacePath' ? null : client.renderWorkspacePicker(React, {
      loaded: workspace.loaded,
      available: workspace.available,
      workspaces: workspace.workspaces,
      selectedId: workspace.selectedId,
      disabled: false,
      t: t,
      onSelectedChange: noop,
      onApply: noop,
    }),
  }, overrides)
}

mkdirSync(OUT_DIR, { recursive: true })
const written = []
for (const group of client.GROUPS) {
  const html = renderToStaticMarkup(React.createElement(client.SettingsView, baseProps({ page: group.id })))
  const file = join(OUT_DIR, 'settings-' + group.id + '.html')
  writeFileSync(file, pageHtml(group.title, client.CSS, html))
  written.push(file)
}

/* ------------------------------------------------------------------ *
 * settings-states.html：F2b 的四种交互态集中一页看
 *   ① 校验错误行（+ 保存条「有 N 项填写有误」+ 导航红色计数）
 *   ② 危险确认对话框（+ 保存条「已修改 N 项」）
 *   ③ 冲突横幅（展开「查看我的修改」）
 *   ④ 保存条成功态（已保存，插件正在原地重启…）
 * ------------------------------------------------------------------ */

/** 校验错误态：端口越界（§5.4 validate.port）。 */
const errorDraft = Object.assign({}, draft, { port: '70000' })

/** 危险态：dmPolicy=open 且 allowAllUsers=true（§5.5 的跨字段最终状态判断）。 */
const riskConfig = Object.assign({}, config, { dmPolicy: 'allowlist', allowAllUsers: false })
const riskDraft = Object.assign({}, client.draftFromSnapshot({ config: riskConfig }), {
  dmPolicy: 'open',
  allowAllUsers: true,
})
const riskList = client.collectRisks(riskDraft, riskConfig, {})

/** 冲突态：留几处改动（含密钥清空 → 只显示「已修改」）。 */
const conflictDraft = Object.assign({}, draft, { port: '8645', typingDelayPerCharMs: '95' })

/** 一页四块：每块自带标题、说明与相对定位容器（覆盖层 only 覆盖本块）。 */
function stateBlock(title, note, overrides) {
  const html = renderToStaticMarkup(React.createElement(client.SettingsView, baseProps(overrides)))
  return `<section class="state">
<h2 class="state-title">${title}</h2>
<p class="state-note">${note}</p>
<div class="qqc-preview">
${html}
</div>
</section>`
}

const statesBody = [
  stateBlock(
    '① 校验错误行 + 保存条「有 N 项填写有误」',
    '端口填 70000：行 data-invalid + 控件 aria-invalid + 错误文字 qqc-e-port；导航「连接」红色计数；保存按钮禁用。',
    { page: 'connection', draft: errorDraft },
  ),
  stateBlock(
    '② 危险确认对话框（保存前二次确认）',
    'dmPolicy=open 且 allowAllUsers=true：行上「有风险」徽标、对话框列出风险、焦点在「取消」；覆盖层挂在 .qqc-root 内（此页为了并排展示改成 absolute）。',
    { page: 'access', draft: riskDraft, config: riskConfig, riskDialog: riskList },
  ),
  stateBlock(
    '③ 冲突横幅（这期间配置在别处被改过）',
    '展开「查看我的修改」：每个已改动键列出「子页 · 标签 · 我的值」；密钥只显示「已修改」，草稿保留到用户点重新加载。',
    { page: 'connection', draft: conflictDraft, clearSecret: true, conflict: true, conflictShowMine: true },
  ),
  stateBlock(
    '④ 保存条成功态（已保存，插件正在原地重启…）',
    '保存成功后条内显示 success 文案；2 秒后面板自动重新拉取快照，然后保存条消失。',
    { page: 'connection', draft: draft, saveState: 'saved' },
  ),
].join('\n')

const statesCss = `/* 仅预览：让 fixed 覆盖层落在各自的演示块里，好并排看 */
.qqc-preview{position:relative;overflow:hidden;padding:12px;border:1px dashed var(--dsw-alias-border-l2);border-radius:10px}
.qqc-preview .qqc-root{max-width:none;margin:0}
.qqc-preview .qqc-overlay{position:absolute}
.state-title{margin:24px 0 4px;font-size:16px;font-weight:600}
.state-note{margin:0 0 8px;color:var(--dsw-alias-label-secondary);font-size:12px}`

const statesFile = join(OUT_DIR, 'settings-states.html')
writeFileSync(statesFile, pageHtml('交互状态总览', client.CSS, statesBody, statesCss))
written.push(statesFile)

/* ------------------------------------------------------------------ *
 * settings-overview.html：F3 的「概览」子页（§4.14）
 *   ① 一份假快照：六格状态 + 记忆用量 meter + 定时任务 + 会话卡片
 *   ② 主插件未运行（available:false）：只加 info 横幅，各格「—」
 * 假快照只存在于本脚本产物中，绝不进 bundle。
 * ------------------------------------------------------------------ */

/** 概览用的假快照（与 src/status.ts 的 CompanionStatusSnapshot 同构）。 */
const overviewStatus = {
  connection: { connected: true, online: true, selfId: '2564812526', botQQ: '2564812526', host: '127.0.0.1', port: 8643 },
  sessions: {
    private: 1,
    group: 1,
    list: [
      { chatId: 'private:2824149798', sessionId: 'onebot-private-2824149798-a1b2c3', title: 'QQ私聊 2824149798 · 10-23', workspaceAttached: true },
      { chatId: 'group:123456789', sessionId: 'onebot-group-123456789-d4e5f6', workspaceAttached: false },
    ],
  },
  today: { sent: 42 },
  proactive: { enabled: true, doneToday: 2, plannedToday: 5, nextAt: '15:30' },
  stickers: { enabled: false, count: 0, maxCount: 300, today: 0, dailyMax: 20 },
  memory: [
    { label: '公开', path: 'E:\\To DeepSeek\\AGENTS.md', bytes: 5701, maxBytes: 6144 },
    { label: '私密', path: 'E:\\To DeepSeek\\private\\AGENTS.md', bytes: 9216, maxBytes: 24576 },
  ],
  scheduled: [
    { id: 'diary', time: '23:00', chatId: 'private:2824149798', doneToday: false, nextAt: '23:00' },
    { id: 'morning', time: '08:30', chatId: 'private:2824149798', doneToday: true, nextAt: '08:30' },
  ],
  permissions: { admin: 'danger-full-access', member: 'read-only' },
  generatedAt: Date.now(),
}

/** 干净的草稿（概览页没有改动，保存条不出现）。 */
const cleanDraft = client.draftFromSnapshot({ config: config })

const overviewRunning = renderToStaticMarkup(React.createElement(client.SettingsView, baseProps({
  page: 'overview',
  draft: cleanDraft,
  status: overviewStatus,
  statusAvailable: true,
})))
const overviewDown = renderToStaticMarkup(React.createElement(client.SettingsView, baseProps({
  page: 'overview',
  draft: cleanDraft,
  status: null,
  statusAvailable: false,
})))

const overviewBody = `
<section class="state">
<h2 class="state-title">① 概览 · 主插件运行中</h2>
<p class="state-note">六格状态（连接 / 会话 / 今天 / 主动聊天 / 表情包 / 定时任务）+ 记忆用量 meter + 定时任务 + 会话卡片；右上「刷新」，页面可见时每 30 秒自动刷新一次。表情包未开启的格子带「去开启」跳到媒体与语音子页。</p>
<div class="qqc-preview">
${overviewRunning}
</div>
</section>
<section class="state">
<h2 class="state-title">② 概览 · QQ 主插件未运行</h2>
<p class="state-note">getStatus() 返回 available:false：只加一条 info 横幅「QQ 主插件未运行，暂时看不到状态」，各格显示「—」；其余子页照常可用。</p>
<div class="qqc-preview">
${overviewDown}
</div>
</section>`

const overviewFile = join(OUT_DIR, 'settings-overview.html')
writeFileSync(overviewFile, pageHtml('概览', client.CSS, overviewBody, statesCss))
written.push(overviewFile)

console.log('=== 设置页静态预览完成：' + written.length + ' 个文件 ===')
for (const file of written) console.log('  ' + file)