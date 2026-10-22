#!/usr/bin/env node
// Windows / 无 bash 环境的构建入口：链宿主包 → 清理 lib/ → tsc 编译 src → lib
// → 打包设置页前端（src/client → lib/client.js）→ 客户端侧类型检查。
// 用法：npm run build
import { spawnSync } from 'node:child_process'
import {
  existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { LINK_PKGS, linkHost } from './link-host.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const LIB = join(ROOT, 'lib')
const NODE_MODULES = join(ROOT, 'node_modules')
const TSC = join(NODE_MODULES, 'typescript', 'bin', 'tsc')
// 设置页前端：src/client（TS）→ lib/client.js（浏览器 bundle）。
const BUILD_CLIENT = join(ROOT, 'scripts', 'build-client.mjs')
const CLIENT_TSCONFIG = join(ROOT, 'tsconfig.client.json')
// 类型缓存：桌面版 dsh 打包时会剥掉 .d.ts，此时从这里取同版本的编译期类型。
// 放在 node_modules 内，天然不入库，npm ci 后按需重建。
const TYPE_CACHE = join(NODE_MODULES, '.host-types')

const fail = message => {
  console.error(`build: ${message}`)
  process.exit(1)
}

/** 递归列出目录下所有文件（不存在则空）。 */
function listFiles(dir) {
  if (!existsSync(dir)) return []
  const out = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...listFiles(full))
    else if (entry.isFile()) out.push(full)
  }
  return out
}

/** 从空 lib/ 开始，src 里删掉的模块不会在 lib/ 留下残骸。 */
function cleanLib() {
  for (const file of listFiles(LIB)) {
    rmSync(file, { force: true })
  }
  const removeEmptyDirs = dir => {
    if (!existsSync(dir)) return
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const full = join(dir, entry.name)
      removeEmptyDirs(full)
      if (readdirSync(full).length === 0) rmSync(full, { recursive: true, force: true })
    }
  }
  removeEmptyDirs(LIB)
}

const readJson = path => JSON.parse(readFileSync(path, 'utf8'))

/** 宿主包里是否有可用的 .d.ts（桌面版打包会剥掉，只剩 lib/types/*.js）。 */
function hostHasTypes() {
  const cordis = join(NODE_MODULES, '@deepseek-ai', 'cordis')
  return listFiles(cordis).some(file => file.endsWith('.d.ts'))
}

/** 宿主链接包 → 精确版本号，供类型缓存对齐（缺失的包跳过）。 */
function hostVersions(hostRoot) {
  const versions = {}
  for (const pkg of LINK_PKGS) {
    const manifest = join(hostRoot, '@deepseek-ai', pkg, 'package.json')
    if (!existsSync(manifest)) continue
    versions['@deepseek-ai/' + pkg] = readJson(manifest).version
  }
  return versions
}

