import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * 契约三处同步守卫（AGENTS.md 架构约束 2）：
 * IPC 契约常量 → preload 暴露 → main handler 必须一一对应，任何一处漏改即失败。
 */
const bridge = vi.hoisted(() => ({
  worlds: [] as Array<{ name: string; api: Record<string, unknown> }>,
  invokeCalls: [] as Array<{ channel: string; args: unknown[] }>,
  listeners: [] as Array<{ channel: string; fn: unknown }>,
  handlers: new Map<string, unknown>()
}))

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: (name: string, api: Record<string, unknown>) => {
      bridge.worlds.push({ name, api })
    }
  },
  ipcRenderer: {
    invoke: (channel: string, ...args: unknown[]) => {
      bridge.invokeCalls.push({ channel, args })
      return Promise.resolve(null)
    },
    on: (channel: string, fn: unknown) => {
      bridge.listeners.push({ channel, fn })
    },
    removeListener: (channel: string, fn: unknown) => {
      bridge.listeners = bridge.listeners.filter((l) => !(l.channel === channel && l.fn === fn))
    }
  },
  ipcMain: {
    handle: (channel: string, fn: unknown) => {
      bridge.handlers.set(channel, fn)
    }
  },
  nativeTheme: { shouldUseDarkColors: false },
  shell: { openExternal: async () => undefined }
}))

vi.mock('../../src/main/window', () => ({
  closeMainWindow: vi.fn(),
  minimizeWindow: vi.fn(),
  setWindowPageTitle: vi.fn(),
  toggleMaximize: vi.fn(),
  toggleMiniMode: vi.fn()
}))

import { IPC } from '../../src/shared/ipc-contract'
import { registerIpc } from '../../src/main/ipc'
import '../../src/preload/index'

const api = bridge.worlds[0]?.api ?? {}

/** 主进程推送、渲染层只订阅的通道 */
const PUSH_CHANNEL_KEYS = ['FeedUpdated', 'ThemeSystemChanged', 'WindowMaximizeChanged'] as const

function collectSources(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) return collectSources(full)
    return entry.endsWith('.ts') ? [full] : []
  })
}

beforeEach(() => {
  bridge.invokeCalls.length = 0
  bridge.listeners.length = 0
  bridge.handlers.clear()
})

describe('preload 桥', () => {
  it('只暴露一个名为 opia 的桥对象', () => {
    expect(bridge.worlds).toHaveLength(1)
    expect(bridge.worlds[0].name).toBe('opia')
  })

  it('OpiaApi 的每个方法都在桥上有实现', () => {
    const expected = [
      'feedList',
      'feedRefresh',
      'feedSources',
      'feedSourceValidate',
      'feedSourceAdd',
      'feedSourceRemove',
      'feedSourceToggle',
      'feedSourceSetDefault',
      'historyGet',
      'historyMarkRead',
      'historyToggleFavorite',
      'settingsGet',
      'settingsSet',
      'sessionGet',
      'sessionSave',
      'themeList',
      'themeGet',
      'themeSave',
      'themeDelete',
      'themeSystemGet',
      'toggleMini',
      'windowMinimize',
      'windowToggleMaximize',
      'windowClose',
      'windowSetTitle',
      'openExternal',
      'onFeedUpdated',
      'onWindowMaximizeChanged',
      'onThemeSystemChanged'
    ]
    for (const method of expected) expect(typeof api[method], method).toBe('function')
    expect(Object.keys(api).sort()).toEqual([...expected].sort())
  })

  it('桥上调用的每个通道都已在主进程注册 handler', () => {
    registerIpc({
      store: {} as never,
      feed: {} as never,
      theme: {} as never
    })
    for (const [key, value] of Object.entries(api)) {
      if (typeof value !== 'function' || key.startsWith('on')) continue
      ;(value as (a?: unknown) => unknown)('arg')
      const channel = bridge.invokeCalls.at(-1)?.channel
      expect(channel, key).toBeTruthy()
      expect(bridge.handlers.has(channel), `${key} -> ${channel}`).toBe(true)
    }
  })

  it('主进程每个 handler 通道都可从渲染层触达（无只注册不暴露的死通道）', () => {
    registerIpc({ store: {} as never, feed: {} as never, theme: {} as never })
    for (const key of Object.keys(api)) {
      const value = api[key]
      if (typeof value !== 'function' || key.startsWith('on')) continue
      ;(value as (a?: unknown) => unknown)('arg')
    }
    const reachable = new Set(bridge.invokeCalls.map((c) => c.channel))
    for (const channel of bridge.handlers.keys()) {
      expect(reachable.has(channel), channel).toBe(true)
    }
    expect(reachable.size).toBe(bridge.handlers.size)
  })

  it('参数按序透传', () => {
    ;(api.feedSourceToggle as (id: string, enabled: boolean) => unknown)('s1', false)
    expect(bridge.invokeCalls.at(-1)).toEqual({
      channel: IPC.FeedSourceToggle,
      args: ['s1', false]
    })
    ;(api.windowSetTitle as (t: string) => unknown)('阅读')
    expect(bridge.invokeCalls.at(-1)).toEqual({
      channel: IPC.WindowSetTitle,
      args: ['阅读']
    })
  })

  it('window 类 API 名与通道前缀不同步的易错点已锁定（toggleMini → window:toggle-mini）', () => {
    ;(api.toggleMini as () => unknown)()
    expect(bridge.invokeCalls.at(-1)?.channel).toBe(IPC.WindowToggleMini)
    ;(api.openExternal as (u: string) => unknown)('https://x.test')
    expect(bridge.invokeCalls.at(-1)?.channel).toBe(IPC.AppOpenExternal)
    ;(api.themeSystemGet as () => unknown)()
    expect(bridge.invokeCalls.at(-1)?.channel).toBe(IPC.ThemeSystemGet)
  })
})

