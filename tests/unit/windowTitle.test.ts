import { describe, expect, it } from 'vitest'
import type { Article } from '../../src/shared/types'
import type { Tab } from '../../src/renderer/stores/useAppStore'
import { getTabTitle } from '../../src/renderer/tabTitle'
import { formatWindowTitle } from '../../src/shared/window-title'

const article: Article = {
  guid: 'article-1',
  sourceId: 'juya-daily',
  title: '文章标题',
  link: 'https://example.com/article-1',
  pubDate: '2026-08-28T10:00:00Z',
  summary: '摘要',
  contentHtml: '<p>正文</p>',
  coverUrl: null
}

describe('active page window title', () => {
  it.each([
    [{ id: 'home-1', kind: 'home', homePage: 'feed' }, '主页'],
    [{ id: 'reader-1', kind: 'reader', article }, '文章标题'],
    [{ id: 'browser-1', kind: 'browser', url: 'https://example.com/page', title: '示例页面' }, '示例页面'],
    [{ id: 'browser-2', kind: 'browser', url: 'https://example.com/page' }, 'example.com'],
    [{ id: 'settings-1', kind: 'settings' }, '设置']
  ] as Array<[Tab, string]>)('uses the visible title for %j', (tab, pageTitle) => {
    expect(getTabTitle(tab)).toBe(pageTitle)
    expect(formatWindowTitle(pageTitle)).toBe(`Opia RSS Reader - ${pageTitle}`)
  })

  it('uses the product name without a suffix before a page is active', () => {
    expect(formatWindowTitle('')).toBe('Opia RSS Reader')
  })
})
