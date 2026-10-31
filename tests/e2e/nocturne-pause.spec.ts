import { test, expect, type Page, type Locator } from '@playwright/test'
import { loadApp, openFirstArticle, activeTab } from './setup'

/** 页面不可见时暂停 nocturne 动画（#22 / SPEC 批次 B6）。
 *
 *  无头环境只验证可验证的部分：**置 `document.documentElement` 上的状态标记**
 *  等价于页面不可见，断言 `document.getAnimations()` 中无 `running`、可暂停动画仍存在
 *  （防止用 `animation: none` 蒙混）、暂停期间计算样式冻结且与运行态等值（透明度/滤镜不跳）、
 *  清除标记后动画恢复运行。
 *
 *  **真实窗口**的最小化 / 隐藏 / 迷你模式切换不在本文件覆盖范围内 —— 由用户真机验收。 */

type StyleSnapshot = { opacity: string; filter: string }
type AnimationInfo = { name: string; state: string; pseudo: string | null; time: number }

type Measurement = {
  styles: {
    h1: StyleSnapshot
    before: StyleSnapshot
    after: StyleSnapshot
    dust: StyleSnapshot
    stars: StyleSnapshot
    starsAfter: StyleSnapshot
  }
  animations: AnimationInfo[]
  htmlHas: boolean
  rootHas: boolean
}

type Action = 'none' | 'hide' | 'show'

const HIDDEN = 'data-app-hidden'

async function openNocturneReader(page: Page): Promise<Locator> {
  await loadApp(page, 'nocturneSvg')
  await openFirstArticle(page)
  const root = activeTab(page).locator('.juya-root')
  await expect(root).toBeVisible()
  // 让 CSS 动画进入运行态（首帧可能尚未采样）
  await page.waitForTimeout(250)
  return root
}

/** 在页面内完成「置/清标记 + 立即采样」，避免跨 round-trip 的时间漂移。 */
function measure(root: Locator, action: Action): Promise<Measurement> {
  return root.evaluate((el, act) => {
    const read = (n: Element, pseudo?: string): StyleSnapshot => {
      const s = getComputedStyle(n, pseudo ?? null)
      return { opacity: s.opacity, filter: s.filter }
    }
    const masthead = el.querySelector('.juya-masthead')
    const h1 = el.querySelector('.juya-masthead h1')
    const dust = el.querySelector('.juya-scene-dust')
    const stars = el.querySelector('.juya-scene-stars')
    if (!masthead || !h1 || !dust || !stars) throw new Error('nocturne 刊头 / 场景结构缺失')

    if (act === 'hide') document.documentElement.setAttribute('data-app-hidden', '')
    if (act === 'show') document.documentElement.removeAttribute('data-app-hidden')

    const animations = document.getAnimations().map((a) => {
      const effect = a.effect as KeyframeEffect | null
      const name = (a as CSSAnimation).animationName ?? ''
      const time = a.currentTime
      return {
        name,
        state: a.playState,
        pseudo: effect?.pseudoElement ?? null,
        time: typeof time === 'number' ? time : Number(time ?? 0)
      }
    })
    return {
      styles: {
        h1: read(h1),
        before: read(masthead, '::before'),
        after: read(masthead, '::after'),
        dust: read(dust),
        stars: read(stars),
        starsAfter: read(stars, '::after')
      },
      animations,
      htmlHas: document.documentElement.hasAttribute('data-app-hidden'),
      rootHas: el.hasAttribute('data-app-hidden')
    }
  }, action)
}

/** 2026-10-31 星尘夜空：dust 改用 jy-noct-dust-drift，亮星两层 jy-noct-stars-a/b 也是持续动画。
 *  逐一列举本变体阅读页上应持续运行的动画（漏一个就说明暂停清单与 CSS 脱节）。 */
const CONTINUOUS = [
  'jy-noct-dust-drift',
  'jy-noct-stars-a',
  'jy-noct-stars-b',
  'jy-noct-glow',
  'jy-noct-aurora-near',
  'jy-noct-aurora-far'
]

/** 可见属性的「等值」判据：透明度直接比数值；滤镜串按数值序列逐项比（动画只动 alpha/半径）。
 *  tolerance 缺省 0.01 =「肉眼不可见」；冻结断言用 1e-4（暂停生效比采样晚约 1ms，见下）。 */
function expectStylesClose(
  actual: Record<string, StyleSnapshot>,
  expected: Record<string, StyleSnapshot>,
  tolerance = 0.01
): void {
  for (const key of Object.keys(expected)) {
    expect(
      Math.abs(Number.parseFloat(actual[key]!.opacity) - Number.parseFloat(expected[key]!.opacity)),
      `${key} 透明度应保持原值（容差 ${tolerance}）`
    ).toBeLessThan(tolerance)
    const actualNums = [...actual[key]!.filter.matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => Number(m[0]))
    const expectedNums = [...expected[key]!.filter.matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => Number(m[0]))
    expect(actualNums.length, `${key} 滤镜结构应保持`).toBe(expectedNums.length)
    actualNums.forEach((n, i) => {
      expect(
        Math.abs(n - expectedNums[i]!),
        `${key} 滤镜第 ${i} 项应保持原值（容差 ${tolerance}）`
      ).toBeLessThan(tolerance)
    })
  }
}

