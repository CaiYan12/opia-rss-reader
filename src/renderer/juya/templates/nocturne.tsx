import { useEffect, useRef, useState, type MouseEvent } from 'react'
import { createPortal } from 'react-dom'
import { EntryTitle, Lead, LinksBlock, OverviewItems, Paragraphs, SafeLink } from './shared'
import { DefaultFeedItem, FeedShell, Scene } from './parts'
import { NocturneFeedMasthead } from './nocturne-feed-craft'
import type { JuyaEntry, JuyaImage } from '../parseJuyaIssue'
import type { JuyaTemplate, JuyaIssueProps, JuyaFeedProps } from '../templateTypes'
import { useAppStore } from '../../stores/useAppStore'

const VARIANT_CLASS = 'jynoct'

/** lightbox 只挂载的变体（#21 / SPEC B5b）：需求 §9 把「nocturne-light 任何改动」列为不做，
 *  故亮侧保持原行为（点图不放大）。判定沿用 IssueView 已有的 variantId，不新增分支来源。 */
const LIGHTBOX_VARIANT = 'nocturne-dark'

/** 右列最多容纳的图片张数；第 3 张及以后回流为正文下方通栏（#8 决策 13）。
 *  仅本文件消费（`NocturneEntrySplit` 内切片），故不导出 —— 导出会误导为公共契约。 */
const NOCTURNE_FIGURE_LIMIT = 2

/** 单幅图版（#21）：与 shared.tsx `ImageGrid` 的产出**同构**，唯一差异是「图片被 `<a>` 包裹时
 *  包一层 SafeLink」—— 放大视图只认裸图，链接图必须继续走既有外链分流（不吞「点图跳原文」）。
 *  为什么在本文件本地实现而不改共享 ImageGrid：后者被其余 7 风格共用，为单风格的图片链接形态
 *  给共享原子层加分支属于扩大共享面；本次只让 nocturne 消费 `JuyaImage.href`。
 *  **`wrapLinks` 必须由变体门控（2026-10-20 收口修正）**：链接包装只服务暗侧放大视图；
 *  `nocturne-light` 按需求 §9「任何改动」不做，必须继续产出与上一轮**逐字相同**的裸 `<img>`
 *  （包裹会在亮侧新增 `<a>` 节点与可点行为）。 */
function NocturneImage({
  image,
  onOpenLink,
  wrapLinks
}: {
  image: JuyaImage
  onOpenLink: (href: string) => void
  wrapLinks: boolean
}): JSX.Element {
  const img = <img src={image.src} alt={image.alt} loading="lazy" />
  return wrapLinks && image.href ? (
    <SafeLink href={image.href} onOpenLink={onOpenLink}>
      {img}
    </SafeLink>
  ) : (
    img
  )
}

/** 图版容器：plate = 题注装裱（右列，class 与 shared ImageGrid 逐字一致以复用既有 CSS/E2E 锚点）；
 *  grid = 通栏回流带（第 3 张及以后）。 */
function NocturneImageGrid({
  images,
  mode,
  onOpenLink,
  wrapLinks
}: {
  images: JuyaImage[]
  mode: 'plate' | 'grid'
  onOpenLink: (href: string) => void
  wrapLinks: boolean
}): JSX.Element {
  if (mode === 'plate') {
    return (
      <div className="juya-media juya-media-plate">
        {images.map((image, i) => (
          <figure className="juya-plate" key={i}>
            <NocturneImage image={image} onOpenLink={onOpenLink} wrapLinks={wrapLinks} />
            {image.alt && <figcaption>{image.alt}</figcaption>}
          </figure>
        ))}
      </div>
    )
  }
  return (
    <div className="juya-media juya-media-grid">
      {images.map((image, i) => (
        <NocturneImage key={i} image={image} onOpenLink={onOpenLink} wrapLinks={wrapLinks} />
      ))}
    </div>
  )
}

/** 原生 `<dialog>` 放大视图（#21 / SPEC 批次 B5b）。
 *  - `showModal()` 自带焦点陷阱、ESC 关闭与 `role=dialog`/`aria-modal` 语义 —— 不手写一套；
 *  - 零新状态库、零 IPC、零网络请求：只把**已加载**的 `src` 交给同一个 URL；
 *  - portal 到 `document.body`：内容区在 CSS `zoom` 容器内，居中/尺寸会被 zoom 缩放（先例
 *    ThemeEditor 取色器）；同时让它脱离 `.juya-root` 子树，不破「`.juya-root` 永无 animation」。
 *  - 关闭统一走原生 `close()`：ESC、点遮罩、`cancel` 都归一到同一个 `close` 事件。 */
