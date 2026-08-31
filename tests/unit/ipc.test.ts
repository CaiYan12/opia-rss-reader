import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeSettings } from './helpers/opiaStub'

const electronStub = vi.hoisted(() => ({
  handlers: new Map<string, (e: unknown, ...args: never[]) => unknown>(),
  shouldUseDarkColors: false,
  openExternal: vi.fn(async () => undefined)
}))

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, fn: (e: unknown, ...args: never[]) => unknown) => {
      electronStub.handlers.set(channel, fn)
    }
  },
  nativeTheme: {
    get shouldUseDarkColors() {
      return electronStub.shouldUseDarkColors
    }
  },
  shell: { openExternal: electronStub.openExternal }
}))

const windowStub = vi.hoisted(() => ({
  closeMainWindow: vi.fn(),
  minimizeWindow: vi.fn(),
  setWindowPageTitle: vi.fn(),
  toggleMaximize: vi.fn(),
  toggleMiniMode: vi.fn(async () => true)
}))
vi.mock('../../src/main/window', () => windowStub)

import { registerIpc } from '../../src/main/ipc'
import { IPC } from '../../src/shared/ipc-contract'

/** 主 → 渲染推送通道：由 webContents.send 发出，不在 ipcMain.handle 注册。 */
const PUSH_CHANNELS: string[] = [IPC.FeedUpdated, IPC.ThemeSystemChanged, IPC.WindowMaximizeChanged]

function createDeps() {
  const store = {
    getHistory: vi.fn(() => ({})),
    markRead: vi.fn(),
    toggleFavorite: vi.fn(() => true),
    getSettings: vi.fn(() => makeSettings()),
    setSettings: vi.fn((patch: object) => makeSettings(patch as never)),
    getSession: vi.fn(() => null),
    setSession: vi.fn()
  }
  const feed = {
    list: vi.fn(() => ['articles']),
    refresh: vi.fn(async () => ({ added: 3 })),
    getSources: vi.fn(() => ['sources']),
    addSource: vi.fn(() => 'addedSource'),
    removeSource: vi.fn(),
    toggleSource: vi.fn(),
    setDefaultSource: vi.fn(() => ['defaulted']),
    startAutoRefresh: vi.fn(),
    stopAutoRefresh: vi.fn()
  }
  const theme = {
    list: vi.fn(() => ['themes']),
    get: vi.fn(() => null),
    save: vi.fn(),
    delete: vi.fn()
  }
  return {
    deps: { store, feed, theme } as unknown as Parameters<typeof registerIpc>[0],
    store,
    feed,
    theme
  }
}

let deps: ReturnType<typeof createDeps>
let store: ReturnType<typeof createDeps>['store']
let feed: ReturnType<typeof createDeps>['feed']
let theme: ReturnType<typeof createDeps>['theme']

function call<T = unknown>(channel: string, ...args: unknown[]): T {
  const handler = electronStub.handlers.get(channel)
  if (!handler) throw new Error(`no handler registered for ${channel}`)
  return handler({}, ...args) as T
}

beforeEach(() => {
  electronStub.handlers.clear()
  electronStub.openExternal.mockClear()
  electronStub.shouldUseDarkColors = false
  for (const fn of Object.values(windowStub)) fn.mockClear()
  deps = createDeps()
  ;({ store, feed, theme } = deps)
  registerIpc(deps.deps)
})

describe('IPC 通道注册完备性', () => {
  it('每个请求型契约常量都注册了 handler', () => {
    const requestChannels = Object.values(IPC).filter((c) => !PUSH_CHANNELS.includes(c))
    for (const channel of requestChannels) {
      expect(electronStub.handlers.has(channel), channel).toBe(true)
    }
  })

  it('推送型常量不注册 handler（否则 invoke 通道出现幽灵监听）', () => {
    for (const channel of PUSH_CHANNELS) {
      expect(electronStub.handlers.has(channel), channel).toBe(false)
    }
  })

  it('注册的 handler 数与请求型通道数相等（无游离通道、无重复注册）', () => {
    const requestChannels = Object.values(IPC).filter((c) => !PUSH_CHANNELS.includes(c))
    expect(electronStub.handlers.size).toBe(requestChannels.length)
  })

  it('通道字符串全局唯一', () => {
    const values = Object.values(IPC)
    expect(new Set(values).size).toBe(values.length)
  })
})

