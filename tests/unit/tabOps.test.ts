import { describe, expect, it } from 'vitest'
import type { Article, SavedSession } from '../../src/shared/types'
import type { Tab } from '../../src/renderer/stores/useAppStore'
import {
  MAX_TABS,
  TAB_LIMIT_MSG,
  canOpenTab,
  reorderTab,
  truncateSavedSession
} from '../../src/renderer/stores/tabOps'

// tabOps 纯函数契约测试（TDD 先行，实现见 src/renderer/stores/tabOps.ts）。
// reorderTab 核心要求：无效 ID / 相同位置 / 拖动后顺序不变 → 返回原数组引用（===）。

function makeArticle(guid: string): Article {
  return {
    guid,
    sourceId: 'juya-daily',
    title: `标题 ${guid}`,
    link: `https://example.com/${guid}`,
    pubDate: '2026-08-28T10:00:00Z',
    summary: '摘要',
    contentHtml: '<p>正文</p>',
    coverUrl: null
  }
}

function home(id: string): Tab {
  return { id, kind: 'home', homePage: 'feed' }
}
function reader(id: string): Tab {
  return { id, kind: 'reader', article: makeArticle(id) }
}
function browser(id: string): Tab {
  return { id, kind: 'browser', url: `https://example.com/${id}` }
}
function settings(id: string): Tab {
  return { id, kind: 'settings' }
}
function tabIds(tabs: Tab[]): string[] {
  return tabs.map((t) => t.id)
}
function makeSession(n: number, activeTabIndex: number): SavedSession {
  return {
    tabs: Array.from({ length: n }, () => ({ kind: 'home' as const, homePage: 'feed' as const })),
    activeTabIndex
  }
}

describe('reorderTab — 顺序重排', () => {
  it('首位拖到末位（插入到末位之后）', () => {
    const tabs = [home('t1'), reader('t2'), browser('t3'), settings('t4')]
    const next = reorderTab(tabs, 't1', 't4', 'after')
    expect(tabIds(next)).toEqual(['t2', 't3', 't4', 't1'])
    expect(next).not.toBe(tabs)
  })

  it('末位拖到首位（插入到首位之前）', () => {
    const tabs = [home('t1'), reader('t2'), browser('t3'), settings('t4')]
    const next = reorderTab(tabs, 't4', 't1', 'before')
    expect(tabIds(next)).toEqual(['t4', 't1', 't2', 't3'])
    expect(next).not.toBe(tabs)
  })

  it('相邻交换（t2 拖到 t1 之前）', () => {
    const tabs = [home('t1'), reader('t2'), browser('t3')]
    const next = reorderTab(tabs, 't2', 't1', 'before')
    expect(tabIds(next)).toEqual(['t2', 't1', 't3'])
    expect(next).not.toBe(tabs)
  })

  it('相邻交换（t2 拖到 t3 之后）', () => {
    const tabs = [home('t1'), reader('t2'), browser('t3')]
    const next = reorderTab(tabs, 't2', 't3', 'after')
    expect(tabIds(next)).toEqual(['t1', 't3', 't2'])
    expect(next).not.toBe(tabs)
  })

  it('中间拖到中间（t2 插到 t4 之后）', () => {
    const tabs = [home('t1'), reader('t2'), browser('t3'), settings('t4'), home('t5')]
    const next = reorderTab(tabs, 't2', 't4', 'after')
    expect(tabIds(next)).toEqual(['t1', 't3', 't4', 't2', 't5'])
    expect(next).not.toBe(tabs)
  })

  it('复用原 Tab 对象引用（不深拷贝）', () => {
    const tabs = [home('t1'), reader('t2'), browser('t3')]
    const next = reorderTab(tabs, 't1', 't3', 'after')
    // 语义：移除 t1 后 [t2,t3]，插到 t3 之后 → [t2,t3,t1]
    expect(next[0]).toBe(tabs[1])
    expect(next[1]).toBe(tabs[2])
    expect(next[2]).toBe(tabs[0])
  })
})

