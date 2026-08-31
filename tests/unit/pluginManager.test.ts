import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readdirSync } from 'node:fs'

const paths = vi.hoisted(() => ({ appPath: '', userData: '' }))

vi.mock('electron', () => ({
  app: {
    getAppPath: () => paths.appPath,
    getPath: (name: string) => (name === 'userData' ? paths.userData : join(paths.userData, name))
  }
}))

import { ThemeService } from '../../src/main/theme/ThemeService'
import type { FeedProvider } from '../../src/shared/plugin-api'

const REPO_PLUGINS = join(process.cwd(), 'plugins')
const requireCjs = createRequire(join(process.cwd(), 'package.json'))

interface RepoManifest {
  id: string
  name: string
  version: string
  main: string
  provides: string[]
}

/** require 对 .json 已由 Node 解析为对象，不可再 JSON.parse */
function repoManifest(name: string): RepoManifest {
  return requireCjs(join(REPO_PLUGINS, name, 'manifest.json')) as RepoManifest
}

let appPlugins: string
let userPlugins: string

function writePlugin(
  root: string,
  dirName: string,
  manifest: unknown,
  entry?: { file?: string; code?: string }
): string {
  const dir = join(root, dirName)
  mkdirSync(dir, { recursive: true })
  if (manifest !== undefined) {
    writeFileSync(
      join(dir, 'manifest.json'),
      typeof manifest === 'string' ? manifest : JSON.stringify(manifest),
      'utf-8'
    )
  }
  if (entry?.code !== undefined) {
    writeFileSync(join(dir, entry.file ?? 'index.cjs'), entry.code, 'utf-8')
  }
  return dir
}

function providerManifest(id: string) {
  return {
    id,
    name: id,
    version: '1.0.0',
    main: 'index.cjs',
    provides: ['feed-provider']
  }
}

function themeManifest(id: string, provides: string[] = ['theme']) {
  return { id, name: id, version: '1.0.0', main: 'index.cjs', provides }
}

const validThemeSource = (id: string) => `
  const colors = { bg: '#111111', surface: '#222222', card: '#333333', border: '#444444',
    text: '#eeeeee', textSecondary: '#cccccc', accent: '#0067c0', accentHover: '#005099',
    onAccent: '#ffffff', chip: '#555555', chipText: '#666666', read: '#777777' }
  module.exports = { themes: [{ id: '${id}', name: '${id}', colorScheme: 'dark', colors,
    fonts: { heading: 'serif', body: 'serif' }, radius: 8, spacing: 16 }] }
`

async function createManager(feed: unknown) {
  vi.resetModules()
  const { PluginManager } = await import('../../src/main/plugin/PluginManager')
  return new PluginManager(feed as never)
}

beforeEach(() => {
  paths.appPath = mkdtempSync(join(tmpdir(), 'opia-app-'))
  paths.userData = mkdtempSync(join(tmpdir(), 'opia-user-'))
  appPlugins = join(paths.appPath, 'plugins')
  userPlugins = join(paths.userData, 'plugins')
  mkdirSync(appPlugins, { recursive: true })
  mkdirSync(userPlugins, { recursive: true })
})

afterEach(() => {
  vi.unstubAllGlobals()
  rmSync(paths.appPath, { recursive: true, force: true })
  rmSync(paths.userData, { recursive: true, force: true })
})