describe('IPC 委托到服务层', () => {
  it('feed 系列透传参数并回传结果', async () => {
    expect(call(IPC.FeedList, 's1')).toEqual(['articles'])
    expect(feed.list).toHaveBeenCalledWith('s1')
    await expect(call<Promise<{ added: number }>>(IPC.FeedRefresh, 's1')).resolves.toEqual({
      added: 3
    })
    expect(feed.refresh).toHaveBeenCalledWith('s1')
    expect(call(IPC.FeedSources)).toEqual(['sources'])
    expect(call(IPC.FeedSourceSetDefault, 'a')).toEqual(['defaulted'])
    call(IPC.FeedSourceRemove, 'a')
    expect(feed.removeSource).toHaveBeenCalledWith('a')
    call(IPC.FeedSourceToggle, 'a', false)
    expect(feed.toggleSource).toHaveBeenCalledWith('a', false)
  })

  it('history 系列委托 StoreService', () => {
    call(IPC.HistoryMarkRead, 'g1')
    expect(store.markRead).toHaveBeenCalledWith('g1')
    expect(call(IPC.HistoryToggleFavorite, 'g1')).toBe(true)
    expect(call(IPC.HistoryGet)).toEqual({})
  })

  it('theme 系列委托 ThemeService', () => {
    expect(call(IPC.ThemeList)).toEqual(['themes'])
    call(IPC.ThemeSave, { id: 'x' })
    expect(theme.save).toHaveBeenCalledWith({ id: 'x' })
    call(IPC.ThemeDelete, 'x')
    expect(theme.delete).toHaveBeenCalledWith('x')
  })

  it('ThemeSystemGet 直接读 nativeTheme 而不走服务层', () => {
    expect(call(IPC.ThemeSystemGet)).toBe(false)
    electronStub.shouldUseDarkColors = true
    expect(call(IPC.ThemeSystemGet)).toBe(true)
  })
})

describe('IPC.SettingsSet 的自动刷新副作用', () => {
  it('补丁含 refreshIntervalMin 时按合并后的值重启定时器', () => {
    store.setSettings.mockImplementation((patch: object) =>
      makeSettings({ ...(patch as object), refreshIntervalMin: 15 } as never)
    )
    call(IPC.SettingsSet, { refreshIntervalMin: 15 })
    expect(feed.startAutoRefresh).toHaveBeenCalledWith(15)
  })

  it('补丁不含 refreshIntervalMin 时不打扰定时器', () => {
    call(IPC.SettingsSet, { uiZoom: 1.1 })
    expect(feed.startAutoRefresh).not.toHaveBeenCalled()
  })

  it('返回合并后的完整设置', () => {
    const result = call<{ uiZoom: number; themeMode: string }>(IPC.SettingsSet, { uiZoom: 1.5 })
    expect(result.uiZoom).toBe(1.5)
    expect(result.themeMode).toBe('light')
  })
})

describe('IPC 会话落盘', () => {
  it('SessionSave 写入存储且返回 undefined（渲染层 fire-and-forget）', () => {
    store.setSession.mockReturnValue('leaked-return-value')
    expect(call(IPC.SessionSave, { tabs: [], activeTabIndex: 0 })).toBeUndefined()
    expect(store.setSession).toHaveBeenCalledWith({ tabs: [], activeTabIndex: 0 })
  })

  it('SessionGet 回传存储内容', () => {
    store.getSession.mockReturnValue({ tabs: [], activeTabIndex: 2 })
    expect(call(IPC.SessionGet)).toEqual({ tabs: [], activeTabIndex: 2 })
  })
})

describe('IPC 窗口控制一律经主进程', () => {
  it('五个窗口通道分别委托 window 模块', () => {
    call(IPC.WindowToggleMini)
    expect(windowStub.toggleMiniMode).toHaveBeenCalledTimes(1)
    call(IPC.WindowMinimize)
    expect(windowStub.minimizeWindow).toHaveBeenCalledTimes(1)
    call(IPC.WindowToggleMaximize)
    expect(windowStub.toggleMaximize).toHaveBeenCalledTimes(1)
    call(IPC.WindowClose)
    expect(windowStub.closeMainWindow).toHaveBeenCalledTimes(1)
    call(IPC.WindowSetTitle, '阅读页')
    expect(windowStub.setWindowPageTitle).toHaveBeenCalledWith('阅读页')
  })
})

describe('IPC.AppOpenExternal 协议白名单（安全边界）', () => {
  it('放行 http 与 https', async () => {
    await call(IPC.AppOpenExternal, 'https://daily.juya.uk/issue')
    await call(IPC.AppOpenExternal, 'http://example.com')
    expect(electronStub.openExternal).toHaveBeenNthCalledWith(1, 'https://daily.juya.uk/issue')
    expect(electronStub.openExternal).toHaveBeenNthCalledWith(2, 'http://example.com')
  })

  it('拦截 javascript: / file: / data: 与相对地址', () => {
    const blocked = [
      'javascript:alert(1)',
      'JaVaScRiPt:alert(1)',
      'file:///C:/Windows/system32/calc.exe',
      'data:text/html,<script>alert(1)</script>',
      '/relative/path',
      'example.com/x',
      ' jvs://custom/scheme',
      ''
    ]
    for (const url of blocked) {
      expect(() => call(IPC.AppOpenExternal, url), url).toThrowError(/blocked non-http url/)
    }
    expect(electronStub.openExternal).not.toHaveBeenCalled()
  })

  it('拦截时错误信息不泄露到 shell（openExternal 调用数为 0）', () => {
    electronStub.openExternal.mockClear()
    expect(() => call(IPC.AppOpenExternal, 'javascript:alert(document.cookie)')).toThrow()
    expect(electronStub.openExternal).not.toHaveBeenCalled()
  })
})
