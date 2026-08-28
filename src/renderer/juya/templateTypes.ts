import type { ComponentType } from 'react'
import type { Article, JuyaStyleId, LayoutConfig } from '../../shared/types'
import type { JuyaIssue } from './parseJuyaIssue'
import type { JuyaStyleVariantId } from './juyaStyles'

/** 阅读详情页模板入参：语义模型 + 原文元数据 + 外链出口 + 当前变体（亮/暗由运行时解析） */
export interface JuyaIssueProps {
  article: Article
  issue: JuyaIssue
  onOpenLink: (href: string) => void
  variantId: JuyaStyleVariantId
}

/** 订阅页（期号列表）模板入参；历史/打开行为由模板内部经 store 获取。
 *  layout 来自设置「布局」配置：预设（grid/compact/magazine）、列数与显示字段，橘鸦主页同样遵循。 */
export interface JuyaFeedProps {
  articles: Article[]
  variantId: JuyaStyleVariantId
  layout: LayoutConfig
}

export interface JuyaTemplate {
  IssueView: ComponentType<JuyaIssueProps>
  FeedList: ComponentType<JuyaFeedProps>
}

export type JuyaStyleKey = Exclude<JuyaStyleId, 'off'>