describe('PluginManager 加载与门控', () => {
  it('声明 feed-provider 的插件其 provider 注册进 FeedService', async () => {
    writePlugin(appPlugins, 'p1', providerManifest('p1'), {
      code: `module.exports = { feedProviders: [{ id: 'json-x', name: 'X', canHandle: () => true, fetch: async () => ({ articles: [] }) }] }`
    })
    const registerProvider = vi.fn()
    const manager = await createManager({ registerProvider })
    manager.loadAll()
    expect(registerProvider).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'json-x', name: 'X' })
    )
  })

  it('未在 provides 声明 feed-provider 时不注册（能力由声明门控）', async () => {
    writePlugin(appPlugins, 'p1', { ...providerManifest('p1'), provides: [] }, {
      code: `module.exports = { feedProviders: [{ id: 'json-x', name: 'X', canHandle: () => true, fetch: async () => ({ articles: [] }) }] }`
    })
    const registerProvider = vi.fn()
    const manager = await createManager({ registerProvider })
    manager.loadAll()
    expect(registerProvider).not.toHaveBeenCalled()
  })

  it('collectThemes 只收集声明了 theme 的插件主题', async () => {
    writePlugin(appPlugins, 'declared', themeManifest('declared'), {
      code: validThemeSource('t-declared')
    })
    writePlugin(appPlugins, 'undeclared', themeManifest('undeclared', []), {
      code: validThemeSource('t-undeclared')
    })
    const manager = await createManager({ registerProvider: vi.fn() })
    manager.loadAll()
    expect(manager.collectThemes().map((t: { id: string }) => t.id)).toEqual(['t-declared'])
  })

  it('两种根目录都会被扫描', async () => {
    writePlugin(appPlugins, 'from-app', providerManifest('from-app'), {
      code: `module.exports = { feedProviders: [{ id: 'from-app', name: 'A', canHandle: () => true, fetch: async () => ({ articles: [] }) }] }`
    })
    writePlugin(userPlugins, 'from-user', providerManifest('from-user'), {
      code: `module.exports = { feedProviders: [{ id: 'from-user', name: 'B', canHandle: () => true, fetch: async () => ({ articles: [] }) }] }`
    })
    const registerProvider = vi.fn()
    const manager = await createManager({ registerProvider })
    manager.loadAll()
    expect(registerProvider.mock.calls.map((c: [{ id: string }]) => c[0].id).sort()).toEqual([
      'from-app',
      'from-user'
    ])
  })

  it('exports.default 与 module.exports 两种写法都接受', async () => {
    writePlugin(appPlugins, 'es-style', providerManifest('es-style'), {
      code: `exports.default = { feedProviders: [{ id: 'es-style', name: 'E', canHandle: () => true, fetch: async () => ({ articles: [] }) }] }`
    })
    const registerProvider = vi.fn()
    const manager = await createManager({ registerProvider })
    manager.loadAll()
    expect(registerProvider).toHaveBeenCalledWith(expect.objectContaining({ id: 'es-style' }))
  })

  it('目录名与插件身份无关（身份取 manifest.id）', async () => {
    writePlugin(appPlugins, 'totally-unrelated-folder-name', providerManifest('real-id'), {
      code: `module.exports = { feedProviders: [] }`
    })
    const manager = await createManager({ registerProvider: vi.fn() })
    manager.loadAll()
    expect(manager.snapshot().providers).toEqual([])
    expect(manager.collectThemes()).toEqual([])
  })

  it('无 manifest.json 的目录与非目录条目被跳过', async () => {
    mkdirSync(join(appPlugins, 'not-a-plugin'), { recursive: true })
    writeFileSync(join(appPlugins, 'stray.txt'), 'x', 'utf-8')
    const manager = await createManager({ registerProvider: vi.fn() })
    expect(() => manager.loadAll()).not.toThrow()
    expect(manager.snapshot()).toEqual({ providers: [], themes: [], cardRenderers: [] })
  })
})

