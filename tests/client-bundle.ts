/** 客户端测试从源码构建到内存，不读取/写入共享lib产物。 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { buildSync } from 'esbuild'

let source: string | undefined
export function buildClientSource(): string {
  if (source != null) return source
  const root = fileURLToPath(new URL('..', import.meta.url))
  const packageName: string = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).name
  const result = buildSync({
    absWorkingDir: root,
    entryPoints: [fileURLToPath(new URL('../src/client/index.ts', import.meta.url))],
    bundle: true, format: 'cjs', platform: 'browser', external: ['react'],
    legalComments: 'none', charset: 'utf8', minify: false, write: false,
    define: { __PLUGIN_ID__: JSON.stringify(packageName) },
  })
  source = [
    'window.__ModuleLoader__.load({',
    '\tid: ' + JSON.stringify(packageName) + ',',
    '\tfactory: (require) => {',
    '\t\tvar module = { exports: {} };',
    '\t\tvar exports = module.exports;',
    result.outputFiles[0].text,
    '\t\treturn module.exports;',
    '\t}',
    '});',
  ].join('\n')
  return source
}

/** 保持与宿主CJS模块装载协议一致，只注入React。 */
export function loadClientSource(react: unknown): Record<string, unknown> {
  let factory: ((require: (name: string) => unknown) => unknown) | undefined
  const window = { __ModuleLoader__: { load(entry: { factory: typeof factory }) { factory = entry.factory } } }
  new Function('window', buildClientSource())(window)
  if (factory == null) throw new Error('客户端未注册CJS factory')
  return factory(name => {
    if (name !== 'react') throw new Error('unexpected external require: ' + name)
    return react
  }) as Record<string, unknown>
}
