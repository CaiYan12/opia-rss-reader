import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { nocturneTemplate } from '../../src/renderer/juya/templates/nocturne'
import type { JuyaEntry, JuyaIssue } from '../../src/renderer/juya/parseJuyaIssue'
import type { Article } from '../../src/shared/types'

// nocturne 图文并排渲染守卫（#8，2026-10-12）：
// 右列「图恒在右、不左右交替」是风格签名，但最多 2 张；第 3 张及以后回流为正文下方通栏。
// 断言走 renderToStaticMarkup 的**结构**（类名 / 数量 / 顺序），不做几何测量——
// 夹具图片是坏链（assets.example.com），高度会塌陷，任何 px 断言都测不出真值。

const ARTICLE: Article = {
  guid: 'https://daily.juya.uk/issues/2026-08-28/',
  sourceId: 'juya-daily',
  title: '2026-08-28',
  link: 'https://daily.juya.uk/issues/2026-08-28/',
  pubDate: '2026-08-28T01:31:42.000Z',
  summary: '摘要',
  contentHtml: '<p>x</p>',
  coverUrl: null
}

/** 构造含 n 张图、带相关链接的条目；图片 src 为可辨识的序号文件名 */
function makeEntry(imageCount: number, withLinks = true): JuyaEntry {
  const images = Array.from({ length: imageCount }, (_, i) => ({ src: `img-${i}.png`, alt: '' }))
  return {
    title: '条目标题',
    titleLink: null,
    index: '1',
    lead: null,
    paragraphs: ['正文段落'],
    images,
    blocks: [],
    links: withLinks ? [{ text: '相关链接', href: 'https://example.com/a' }] : []
  }
}

/** 渲染单条目期号，返回解析后的 DOM */
function renderEntry(
  entry: JuyaEntry,
  variantId: 'nocturne-dark' | 'nocturne-light' = 'nocturne-dark'
): Document {
  const issue: JuyaIssue = { heading: '期头', sections: [{ heading: '栏目', entries: [entry] }] }
  const html = renderToStaticMarkup(
    createElement(nocturneTemplate.IssueView, {
      article: ARTICLE,
      issue,
      onOpenLink: () => {},
      variantId
    })
  )
  return new DOMParser().parseFromString(html, 'text/html')
}

const figureSrcs = (doc: Document): string[] =>
  [...doc.querySelectorAll('.juya-entry-figure img')].map((img) => img.getAttribute('src') ?? '')

const overflowSrcs = (doc: Document): string[] =>
  [...doc.querySelectorAll('.jynoct-overflow-media img')].map((img) => img.getAttribute('src') ?? '')