describe('PluginManager 错误隔离', () => {
  let error: ReturnType<typeof vi.spyOn>
  beforeEach(() => {
    error = vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => error.mockRestore())

  it('manifest JSON 损坏只影响该插件，其余照常加载', async () => {
    writePlugin(appPlugins, 'broken', '{ not json' as unknown as never)
    writePlugin(appPlugins, 'good', providerManifest('good'), {
      code: `module.exports = { feedProviders: [{ id: 'good-p', name: 'G', canHandle: () => true, fetch: async () => ({ articles: [] }) }] }`
    })
    const registerProvider = vi.fn()
    const manager = await createManager({ registerProvider })
    expect(() => manager.loadAll()).not.toThrow()
    expect(registerProvider).toHaveBeenCalledWith(expect.objectContaining({ id: 'good-p' }))
    expect(error).toHaveBeenCalledWith(expect.stringContaining('failed to load'), expect.any(Error))
  })

  it('缺 id / main / provides 的清单被拒绝', async () => {
    const badManifests = [
      { name: 'n', version: '1', main: 'index.cjs', provides: [] },
      { id: 'x', name: 'n', version: '1', provides: [] },
      { id: 'y', name: 'n', version: '1', main: 'index.cjs' }
    ]
    badManifests.forEach((bad, i) => {
      writePlugin(appPlugins, `bad-${i}`, bad, { code: 'module.exports = {}' })
    })
    const manager = await createManager({ registerProvider: vi.fn() })
    expect(() => manager.loadAll()).not.toThrow()
    expect(error).toHaveBeenCalledTimes(3)
  })

  it('入口 require 抛错被兜住', async () => {
    writePlugin(appPlugins, 'throws', providerManifest('throws'), {
      code: 'throw new Error("boom on load")'
    })
    const manager = await createManager({ registerProvider: vi.fn() })
    expect(() => manager.loadAll()).not.toThrow()
    expect(error).toHaveBeenCalledWith(expect.stringContaining('failed to load'), expect.any(Error))
  })

  it('主入口指向不存在的文件时被拒绝而非崩溃', async () => {
    writePlugin(appPlugins, 'missing-entry', { ...providerManifest('m'), main: 'nope.cjs' })
    const manager = await createManager({ registerProvider: vi.fn() })
    expect(() => manager.loadAll()).not.toThrow()
    expect(error).toHaveBeenCalledTimes(1)
  })

  it('插件根目录缺失时忽略该根，不影响另一个根', async () => {
    rmSync(userPlugins, { recursive: true, force: true })
    writePlugin(appPlugins, 'p', providerManifest('p'), {
      code: `module.exports = { feedProviders: [{ id: 'only-app', name: 'A', canHandle: () => true, fetch: async () => ({ articles: [] }) }] }`
    })
    const registerProvider = vi.fn()
    const manager = await createManager({ registerProvider })
    expect(() => manager.loadAll()).not.toThrow()
    expect(registerProvider).toHaveBeenCalledTimes(1)
  })
})

describe('PluginManager 快照', () => {
  it('三类注册点都带 pluginId（启动日志与排障的唯一出口）', async () => {
    writePlugin(
      appPlugins,
      'multi',
      { id: 'multi', name: '多能力', version: '2.0.0', main: 'index.cjs', provides: ['feed-provider', 'theme', 'card-renderer'] },
      { code: validThemeSource('multi-theme') + `
         module.exports.feedProviders = [{ id: 'multi-p', name: 'P', canHandle: () => true, fetch: async () => ({ articles: [] }) }];
         module.exports.cardRenderers = [{ id: 'multi-card', name: 'C' }];` }
    )
    const manager = await createManager({ registerProvider: vi.fn() })
    manager.loadAll()
    expect(manager.snapshot()).toEqual({
      providers: [{ id: 'multi-p', name: 'P', pluginId: 'multi' }],
      themes: [{ id: 'multi-theme', name: 'multi-theme', pluginId: 'multi' }],
      cardRenderers: [{ id: 'multi-card', name: 'C', pluginId: 'multi' }]
    })
  })
})

describe('仓库内置示例插件必须真实可用', () => {
  const dirs = readdirSync(REPO_PLUGINS).filter((name) =>
    existsSync(join(REPO_PLUGINS, name, 'manifest.json'))
  )

  it('至少提供三类注册点各一个示例', () => {
    const allProvides = dirs.flatMap((name) => repoManifest(name).provides)
    expect(new Set(allProvides)).toEqual(
      new Set(['feed-provider', 'theme', 'card-renderer'])
    )
  })

  it.each(dirs.map((name) => [name] as const))('%s：清单字段完整且入口文件存在', (name) => {
    const manifest = repoManifest(name)
    expect(typeof manifest.id).toBe('string')
    expect(typeof manifest.name).toBe('string')
    expect(typeof manifest.version).toBe('string')
    expect(typeof manifest.main).toBe('string')
    expect(Array.isArray(manifest.provides)).toBe(true)
    expect(existsSync(join(REPO_PLUGINS, name, manifest.main as string))).toBe(true)
    for (const p of manifest.provides as string[]) {
      expect(['feed-provider', 'theme', 'card-renderer']).toContain(p)
    }
  })

  it.each(dirs.map((name) => [name] as const))('%s：入口可加载且能力与 provides 一致', (name) => {
    const manifest = repoManifest(name)
    const mod = requireCjs(join(REPO_PLUGINS, name, manifest.main)) as {
      feedProviders?: unknown[]
      themes?: unknown[]
      cardRenderers?: unknown[]
    }
    const instance = mod
    if (manifest.provides.includes('feed-provider')) {
      expect(instance.feedProviders?.length, name).toBeGreaterThan(0)
    } else {
      expect(instance.feedProviders ?? [], name).toHaveLength(0)
    }
    if (manifest.provides.includes('theme')) {
      expect(instance.themes?.length, name).toBeGreaterThan(0)
    }
    if (manifest.provides.includes('card-renderer')) {
      expect(instance.cardRenderers?.length, name).toBeGreaterThan(0)
    }
  })

  it('example-json-feed 的 provider 能被 FeedService 正常选用并解析 JSON Feed', async () => {
    const mod = requireCjs(join(REPO_PLUGINS, 'example-json-feed', 'index.cjs')) as {
      feedProviders: FeedProvider[]
    }
    const provider = mod.feedProviders[0]
    expect(provider.id).toBe('example-json')
    expect(provider.canHandle('https://example.com/feed.json')).toBe(true)
    expect(provider.canHandle('https://example.com/feed.json?v=2')).toBe(true)
    expect(provider.canHandle('https://example.com/rss.xml')).toBe(false)
    expect(provider.canHandle('file:///C:/feed.json')).toBe(false)

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          items: [
            { title: '一条', url: 'https://example.com/1', date_published: '2026-08-30T00:00:00Z', content: '纯文本 <b>正文</b>' },
            { id: 'x2', content_html: '<p>富文本</p><img src="https://cdn/cover_2.png">', image: 'https://cdn/i.jpg' }
          ]
        })
      }))
    )
    const result = await provider.fetch({
      id: 's1',
      name: '源',
      url: 'https://example.com/feed.json',
      enabled: true,
      providerId: 'example-json'
    })
    expect(result.articles).toHaveLength(2)
    expect(result.articles[0]).toMatchObject({
      guid: 'https://example.com/1',
      title: '一条',
      pubDate: '2026-08-30T00:00:00.000Z'
    })
    expect(result.articles[0].contentHtml).toContain('&lt;b&gt;')
    expect(result.articles[1]).toMatchObject({ guid: 'x2' })
    expect(result.articles[1].contentHtml).toContain('<p>富文本</p>')
    expect(result.articles.every((a) => 'sourceId' in a === false)).toBe(true)
  })

  it('example-json-feed 对上游错误抛穿（由 FeedService 逐源兜住）', async () => {
    const mod = requireCjs(join(REPO_PLUGINS, 'example-json-feed', 'index.cjs')) as {
      feedProviders: FeedProvider[]
    }
    const provider = mod.feedProviders[0]
    const source = {
      id: 's1',
      name: '源',
      url: 'https://example.com/feed.json',
      enabled: true,
      providerId: 'example-json'
    }
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 503 })))
    await expect(provider.fetch(source)).rejects.toThrowError(/HTTP 503/)
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({}) })))
    await expect(provider.fetch(source)).rejects.toThrowError(/items/)
  })

  it('example-theme 的两个主题能通过 ThemeService 校验并落入列表', () => {
    const mod = requireCjs(join(REPO_PLUGINS, 'example-theme', 'index.cjs')) as {
      themes: import('../../src/shared/types').ThemeTokens[]
    }
    expect(mod.themes).toHaveLength(2)
    const service = new ThemeService()
    for (const t of mod.themes) expect(() => service.registerPluginTheme(t), t.id).not.toThrow()
    const ids = service.list().map((t) => t.id)
    expect(ids).toEqual(expect.arrayContaining(['example-forest-light', 'example-forest-dark']))
    expect(new Set(mod.themes.map((t) => t.colorScheme)).size).toBe(2)
    for (const t of mod.themes) expect(t.id.startsWith('example-')).toBe(true)
  })
})
