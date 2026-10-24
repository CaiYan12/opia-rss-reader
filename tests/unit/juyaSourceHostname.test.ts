import { describe, expect, it } from 'vitest'
import { sourceHostname } from '../../src/renderer/juya/templates/shared'

// 共享原子层的订阅源 host 派生（#68）：wabi 与 editorial 订阅页头版的单一来源。
// 行为与打样期两份本地副本逐字一致：空串与解析失败都返回空串（头版不渲染 host 行）。

describe('sourceHostname', () => {
  it('正常 URL 取 hostname（含端口/路径时只取主机名）', () => {
    expect(sourceHostname('https://example.com/feed.xml')).toBe('example.com')
    expect(sourceHostname('http://news.example.org:8080/rss?all=1')).toBe('news.example.org')
  })

  it('空串返回空串', () => {
    expect(sourceHostname('')).toBe('')
  })

  it('非法 URL 返回空串', () => {
    expect(sourceHostname('not a url')).toBe('')
    expect(sourceHostname('example.com/no-scheme')).toBe('')
  })
})