describe('nocturne 图文并排：右列限 2 张，其余回流通栏（#8）', () => {
  it('多图条目：右列恰好 2 张 plate，第 3 张及以后在通栏容器内且不在右列内', () => {
    const doc = renderEntry(makeEntry(5))

    expect(doc.querySelectorAll('.juya-entry-row .juya-entry-figure .juya-plate')).toHaveLength(2)
    expect(figureSrcs(doc)).toEqual(['img-0.png', 'img-1.png'])

    const overflow = doc.querySelector('.jynoct-overflow-media')
    expect(overflow, '第 3 张起应回流到通栏溢出容器').not.toBeNull()
    expect(overflowSrcs(doc)).toEqual(['img-2.png', 'img-3.png', 'img-4.png'])

    // 溢出图不得同时出现在右列（两处都渲染 = 重复图）
    for (const src of overflowSrcs(doc)) expect(figureSrcs(doc)).not.toContain(src)

    // 通栏容器是 .juya-entry-row 之后的兄弟，不在右列内
    expect(overflow?.closest('.juya-entry-row')).toBeNull()
    expect(overflow?.closest('.juya-entry-figure')).toBeNull()
  })

  it('溢出容器是 .juya-entry-row 的兄弟节点，且 LinksBlock 仍是 <article> 的最后一个子节点', () => {
    const doc = renderEntry(makeEntry(4))
    const article = doc.querySelector('article.juya-entry')
    expect(article).not.toBeNull()

    const children = [...(article?.children ?? [])].map((el) => el.className)
    expect(children).toEqual(['juya-entry-row', 'jynoct-overflow-media', 'juya-links-label', 'juya-links'])
    expect(article?.lastElementChild?.className).toBe('juya-links')
  })

  it('保留「图恒在右、不左右交替」的纪律签名：基类齐备且从无 .juya-entry-alt', () => {
    const doc = renderEntry(makeEntry(3))
    const article = doc.querySelector('article.juya-entry')
    expect(article?.className).toBe('juya-entry juya-entry-split')
    expect(doc.querySelector('.juya-entry-alt')).toBeNull()
    expect(doc.querySelector('.juya-entry-row > .juya-entry-body')).not.toBeNull()
    expect(doc.querySelector('.juya-entry-row > .juya-entry-figure')).not.toBeNull()
  })

  it('无图条目：右列不渲染、溢出容器不渲染，排版不回退', () => {
    const doc = renderEntry(makeEntry(0))
    expect(doc.querySelector('.juya-entry-figure')).toBeNull()
    expect(doc.querySelector('.jynoct-overflow-media')).toBeNull()
    expect(doc.querySelectorAll('article.juya-entry > .juya-entry-row > .juya-entry-body p')).toHaveLength(1)
    expect(doc.querySelector('article.juya-entry')?.lastElementChild?.className).toBe('juya-links')
  })

  it('单图条目：右列 1 张 plate，溢出容器不渲染', () => {
    const doc = renderEntry(makeEntry(1))
    expect(doc.querySelectorAll('.juya-entry-figure .juya-plate')).toHaveLength(1)
    expect(figureSrcs(doc)).toEqual(['img-0.png'])
    expect(doc.querySelector('.jynoct-overflow-media')).toBeNull()
  })

  it('双图条目：右列 2 张 plate，溢出容器不渲染（不产生空容器）', () => {
    const doc = renderEntry(makeEntry(2))
    expect(doc.querySelectorAll('.juya-entry-figure .juya-plate')).toHaveLength(2)
    expect(figureSrcs(doc)).toEqual(['img-0.png', 'img-1.png'])
    expect(doc.querySelector('.jynoct-overflow-media')).toBeNull()
  })

  it('无相关链接时：LinksBlock 整体不渲染，通栏容器仍为末尾内容', () => {
    const doc = renderEntry(makeEntry(3, false))
    const article = doc.querySelector('article.juya-entry')
    expect(doc.querySelector('.juya-links')).toBeNull()
    expect([...(article?.children ?? [])].map((el) => el.className)).toEqual([
      'juya-entry-row',
      'jynoct-overflow-media'
    ])
  })
})

// 链接图包装的变体门控（2026-10-20 收口修正）：
// 暗侧为让「点图跳原文」不被放大视图吞掉，解析期新增可选 `JuyaImage.href`，并在模板里把带
// href 的图包一层 SafeLink。该包装**不得外溢到亮侧** —— 需求 §9 把 `nocturne-light` 的任何
// 改动列为不做，包裹会在亮侧新增 `<a>` 节点与可点行为（DOM + 交互双改动）。
// 断言形态：只看渲染出来的 DOM 结构，不看内部实现。
const withHref = (entry: JuyaEntry, href: string, indexes: number[] = [0]): JuyaEntry => ({
  ...entry,
  images: entry.images.map((img, i) => (indexes.includes(i) ? { ...img, href } : img))
})

describe('链接图包装按变体门控（亮侧零改动）', () => {
  const HREF = 'https://example.com/origin'

  it('暗侧：带 href 的图被 SafeLink 包裹，href 原样保留（右列与通栏两处都包）', () => {
    // 首图进右列、第 3 图进通栏，两处各验一次，证明包装在两种布局容器里都生效
    const doc = renderEntry(withHref(makeEntry(3), HREF, [0, 2]))
    const links = [...doc.querySelectorAll('.juya-entry-figure a, .jynoct-overflow-media a')]
    expect(links, '暗侧首图（右列）与第三图（通栏）均应可点').toHaveLength(2)
    expect(links[0].getAttribute('href')).toBe(HREF)
    expect(links.map((a) => a.querySelector('img')?.getAttribute('src'))).toEqual([
      'img-0.png',
      'img-2.png'
    ])
  })

  it('暗侧：没有 href 的图不得被包裹（裸图才能开放大视图）', () => {
    const doc = renderEntry(makeEntry(3))
    expect(doc.querySelector('.juya-entry-figure a, .jynoct-overflow-media a')).toBeNull()
  })

  it('亮侧：即使解析出 href 也不包裹，产出仍是裸 <img>（§9 任何改动不做）', () => {
    const doc = renderEntry(withHref(makeEntry(3), HREF, [0, 2]), 'nocturne-light')
    expect(doc.querySelector('.juya-entry-figure a, .jynoct-overflow-media a')).toBeNull()
    // 图仍在原位、未因去掉包装而丢失
    expect(figureSrcs(doc)).toEqual(['img-0.png', 'img-1.png'])
    expect(overflowSrcs(doc)).toEqual(['img-2.png'])
  })
})