function NocturneLightbox({
  image,
  onClose
}: {
  image: JuyaImage
  onClose: () => void
}): JSX.Element {
  const ref = useRef<HTMLDialogElement>(null)
  // 只在挂载时订阅一次原生 close；用 ref 承接最新回调，避免 effect 依赖抖动
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (!dialog.open) dialog.showModal()
    const handleClose = (): void => onCloseRef.current()
    dialog.addEventListener('close', handleClose)
    return () => {
      dialog.removeEventListener('close', handleClose)
      if (dialog.open) dialog.close()
    }
  }, [])

  return createPortal(
    <dialog
      ref={ref}
      className="jynoct-lightbox"
      data-juya-variant={LIGHTBOX_VARIANT}
      aria-label="图片放大查看"
      onClick={(e: MouseEvent<HTMLDialogElement>) => {
        // 点遮罩：`::backdrop` 上的点击事件 target 就是 dialog 自身（内容盒内的点击目标是 img）
        if (e.target === e.currentTarget) e.currentTarget.close()
      }}
    >
      <img src={image.src} alt={image.alt} />
    </dialog>,
    document.body
  )
}

/** nocturne 专属图文并排骨架（#8）：在模板内组合 shared.tsx 原子层，**零共享层改动**
 *  （共享 EntrySplit 无「右列限 N 张」参数，改它会波及 y2k / editorial）。
 *  与共享 EntrySplit 的差异只有一处：右列只取前 2 张 plate，剩余图回流到
 *  `.jynoct-overflow-media` 通栏图片带，顺序不变；`LinksBlock` 仍是条目尾部。
 *
 *  纪律签名保留：类名沿用 `juya-entry-split` / `juya-entry-row` / `juya-entry-body` /
 *  `juya-entry-figure`（既有 CSS 与 E2E 锚点），且**永不**加 `juya-entry-alt`——
 *  图恒在右、不左右交替。
 *
 *  几何实测结论（2026-10-12，#8 收口；集成侧串行 E2E 实测**已完成**，原「真值待实测」注释已过期）：
 *    · 坏链夹具（`tests/fixtures/juya-content.html` 的 6 张图全指向不可达的 assets.example.com，
 *      高度塌陷）：空洞 **145.8px**；
 *    · `nocturneSvg` 内联 SVG 图源（480×320 = 3:2，几何真实可复现）：空洞 **167px**。
 *    **票面「约 270px 降到约 100px 内」的目标未达成** —— 如实记录，不粉饰。原因（已定位）：
 *      溢出带 `.jynoct-overflow-media` 落在行**之下**（`juya-entry-row` 之后），填不上右列旁的
 *      空白；而空洞的定义就是「右列 2 张图高度 − 正文列高度」，把图移出行**不会**缩小右列高度，
 *      只是减少了堆在右列里的张数（4 张 → 2 张）。
 *    用户裁决（2026-10-12）：**保持通栏实现**（决策 13 形态不动），以实测值收口并记录该偏差。
 *    回归闸门见 `tests/e2e/reader.spec.ts` 的「已接受偏差的回归闸门」注释（引用 167px）。 */
export function NocturneEntrySplit({
  entry,
  onOpenLink,
  wrapLinks
}: {
  entry: JuyaEntry
  onOpenLink: (href: string) => void
  wrapLinks: boolean
}): JSX.Element {
  const figureImages = entry.images.slice(0, NOCTURNE_FIGURE_LIMIT)
  const overflowImages = entry.images.slice(NOCTURNE_FIGURE_LIMIT)
  return (
    <article className="juya-entry juya-entry-split">
      <div className="juya-entry-row">
        <div className="juya-entry-body">
          <EntryTitle entry={entry} onOpenLink={onOpenLink} />
          {entry.lead && <Lead lead={entry.lead} />}
          <Paragraphs paragraphs={entry.paragraphs} />
        </div>
        {figureImages.length > 0 && (
          <div className="juya-entry-figure">
            <NocturneImageGrid
              images={figureImages}
              mode="plate"
              onOpenLink={onOpenLink}
              wrapLinks={wrapLinks}
            />
          </div>
        )}
      </div>
      {/* 第 3 张及以后：通栏海报带（grid 模式自适应多列，1 张时退化为单幅通栏） */}
      {overflowImages.length > 0 && (
        <div className="jynoct-overflow-media">
          <NocturneImageGrid
            images={overflowImages}
            mode="grid"
            onOpenLink={onOpenLink}
            wrapLinks={wrapLinks}
          />
        </div>
      )}
      <LinksBlock links={entry.links} onOpenLink={onOpenLink} />
    </article>
  )
}