describe('渲染层订阅通道', () => {
  it('三个 on* 方法各订阅其推送通道', () => {
    const cases: Array<[string, unknown]> = [
      [IPC.FeedUpdated, api.onFeedUpdated],
      [IPC.ThemeSystemChanged, api.onThemeSystemChanged],
      [IPC.WindowMaximizeChanged, api.onWindowMaximizeChanged]
    ]
    for (const [channel, method] of cases) {
      bridge.listeners.length = 0
      ;(method as (cb: unknown) => unknown)(() => {})
      expect(bridge.listeners.map((l) => l.channel)).toEqual([channel])
    }
  })

  it('返回的解绑函数移除对应监听（避免 keep-alive 标签重复订阅）', () => {
    bridge.listeners.length = 0
    const off = (api.onFeedUpdated as (cb: unknown) => () => void)(() => {})
    expect(bridge.listeners).toHaveLength(1)
    off()
    expect(bridge.listeners).toHaveLength(0)
  })

  it('解绑只影响自己，不误删同通道其他监听', () => {
    bridge.listeners.length = 0
    const offA = (api.onFeedUpdated as (cb: unknown) => () => void)(() => {})
    ;(api.onFeedUpdated as (cb: unknown) => () => void)(() => {})
    offA()
    expect(bridge.listeners).toHaveLength(1)
  })
})

describe('通道字符串卫生（禁止裸字符串）', () => {
  const mainSources = collectSources(join(process.cwd(), 'src/main'))

  it('主进程不存在任何 webContents.send 裸字符串通道', () => {
    const offenders: string[] = []
    for (const file of mainSources) {
      const text = readFileSync(file, 'utf-8')
      for (const match of text.matchAll(/webContents\.send\(\s*(['"])([^'"]+)\1/g)) {
        offenders.push(`${file}: ${match[2]}`)
      }
    }
    expect(offenders, '裸字符串通道必须改用 IPC 契约常量').toEqual([])
  })

  it('每个推送通道常量都在主进程里被 send 出去', () => {
    const text = mainSources.map((f) => readFileSync(f, 'utf-8')).join('\n')
    for (const key of PUSH_CHANNEL_KEYS) {
      expect(text, `IPC.${key}`).toContain(`IPC.${key}`)
      expect(text, `IPC.${key}`).toMatch(new RegExp(`send\\(IPC\\.${key}`))
    }
  })

  it('契约中不存在既未注册 handler 也未推送的幽灵通道', () => {
    registerIpc({ store: {} as never, feed: {} as never, theme: {} as never })
    const pushChannels = PUSH_CHANNEL_KEYS.map((k) => IPC[k])
    const sendText = mainSources
      .map((f) => readFileSync(f, 'utf-8'))
      .join('\n')
    for (const [key, channel] of Object.entries(IPC)) {
      const handled = bridge.handlers.has(channel)
      const pushed = new RegExp(`send\\(IPC\\.${key}\\b`).test(sendText)
      expect(handled || pushed, `IPC.${key}`).toBe(true)
      expect(pushChannels.includes(channel), `IPC.${key}`).toBe(!handled)
    }
  })
})
