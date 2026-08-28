import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS } from '../../src/shared/types'
import { useAppStore, type Tab } from '../../src/renderer/stores/useAppStore'
import { useToastStore } from '../../src/renderer/stores/useToastStore'

describe('useAppStore.openExternalSmart', () => {
  const toggleMini = vi.fn(async () => false)
  const sessionSave = vi.fn(async () => undefined)

  beforeEach(() => {
    Object.assign(window, {
      opia: { toggleMini, sessionSave }
    })
    toggleMini.mockClear()
    sessionSave.mockClear()
    const tabs: Tab[] = Array.from({ length: 20 }, (_, index) => ({
      id: `tab-${index}`,
      kind: 'home',
      homePage: 'feed'
    }))
    useAppStore.setState({
      settings: { ...DEFAULT_SETTINGS, externalLinkBehavior: 'builtin' },
      tabs,
      activeTabId: tabs[0].id,
      mini: true
    })
  })

  afterEach(() => {
    useToastStore.getState().clear()
  })

  it('does not leave Mini mode when a full tab limit rejects a builtin link', async () => {
    await useAppStore.getState().openExternalSmart('https://example.com/article')

    expect(toggleMini).not.toHaveBeenCalled()
    expect(useAppStore.getState().mini).toBe(true)
    expect(useAppStore.getState().tabs).toHaveLength(20)
  })
})
