import { describe, expect, it } from 'vitest'
import type { JuyaEntry, JuyaIssue, JuyaSection } from '../../src/renderer/juya/parseJuyaIssue'
import {
  attachOverviewAnchors,
  matchOverviewEntries,
  normalizeEntryTitle
} from '../../src/renderer/juya/overviewAnchors'

/** 概览→条目匹配契约：编号优先、规范化标题次之、概览外链等于条目标题外链再次之；
 *  每一级都只接受**唯一**命中，歧义逐级下探，全部歧义/无命中返回 null。 */

function entry(overrides: Partial<JuyaEntry> = {}): JuyaEntry {
  return {
    title: '默认标题',
    titleLink: null,
    index: null,
    lead: null,
    paragraphs: [],
    images: [],
    blocks: [],
    links: [],
    ...overrides
  }
}

function section(heading: string, entries: JuyaEntry[]): JuyaSection {
  return { heading, entries }
}

describe('normalizeEntryTitle', () => {
  it('折叠连续空白（含全角空格与换行）并去首尾', () => {
    expect(normalizeEntryTitle('  要闻　一\n 标题 ')).toBe('要闻 一 标题')
  })

  it('保留标点与大小写，不做模糊改写', () => {
    expect(normalizeEntryTitle('OpenAI：新模型 (Beta)')).toBe('OpenAI：新模型 (Beta)')
  })
})

describe('matchOverviewEntries — 编号优先', () => {
  const sections = [
    section('甲', [
      entry({ title: '同名标题', index: '1', titleLink: 'https://example.com/a' }),
      entry({ title: '同名标题', index: '2', titleLink: 'https://example.com/b' })
    ])
  ]

  it('编号唯一命中时压过同名的另一条', () => {
    const matches = matchOverviewEntries(
      [{ title: '同名标题', href: null, index: '2' }],
      sections
    )
    expect(matches[0]?.entry).toBe(sections[0].entries[1])
    expect(matches[0]?.anchorId).toBe('juya-entry-1')
  })

  it('编号全篇重复时不猜：下探到唯一标题', () => {
    const duplicated = [
      section('甲', [
        entry({ title: '甲条', index: '1' }),
        entry({ title: '乙条', index: '1' })
      ])
    ]
    const matches = matchOverviewEntries(
      [{ title: '乙条', href: null, index: '1' }],
      duplicated
    )
    expect(matches[0]?.entry).toBe(duplicated[0].entries[1])
  })
})

describe('matchOverviewEntries — 标题与链接兜底', () => {
  it('概览缺编号时按规范化标题唯一命中', () => {
    const sections = [section('甲', [entry({ title: '模型  发布' }), entry({ title: '产品应用' })])]
    const matches = matchOverviewEntries([{ title: ' 模型 发布 ', href: null, index: null }], sections)
    expect(matches[0]?.entry).toBe(sections[0].entries[0])
  })

  it('标题重复时按概览外链 = 条目标题外链唯一命中', () => {
    const sections = [
      section('甲', [
        entry({ title: '同名', titleLink: 'https://example.com/a' }),
        entry({ title: '同名', titleLink: 'https://example.com/b' })
      ])
    ]
    const matches = matchOverviewEntries(
      [{ title: '同名', href: 'https://example.com/b', index: null }],
      sections
    )
    expect(matches[0]?.entry).toBe(sections[0].entries[1])
  })

  it('编号缺失且标题漂移时，仍可靠外链命中', () => {
    const sections = [section('甲', [entry({ title: '正文标题', titleLink: 'https://example.com/x' })])]
    const matches = matchOverviewEntries(
      [{ title: '目录标题', href: 'https://example.com/x', index: null }],
      sections
    )
    expect(matches[0]?.entry).toBe(sections[0].entries[0])
  })

  it('三级都歧义或缺失 → null（不生成滚动入口）', () => {
    const sections = [
      section('甲', [
        entry({ title: '同名', titleLink: 'https://example.com/a' }),
        entry({ title: '同名', titleLink: 'https://example.com/a' })
      ])
    ]
    const matches = matchOverviewEntries(
      [{ title: '同名', href: 'https://example.com/a', index: '9' }],
      sections
    )
    expect(matches).toEqual([null])
  })

  it('无栏目或无概览项时返回空/null 序列', () => {
    expect(matchOverviewEntries([], [section('甲', [entry()])])).toEqual([])
    expect(matchOverviewEntries([{ title: '标题', href: null, index: '1' }], [])).toEqual([null])
  })
})

describe('attachOverviewAnchors', () => {
  const issue: JuyaIssue = {
    heading: '期号',
    overview: [
      { title: '要闻一', href: 'https://example.com/1', index: '1' },
      { title: '未匹配目录项', href: 'https://example.com/x', index: null }
    ],
    sections: [
      section('要闻', [entry({ title: '要闻一', index: '1', titleLink: 'https://example.com/1' })]),
      section('模型', [entry({ title: '要闻二', index: '2' })])
    ]
  }

  it('按文档顺序给每个条目注入唯一锚点', () => {
    const anchored = attachOverviewAnchors(issue)
    expect(anchored.sections.map((s) => s.entries.map((e) => e.anchorId))).toEqual([
      ['juya-entry-0'],
      ['juya-entry-1']
    ])
  })

  it('概览唯一命中写入同一锚点，未命中为 null', () => {
    const anchored = attachOverviewAnchors(issue)
    expect(anchored.overview?.map((o) => o.anchorId)).toEqual(['juya-entry-0', null])
  })

  it('不改动原 issue（纯函数）', () => {
    attachOverviewAnchors(issue)
    expect(issue.sections[0].entries[0].anchorId).toBeUndefined()
    expect(issue.overview?.[0].anchorId).toBeUndefined()
  })

  it('无概览时只注入条目锚点，不凭空造 overview', () => {
    const anchored = attachOverviewAnchors({
      heading: '期号',
      sections: [section('要闻', [entry({ title: '条目' })])]
    })
    expect(anchored.overview).toBeUndefined()
    expect(anchored.sections[0].entries[0].anchorId).toBe('juya-entry-0')
  })

  it('保留原有字段与顺序', () => {
    const anchored = attachOverviewAnchors(issue)
    expect(anchored.heading).toBe('期号')
    expect(anchored.sections.map((s) => s.heading)).toEqual(['要闻', '模型'])
    expect(anchored.sections[1].entries[0].title).toBe('要闻二')
    expect(anchored.overview?.[0].href).toBe('https://example.com/1')
  })
})
