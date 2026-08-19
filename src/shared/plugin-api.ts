import type { Article, FeedSource, ThemeTokens } from './types'

/**
 * 插件 API v1 —— 三类注册点。
 * 插件为含 manifest.json 的目录，main 字段指向 CommonJS 入口，
 * 入口默认导出实现 OpiaPlugin 的对象。
 */

export interface FeedFetchResult {
  articles: Array<Omit<Article, 'sourceId'>>
}

export interface FeedProvider {
  /** 全局唯一 id，如 'builtin-rss' */
  id: string
  name: string
  /** 校验该 provider 是否能处理给定 url */
  canHandle(url: string): boolean
  fetch(source: FeedSource): Promise<FeedFetchResult>
}

export interface CardRendererProps {
  article: Article
  read: boolean
  favorite: boolean
}

export interface OpiaPlugin {
  manifest: {
    id: string
    name: string
    version: string
  }
  feedProviders?: FeedProvider[]
  themes?: ThemeTokens[]
  /** 渲染进程卡片渲染器暂不跨进程加载，v1 仅登记元数据 */
  cardRenderers?: Array<{ id: string; name: string }>
}

export interface PluginRegistrySnapshot {
  providers: Array<{ id: string; name: string; pluginId: string }>
  themes: Array<{ id: string; name: string; pluginId: string }>
  cardRenderers: Array<{ id: string; name: string; pluginId: string }>
}