test('不可见标记暂停全部 nocturne 动画（含伪元素），可见属性不跳变', async ({ page }) => {
  const root = await openNocturneReader(page)
  // 打开阅读标签会触发标签栏的 color 过渡（CSSTransition，与本机制无关且无法用
  // animation-play-state 暂停）；等它们自然结束后再测，保证「置标记后无 running」是严格断言。
  await page.waitForFunction(
    () =>
      document
        .getAnimations()
        .every((a) => a.constructor.name !== 'CSSTransition' || a.playState !== 'running'),
    undefined,
    { timeout: 5000 }
  )

  const running = await measure(root, 'none')
  const runningAnims = running.animations.filter((a) => a.state === 'running')
  for (const name of CONTINUOUS) {
    expect(runningAnims.map((a) => a.name), `阅读页应有持续动画 ${name}`).toContain(name)
  }
  // 伪元素动画确实在 `getAnimations()` 结果里 —— 证明本 E2E 真覆盖了 ::before / ::after
  const pseudos = [...new Set(runningAnims.map((a) => a.pseudo))]
  expect(pseudos, '应覆盖 ::before 与 ::after 两条极光幕帘').toEqual(
    expect.arrayContaining(['::before', '::after'])
  )

  // 置标记：与「运行态」在同一任务内测量，暂停不得把动画退回静态档（会跳变）
  const hidden = await measure(root, 'hide')
  expect(hidden.htmlHas, '标记应挂在 documentElement').toBe(true)
  expect(hidden.rootHas, '标记不得挂内容根容器').toBe(false)
  expect(
    hidden.animations.filter((a) => a.state === 'running'),
    '置标记后不得有 running 动画'
  ).toEqual([])
  // 强烈反证：动画对象仍在且为 paused（若实现成 `animation: none`，它们会从 getAnimations 消失）
  expect(hidden.animations.filter((a) => a.state === 'paused').map((a) => a.name)).toEqual(
    expect.arrayContaining(CONTINUOUS)
  )
  expectStylesClose(hidden.styles, running.styles)

  // 冻结基线必须在暂停**落地**后取，不能拿「置标记瞬间」当基线（2026-10-21 全量并行偶发修正）。
  // 实测现象：同一测量里 playState 已是 paused，但 250ms 后 jy-dust-drift 的 currentTime 仍推进超阈值 ——
  // 推断是「暂停标记在 style flush 里生效、而动画时间停表要等后续帧提交」，主线程忙时这段延迟可超一帧。
  // 故先等两帧让暂停坐实，再取基线。这不是放宽断言：实现若根本不暂停，上面第 146 行的
  // 「不得有 running」会在落地前就转红，本段只把「停表→不推进」这个待测属性隔离出来。
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      )
  )
  const settled = await measure(root, 'none')
  expect(
    settled.animations.filter((a) => a.state === 'running'),
    '暂停落地后仍不得有 running 动画'
  ).toEqual([])

  // 冻结：暂停后 250ms 再测，可见属性必须不动（若仍在跑，250ms 会改变 ~0.004 透明度，
  // 比下面 1e-4 的容差大 40 倍）。容差不取 0：暂停与采样之间仍可能留下 1e-5 级尾差。
  await page.waitForTimeout(250)
  const frozen = await measure(root, 'none')
  expectStylesClose(frozen.styles, settled.styles, 1e-4)
  expect(frozen.animations.filter((a) => a.state === 'running'), '暂停期间不得自行恢复').toEqual([])
  for (const name of CONTINUOUS) {
    const before = settled.animations.find((a) => a.name === name)
    const after = frozen.animations.find((a) => a.name === name)
    expect(
      Math.abs(after!.time - before!.time),
      `${name} 的 currentTime 应冻结（已扣除暂停落地延迟；若仍在跑，250ms 会推进 250ms）`
    ).toBeLessThan(25)
  }

  // 清除标记：恢复运行，currentTime 继续推进
  await page.evaluate(() => document.documentElement.removeAttribute('data-app-hidden'))
  await page.waitForTimeout(150)
  const resumed = await measure(root, 'none')
  expect(resumed.htmlHas, '清除后标记应消失').toBe(false)
  const resumedAnims = resumed.animations.filter((a) => a.state === 'running')
  expect(
    resumedAnims.map((a) => a.name),
    '恢复可见后持续动画应全部继续运行'
  ).toEqual(expect.arrayContaining(CONTINUOUS))
  for (const name of CONTINUOUS) {
    const before = hidden.animations.find((a) => a.name === name)
    const after = resumed.animations.find((a) => a.name === name)
    expect(after!.time, `${name} 恢复后 currentTime 应继续推进`).toBeGreaterThan(before!.time)
  }
  expect(await root.getAttribute(HIDDEN), '内容根容器始终不带该标记').toBeNull()
})