describe('reorderTab — 返回原数组引用', () => {
  it('dragId === targetId', () => {
    const tabs = [home('t1'), reader('t2'), browser('t3')]
    expect(reorderTab(tabs, 't2', 't2', 'before')).toBe(tabs)
  })

  it('dragId 不存在', () => {
    const tabs = [home('t1'), reader('t2'), browser('t3')]
    expect(reorderTab(tabs, 'nope', 't2', 'after')).toBe(tabs)
  })

  it('targetId 不存在', () => {
    const tabs = [home('t1'), reader('t2'), browser('t3')]
    expect(reorderTab(tabs, 't1', 'nope', 'after')).toBe(tabs)
  })

  it('dragId 与 targetId 都不存在', () => {
    const tabs = [home('t1'), reader('t2'), browser('t3')]
    expect(reorderTab(tabs, 'nope1', 'nope2', 'after')).toBe(tabs)
  })

  it('空数组', () => {
    const tabs: Tab[] = []
    expect(reorderTab(tabs, 'a', 'b', 'before')).toBe(tabs)
  })

  it('drag 紧邻 target 之前且插其前：顺序不变（t2 插 t3 前）', () => {
    const tabs = [home('t1'), reader('t2'), browser('t3')]
    expect(reorderTab(tabs, 't2', 't3', 'before')).toBe(tabs)
  })

  it('drag 紧邻 target 之后且插其后：顺序不变（t2 插 t1 后）', () => {
    const tabs = [home('t1'), reader('t2'), browser('t3')]
    expect(reorderTab(tabs, 't2', 't1', 'after')).toBe(tabs)
  })

  it('两元素数组 t1 插 t2 后：顺序变为 [t2,t1]（新数组）', () => {
    const tabs = [home('t1'), reader('t2')]
    const next = reorderTab(tabs, 't1', 't2', 'after')
    expect(tabIds(next)).toEqual(['t2', 't1'])
    expect(next).not.toBe(tabs)
  })
})

describe('canOpenTab — 上限判断', () => {
  it('19 个标签可开', () => {
    const tabs = Array.from({ length: 19 }, (_, i) => home(`t${i}`))
    expect(canOpenTab(tabs)).toBe(true)
  })

  it('20 个标签不可开', () => {
    const tabs = Array.from({ length: 20 }, (_, i) => home(`t${i}`))
    expect(canOpenTab(tabs)).toBe(false)
  })

  it('21 个标签不可开', () => {
    const tabs = Array.from({ length: 21 }, (_, i) => home(`t${i}`))
    expect(canOpenTab(tabs)).toBe(false)
  })
})

describe('truncateSavedSession — 会话截断与越界收敛', () => {
  it('25 个标签截断到 20，index 在界内不变', () => {
    const next = truncateSavedSession(makeSession(25, 5), MAX_TABS)
    expect(next.tabs).toHaveLength(20)
    expect(next.activeTabIndex).toBe(5)
  })

  it('index 越界（30）clamp 到 19', () => {
    const next = truncateSavedSession(makeSession(25, 30), MAX_TABS)
    expect(next.tabs).toHaveLength(20)
    expect(next.activeTabIndex).toBe(19)
  })

  it('index 为负值 clamp 到 0', () => {
    const next = truncateSavedSession(makeSession(25, -3), MAX_TABS)
    expect(next.activeTabIndex).toBe(0)
  })

  it('tabs 空时 index 为 0', () => {
    expect(truncateSavedSession({ tabs: [], activeTabIndex: 3 }, MAX_TABS)).toEqual({
      tabs: [],
      activeTabIndex: 0
    })
  })
})

describe('常量契约', () => {
  it('MAX_TABS = 20', () => {
    expect(MAX_TABS).toBe(20)
  })

  it('TAB_LIMIT_MSG 文案', () => {
    expect(TAB_LIMIT_MSG).toBe('标签已达上限（20）')
  })
})
