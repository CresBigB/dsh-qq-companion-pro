#!/usr/bin/env node
// 把宿主 dsh 的 @deepseek-ai 包链进本插件的 node_modules，让插件与宿主进程用
// 同一份模块实例（避免 dual-package hazard 让 instanceof 判断失效）。
// 宿主解析顺序：环境变量 DSH_ROOT → D:\DSH Desktop\resources\app\node_modules
// → 报错退出。更新 dsh 后重跑（npm run link-host / build.mjs 会自动调用）。
import { existsSync, mkdirSync, rmSync, symlinkSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

// 默认宿主 node_modules 根（本机 DSH Desktop 的安装位置）。
const DEFAULT_HOST_ROOT = 'D:\\DSH Desktop\\resources\\app\\node_modules'

// 插件在运行时 import、或编译期取其类型的 @deepseek-ai 包。
// 传递依赖由宿主安装提供。
export const LINK_PKGS = [
  'cordis',
  'cosmokit',
  'schemastery',
  'dsh-agent',
  'dsh-brand',
  'dsh-invariants',
  'dsh-llm',
  'dsh-scope',
  'dsh-session',
  'dsh-system-prompt',
  'dsh-timeout',
  'dsh-tools',
  'dsh-typert-protocol',
  'dsh-user-approval',
  'dsh-util-values',
]

// 宿主把 schemastery / cosmokit 放在 node_modules 顶层，与 @deepseek-ai/ 平级。
const TOP_LEVEL_PKGS = ['schemastery', 'cosmokit']

const isHostRoot = dir => existsSync(join(dir, '@deepseek-ai'))

/** 解析宿主 node_modules 根，失败返回 undefined。 */
export function resolveHostRoot() {
  const fromEnv = process.env.DSH_ROOT
  if (fromEnv) {
    if (isHostRoot(fromEnv)) return fromEnv
    throw new Error(`link-host: DSH_ROOT=${fromEnv} 下没有 @deepseek-ai/，不是宿主 node_modules 根`)
  }
  if (isHostRoot(DEFAULT_HOST_ROOT)) return DEFAULT_HOST_ROOT
  return undefined
}

/** 建立宿主包链接，返回宿主 node_modules 根。 */
export function linkHost({ root = ROOT } = {}) {
  const hostRoot = resolveHostRoot()
  if (!hostRoot) {
    throw new Error(`link-host: 找不到宿主 node_modules（DSH_ROOT 未设置，且 ${DEFAULT_HOST_ROOT} 不存在）`)
  }

  const scopedDir = join(root, 'node_modules', '@deepseek-ai')
  mkdirSync(scopedDir, { recursive: true })

  const linkType = process.platform === 'win32' ? 'junction' : 'dir'
  const link = (target, at) => {
    rmSync(at, { recursive: true, force: true })
    symlinkSync(target, at, linkType)
  }

  let linked = 0
  for (const pkg of LINK_PKGS) {
    const target = join(hostRoot, '@deepseek-ai', pkg)
    // dsh 0.2.1 起去掉了部分包（如 dsh-invariants）；src 不 import 它们，
    // 缺了只警告——真需要时 tsc 会自己报错。
    if (!existsSync(target)) {
      console.warn(`link-host: 跳过宿主缺失的包: ${target}`)
      continue
    }
    link(target, join(scopedDir, pkg))
    linked += 1
  }

  for (const pkg of TOP_LEVEL_PKGS) {
    const target = join(hostRoot, pkg)
    if (!existsSync(target)) {
      console.log(`link-host: 宿主 node_modules 顶层没有 ${pkg}，跳过（由 package.json 依赖提供）`)
      continue
    }
    link(target, join(root, 'node_modules', pkg))
    linked += 1
  }

  console.log(`link-host: 已链接 ${linked} 个包，来自: ${hostRoot}`)
  return hostRoot
}

// 直接运行时执行；被 build.mjs import 时只提供函数。
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    linkHost()
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}