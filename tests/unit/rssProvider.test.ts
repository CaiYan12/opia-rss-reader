import { describe, it, expect } from 'vitest'
import { extractCover, RssProvider } from '../../src/main/feed/RssProvider'

describe('extractCover', () => {
  it('空输入与无 img 输入返回 null', () => {
    expect(extractCover('')).toBeNull()
    expect(extractCover('<p>没有图片</p>')).toBeNull()
  })

  it('无 cover_ 命名时取首个 img src', () => {
    const html = '<p><img src="https://cdn/a.png" alt="a"></p><img src="https://cdn/b.png">'
    expect(extractCover(html)).toBe('https://cdn/a.png')
  })

  it('文件名含 cover_ 的图片优先于首个图片', () => {
    const html = '<img src="https://cdn/first.png"><img src="https://cdn/cover_x.png">'
    expect(extractCover(html)).toBe('https://cdn/cover_x.png')
  })

  it('存在多个 cover_ 时取第一个命中的', () => {
    const html = '<img src="https://cdn/cover_a.png"><img src="https://cdn/cover_b.png">'
    expect(extractCover(html)).toBe('https://cdn/cover_a.png')
  })

  it('cover_ 出现在首个位置时同样返回它', () => {
    expect(extractCover('<img src="/imgs/cover_20260828.jpg">')).toBe('/imgs/cover_20260828.jpg')
  })

  it('匹配大小写不敏感的 COVER_', () => {
    expect(extractCover('<img src="https://cdn/COVER_1.png">')).toBe('https://cdn/COVER_1.png')
  })

  it('兼容单引号 src 与 src 非首位属性', () => {
    const html = "<img loading='lazy' src='https://cdn/s.png' alt=''>"
    expect(extractCover(html)).toBe('https://cdn/s.png')
  })

  it('容忍相对路径与查询串', () => {
    expect(extractCover('<img src="./assets/i.webp?v=2">')).toBe('./assets/i.webp?v=2')
  })
})

describe('RssProvider.canHandle', () => {
  const provider = new RssProvider()

  it('接受 http 与 https（大小写不敏感）', () => {
    expect(provider.canHandle('http://example.com/rss')).toBe(true)
    expect(provider.canHandle('https://daily.juya.uk/rss.xml')).toBe(true)
    expect(provider.canHandle('HTTPS://EXAMPLE.COM/rss')).toBe(true)
  })

  it('拒绝非 http 协议与空主机', () => {
    expect(provider.canHandle('file:///C:/feed.xml')).toBe(false)
    expect(provider.canHandle('ftp://example.com/rss')).toBe(false)
    expect(provider.canHandle('javascript:alert(1)')).toBe(false)
    expect(provider.canHandle('https://')).toBe(false)
    expect(provider.canHandle('example.com/rss')).toBe(false)
    expect(provider.canHandle('')).toBe(false)
  })

  it('provider 元数据稳定（builtin-rss 是 refresh 回退的键）', () => {
    expect(provider.id).toBe('builtin-rss')
    expect(provider.name).toBe('RSS 2.0 / Atom')
  })
})
