/** Mini 模式展开摘要纯函数模块：无 React / 无副作用。
 *  行为约定（AGENTS.md「Mini 模式展开摘要」）：
 *  - 橘鸦源（sourceId === JUYA_SOURCE_ID）展开后展示概览（简报）条目文本，恒视为已截断
 *    （简报只是全刊简化，完整内容在正常模式阅读页）。
 *  - 其他源展示纯文本摘要（优先 summary，缺省从 contentHtml 剥离标签），超过
 *    MINI_TEXT_LIMIT 字符截断。
 *  - 完全无内容时返回 null（行不可展开）。 */

import { JUYA_SOURCE_ID } from '../../shared/types'
import type { Article } from '../../shared/types'
import { parseJuyaIssue } from '../juya/parseJuyaIssue'

/** 非橘鸦源的文本摘要展示上限（字符数，超出截断并加省略号） */
export const MINI_TEXT_LIMIT = 120

export interface MiniDigest {
  /** juya=概览（简报）条目；text=纯文本摘要 */
  kind: 'juya' | 'text'
  /** kind==='juya'：条目文本（含 #编号 前缀；外链不外发，纯文本展示） */
  entries?: string[]
  /** kind==='text'：限长后的摘要文本 */
  text?: string
  /** 内容相对完整原文是否被简化/截断（决定是否显示「查看更多」） */
  truncated: boolean
}

/** HTML 剥离为纯文本：去 script/style、折叠空白（渲染进程用 DOMParser 实现） */
export function stripHtmlToText(html: string): string {
  if (!html || !html.trim()) return ''
  let doc: Document
  try {
    doc = new DOMParser().parseFromString(html, 'text/html')
  } catch {
    return ''
  }
  doc.querySelectorAll('script, style').forEach((el) => el.remove())
  return (doc.body.textContent ?? '').replace(/\s+/g, ' ').trim()
}

function truncateText(text: string, max: number): { text: string; truncated: boolean } {
  if (text.length <= max) return { text, truncated: false }
  return { text: text.slice(0, max) + '…', truncated: true }
}

/** 计算一篇文章在 Mini 展开区的摘要；无可展示内容返回 null */
export function getMiniDigest(article: Article): MiniDigest | null {
  if (article.sourceId === JUYA_SOURCE_ID) {
    const issue = parseJuyaIssue(article.contentHtml)
    const overview = issue?.overview ?? []
    if (overview.length > 0) {
      return {
        kind: 'juya',
        entries: overview.map((e) => (e.index ? `#${e.index} ${e.title}` : e.title)),
        truncated: true
      }
    }
    // 无概览（或解析失败）→ 与其他源一致走文本摘要
  }

  const raw = article.summary?.trim() || stripHtmlToText(article.contentHtml)
  if (!raw) return null
  const { text, truncated } = truncateText(raw, MINI_TEXT_LIMIT)
  return { kind: 'text', text, truncated }
}
