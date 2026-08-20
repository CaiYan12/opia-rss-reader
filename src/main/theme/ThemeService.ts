import { app } from 'electron'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import type { ThemeTokens } from '../../shared/types'
import { BUILTIN_THEMES } from './builtinThemes'

export class ThemeService {
  private userDir: string
  private pluginThemes: ThemeTokens[] = []

  constructor() {
    this.userDir = join(app.getPath('userData'), 'themes')
    if (!existsSync(this.userDir)) mkdirSync(this.userDir, { recursive: true })
  }

  /** 注册插件提供的主题（插件管线调用） */
  registerPluginTheme(theme: ThemeTokens): void {
    this.validate(theme)
    this.pluginThemes.push(theme)
  }

  list(): ThemeTokens[] {
    return [...BUILTIN_THEMES, ...this.pluginThemes, ...this.listUserThemes()]
  }

  get(id: string): ThemeTokens | null {
    return this.list().find((t) => t.id === id) ?? null
  }

  save(theme: ThemeTokens): void {
    if (BUILTIN_THEMES.some((t) => t.id === theme.id)) {
      throw new Error(`builtin theme "${theme.id}" is read-only; save as a new id`)
    }
    this.validate(theme)
    writeFileSync(this.fileFor(theme.id), JSON.stringify({ ...theme, builtin: false }, null, 2), 'utf-8')
  }

  delete(id: string): void {
    if (BUILTIN_THEMES.some((t) => t.id === id)) {
      throw new Error(`builtin theme "${id}" cannot be deleted`)
    }
    const file = this.fileFor(id)
    if (existsSync(file)) unlinkSync(file)
  }

  private fileFor(id: string): string {
    if (!/^[\w-]+$/.test(id)) throw new Error(`invalid theme id: ${id}`)
    return join(this.userDir, `${id}.json`)
  }

  private listUserThemes(): ThemeTokens[] {
    if (!existsSync(this.userDir)) return []
    const out: ThemeTokens[] = []
    for (const file of readdirSync(this.userDir)) {
      if (!file.endsWith('.json')) continue
      try {
        const raw = JSON.parse(readFileSync(join(this.userDir, file), 'utf-8'))
        this.validate(raw)
        out.push({ ...raw, builtin: false })
      } catch (err) {
        console.warn(`[ThemeService] skip invalid theme ${file}:`, err)
      }
    }
    return out
  }

  private validate(t: ThemeTokens): void {
    const colorKeys = [
      'bg', 'surface', 'card', 'border', 'text', 'textSecondary',
      'accent', 'accentHover', 'onAccent', 'chip', 'chipText', 'read'
    ] as const
    if (!t.id || !t.name) throw new Error('theme requires id and name')
    for (const key of colorKeys) {
      if (!t.colors?.[key]) throw new Error(`theme.colors.${key} missing`)
    }
    if (!t.fonts?.heading || !t.fonts?.body) {
      throw new Error('theme.fonts incomplete')
    }
    if (t.colorScheme !== undefined && t.colorScheme !== 'light' && t.colorScheme !== 'dark') {
      throw new Error('theme.colorScheme must be "light" or "dark"')
    }
  }
}
