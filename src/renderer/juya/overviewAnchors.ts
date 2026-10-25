/** 概览→条目的页内跳转解析（渲染进程纯函数）。
 *
 *  匹配梯度：编号 → 规范化标题 → 概览项 href 与条目标题外链相等。每一级只接受**唯一**命中：
 *  编号会因源站重复/缺号而歧义，标题会漂移，外链是最后一道可核对的身份。
 *  全部歧义或缺失 ⇒ 不生成滚动入口（宁可不跳，也不把读者送到错条目）。
 *
 *  锚点 id 由 attachOverviewAnchors 按文档顺序统一注入：概览与条目标题消费同一个 id，
 *  不依赖编号（编号可能重复/缺失），也不依赖标题（标题可能漂移）。 */

import type { JuyaEntry, JuyaIssue, JuyaOverviewEntry, JuyaSection } from './parseJuyaIssue'

const DEFAULT_ANCHOR_PREFIX = 'juya'

export interface EntryAnchor {
  entry: JuyaEntry
  /** 该条目标题的页内锚点 id */
  anchorId: string
}

/** 折叠空白（含全角空格/换行）并去首尾；不改标点、大小写与文字本身。 */
export function normalizeEntryTitle(title: string): string {
  return title.replace(/\s+/g, ' ').trim()
}

function flattenEntries(sections: readonly JuyaSection[], prefix: string): EntryAnchor[] {
  let ordinal = 0
  return sections.flatMap((section) =>
    section.entries.map((entry) => ({
      entry,
      anchorId: `${prefix}-entry-${ordinal++}`
    }))
  )
}

function unique(candidates: EntryAnchor[]): EntryAnchor | null {
  return candidates.length === 1 ? candidates[0] : null
}

/** 为每条概览项解析唯一目标；返回与 overview 等长的序列，未命中为 null。
 *  prefix 由调用方按阅读页实例给出，避免 keep-alive 多标签出现重复 id。 */
export function matchOverviewEntries(
  overview: readonly JuyaOverviewEntry[],
  sections: readonly JuyaSection[],
  prefix: string = DEFAULT_ANCHOR_PREFIX
): Array<EntryAnchor | null> {
  const all = flattenEntries(sections, prefix)
  const pick = (predicate: (candidate: EntryAnchor) => boolean): EntryAnchor | null =>
    unique(all.filter(predicate))
  return overview.map((item) => {
    if (item.index !== null) {
      const byIndex = pick((c) => c.entry.index === item.index)
      if (byIndex) return byIndex
    }
    const title = normalizeEntryTitle(item.title)
    const byTitle = pick((c) => normalizeEntryTitle(c.entry.title) === title)
    if (byTitle) return byTitle
    if (item.href !== null) {
      const byHref = pick((c) => c.entry.titleLink === item.href)
      if (byHref) return byHref
    }
    return null
  })
}

/** 给条目标题注入锚点，并把唯一命中的锚点写回概览项（未命中为 null）。 */
export function attachOverviewAnchors(
  issue: JuyaIssue,
  prefix: string = DEFAULT_ANCHOR_PREFIX
): JuyaIssue {
  const candidates = flattenEntries(issue.sections, prefix)
  const anchorByEntry = new Map(candidates.map((c) => [c.entry, c.anchorId]))
  const sections = issue.sections.map((section) => ({
    ...section,
    entries: section.entries.map((entry) => ({
      ...entry,
      anchorId: anchorByEntry.get(entry)
    }))
  }))
  if (!issue.overview) return { ...issue, sections }
  const matches = matchOverviewEntries(issue.overview, sections, prefix)
  const overview = issue.overview.map((item, i) => ({
    ...item,
    anchorId: matches[i]?.anchorId ?? null
  }))
  return { ...issue, sections, overview }
}
