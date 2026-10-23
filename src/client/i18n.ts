/**
 * 双语词条（zh 为 key 集真相源，en 逐 key 对齐；占位符用平台 `{word}` 形式）。
 * 字段 label / hint / 子页名 / 卡片名是字段表里的中文常量，不走词条；
 * 这里只放界面骨架文案（《前端设计规范》§7）。
 */

/** 中文词条。 */
export const zh: Record<string, string> = {
  'settings.nav': 'QQ 陪伴',
  'settings.title': 'QQ 陪伴',
  'settings.desc': '配置写入当前 profile 的 cordis.patch.yml，保存后插件会原地重启',
  // §7 的接口在 F3 由 getStatus() 提供；F2a 只有 idle 点 + 生效的 QQ 号。
  'conn.qq': 'QQ 号 {qq}',
  'search.placeholder': '搜索设置…',
  'search.results': '搜索结果',
  'search.empty': '没有匹配“{q}”的设置',
  'search.count': '{n} 项',
  'filter.changed': '只看已改动',
  'filter.empty': '这一页都是默认值',
  'badge.dirty': '已改动',
  'badge.nonDefault': '非默认',
  'badge.inactive': '未生效',
  'badge.willClear': '保存后将清空',
  'field.resetDefault': '恢复默认值（{value}）',
  'secret.set': '已设置',
  'secret.unset': '未设置',
  'secret.placeholder': '留空 = 不修改',
  'secret.clear': '清空',
  'secret.undoClear': '撤销清空',
  'tags.placeholder': '输入后按回车添加',
  'tags.remove': '删除 {item}',
  'switch.on': '开',
  'switch.off': '关',
  'select.followDefault': '跟随默认',
  'workspace.title': '快速填入 workspace',
  'workspace.fill': '填入',
  'workspace.choose': '选择已有工作区…',
  'workspace.empty': '暂无 workspace 记录，可直接输入路径。',
  'workspace.unavailable': '无法获取 workspace 列表（宿主未提供 workspace 注册表），可直接输入路径。',
  'workspace.note': '选中后点「填入」仅写入上方输入框；保存后才对新会话生效（已用 /workspace 覆盖的会话不受影响）。',
  'save.summary': '已修改 {n} 项',
  'save.revert': '还原',
  'save.submit': '保存',
  'save.saving': '正在保存…',
  'save.done': '已保存，插件正在原地重启…',
  'save.noChanges': '没有需要保存的变更。',
  'save.badNumber': '数字字段不合法：{keys}',
  'load.error': '加载设置失败',
  'load.retry': '重试',
  'entry.inactive': 'QQ 插件条目当前未激活，保存后可能不会生效',
  'conflict.title': '这期间配置在别处被改过',
}

/** 英文词条（逐 key 对齐 zh）。 */
export const en: Record<string, string> = {
  'settings.nav': 'QQ Companion',
  'settings.title': 'QQ Companion',
  'settings.desc': "Saved to this profile's cordis.patch.yml; the plugin restarts in place on save",
  'conn.qq': 'QQ {qq}',
  'search.placeholder': 'Search settings…',
  'search.results': 'Search results',
  'search.empty': 'No settings match “{q}”',
  'search.count': '{n} found',
  'filter.changed': 'Changed only',
  'filter.empty': 'Everything here is at its default',
  'badge.dirty': 'Edited',
  'badge.nonDefault': 'Customized',
  'badge.inactive': 'Inactive',
  'badge.willClear': 'Cleared on save',
  'field.resetDefault': 'Reset to default ({value})',
  'secret.set': 'Set',
  'secret.unset': 'Not set',
  'secret.placeholder': 'Leave empty to keep',
  'secret.clear': 'Clear',
  'secret.undoClear': 'Undo clear',
  'tags.placeholder': 'Type and press Enter',
  'tags.remove': 'Remove {item}',
  'switch.on': 'On',
  'switch.off': 'Off',
  'select.followDefault': 'Follow default',
  'workspace.title': 'Quick fill from a workspace',
  'workspace.fill': 'Fill in',
  'workspace.choose': 'Choose a workspace…',
  'workspace.empty': 'No workspace on record; type a path instead.',
  'workspace.unavailable': 'Workspace list unavailable (the host exposes no workspace registry); type a path instead.',
  'workspace.note': 'Fill in only writes the input above; it takes effect for new sessions after saving (sessions with their own /workspace keep it).',
  'save.summary': '{n} changes',
  'save.revert': 'Revert',
  'save.submit': 'Save',
  'save.saving': 'Saving…',
  'save.done': 'Saved. The plugin is restarting…',
  'save.noChanges': 'Nothing to save.',
  'save.badNumber': 'Invalid number fields: {keys}',
  'load.error': "Couldn't load settings",
  'load.retry': 'Retry',
  'entry.inactive': 'The QQ plugin entry is inactive; saving may have no effect',
  'conflict.title': 'Settings changed elsewhere',
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