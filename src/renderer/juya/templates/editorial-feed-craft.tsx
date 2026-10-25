import { sourceHostname } from './shared'

interface EditorialFeedMastheadProps {
  sourceName: string
  sourceUrl: string
}

/** 订阅页头版（#71 打样 → #78 裁切角标与题注化）：杂志 nameplate——上缘双发丝线、
 *  衬线大字源名、host 作大写信息行、下缘 3px double 收底；只承载订阅源身份，
 *  期号日期留在各自卡片，本组件不输出任何日期。
 *  #78 搬运阅读页 .juya-issue::before/::after 的 L 形裁切角标（24×24 / 内缩 8px /
 *  1px 发丝 token，形态见 juya.css editorial 分节 .jyedit-feed-masthead-corner 块）：
 *  容器 ::before 已被 V1 第二条上缘发丝线占用，双角标只能落真实 DOM span——
 *  aria-hidden 对辅助技术静默，pointer-events:none 不拦截点击与选择（CSS 面）。
 *  host 行前置 24px 发丝短线（domain ::before），字距对齐阅读页题注语汇
 *  （uppercase + 0.08em，.juya-plate figcaption 同款）；刻意不搬阅读页栏目序号
 *  （counter jysec）——订阅源无真实序号语义，编号即造假信息。
 *  语义顺序仍自然（kicker → h1 → host），角标 span 无文本、无焦点、无交互。 */
export function EditorialFeedMasthead({ sourceName, sourceUrl }: EditorialFeedMastheadProps): JSX.Element {
  const hostname = sourceHostname(sourceUrl)

  return (
    <div className="jyedit-feed-masthead">
      <span aria-hidden="true" className="jyedit-feed-masthead-corner jyedit-feed-masthead-corner-tl" />
      <span aria-hidden="true" className="jyedit-feed-masthead-corner jyedit-feed-masthead-corner-br" />
      <p className="jyedit-feed-masthead-kicker">订阅源</p>
      <h1>{sourceName}</h1>
      {hostname && <p className="jyedit-feed-masthead-domain">{hostname}</p>}
    </div>
  )
}
