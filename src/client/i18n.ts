/**
 * 双语词条（zh 为 key 集真相源，en 逐 key 对齐；占位符用平台 `{word}` 形式）。
 * 分组标题与字段 label 是中文常量，不走词条。
 */

/** 中文词条。 */
export const zh: Record<string, string> = {
  'settings.nav': 'QQ Bot（OneBot）',
  'settings.title': 'QQ Bot（OneBot）设置',
  'settings.desc': '配置持久化为 profile 层 cordis.patch.yml 中 QQ 插件条目的 config 覆盖行，与手改 patch、宿主原生设置页同源。',
  'settings.loading': '正在加载设置…',
  'settings.reload': '重新加载',
  'settings.reset': '恢复默认值',
  'save.submit': '保存设置',
  'save.saving': '正在保存…',
  'save.done': '设置已保存。保存即热生效：插件秒级重启，QQ 桥会自动重连。',
  'save.noChanges': '没有需要保存的变更。',
  'save.badNumber': '数字字段不合法：{keys}',
  'effect.hint': '保存即热生效（无需重启宿主）：插件秒级原地重启，QQ 桥会自动重连；在途回合中断、频控窗口与中间消息缓冲清零，会话映射/历史不受影响。',
  'effect.entryInactive': 'QQ 插件条目当前未激活，保存后可能无法生效，请检查插件加载状态。',
  'secret.set': '已配置（脱敏，不回显）',
  'secret.unset': '未配置',
  'secret.placeholder': '留空 = 不修改',
  'secret.clear': '清除已保存的 AccessToken',
  'conflict.title': '保存冲突：设置已被其他来源修改（revision 不一致），已重新拉取最新配置，请检查后重试。',
  'status.error': '出错',
  'revision.label': 'revision',
}

/** 英文词条（逐 key 对齐 zh）。 */
export const en: Record<string, string> = {
  'settings.nav': 'QQ Bot (OneBot)',
  'settings.title': 'QQ Bot (OneBot) settings',
  'settings.desc': "Settings persist as the config override row of the QQ plugin entry in the profile-layer cordis.patch.yml — same source as hand-edited patches and the host's native settings page.",
  'settings.loading': 'Loading settings…',
  'settings.reload': 'Reload',
  'settings.reset': 'Reset to defaults',
  'save.submit': 'Save settings',
  'save.saving': 'Saving…',
  'save.done': 'Settings saved. Hot-applied on save: the plugin restarts within seconds and the QQ bridge reconnects automatically.',
  'save.noChanges': 'Nothing to save.',
  'save.badNumber': 'Invalid number fields: {keys}',
  'effect.hint': 'Hot-applied on save (no host restart): the plugin fiber restarts in place within seconds; the QQ bridge reconnects automatically. In-flight turns are interrupted and rate-limit windows/interim buffers reset; session mappings and history are unaffected.',
  'effect.entryInactive': "The QQ plugin entry is currently inactive; saving may not take effect. Check the plugin's load state.",
  'secret.set': 'Configured (redacted, never echoed)',
  'secret.unset': 'Not configured',
  'secret.placeholder': 'Leave empty = keep current',
  'secret.clear': 'Clear the saved AccessToken',
  'conflict.title': 'Save conflict: settings were changed by another source (revision mismatch). The latest snapshot has been re-fetched — review and retry.',
  'status.error': 'Error',
  'revision.label': 'revision',
}

/** 双语 key 集一致性自检：缺漏仅告警不致崩溃。 */
export function assertSameKeys(a: Record<string, string>, b: Record<string, string>): void {
  const missing = Object.keys(a).filter(key => !(key in b))
  const extra = Object.keys(b).filter(key => !(key in a))
  if (missing.length > 0 || extra.length > 0) {
    console.warn('[qq-companion] 双语词条 key 不齐 zh缺:' + missing.join(',') + ' en缺:' + extra.join(','))
  }
}

assertSameKeys(zh, en)