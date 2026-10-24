import { sourceHostname } from './shared'

interface NocturneFeedMastheadProps {
  sourceName: string
  sourceUrl: string
}

/** 订阅页头版（#74）：暗夜精修语言的 nameplate —— kicker「订阅源」+ 银灰渐变大字源名
 *  + 等宽大写 host，发丝线上下收边（形态见 juya.css nocturne 分节 .jynoct-feed-masthead 块）。
 *  只承载订阅源身份：期号日期留在各自卡片上，本组件不输出任何日期。
 *  host 派生走共享原子层单一来源（#68 收敛）；host 解析失败时整行不渲染。
 *  语义顺序自然（kicker → h1 → host），无装饰 DOM、无焦点、无交互 —— 发丝细节全部由
 *  CSS 伪元素承担（aria 外），键盘路径与接线前一致。 */
export function NocturneFeedMasthead({ sourceName, sourceUrl }: NocturneFeedMastheadProps): JSX.Element {
  const hostname = sourceHostname(sourceUrl)

  return (
    <div className="jynoct-feed-masthead">
      <p className="jynoct-feed-masthead-kicker">订阅源</p>
      <h1>{sourceName}</h1>
      {hostname && <p className="jynoct-feed-masthead-domain">{hostname}</p>}
    </div>
  )
}
