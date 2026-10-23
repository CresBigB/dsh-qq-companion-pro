/**
 * 客户端 bundle 常量。
 *
 * PLUGIN_ID 不在源码里硬编码：scripts/build-client.mjs 调用 esbuild 时以
 * define 把 package.json 的 name 注入 `__PLUGIN_ID__`（唯一真相源）。
 */

/** 构建期注入的包名（= 插件 id）。 */
declare const __PLUGIN_ID__: string

/** 插件 id（= package.json name）。 */
export const PLUGIN_ID: string = __PLUGIN_ID__
/** Typert Remote 命名空间。 */
export const REMOTE_NS = 'onebotSettings'
/** locale 命名空间。 */
export const NS = 'qq-companion'
/** 设置页 slot 的 id。 */
export const SLOT_ID = 'onebot-settings'
/** 设置页在 nav 里的排序。 */
export const SLOT_ORDER = 18

/** 第二入口的 slot 名（插件详情页里某一行 bundle 的「配置」按钮，keyed slot）。 */
export const SECOND_ENTRY_SLOT = 'plugins.row.config'
/** 第二入口对应 bundle 声明的行 id（cordis.patch.yml 里的 `- id: dsh-onebot`）。 */
export const SECOND_ENTRY_ROW_ID = 'dsh-onebot'
/** 第二入口的 key（宿主约定：`<package name>#<row id>`）。 */
export const SECOND_ENTRY_KEY = PLUGIN_ID + '#' + SECOND_ENTRY_ROW_ID