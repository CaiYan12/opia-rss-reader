import { describe, expect, it } from 'vitest'
import { getMiniDigest, MINI_TEXT_LIMIT, stripHtmlToText } from '../../src/renderer/components/miniDigest'
import { JUYA_SOURCE_ID } from '../../src/shared/types'
import type { Article } from '../../src/shared/types'

function article(overrides: Partial<Article> = {}): Article {
  return {
    guid: 'g1',
    sourceId: 'src-x',
    title: '标题',
    link: 'https://example.com/a',
    pubDate: '2026-08-31T00:00:00.000Z',
    summary: '',
    contentHtml: '',
    coverUrl: null,
    ...overrides
  }
}

/** 最小合法橘鸦结构：概览（简报）+ 一个含条目的栏目（解析器要求至少一个条目） */
const juyaHtml = [
  '<h1>橘鸦AI早报</h1>',
  '<h2>概览</h2>',
  '<ul>',
  '<li><a href="https://a.example/1">第一条新闻</a> <code>#1</code></li>',
  '<li>第二条无链接</li>',
  '</ul>',
  '<h2>大模型</h2>',
  '<h3><code>#1</code> 条目标题</h3>',
  '<blockquote>导语</blockquote>',
  '<p>正文段落</p>'
].join('')

describe('stripHtmlToText', () => {
  it('剥离标签并折叠空白', () => {
    expect(stripHtmlToText('<p>你好</p> <b>世界</b>\n<i>!</i>')).toBe('你好 世界 !')
  })

  it('移除 script 与 style 内容', () => {
    expect(stripHtmlToText('<style>.x{}</style><script>evil()</script><p>正文</p>')).toBe('正文')
  })

  it('空输入返回空串', () => {
    expect(stripHtmlToText('')).toBe('')
    expect(stripHtmlToText('   ')).toBe('')
  })
})

describe('getMiniDigest 橘鸦源', () => {
  it('有概览 → juya 简报条目（含编号前缀），恒 truncated', () => {
    const d = getMiniDigest(article({ sourceId: JUYA_SOURCE_ID, contentHtml: juyaHtml }))
    expect(d).not.toBeNull()
    expect(d!.kind).toBe('juya')
    expect(d!.entries).toEqual(['#1 第一条新闻', '第二条无链接'])
    expect(d!.truncated).toBe(true)
  })

  it('解析失败（无栏目）→ 回退文本摘要', () => {
    const d = getMiniDigest(
      article({ sourceId: JUYA_SOURCE_ID, contentHtml: '<p>纯文本占位</p>', summary: '备用摘要' })
    )
    expect(d!.kind).toBe('text')
    expect(d!.text).toBe('备用摘要')
  })

  it('解析失败且无 summary → 剥离 contentHtml 文本', () => {
    const d = getMiniDigest(
      article({ sourceId: JUYA_SOURCE_ID, contentHtml: '<p>剥出来的文本</p>' })
    )
    expect(d!.kind).toBe('text')
    expect(d!.text).toBe('剥出来的文本')
  })
})

describe('getMiniDigest 其他源', () => {
  it('短 summary → text 未截断', () => {
    const d = getMiniDigest(article({ summary: '短摘要' }))
    expect(d).toEqual({ kind: 'text', text: '短摘要', truncated: false })
  })

  it(`超 ${MINI_TEXT_LIMIT} 字 → 截断加省略号`, () => {
    const long = '字'.repeat(300)
    const d = getMiniDigest(article({ summary: long }))
    expect(d!.truncated).toBe(true)
    expect(d!.text).toBe('字'.repeat(MINI_TEXT_LIMIT) + '…')
    expect(d!.text!.length).toBe(MINI_TEXT_LIMIT + 1)
  })

  it('无 summary → 从 contentHtml 剥离', () => {
    const d = getMiniDigest(article({ contentHtml: '<p>正文摘要内容</p>' }))
    expect(d!.kind).toBe('text')
    expect(d!.text).toBe('正文摘要内容')
  })

  it('summary 与 contentHtml 均为空 → null（行不可展开）', () => {
    expect(getMiniDigest(article())).toBeNull()
  })

  it('summary 空白优先级低于 contentHtml', () => {
    const d = getMiniDigest(article({ summary: '   ', contentHtml: '<p>来自全文</p>' }))
    expect(d!.text).toBe('来自全文')
  })
})
