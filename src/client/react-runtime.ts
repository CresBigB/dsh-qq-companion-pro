/**
 * React 运行时取值：client bundle 的外层 factory 只把 `require` 交给模块，
 * 平台冻结的外部模块表里只有 react（用它 + default 回退取到真实实现）。
 *
 * 类型走 `import type`（编译期擦除），运行时只保留这一次 require 调用。
 */
import type * as ReactTypes from 'react'

/** 面板实际用到的 React 面（最小子集：createElement + 两个 hook）。 */
export type ReactLike = {
  createElement(type: unknown, props?: unknown, ...children: unknown[]): ReactTypes.ReactElement
  useState: typeof ReactTypes.useState
  useEffect: typeof ReactTypes.useEffect
}

/** 宿主 CJS 加载器注入的 require（仅对冻结表内的外部模块可用）。 */
declare function require(specifier: string): unknown

/** react 模块的两种形态：本身带 createElement，或挂在 default 上。 */
interface ReactModuleLike {
  createElement?: unknown
  default?: unknown
}

const reactModule = require('react') as ReactModuleLike | null | undefined
const ReactImpl = reactModule != null && typeof reactModule.createElement === 'function'
  ? reactModule
  : (reactModule == null ? undefined : reactModule.default)

if (ReactImpl == null || typeof (ReactImpl as ReactModuleLike).createElement !== 'function') {
  throw new Error('dsh-qq-companion-pro client: react 不可用')
}

/** 面板与渲染函数统一使用的 React 实现。 */
export const React = ReactImpl as ReactLike