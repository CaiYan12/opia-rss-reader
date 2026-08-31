/**
 * 示例插件：JSON Feed 订阅源解析器（FeedProvider）
 *
 * 演示三类注册点中唯一完整可用的「抓取侧」扩展点：实现 src/shared/plugin-api.ts 的 FeedProvider，
 * 由 PluginManager 注册进 FeedService 的 provider 表，按订阅源的 providerId 选中。
 *
 * 使用方式（当前 UI 未提供 provider 选择器，需手改持久层）：
 * 1. 把本目录复制到 %APPDATA%\Opia RSS Reader\plugins\example-json-feed\（便携版唯一可写的插件位置）
 * 2. 重启应用，主进程日志出现 `[PluginManager] loaded example-json-feed@0.1.0`
 * 3. 在应用内添加该订阅源（任意 providerId），退出后编辑 opia-data.json，把该源的 providerId 改为 "example-json"
 * 4. 再启动即可按 JSON Feed 抓取。判据见 canHandle：只接 URL 以 .json 结尾的源
 *
 * 约束（与核心实现的契约）：
 * - CommonJS 入口，module.exports 或 exports.default 均可
 * - 无生命周期钩子：加载即读属性，不会调用 init/dispose
 * - 运行在 main 进程且未沙箱化：可用 node 内置模块，但请自律（可读用户全部本地数据）
 * - 不能 import 核心代码（构建产物不导出符号），故封面提取等小工具自带一份
 */

/** JSON Feed 1.1 的 item → 核心 Article（不含 sourceId，由 FeedService 打） */
function toArticle(item, source) {
  const contentHtml =
    item.content_html || (item.content ? `<p>${escapeHtml(String(item.content))}</p>` : '')
  const link = item.url || ''
  return {
    guid: item.id || link || `${source.id}:${item.title}`,
    title: item.title || '(无标题)',
    link,
    pubDate: normalizeDate(item.date_published),
    summary: item.summary ? String(item.summary).slice(0, 200) : stripHtml(contentHtml),
    contentHtml,
    coverUrl: extractCover(item.image || contentHtml)
  }
}

function normalizeDate(value) {
  const time = value ? new Date(value).getTime() : NaN
  return Number.isNaN(time) ? new Date().toISOString() : new Date(time).toISOString()
}

/** 只接受 http(s) 且路径以 .json 结尾的源，其余留给内置 RSS provider */
function canHandle(url) {
  return typeof url === 'string' && /^https?:\/\/.+/i.test(url) && /\.json(\?|$)/i.test(url)
}

function extractCover(html) {
  if (!html) return null
  const imgRe = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi
  let first = null
  let match
  while ((match = imgRe.exec(html)) !== null) {
    if (!first) first = match[1]
    if (/cover_/i.test(match[1])) return match[1]
  }
  return first
}

function stripHtml(html) {
  const text = html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return text.length > 200 ? text.slice(0, 200) + '…' : text
}

function escapeHtml(text) {
  return text.replace(
    /[&<>"']/g,
    (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]
  )
}

module.exports = {
  // manifest 字段仅用于自描述；加载器实际读的是 manifest.json
  manifest: { id: 'example-json-feed', name: '示例 JSON Feed 订阅源', version: '0.1.0' },
  feedProviders: [
    {
      id: 'example-json',
      name: 'JSON Feed 1.1（示例）',
      canHandle,
      async fetch(source) {
        const response = await fetch(source.url, { headers: { 'User-Agent': 'OpiaRSSReader-ExampleJson/0.1' } })
        if (!response.ok) throw new Error(`JSON Feed 抓取失败：HTTP ${response.status}`)
        const feed = await response.json()
        if (!Array.isArray(feed.items)) throw new Error('响应缺少 items 数组，不是 JSON Feed')
        return { articles: feed.items.map((item) => toArticle(item, source)) }
      }
    }
  ]
}
