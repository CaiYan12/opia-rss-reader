import { afterEach, describe, expect, it } from 'vitest'
import {
  APP_HIDDEN_ATTR,
  startVisibilityPause,
  syncAppHidden
} from '../../src/renderer/visibilityPause'

/** 页面不可见暂停标记（#22 / SPEC 批次 B6）。
 *  只做 `document.hidden` 路径；真实窗口的最小化 / 隐藏 / Mini 切换由用户真机验收。 */

describe('页面不可见暂停标记（#22 / SPEC B6）', () => {
  afterEach(() => {
    document.documentElement.removeAttribute(APP_HIDDEN_ATTR)
    // 删除实例上的隐藏属性后回落到 happy-dom 原型上的 getter
    Reflect.deleteProperty(document, 'hidden')
  })

  it('标记置/清都落在 documentElement 上，不碰内容根容器', () => {
    const root = document.createElement('div')
    root.className = 'juya-root jynoct'
    document.body.appendChild(root)
    syncAppHidden(true)
    expect(document.documentElement.hasAttribute(APP_HIDDEN_ATTR)).toBe(true)
    expect(root.hasAttribute(APP_HIDDEN_ATTR), '标记不得挂内容根容器').toBe(false)
    syncAppHidden(false)
    expect(document.documentElement.hasAttribute(APP_HIDDEN_ATTR)).toBe(false)
    root.remove()
  })

  it('visibilitychange 按 document.hidden 同步，清理后不再响应', () => {
    const stop = startVisibilityPause()
    Object.defineProperty(document, 'hidden', { configurable: true, value: true })
    document.dispatchEvent(new Event('visibilitychange'))
    expect(document.documentElement.hasAttribute(APP_HIDDEN_ATTR)).toBe(true)
    Object.defineProperty(document, 'hidden', { configurable: true, value: false })
    document.dispatchEvent(new Event('visibilitychange'))
    expect(document.documentElement.hasAttribute(APP_HIDDEN_ATTR)).toBe(false)
    stop()
    Object.defineProperty(document, 'hidden', { configurable: true, value: true })
    document.dispatchEvent(new Event('visibilitychange'))
    expect(document.documentElement.hasAttribute(APP_HIDDEN_ATTR), '清理后不再置标记').toBe(false)
  })

  it('启动时立即同步一次（以不可见状态启动也能暂停）', () => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true })
    const stop = startVisibilityPause()
    expect(document.documentElement.hasAttribute(APP_HIDDEN_ATTR)).toBe(true)
    stop()
  })
})
