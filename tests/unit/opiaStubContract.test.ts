import { describe, it, expect } from 'vitest'
import { makeStubScript } from '../e2e/helpers'
import { createOpiaStub } from './helpers/opiaStub'

/**
 * window.opia 三处实现（契约 / 单测桩 / 端到端注入桩）必须同形。
 * 端到端桩是注入浏览器的字符串，TypeScript 无法检查，历史上曾静默缺过 6 个方法
 * （调用即抛 not a function），故在此用运行时断言钉住。
 */
const OPIA_METHODS = [
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
] as const

describe('window.opia 桩与契约同形', () => {
  it('OpiaApi 的每个方法都被两套桩实现', () => {
    expect(Object.keys(createOpiaStub()).sort()).toEqual([...OPIA_METHODS].sort())
  })

  for (const scenario of ['default', 'dark', 'system', 'tabs5'] as const) {
    it(`端到端桩（${scenario} 场景）覆盖全部方法`, () => {
      const script = makeStubScript(scenario)
      const missing = OPIA_METHODS.filter((method) => !new RegExp(`^\\s+${method}:\\s`, 'm').test(script))
      expect(missing, '端到端桩缺少方法，浏览器中调用将抛 not a function').toEqual([])
    })
  }

  it('端到端桩不引入契约之外的方法', () => {
    const script = makeStubScript('default')
    const declared = [...script.matchAll(/^ {6}([A-Za-z]+):\s/gm)].map((m) => m[1])
    expect(declared.length).toBeGreaterThan(20)
    expect(declared.filter((name) => !OPIA_METHODS.includes(name as never))).toEqual([])
  })
})
