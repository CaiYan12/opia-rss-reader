import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { makeTheme } from './helpers/opiaStub'

const holder = vi.hoisted(() => ({ userData: '' }))

vi.mock('electron', () => ({
  app: { getPath: (name: string) => holder.userData }
}))

import { ThemeService } from '../../src/main/theme/ThemeService'
import { BUILTIN_THEMES } from '../../src/main/theme/builtinThemes'

let userData: string
let service: ThemeService

beforeEach(() => {
  userData = mkdtempSync(join(tmpdir(), 'opia-themes-'))
  holder.userData = userData
  service = new ThemeService()
})

afterEach(() => {
  rmSync(userData, { recursive: true, force: true })
})

describe('ThemeService 列表与查询', () => {
  it('初始列表 = 全部内置主题', () => {
    expect(service.list().map((t) => t.id)).toEqual(BUILTIN_THEMES.map((t) => t.id))
  })

  it('get 命中返回主题，未命中返回 null', () => {
    expect(service.get('windows-light')?.id).toBe('windows-light')
    expect(service.get('nope')).toBeNull()
  })

  it('构造时创建 userData/themes 目录', () => {
    expect(existsSync(join(userData, 'themes'))).toBe(true)
  })

  it('同名 id 的优先级：内置 > 插件 > 用户（get 取首个匹配）', () => {
    service.registerPluginTheme(makeTheme({ id: 'dup', name: '插件版', builtin: false }))
    service.save(makeTheme({ id: 'dup', name: '用户版' }))
    expect(service.get('dup')?.name).toBe('插件版')
    service.registerPluginTheme(makeTheme({ id: 'windows-light', name: '顶替内置' }))
    expect(service.get('windows-light')?.name).toBe('Windows Light')
  })
})

describe('ThemeService.save', () => {
  it('写入用户主题文件并强制 builtin: false', () => {
    service.save(makeTheme({ id: 'mine', name: '我的', builtin: true }))
    const file = join(userData, 'themes', 'mine.json')
    expect(existsSync(file)).toBe(true)
    expect(JSON.parse(readFileSync(file, 'utf-8')).builtin).toBe(false)
    expect(service.get('mine')).toMatchObject({ id: 'mine', builtin: false })
  })

  it('内置主题 id 只读，另存副本才允许', () => {
    expect(() => service.save(makeTheme({ id: 'windows-dark' }))).toThrowError(/read-only/)
  })

  it('缺少任一颜色键即拒绝', () => {
    const theme = makeTheme({ id: 'bad' })
    delete (theme.colors as Record<string, string>).accent
    expect(() => service.save(theme)).toThrowError(/theme\.colors\.accent missing/)
  })

  it('缺 id / name / fonts 即拒绝', () => {
    expect(() => service.save({ ...makeTheme(), id: '' })).toThrowError(/requires id and name/)
    expect(() => service.save({ ...makeTheme(), name: '' })).toThrowError(/requires id and name/)
    expect(() =>
      service.save({ ...makeTheme(), fonts: { heading: 'x', body: '' } })
    ).toThrowError(/theme\.fonts incomplete/)
  })

  it('colorScheme 只接受 light / dark / 缺省', () => {
    expect(() =>
      service.save({ ...makeTheme(), colorScheme: 'neon' as never })
    ).toThrowError(/colorScheme must be "light" or "dark"/)
    expect(() => service.save({ ...makeTheme(), colorScheme: undefined })).not.toThrow()
  })

  it('不校验颜色格式与 radius/spacing（宽松契约，文档需据此说明）', () => {
    expect(() =>
      service.save(makeTheme({ id: 'loose', colors: { bg: 'not-a-color' }, radius: 0 }))
    ).not.toThrow()
  })
})

describe('ThemeService.delete', () => {
  it('删除用户主题文件', () => {
    service.save(makeTheme({ id: 'gone' }))
    service.delete('gone')
    expect(existsSync(join(userData, 'themes', 'gone.json'))).toBe(false)
    expect(service.get('gone')).toBeNull()
  })

  it('内置主题不可删除', () => {
    expect(() => service.delete('juya-daily')).toThrowError(/cannot be deleted/)
  })

  it('删除不存在的 id 幂等不抛错', () => {
    expect(() => service.delete('never-existed')).not.toThrow()
  })

  it('id 白名单阻止路径穿越（不得写出 themes 目录）', () => {
    const outside = join(userData, 'evil.json')
    writeFileSync(outside, 'keep me')
    expect(() => service.delete('../../evil')).toThrowError(/invalid theme id/)
    expect(() => service.save(makeTheme({ id: '../../evil' }))).toThrowError(/invalid theme id/)
    expect(() => service.save(makeTheme({ id: 'a/b' }))).toThrowError(/invalid theme id/)
    expect(existsSync(outside)).toBe(true)
  })
})

describe('ThemeService 用户主题目录读取', () => {
  it('跳过损坏或非主题 JSON 而不抛错（仅告警）', () => {
    const dir = join(userData, 'themes')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'broken.json'), '{ not json', 'utf-8')
    writeFileSync(join(dir, 'partial.json'), JSON.stringify({ id: 'x', name: 'y' }), 'utf-8')
    service.save(makeTheme({ id: 'good' }))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    expect(service.list().map((t) => t.id)).toContain('good')
    expect(service.list().map((t) => t.id)).not.toContain('x')
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('skip invalid theme'), expect.any(Error))
    warn.mockRestore()
  })

  it('忽略非 .json 文件', () => {
    const dir = join(userData, 'themes')
    writeFileSync(join(dir, 'notes.txt'), 'hello', 'utf-8')
    expect(() => service.list()).not.toThrow()
  })

  it('插件主题经 registerPluginTheme 进入列表', () => {
    service.registerPluginTheme(makeTheme({ id: 'plugin-one', name: '插件一' }))
    expect(service.list().map((t) => t.id)).toContain('plugin-one')
  })

  it('非法插件主题在注册点即抛错（调用方必须自行兜住，否则影响启动）', () => {
    expect(() => service.registerPluginTheme({ ...makeTheme(), name: '' })).toThrowError(
      /requires id and name/
    )
  })
})
