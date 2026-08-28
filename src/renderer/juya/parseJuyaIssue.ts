/** 橘鸦早报结构化解析器（渲染进程纯函数，DOMParser 实时解析）。
 *  契约与降级规则见 docs/PLAN-20260828.md「解析器契约定稿」与「渲染和降级规则」：
 *  - 返回 null = 整篇降级（关键骨架缺失），由调用方静默回退通用 ReaderView 渲染。
 *  - 部分失配（缺导语/编号/链接）→ 对应字段为 null，不整篇降级。
 *  - 未知节点忽略，不抛错。 */

export interface JuyaImage {
  src: string
  alt: string
}

export interface JuyaLink {
  text: string
  href: string
}

export interface JuyaOverviewEntry {
  title: string
  href: string | null
  /** 条目编号（code 内 "#N" 的 N）；缺失为 null */
  index: string | null
}

export interface JuyaEntry {
  title: string
  /** 条目标题外链；缺失为 null */
  titleLink: string | null
  index: string | null
  /** 导语（blockquote）；缺失为 null */
  lead: string | null
  /** 正文段落文本（不含「相关链接：」引导段与其后的链接列表） */
  paragraphs: string[]
  images: JuyaImage[]
  /** 「相关链接」列表 */
  links: JuyaLink[]
}

export interface JuyaSection {
  heading: string
  entries: JuyaEntry[]
}

export interface JuyaIssue {
  /** 期头（首个 h1） */
  heading: string
  /** 概览区（<h2>概览</h2> 下的列表项）；无概览时 undefined */
  overview?: JuyaOverviewEntry[]
  /** 全文栏目（概览除外） */
  sections: JuyaSection[]
}

/** 从 code 元素文本提取编号：'#3' → '3'；无效返回 null */
function extractIndex(el: Element | null): string | null {
  if (!el) return null
  const m = /#?\s*(\d+)/.exec(el.textContent ?? '')
  return m ? m[1] : null
}

/** 解析概览列表项：文本去掉 ↗ 与 code 后为标题，首个外链为 href */
function parseOverviewLi(li: Element): JuyaOverviewEntry {
  const code = li.querySelector('code')
  const index = extractIndex(code)
  const link = li.querySelector('a')
  const cloned = li.cloneNode(true) as Element
  cloned.querySelectorAll('code').forEach((c) => c.remove())
  const title = (cloned.textContent ?? '').replace(/↗/g, '').replace(/\s+/g, ' ').trim()
  return { title, href: link?.getAttribute('href') ?? null, index }
}

/** 解析一个全文条目：h3 标题及其后续兄弟节点（直到下一个 h3/h2） */
function parseEntry(h3: Element): JuyaEntry {
  const headingLink = h3.querySelector('a')
  const code = h3.querySelector('code')
  const clonedH3 = h3.cloneNode(true) as Element
  clonedH3.querySelectorAll('code').forEach((c) => c.remove())
  const title = (clonedH3.textContent ?? '').replace(/\s+/g, ' ').trim()

  const entry: JuyaEntry = {
    title,
    titleLink: headingLink?.getAttribute('href') ?? null,
    index: extractIndex(code),
    lead: null,
    paragraphs: [],
    images: [],
    links: []
  }

  let node = h3.nextElementSibling
  let linksStarted = false
  while (node && node.tagName !== 'H3' && node.tagName !== 'H2') {
    const tag = node.tagName
    if (tag === 'BLOCKQUOTE' && entry.lead === null && !linksStarted) {
      entry.lead = (node.textContent ?? '').trim() || null
    } else if (tag === 'P') {
      for (const img of node.querySelectorAll('img')) {
        entry.images.push({ src: img.getAttribute('src') ?? '', alt: img.getAttribute('alt') ?? '' })
      }
      const text = (node.textContent ?? '').trim()
      if (text && node.querySelector('img') === null) {
        if (/^相关链接[：:]?\s*$/.test(text)) {
          linksStarted = true
        } else if (!linksStarted) {
          entry.paragraphs.push(text)
        }
      }
    } else if (tag === 'UL' || tag === 'OL') {
      if (linksStarted) {
        for (const a of node.querySelectorAll('a')) {
          const href = a.getAttribute('href')
          if (href) entry.links.push({ text: (a.textContent ?? '').trim(), href })
        }
      }
    }
    // hr / 未知节点：忽略
    node = node.nextElementSibling
  }
  return entry
}

/** 解析橘鸦 content:encoded 为结构化语义模型；骨架缺失返回 null（整篇降级）。 */
export function parseJuyaIssue(html: string): JuyaIssue | null {
  if (!html || !html.trim()) return null
  let doc: Document
  try {
    doc = new DOMParser().parseFromString(html, 'text/html')
  } catch {
    return null
  }

  const body = doc.body
  const h1 = body.querySelector('h1')
  const heading = (h1?.textContent ?? '').trim()

  const sections: JuyaSection[] = []
  let overview: JuyaOverviewEntry[] | undefined

  // 按文档顺序遍历 h2/h3，把 h3 条目归入其前方最近的 h2 栏目
  const headings = [...body.querySelectorAll('h2, h3')]
  let current: JuyaSection | null = null

  for (const h of headings) {
    if (h.tagName === 'H2') {
      const title = (h.textContent ?? '').trim()
      if (title === '概览') {
        current = null
        // 概览：该 h2 后、下一个 h2 前的所有列表项（概览内部用 h3 分组，需跨过）
        const entries: JuyaOverviewEntry[] = []
        let node = h.nextElementSibling
        while (node && node.tagName !== 'H2') {
          if (node.tagName === 'UL' || node.tagName === 'OL') {
            for (const li of node.querySelectorAll('li')) entries.push(parseOverviewLi(li))
          }
          node = node.nextElementSibling
        }
        if (entries.length > 0) overview = entries
      } else {
        current = { heading: title, entries: [] }
        sections.push(current)
      }
    } else {
      // h3：仅当处于某个非概览栏目内时作为条目标题
      if (current) current.entries.push(parseEntry(h))
    }
  }

  const hasEntries = sections.some((s) => s.entries.length > 0)
  if (!hasEntries) return null

  const issue: JuyaIssue = { heading, sections: sections.filter((s) => s.entries.length > 0) }
  if (overview) issue.overview = overview
  return issue
}