/** 暗夜精修式（第二轮定制排版）：图文并排但图恒在右侧（纪律感不交替），
 *  题注等宽字体；序号退化为灰色 # 前缀小字（发丝线体系的一部分）。
 *  场景层（#2）：dust + nebula 两个纯氛围预设，挂在 .juya-issue 之前（与 y2k / synthwave 同位，
 *  场景在内容之下 z-index 0）；色值/避让/降级全部在 juya.css 的 nocturne 段内。
 *  图片放大（#21）：事件委托挂在内容容器 `.juya-issue` 上（图片张数不定，
 *  右列 plate 与回流通栏带都覆盖），只对裸图生效。 */
function IssueView({ article, issue, onOpenLink, variantId }: JuyaIssueProps): JSX.Element {
  const [zoomed, setZoomed] = useState<JuyaImage | null>(null)
  const lightboxEnabled = variantId === LIGHTBOX_VARIANT

  const handleContentClick = (e: MouseEvent<HTMLDivElement>): void => {
    const target = e.target
    if (!(target instanceof Element)) return
    const img = target.closest('img')
    if (!(img instanceof HTMLImageElement)) return
    // 只对裸图生效：链接包裹的图放行给 SafeLink / 原生 <a>，不吞「点图跳原文」
    if (img.closest('a')) return
    const src = img.currentSrc || img.getAttribute('src') || ''
    if (!src) return
    setZoomed({ src, alt: img.getAttribute('alt') ?? '' })
  }

  return (
    <div className={`juya-root ${VARIANT_CLASS}`} data-juya-variant={variantId}>
      <Scene dust nebula stars />
      <div className="juya-issue" onClick={lightboxEnabled ? handleContentClick : undefined}>
        <header className="juya-masthead">
          <h1>{issue.heading || article.title}</h1>
        </header>
        {issue.overview && <OverviewItems overview={issue.overview} onOpenLink={onOpenLink} />}
        {issue.sections.map((section) => (
          <section className="juya-section" key={section.heading}>
            <h2>{section.heading}</h2>
            {section.entries.map((entry, i) => (
              <NocturneEntrySplit
                key={i}
                entry={entry}
                onOpenLink={onOpenLink}
                wrapLinks={lightboxEnabled}
              />
            ))}
          </section>
        ))}
      </div>
      {zoomed && <NocturneLightbox image={zoomed} onClose={() => setZoomed(null)} />}
    </div>
  )
}

function FeedList({ articles, variantId, layout }: JuyaFeedProps): JSX.Element {
  const { openArticle, sources, activeSourceId } = useAppStore()
  const activeSource = sources.find((source) => source.id === activeSourceId)
  return (
    <FeedShell
      articles={articles}
      variantId={variantId}
      variantClass={VARIANT_CLASS}
      layout={layout}
      scene={
        /* 订阅页夜空（2026-10-31）：与阅读页同一套 Scene（dust + nebula + stars），
           挂在头版之前、卡片列表之下；卡片半透明后星点从卡面透出。
           头版（#74）：亮暗两变体都挂载（#67 明确解除亮侧冻结，范围仅限头版）；
           期号日期留在卡片上，头版只承载源身份。 */
        <>
          <Scene dust nebula stars />
          <NocturneFeedMasthead
            sourceName={activeSource?.name ?? ''}
            sourceUrl={activeSource?.url ?? ''}
          />
        </>
      }
      renderItem={(a, _i, mode, gates, delay) => (
        <DefaultFeedItem a={a} mode={mode} gates={gates} delay={delay} onOpen={() => void openArticle(a)} />
      )}
    />
  )
}

export const nocturneTemplate: JuyaTemplate = { IssueView, FeedList }