/** 确保 node_modules/.host-types 里有一份与宿主同版本的类型副本。 */
function ensureHostTypes(hostRoot) {
  const versions = hostVersions(hostRoot)
  const manifestPath = join(TYPE_CACHE, 'package.json')
  const expected = { name: 'dsh-qq-companion-host-types', private: true, dependencies: versions }
  const installed = existsSync(manifestPath) ? readJson(manifestPath) : undefined
  const sameVersions = installed
    && JSON.stringify(installed.dependencies) === JSON.stringify(versions)
    && existsSync(join(TYPE_CACHE, 'node_modules', '@deepseek-ai', 'cordis'))

  if (!sameVersions) {
    console.log('build: 宿主未提供 .d.ts（桌面版打包剥离），正在获取同版本类型副本…')
    rmSync(TYPE_CACHE, { recursive: true, force: true })
    mkdirSync(TYPE_CACHE, { recursive: true })
    writeFileSync(manifestPath, JSON.stringify(expected, null, 2) + '\n')

    const npmCli = join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js')
    const command = existsSync(npmCli) ? process.execPath : (process.platform === 'win32' ? 'npm.cmd' : 'npm')
    const args = [
      ...(existsSync(npmCli) ? [npmCli] : []),
      'install',
      '--prefix', TYPE_CACHE,
      '--no-audit', '--no-fund', '--legacy-peer-deps', '--loglevel', 'error',
    ]
    const install = spawnSync(command, args, { cwd: TYPE_CACHE, stdio: 'inherit' })
    if (install.status !== 0) {
      fail('获取宿主类型副本失败，请检查网络后重跑（或设置 DSH_ROOT 指向含 .d.ts 的完整 dsh 安装）')
    }
  }

  const configPath = join(tmpdir(), 'dsh-qq-companion-build.tsconfig.json')
  writeFileSync(configPath, JSON.stringify({
    extends: join(ROOT, 'tsconfig.json').replace(/\\/g, '/'),
    compilerOptions: {
      baseUrl: ROOT.replace(/\\/g, '/'),
      // 临时配置在系统临时目录，@types 必须显式指回仓库。
      typeRoots: [join(NODE_MODULES, '@types').replace(/\\/g, '/')],
      paths: {
        '@deepseek-ai/*': [join(TYPE_CACHE, 'node_modules', '@deepseek-ai', '*').replace(/\\/g, '/')],
      },
    },
    include: [join(ROOT, 'src').replace(/\\/g, '/')],
    // 设置页前端（src/client）是浏览器代码，单独用 tsconfig.client.json 检查。
    exclude: [join(ROOT, 'src', 'client').replace(/\\/g, '/')],
  }, null, 2) + '\n')
  return configPath
}

if (!existsSync(TSC)) fail(`找不到 tsc，请先在 ${ROOT} 运行 npm install`)

let hostRoot
try {
  hostRoot = linkHost({ root: ROOT })
} catch (error) {
  fail(error instanceof Error ? error.message : String(error))
}

// 宿主自带 .d.ts 时按普通 tsconfig 编译；否则用类型副本兜底。
const tsconfigPath = hostHasTypes() ? join(ROOT, 'tsconfig.json') : ensureHostTypes(hostRoot)

cleanLib()

const version = spawnSync(process.execPath, [TSC, '--version'], { encoding: 'utf8' })
const tscVersion = (version.stdout ?? '').trim() || 'unknown'
console.log(`=== 编译 src → lib（${tscVersion}，宿主: ${hostRoot}）===`)

const result = spawnSync(process.execPath, [TSC, '-p', tsconfigPath], { cwd: ROOT, stdio: 'inherit' })
if (result.status !== 0) fail(`tsc 编译失败（退出码 ${result.status ?? 'null'}）`)

// 设置页前端：esbuild 打包 src/client → lib/client.js（外壳 + externals 见脚本内注释）。
const clientBuild = spawnSync(process.execPath, [BUILD_CLIENT], { cwd: ROOT, stdio: 'inherit' })
if (clientBuild.status !== 0) fail(`客户端 bundle 构建失败（退出码 ${clientBuild.status ?? 'null'}）`)

// 设置页前端类型检查（浏览器 lib：DOM；与宿主侧 lib/tsconfig 隔离）。
const clientCheck = spawnSync(process.execPath, [TSC, '-p', CLIENT_TSCONFIG], { cwd: ROOT, stdio: 'inherit' })
if (clientCheck.status !== 0) fail(`客户端类型检查失败（退出码 ${clientCheck.status ?? 'null'}）`)

const produced = listFiles(LIB)
const size = produced.reduce((sum, file) => sum + statSync(file).size, 0)
console.log(`=== 构建完成：lib/ 下 ${produced.length} 个文件，共 ${(size / 1024).toFixed(1)} KB ===`)
if (produced.length === 0) fail('lib/ 下没有任何产物')

// 便于人工核对：列出顶层产物
for (const file of produced.filter(item => !relative(LIB, item).includes('\\') && !relative(LIB, item).includes('/'))) {
  console.log(`  ${relative(LIB, file)}`)
}