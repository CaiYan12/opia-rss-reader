import type { Article, FeedSource, ThemeTokens } from './types'

/**
 * 插件 API v1 —— 三类注册点：FeedProvider 与 Theme 完整可用，CardRenderer 仅登记元数据。
 * 插件为含 manifest.json 的目录，main 字段指向 CommonJS 入口，入口导出实现 OpiaPlugin 的对象
 * （module.exports 或 exports.default 均可；经未沙箱化的 require() 加载，无 init/dispose 钩子）。
 * 能力由 manifest.provides 声明门控：未声明的注册点即使带了对应字段也不生效。
 * 完整契约、选中规则与限制见 docs/PLUGIN_API.md。
 */

export interface FeedFetchResult {
  /** 不得携带 sourceId：FeedService 会按当前源统一打上 */
  articles: Array<Omit<Article, 'sourceId'>>
}

export interface FeedProvider {
  /** 全局唯一 id，如 'builtin-rss'；用该 id 会静默顶替内置 RSS 解析器 */
  id: string
  name: string
  /** 校验该 provider 是否能处理给定 url；返回 false 时该源被跳过（只 warn） */
  canHandle(url: string): boolean
  /** 抛错由 FeedService 逐源兜住，不影响其余源；guid 不稳定会导致重复计入新文章 */
  fetch(source: FeedSource): Promise<FeedFetchResult>
}

/** v1 无任何消费者：渲染层卡片仍由 ArticleCard 自包含渲染，此形状为未来接通预留 */
export interface CardRendererProps {
  article: Article
  read: boolean
  favorite: boolean
}

export interface OpiaPlugin {
  /** 仅自描述；加载器实际读取的是同目录 manifest.json */
  manifest: {
    id: string
    name: string
    version: string
  }
  /** 需 manifest.provides 含 'feed-provider' 才注册 */
  feedProviders?: FeedProvider[]
  /** 需 manifest.provides 含 'theme' 才注册；须通过 ThemeService 校验（colors 12 键全非空、双字体非空），非法主题会被跳过 */
  themes?: ThemeTokens[]
  /** 渲染进程卡片渲染器暂不跨进程加载，v1 仅登记元数据、无渲染路径 */
  cardRenderers?: Array<{ id: string; name: string }>
}

export interface PluginRegistrySnapshot {
  providers: Array<{ id: string; name: string; pluginId: string }>
  themes: Array<{ id: string; name: string; pluginId: string }>
  cardRenderers: Array<{ id: string; name: string; pluginId: string }>
}
