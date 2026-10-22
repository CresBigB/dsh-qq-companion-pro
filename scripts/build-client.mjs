#!/usr/bin/env node
// 设置页前端源码（src/client）→ lib/client.js（浏览器可跑的 CJS 包裹 bundle）。
// 用法：npm run build:client（npm run build 内部也会调用）。
//
// 产物外壳与宿主装载契约逐字绑定（tests/client-settings.spec.ts 断言）：
//   window.__ModuleLoader__.load({ id, factory: (require) => { ... return module.exports; } });
// 外部模块表只有 react；PLUGIN_ID 从 package.json 的 name 注入，源码不硬编码。
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { build } from 'esbuild'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const ENTRY = join(ROOT, 'src', 'client', 'index.ts')
const OUT = join(ROOT, 'lib', 'client.js')
const PACKAGE_JSON = join(ROOT, 'package.json')

/** 产物文件头：构建生成，源码在 src/client/，不要手改。 */
const HEADER = [
	'/**',
	' * dsh-qq-companion-pro — 设置页 client bundle（QQ Bot 设置面板）。',
	' *',
	' * 本文件由 scripts/build-client.mjs 构建生成，源码在 src/client/，不要手改；',
	' * 改完源码跑 `npm run build`（或 `npm run build:client`）重新生成。',
	' * 外层包裹 = 宿主 window.__ModuleLoader__ 的 CJS 装载形态，外部模块表只有 react。',
	' */',
].join('\n')

const packageName = JSON.parse(readFileSync(PACKAGE_JSON, 'utf8')).name
if (typeof packageName !== 'string' || packageName === '') {
	console.error('build-client: package.json 里没有 name，无法注入 PLUGIN_ID')
	process.exit(1)
}

let text
try {
	const result = await build({
		entryPoints: [ENTRY],
		absWorkingDir: ROOT,
		bundle: true,
		format: 'cjs',
		platform: 'browser',
		external: ['react'],
		legalComments: 'none',
		charset: 'utf8', // 中文不转义成 \uXXXX
		minify: false,
		write: false,
		logLevel: 'warning',
		define: { __PLUGIN_ID__: JSON.stringify(packageName) },
	})
	text = result.outputFiles[0].text
} catch (error) {
	console.error('build-client: ' + (error instanceof Error ? error.message : String(error)))
	process.exit(1)
}

// 统一缩进两个制表符（空行保持空），去掉文件末尾多余空行。
const body = text.replace(/\n+$/, '').split('\n').map(line => (line === '' ? '' : '\t\t' + line)).join('\n')

const source = [
	HEADER,
	'',
	'window.__ModuleLoader__.load({',
	'\tid: ' + JSON.stringify(packageName) + ',',
	'\tfactory: (require) => {',
	'\t\tvar module = { exports: {} };',
	'\t\tvar exports = module.exports;',
	'',
	body,
	'',
	'\t\treturn module.exports;',
	'\t}',
	'});',
	'',
].join('\n')

mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, source)

console.log(`=== 客户端 bundle 完成：lib/client.js（${(Buffer.byteLength(source, 'utf8') / 1024).toFixed(1)} KB，id: ${packageName}）===`)