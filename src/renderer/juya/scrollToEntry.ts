/** 阅读页页内跳转的滚动落点（渲染进程 DOM 辅助）。
 *
 *  落点 = 目标标题顶边距滚动口顶边 24px。阅读页内容挂在 CSS zoom 容器内：
 *  getBoundingClientRect 与滚动口同属视口坐标，差值可直接加到 scrollTop；
 *  不能用 offsetTop（那是未缩放的布局坐标，uiZoom ≠ 1 时会偏）。
 *  滚动口按 overflow-y 向上查找，不假定一定是 .view-scroll（Mini/测试容器可复用）。 */

export const ENTRY_SCROLL_OFFSET = 24

function findScrollContainer(from: HTMLElement): HTMLElement | null {
  let node = from.parentElement
  while (node) {
    const overflowY = getComputedStyle(node).overflowY
    if (overflowY === 'auto' || overflowY === 'scroll') return node
    node = node.parentElement
  }
  return null
}

export function scrollToEntry(target: HTMLElement): void {
  // 焦点先行且不滚动：平滑滚动途中若焦点触发滚动，会截断动画并造成二次跳动
  target.focus({ preventScroll: true })
  const scroller = findScrollContainer(target)
  if (!scroller) return
  const delta =
    target.getBoundingClientRect().top -
    scroller.getBoundingClientRect().top -
    ENTRY_SCROLL_OFFSET
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  scroller.scrollTo({
    top: scroller.scrollTop + delta,
    behavior: reduceMotion ? 'auto' : 'smooth'
  })
}
