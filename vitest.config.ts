import { configDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // diagnostics 下的独立 node:test 由 node --test 执行，不由 Vitest 执行。
    exclude: [...configDefaults.exclude, 'diagnostics/**'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // stt.ts needs a local whisper install; covered by its own opt-in checks.
      // src/client 是浏览器 bundle 源码，经 lib/client.js 求值测试（见 client-settings.spec）。
      exclude: ['src/stt.ts', 'src/client/**'],
      reporter: ['text-summary', 'json-summary', 'html'],
      // A little under the current numbers: fail on real regressions only.
      thresholds: { lines: 86, statements: 86, functions: 85, branches: 80 },
    },
  },
})
