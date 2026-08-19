import { app } from 'electron'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import type { OpiaPlugin, PluginRegistrySnapshot } from '../../shared/plugin-api'
import type { PluginManifest, ThemeTokens } from '../../shared/types'
import type { FeedService } from '../feed/FeedService'

const require_ = createRequire(resolve(app.getAppPath(), 'package.json'))

interface LoadedPlugin {
  manifest: PluginManifest
  instance: OpiaPlugin
  dir: string
}

/**
 * 插件管理器 v1：
 * - 扫描 <appPath>/plugins（开发期）与 userData/plugins（用户插件）
 * - 每个插件为含 manifest.json 的目录，main 为 CommonJS 入口，默认导出 OpiaPlugin
 */
export class PluginManager {
  private plugins: LoadedPlugin[] = []

  constructor(private feed: FeedService) {}

  /** 返回全部待扫描目录 */
  private scanRoots(): string[] {
    const roots = [join(app.getAppPath(), 'plugins'), join(app.getPath('userData'), 'plugins')]
    return roots.filter((r) => existsSync(r))
  }

  loadAll(): void {
    for (const root of this.scanRoots()) {
      for (const entry of readdirSync(root, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue
        const dir = join(root, entry.name)
        try {
          this.loadOne(dir)
        } catch (err) {
          console.error(`[PluginManager] failed to load ${dir}:`, err)
        }
      }
    }
  }

  private loadOne(dir: string): void {
    const manifestPath = join(dir, 'manifest.json')
    if (!existsSync(manifestPath)) return

    const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8')) as PluginManifest
    if (!manifest.id || !manifest.main || !Array.isArray(manifest.provides)) {
      throw new Error(`invalid manifest in ${dir}`)
    }

    const mod = require_(join(dir, manifest.main)) as { default?: OpiaPlugin } & OpiaPlugin
    const instance: OpiaPlugin = mod.default ?? mod

    if (manifest.provides.includes('feed-provider') && instance.feedProviders) {
      for (const p of instance.feedProviders) this.feed.registerProvider(p)
    }

    this.plugins.push({ manifest, instance, dir })
    console.log(`[PluginManager] loaded ${manifest.id}@${manifest.version}`)
  }

  /** 插件声明的主题（由调用方合并进 ThemeService 列表） */
  collectThemes(): ThemeTokens[] {
    return this.plugins.flatMap((p) => p.instance.themes ?? [])
  }

  snapshot(): PluginRegistrySnapshot {
    return {
      providers: this.plugins.flatMap((p) =>
        (p.instance.feedProviders ?? []).map((fp) => ({
          id: fp.id,
          name: fp.name,
          pluginId: p.manifest.id
        }))
      ),
      themes: this.plugins.flatMap((p) =>
        (p.instance.themes ?? []).map((t) => ({ id: t.id, name: t.name, pluginId: p.manifest.id }))
      ),
      cardRenderers: this.plugins.flatMap((p) =>
        (p.instance.cardRenderers ?? []).map((c) => ({ ...c, pluginId: p.manifest.id }))
      )
    }
  }
}
