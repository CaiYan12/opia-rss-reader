import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseJuyaIssue } from '../../src/renderer/juya/parseJuyaIssue'

// 解析器契约测试（TDD 先行，实现见 src/renderer/juya/parseJuyaIssue.ts）。
// 结构断言均对照 2026-08-28 期真实样本的脱敏夹具。
// 夹具目录按项目约定不入库（见 .gitignore），缺失时跳过这些结构断言，而不是让 npm test 在解析阶段整体失败。
const FIXTURE_PATH = join(process.cwd(), 'tests/fixtures/juya-content.html')
const hasFixture = existsSync(FIXTURE_PATH)
const fixtureHtml = hasFixture ? readFileSync(FIXTURE_PATH, 'utf-8') : ''

describe.skipIf(!hasFixture)('parseJuyaIssue — 完整结构', () => {
  const issue = parseJuyaIssue(fixtureHtml)

  it('解析成功（非 null）', () => {
    expect(issue).not.toBeNull()
  })

  it('期头来自首个 h1', () => {
    expect(issue?.heading).toBe('AI 早报 2026-08-28')
  })

  it('概览区独立提取，含编号与链接；无链接条目 titleLink 为 null', () => {
    const ov = issue?.overview
    expect(ov).toBeDefined()
    expect(ov).toHaveLength(5)
    expect(ov?.[0]).toMatchObject({
      title: '示例要闻标题一',
      href: 'https://example.com/news/1',
      index: '1'
    })
    expect(ov?.[4]).toMatchObject({ title: '示例产品应用标题二（无链接占位）', index: '5' })
    expect(ov?.[4]?.href).toBeNull()
  })

  it('概览不计入 sections；栏目顺序与真实样本一致', () => {
    expect(issue?.sections.map((s) => s.heading)).toEqual(['要闻', '模型发布', '产品应用'])
  })

  it('条目骨架：标题 / 标题链接 / 编号 / 导语 / 段落 / 图片 / 相关链接', () => {
    const entry = issue?.sections[0]?.entries[0]
    expect(entry).toMatchObject({
      title: '示例要闻标题一',
      titleLink: 'https://example.com/news/1',
      index: '1',
      lead: '示例导语一：一句话摘要占位文本。'
    })
    expect(entry?.paragraphs).toEqual([
      '示例正文段一占位文本，描述该要闻的详细内容。',
      '示例正文段二占位文本，补充说明。'
    ])
    expect(entry?.images.map((i) => i.src)).toEqual([
      'https://assets.example.com/imagehub/aidaily/aaaa/m001_1111.gif',
      'https://assets.example.com/imagehub/aidaily/aaaa/m002_2222.gif',
      'https://assets.example.com/imagehub/aidaily/aaaa/m003_3333.png'
    ])
    expect(entry?.links).toEqual([
      { text: 'https://example.com/news/1', href: 'https://example.com/news/1' },
      { text: 'https://example.com/news/1-extra', href: 'https://example.com/news/1-extra' }
    ])
  })

  it('无图条目：images 为空数组而非缺省', () => {
    const entry = issue?.sections[0]?.entries[1]
    expect(entry?.title).toBe('示例要闻标题二')
    expect(entry?.images).toEqual([])
  })

  it('各栏目条目数正确', () => {
    expect(issue?.sections[0]?.entries).toHaveLength(2)
    expect(issue?.sections[1]?.entries).toHaveLength(1)
    expect(issue?.sections[2]?.entries).toHaveLength(2)
  })
})

describe.skipIf(!hasFixture)('parseJuyaIssue — 部分失配（不整篇降级）', () => {
  it('条目缺导语 → lead 为 null，其余字段照常', () => {
    const entry = parseJuyaIssue(fixtureHtml)?.sections[2]?.entries[1]
    expect(entry?.title).toBe('示例产品应用标题二（无链接无导语占位）')
    expect(entry?.lead).toBeNull()
    expect(entry?.titleLink).toBeNull()
    expect(entry?.index).toBe('5')
    expect(entry?.paragraphs).toHaveLength(1)
  })

  it('条目 h3 无编号 code → index 为 null', () => {
    const html = '<h1>X</h1><h2>栏目</h2><h3>无编号条目</h3><p>正文</p>'
    const entry = parseJuyaIssue(html)?.sections[0]?.entries[0]
    expect(entry?.index).toBeNull()
    expect(entry?.title).toBe('无编号条目')
  })
})

describe('parseJuyaIssue — 整篇降级判据（返回 null）', () => {
  it('空字符串', () => {
    expect(parseJuyaIssue('')).toBeNull()
  })

  it('纯文本无结构', () => {
    expect(parseJuyaIssue('只是一段纯文本，没有任何标签。')).toBeNull()
  })

  it('只有 h1 与段落、无栏目条目', () => {
    expect(parseJuyaIssue('<h1>期名</h1><p>段落一</p><p>段落二</p>')).toBeNull()
  })

  it('有 h2 栏目但无任何 h3 条目', () => {
    expect(parseJuyaIssue('<h1>期名</h1><h2>要闻</h2><p>只有段落</p>')).toBeNull()
  })

  it('仅概览区（h2+ul）但无全文栏目条目', () => {
    const html =
      '<h1>期名</h1><h2>概览</h2><ul><li>条目 <a href="https://example.com/a">↗</a> <code>#1</code></li></ul>'
    expect(parseJuyaIssue(html)).toBeNull()
  })
})

describe('parseJuyaIssue — 未知节点与异常 HTML（忽略，不抛错）', () => {
  it('混入未知元素不抛错且不进入模型', () => {
    const html =
      '<h1>期名</h1><h2>栏目</h2><table><tr><td>干扰</td></tr></table><figure><img src="x"></figure>' +
      '<h3><a href="https://example.com/a">条目一</a> <code>#1</code></h3><blockquote>导语</blockquote><p>正文</p>'
    const issue = parseJuyaIssue(html)
    expect(issue).not.toBeNull()
    expect(issue?.sections[0]?.entries).toHaveLength(1)
    expect(issue?.sections[0]?.entries[0]?.paragraphs).toEqual(['正文'])
  })

  it('破损标签不抛错', () => {
    expect(() => parseJuyaIssue('<h1>期名<h2>栏目<h3><a href="u">条</a><code>#1</code><p>正文')).not.toThrow()
  })
})
