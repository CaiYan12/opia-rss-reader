import Parser from 'rss-parser'
import type { FeedProvider, FeedFetchResult } from '../../shared/plugin-api'
import type { Article, FeedSource } from '../../shared/types'

type RssItem = {
  title?: string
  link?: string
  guid?: string
  pubDate?: string
  content?: string
  contentSnippet?: string
  'content:encoded'?: string
}

/** 从全文 HTML 提取封面：首个 img，文件名含 cover_ 优先 */
export function extractCover(html: string): string | null {
  if (!html) return null
  const imgRe = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi
  let first: string | null = null
  let m: RegExpExecArray | null
  while ((m = imgRe.exec(html)) !== null) {
    const src = m[1]
    if (!first) first = src
    if (/cover_/i.test(src)) return src
  }
  return first
}

function stripHtml(html: string, maxLen = 200): string {
  const text = html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return text.length > maxLen ? text.slice(0, maxLen) + '…' : text
}

export class RssProvider implements FeedProvider {
  id = 'builtin-rss'
  name = 'RSS 2.0 / Atom'

  private parser = new Parser<{ items: RssItem[] }, RssItem>({
    timeout: 15000,
    headers: { 'User-Agent': 'OpiaRSSReader/0.1' }
  })

  canHandle(url: string): boolean {
    return /^https?:\/\/.+/i.test(url)
  }

  async fetch(source: FeedSource): Promise<FeedFetchResult> {
    const feed = await this.parser.parseURL(source.url)
    const articles: Array<Omit<Article, 'sourceId'>> = (feed.items ?? []).map((item) => {
      const contentHtml = item['content:encoded'] ?? item.content ?? ''
      const link = item.link ?? ''
      return {
        guid: item.guid ?? link ?? `${source.id}:${item.pubDate ?? ''}:${item.title ?? ''}`,
        title: item.title ?? '(无标题)',
        link,
        pubDate: item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString(),
        summary: item.contentSnippet
          ? item.contentSnippet.slice(0, 200)
          : stripHtml(contentHtml),
        contentHtml,
        coverUrl: extractCover(contentHtml)
      }
    })
    return { articles }
  }
}
