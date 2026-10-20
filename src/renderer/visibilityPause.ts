/** 「页面不可见」状态标记（#22 / SPEC 批次 B6）。
 *
 *  标记恒挂 `document.documentElement`（文档根元素），**绝不**挂内容根容器 ——
 *  `AGENTS.md`「场景层约定」把「内容根容器永无 animation」列为结构不变量，
 *  reduced-motion 断言依赖它；把可见性开关挂到内容根上会打穿那条断言。
 *  只做 `document.hidden` 路径（最小实现）：不引入状态库、不订阅主进程事件。
 */
export const APP_HIDDEN_ATTR = 'data-app-hidden'

/** 把「页面不可见」标记同步到文档根元素；幂等，不触碰内容根容器。 */
export function syncAppHidden(hidden: boolean): void {
  const root = document.documentElement
  if (hidden) root.setAttribute(APP_HIDDEN_ATTR, '')
  else root.removeAttribute(APP_HIDDEN_ATTR)
}

/** 订阅 `visibilitychange`，并立即同步一次（页面以不可见状态启动时也能暂停）。
 *  返回清理函数，可直接作为 React effect 的返回值。 */
export function startVisibilityPause(): () => void {
  const sync = (): void => syncAppHidden(document.hidden)
  sync()
  document.addEventListener('visibilitychange', sync)
  return () => document.removeEventListener('visibilitychange', sync)
}
