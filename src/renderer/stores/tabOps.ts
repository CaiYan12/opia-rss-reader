import type { SavedSession } from '../../shared/types'
import type { Tab } from './useAppStore'

// 标签操作纯函数模块：无 React / 无副作用，供 useAppStore 与标签拖拽逻辑复用。
// 注意：本模块只用 import type 引用 Tab，避免与 useAppStore 形成运行时循环依赖。

export const MAX_TABS = 20
export const TAB_LIMIT_MSG = '标签已达上限（20）'

/**
 * 把 dragId 标签移到 targetId 标签之前（'before'）或之后（'after'），其余相对平移。
 * 语义与 Chrome 拖动一致：指针越过目标标签中心左侧=插入其前、右侧=插入其后。
 * - dragId 或 targetId 不在 tabs 中 / 二者相同 / 拖动后顺序与原来完全相同 → 返回原数组引用
 *   （调用方可据此跳过提交，避免触发会话写盘）
 * - 其余情形返回新数组（Tab 对象引用复用，不深拷贝）
 */
export function reorderTab(
  tabs: Tab[],
  dragId: string,
  targetId: string,
  placement: 'before' | 'after'
): Tab[] {
  if (dragId === targetId) return tabs
  const dragIdx = tabs.findIndex((t) => t.id === dragId)
  const targetIdx = tabs.findIndex((t) => t.id === targetId)
  if (dragIdx === -1 || targetIdx === -1) return tabs

  // 移除 drag 元素后的数组
  const rest = tabs.slice(0, dragIdx).concat(tabs.slice(dragIdx + 1))
  // targetId 在移除后数组中的位置（必存在，因 dragId !== targetId 且 targetIdx 合法）
  const targetPos = rest.findIndex((t) => t.id === targetId)
  const insertPos = placement === 'before' ? targetPos : targetPos + 1
  const next = rest.slice(0, insertPos).concat(tabs[dragIdx], rest.slice(insertPos))

  // 拖动后顺序与原来完全相同（如 drag 紧邻 target 且无需移动）→ 返回原数组引用
  if (next.every((t, i) => t.id === tabs[i].id)) return tabs
  return next
}

/** 是否还能新开标签（tabs.length < MAX_TABS） */
export function canOpenTab(tabs: Tab[]): boolean {
  return tabs.length < MAX_TABS
}

/** 恢复会话时截断到 max 个标签；activeTabIndex 越界时 clamp 到 [0, 新 tabs.length-1]；tabs 空时 index 为 0 */
export function truncateSavedSession(saved: SavedSession, max: number): SavedSession {
  const tabs = saved.tabs.slice(0, max)
  const activeTabIndex =
    tabs.length === 0 ? 0 : Math.min(Math.max(saved.activeTabIndex, 0), tabs.length - 1)
  return { tabs, activeTabIndex }
}
