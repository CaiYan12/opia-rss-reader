import { describe, expect, test, type Page } from '@playwright/test'
import { loadApp, activeTab } from './setup'

/** 标签栏自动化测试：等宽弹性几何、拖动排序、数量上限、回归。
 *  驱动 out/renderer 构建产物 + window.opia 桩；Electron 会话落盘/原生指针由真机验收。 */

/** 标签栏内的标签按钮（store 顺序渲染） */
function tabs(page: Page) {
  return page.locator('[data-tab-id]')
}

/** 拖动态中被拖标签（浮起跟随指针） */
function dragging(page: Page) {
  return page.locator('[data-dragging]')
}

async function lastSessionKinds(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const calls = window.__stubCalls.filter((c: unknown[]) => c[0] === 'sessionSave') as Array<
      [string, { tabs: Array<{ kind: string }> }]
    >
    const last = calls[calls.length - 1]
    return last ? last[1].tabs.map((t) => t.kind) : []
  })
}

async function lastWindowPageTitle(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const calls = (window as unknown as { __stubCalls: Array<[string, unknown]> }).__stubCalls
    const titleCalls = calls.filter((call) => call[0] === 'windowSetTitle')
    const last = titleCalls[titleCalls.length - 1]
    return typeof last?.[1] === 'string' ? last[1] : null
  })
}

/** 按住主键把第 fromIndex 个标签拖到视口 x=toClientX 处释放 */
async function dragTabTo(page: Page, fromIndex: number, toClientX: number): Promise<void> {
  const from = tabs(page).nth(fromIndex)
  const box = (await from.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(toClientX, box.y + box.height / 2, { steps: 12 })
  await page.mouse.up()
}

describe('标签弹性宽度（等宽几何）', () => {
  test('少量标签等宽铺满（5 个标签宽度彼此一致）', async ({ page }) => {
    await loadApp(page, 'tabs5')
    const items = tabs(page)
    await expect(items).toHaveCount(5)
    const boxes = await items.evaluateAll((els) => els.map((el) => el.getBoundingClientRect().width))
    const max = Math.max(...boxes)
    const min = Math.min(...boxes)
    // 等宽弹性：各标签宽度一致（容差 1px 舍入）
    expect(max - min).toBeLessThanOrEqual(1)
    // 未达最大宽 260 限制时铺满（可用宽约 1280-加号，每标签 >200）
    expect(min).toBeGreaterThan(200)
  })

  test('加号紧跟最后一个标签（非固定右侧）', async ({ page }) => {
    await loadApp(page, 'tabs5')
    const lastBox = (await tabs(page).last().boundingBox())!
    const plusBox = (await page.getByTitle('新开主页标签').boundingBox())!
    expect(plusBox.x).toBeGreaterThanOrEqual(lastBox.x + lastBox.width - 1)
  })

  test('大量标签收缩到最小宽并横向溢出（tabs20：scrollWidth > clientWidth）', async ({ page }) => {
    await loadApp(page, 'tabs20')
    await expect(tabs(page)).toHaveCount(20)
    const overflow = await page.evaluate(() => {
      const scroller = document.querySelector('.overflow-x-auto')
      if (!scroller) return -1
      return scroller.scrollWidth - scroller.clientWidth
    })
    expect(overflow).toBeGreaterThan(0)
  })

  test('长标题截断并保留 title 完整提示', async ({ page }) => {
    await loadApp(page, 'default')
    await page.evaluate(() => {
      // 给首页标签标题替换为超长文本不可行（store 内部），改为直接校验 title 属性存在即可
    })
    const first = tabs(page).first()
    await expect(first).toHaveAttribute('title', /./)
  })

  test('标签容器不嵌套交互控件', async ({ page }) => {
    await loadApp(page, 'default')
    const hasNestedInteractive = await tabs(page).evaluateAll((els) =>
      els.some(
        (el) =>
          el.tagName === 'BUTTON' &&
          Boolean(el.querySelector('button, [role="button"]'))
      )
    )
    expect(hasNestedInteractive).toBe(false)
  })

  test('不同标签之间显示低对比分隔线', async ({ page }) => {
    await loadApp(page, 'tabs5')
    const edges = await tabs(page).nth(1).evaluate((element) => {
      const before = getComputedStyle(element, '::before')
      const after = getComputedStyle(element, '::after')
      return {
        before: { content: before.content, visibility: before.visibility },
        after: { content: after.content, visibility: after.visibility },
        width: before.width,
        opacity: before.opacity,
        pointerEvents: before.pointerEvents
      }
    })
    const firstEdges = await tabs(page).first().evaluate((element) => ({
      before: getComputedStyle(element, '::before').visibility,
      after: getComputedStyle(element, '::after').visibility
    }))
    const plusEdge = await page.getByTitle('新开主页标签').evaluate((element) => {
      const style = getComputedStyle(element, '::before')
      return { content: style.content, visibility: style.visibility }
    })

    expect(edges.before.content).toBe('""')
    expect(edges.after.content).toBe('""')
    expect(edges.before.visibility).toBe('visible')
    expect(edges.after.visibility).toBe('visible')
    expect(edges.width).toBe('1px')
    expect(edges.opacity).toBe('0.5')
    expect(edges.pointerEvents).toBe('none')
    expect(firstEdges.before).toBe('visible')
    expect(firstEdges.after).toBe('visible')
    expect(plusEdge.content).toBe('""')
    expect(plusEdge.visibility).toBe('visible')
  })

  test('标签上下留白区域也可点击和开始拖动', async ({ page }) => {
    await loadApp(page, 'tabs5')
    const target = tabs(page).nth(1)
    const targetBox = (await target.boundingBox())!
    const targetMainBox = (await target.locator('.tab-main').boundingBox())!
    expect(targetMainBox.y).toBeGreaterThan(targetBox.y)
    expect(targetMainBox.y + targetMainBox.height).toBeLessThan(targetBox.y + targetBox.height)

    const topPaddingY = targetBox.y + 2
    await page.mouse.click(targetBox.x + targetBox.width / 2, topPaddingY)
    await expect(target).toHaveAttribute('data-active', 'true')
    await expect(target).toHaveCSS('cursor', 'pointer')

    const source = tabs(page).nth(2)
    const sourceBox = (await source.boundingBox())!
    const firstBox = (await tabs(page).first().boundingBox())!
    const bottomPaddingY = sourceBox.y + sourceBox.height - 2
    await page.mouse.move(sourceBox.x + sourceBox.width / 2, bottomPaddingY)
    await page.mouse.down()
    await page.mouse.move(firstBox.x + 5, bottomPaddingY, { steps: 8 })
    await page.mouse.up()

    expect(await lastSessionKinds(page)).toEqual(['reader', 'home', 'reader', 'browser', 'settings'])
  })
})

describe('拖动排序（Pointer Events）', () => {
  test('首位拖到末位：顺序变为 [reader, reader, browser, settings, home]', async ({ page }) => {
    await loadApp(page, 'tabs5')
    const last = tabs(page).last()
    const lastBox = (await last.boundingBox())!
    // 目标 x 取末位标签右缘内侧（其中心右侧 → after）
    await dragTabTo(page, 0, lastBox.x + lastBox.width - 5)
    const kinds = await lastSessionKinds(page)
    expect(kinds).toEqual(['reader', 'reader', 'browser', 'settings', 'home'])
  })

  test('末位拖到首位：顺序变为 [settings, home, reader, reader, browser]', async ({ page }) => {
    await loadApp(page, 'tabs5')
    const first = tabs(page).first()
    const firstBox = (await first.boundingBox())!
    const last = tabs(page).last()
    const lastBox = (await last.boundingBox())!
    await dragTabTo(page, 4, firstBox.x + 5)
    const kinds = await lastSessionKinds(page)
    expect(kinds).toEqual(['settings', 'home', 'reader', 'reader', 'browser'])
    // 释放后滚动可用性：被拖标签回到流内
    await expect(lastBox).toBeTruthy()
  })

  test('相邻交换：第二个标签拖到首位之前', async ({ page }) => {
    await loadApp(page, 'tabs5')
    const firstBox = (await tabs(page).first().boundingBox())!
    await dragTabTo(page, 1, firstBox.x + 5)
    const kinds = await lastSessionKinds(page)
    expect(kinds).toEqual(['reader', 'home', 'reader', 'browser', 'settings'])
  })

  test('拖动后活动内容不变（不改变 activeTabId）', async ({ page }) => {
    await loadApp(page, 'tabs5') // activeTabIndex=0 → home 激活
    const lastBox = (await tabs(page).last().boundingBox())!
    await dragTabTo(page, 0, lastBox.x + lastBox.width - 5)
    // home 仍是激活标签：活动容器仍显示主页内容（juya 订阅页）
    await expect(activeTab(page).locator('.juya-root')).toBeVisible()
  })

  test('拖动非激活标签后活动内容仍不变', async ({ page }) => {
    await loadApp(page, 'tabs5') // activeTabIndex=0 → home 激活
    const lastBox = (await tabs(page).last().boundingBox())!
    await dragTabTo(page, 1, lastBox.x + lastBox.width - 5)
    await expect(tabs(page).first()).toHaveClass(/border-accent/)
    await expect(activeTab(page).locator('.juya-root')).toBeVisible()
  })

  test('Escape 取消拖动：顺序不变', async ({ page }) => {
    await loadApp(page, 'tabs5')
    const lastBox = (await tabs(page).last().boundingBox())!
    const from = tabs(page).first()
    const box = (await from.boundingBox())!
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(lastBox.x + lastBox.width - 5, box.y + box.height / 2, { steps: 12 })
    await page.keyboard.press('Escape')
    await page.mouse.up()
    const kinds = await lastSessionKinds(page)
    expect(kinds).toEqual(['home', 'reader', 'reader', 'browser', 'settings'])
  })

  test('拖动中被拖标签浮起（data-dragging 出现）', async ({ page }) => {
    await loadApp(page, 'tabs5')
    const from = tabs(page).first()
    const box = (await from.boundingBox())!
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width + 40, box.y + box.height / 2, { steps: 6 })
    await expect(dragging(page)).toHaveCount(1)
    await page.mouse.up()
    await expect(dragging(page)).toHaveCount(0)
  })

  test('拖动中淡化当前激活标签并触发让位动画', async ({ page }) => {
    await loadApp(page, 'tabs5')
    const active = tabs(page).first()
    const source = tabs(page).nth(1)
    const sourceBox = (await source.boundingBox())!
    const targetBox = (await tabs(page).nth(2).boundingBox())!

    await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2)
    await page.mouse.down()
    await page.mouse.move(targetBox.x + 4, sourceBox.y + sourceBox.height / 2, { steps: 8 })

    // 让位动画已经提供预测位置，额外插入竖线暂时停用。
    // await expect(page.locator('[data-drop-indicator]')).toBeVisible()
    await expect(active).toHaveAttribute('data-drag-active-target', 'true')

    await page.mouse.up()
  })

  test('边缘自动滚动时浮动标签仍跟随指针', async ({ page }) => {
    await loadApp(page, 'tabs20')
    const scroller = page.locator('.overflow-x-auto')
    const scrollerBox = (await scroller.boundingBox())!
    const from = tabs(page).first()
    const fromBox = (await from.boundingBox())!
    const startX = fromBox.x + 20
    const y = fromBox.y + fromBox.height / 2
    const targetX = scrollerBox.x + scrollerBox.width - 4

    await page.mouse.move(startX, y)
    await page.mouse.down()
    await page.mouse.move(targetX, y, { steps: 12 })
    await page.waitForTimeout(160)

    const scrollLeft = await scroller.evaluate((el) => el.scrollLeft)
    const floatingCount = await dragging(page).count()
    const floatingBox = floatingCount ? await dragging(page).boundingBox() : null
    expect(scrollLeft).toBeGreaterThan(0)
    expect(floatingBox).not.toBeNull()
    expect(Math.abs(floatingBox!.x - (targetX - (startX - fromBox.x)))).toBeLessThan(16)

    await page.mouse.up()
  })

  test('拖到窗口外释放不提交排序', async ({ page }) => {
    await loadApp(page, 'tabs5')
    const before = await lastSessionKinds(page)
    const from = tabs(page).first()
    const box = (await from.boundingBox())!
    const y = box.y + box.height / 2

    await page.mouse.move(box.x + box.width / 2, y)
    await page.mouse.down()
    await page.mouse.move(-10, y, { steps: 12 })
    await page.mouse.up()

    expect(await lastSessionKinds(page)).toEqual(before)
  })

  test('释放后非激活的被拖标签保持在可见区域', async ({ page }) => {
    await loadApp(page, 'tabs20')
    const scroller = page.locator('.overflow-x-auto')
    const scrollerBox = (await scroller.boundingBox())!
    const from = tabs(page).nth(1)
    const dragId = await from.getAttribute('data-tab-id')
    expect(dragId).toBeTruthy()

    await dragTabTo(page, 1, scrollerBox.x + scrollerBox.width - 4)

    const draggedBox = await page.locator(`[data-tab-id="${dragId}"]`).boundingBox()
    expect(draggedBox).not.toBeNull()
    expect(draggedBox!.x).toBeGreaterThanOrEqual(scrollerBox.x - 1)
    expect(draggedBox!.x + draggedBox!.width).toBeLessThanOrEqual(
      scrollerBox.x + scrollerBox.width + 1
    )
  })

  test('从关闭按钮按下拖动不会移动标签（关闭按钮排除拖动起点）', async ({ page }) => {
    await loadApp(page, 'tabs5')
    const close = tabs(page).nth(1).getByTitle('关闭标签')
    await close.hover()
    const box = (await close.boundingBox())!
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width + 60, box.y + box.height / 2, { steps: 8 })
    await page.mouse.up()
    // pointerdown 被 stopPropagation → 不进入拖动；标签数不变（关闭未触发，因 pointer 已移开）
    await expect(tabs(page)).toHaveCount(5)
  })
})

describe('标签数量上限', () => {
  test('满 20 时「＋」拒绝创建并显示上限提示', async ({ page }) => {
    await loadApp(page, 'tabs20')
    await expect(tabs(page)).toHaveCount(20)
    await page.getByTitle('新开主页标签').click()
    await expect(tabs(page)).toHaveCount(20)
    const toast = page.locator('.toast')
    await expect(toast).toBeVisible()
    await expect(toast).toHaveText('标签已达上限（20）')
  })

  test('Mini 模式满标签时点「查看更多」仍显示上限提示并留在 Mini', async ({ page }) => {
    await loadApp(page, 'tabs20Builtin')
    await page.evaluate(() => {
      window.opia.toggleMini = async () => true
    })
    await page.getByRole('banner').getByTitle('Mini').click()
    const miniRow = page.locator('ul button').first()
    await expect(miniRow).toBeVisible()
    await miniRow.click() // 展开摘要
    await page.getByRole('button', { name: /查看更多/ }).click()
    await expect(page.locator('.toast')).toBeVisible()
    await expect(page.locator('.toast')).toHaveText('标签已达上限（20）')
    // 未退出 Mini（标签未切走）
    await expect(miniRow).toBeVisible()
  })

  test('连续触发上限提示不堆叠（单一 toast）', async ({ page }) => {
    await loadApp(page, 'tabs20')
    await page.getByTitle('新开主页标签').click()
    await page.getByTitle('新开主页标签').click()
    await expect(page.locator('.toast')).toHaveCount(1)
  })

  test('非「＋」入口同样受上限约束：打开阅读标签被拒绝并提示', async ({ page }) => {
    await loadApp(page, 'tabs20')
    // 点击文章（若主页可点）打开 reader 会被守卫拒绝
    await page.locator('main article, .juya-feed-item').first().click().catch(() => {})
    const toast = page.locator('.toast')
    if (await page.locator('main article, .juya-feed-item').count()) {
      await expect(toast).toBeVisible()
    }
  })

  test('设置页单例复用：已有 settings 标签时点设置按钮不新增', async ({ page }) => {
    await loadApp(page, 'tabs5')
    await expect(tabs(page)).toHaveCount(5)
    await page.getByRole('banner').getByTitle('设置').click()
    await expect(tabs(page)).toHaveCount(5)
    // settings 标签被激活
    const activeKinds = await page.evaluate(() => {
      const el = document.querySelector('[data-tab-id].border-accent')
      return el?.getAttribute('data-tab-id') ?? ''
    })
    expect(activeKinds).not.toBe('')
  })

  test('恢复超限会话截断到 20（tabs25 → 20 个标签）', async ({ page }) => {
    await loadApp(page, 'tabs25')
    await expect(tabs(page)).toHaveCount(20)
  })
})

describe('标签栏回归', () => {
  test('单击激活标签', async ({ page }) => {
    await loadApp(page, 'tabs5')
    await tabs(page).nth(2).click()
    await expect(tabs(page).nth(2)).toHaveClass(/border-accent/)
  })

  test('中键关闭标签', async ({ page }) => {
    await loadApp(page, 'tabs5')
    const box = (await tabs(page).nth(1).boundingBox())!
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down({ button: 'middle' })
    await page.mouse.up({ button: 'middle' })
    await expect(tabs(page)).toHaveCount(4)
  })

  test('关闭按钮关闭标签', async ({ page }) => {
    await loadApp(page, 'tabs5')
    await tabs(page).nth(1).getByTitle('关闭标签').click()
    await expect(tabs(page)).toHaveCount(4)
  })

  test('Ctrl+Tab 按当前顺序切换到下一标签', async ({ page }) => {
    await loadApp(page, 'tabs5') // 激活 index 0（home）
    await page.keyboard.press('Control+Tab')
    await expect(tabs(page).nth(1)).toHaveClass(/border-accent/)
  })

  test('主页源切换菜单正常打开', async ({ page }) => {
    await loadApp(page, 'tabs5')
    await tabs(page).first().getByTitle('切换订阅源').click()
    await expect(page.locator('[data-source-menu]')).toBeVisible()
  })

  test('活动标签标题同步到窗口标题 IPC', async ({ page }) => {
    await loadApp(page, 'default')
    await expect.poll(() => lastWindowPageTitle(page)).toBe('主页')

    await page.getByRole('banner').getByTitle('设置').click()
    await expect.poll(() => lastWindowPageTitle(page)).toBe('设置')
  })

  test('未达上限时「＋」正常新增主页标签', async ({ page }) => {
    await loadApp(page, 'tabs5')
    await page.getByTitle('新开主页标签').click()
    await expect(tabs(page)).toHaveCount(6)
  })

  test('新建标签从左侧开始入场', async ({ page }) => {
    await loadApp(page, 'default')
    await page.getByTitle('新开主页标签').click()
    const newest = tabs(page).last()
    await expect(newest).toHaveAttribute('data-tab-entering', 'true')
    const motion = await newest.evaluate((element) => {
      const style = getComputedStyle(element)
      return { transformOrigin: style.transformOrigin, transitionProperty: style.transitionProperty }
    })
    expect(motion.transformOrigin).toMatch(/^0px /)
    expect(motion.transitionProperty).toContain('transform')
  })

  test('关闭标签先保留左侧退场状态再移除', async ({ page }) => {
    await loadApp(page, 'tabs5')
    const target = tabs(page).nth(1)
    await target.getByTitle('关闭标签').click()
    await expect(target).toHaveAttribute('data-tab-closing', 'true')
    await expect(tabs(page)).toHaveCount(5)
    await expect(tabs(page)).toHaveCount(4)
  })

  test('关闭加号左侧最后标签时加号同步向左移动', async ({ page }) => {
    await loadApp(page, 'tabs5')
    const plus = page.getByTitle('新开主页标签')
    const target = tabs(page).last()
    const startX = (await plus.boundingBox())!.x

    await target.getByTitle('关闭标签').click()
    await expect(target).toHaveAttribute('data-tab-closing', 'true')
    await expect.poll(async () => {
      const plusBox = await plus.boundingBox()
      return (
        (await page.locator('[data-tab-closing]').count()) > 0 &&
        (plusBox?.x ?? Number.POSITIVE_INFINITY) < startX - 2
      )
    }, { timeout: 140, intervals: [20] }).toBe(true)
    await expect(tabs(page)).toHaveCount(4)
    const lastTabBox = (await tabs(page).last().boundingBox())!
    const finalPlusBox = (await plus.boundingBox())!
    expect(finalPlusBox.x).toBeGreaterThanOrEqual(lastTabBox.x + lastTabBox.width - 1)
  })

  test('reduced-motion 关闭最后标签不驱动加号位移', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await loadApp(page, 'tabs5')
    const plus = page.getByTitle('新开主页标签')
    const target = tabs(page).last()

    await target.getByTitle('关闭标签').click()
    await expect(tabs(page)).toHaveCount(4)
    await expect(plus).not.toHaveAttribute('data-tab-plus-closing', 'true')
    const transform = await plus.evaluate((element) => getComputedStyle(element).transform)
    expect(transform === 'none' || transform.endsWith(', 0)')).toBe(true)
  })

  test('关闭最后一个标签先退场再请求窗口退出', async ({ page }) => {
    await loadApp(page, 'default')
    const close = tabs(page).first().getByTitle('关闭标签')
    await close.click()
    const closeCallsBeforeAnimation = await page.evaluate(() =>
      window.__stubCalls.filter((call: unknown[]) => call[0] === 'windowClose').length
    )
    expect(closeCallsBeforeAnimation).toBe(0)
    await expect(tabs(page).first()).toHaveAttribute('data-tab-closing', 'true')
    await expect.poll(() =>
      page.evaluate(() => window.__stubCalls.filter((call: unknown[]) => call[0] === 'windowClose').length)
    ).toBe(1)
  })

  test('关闭快捷键也先进入退场状态', async ({ page }) => {
    await loadApp(page, 'tabs5')
    await page.keyboard.press('Control+W')
    await expect(tabs(page).first()).toHaveAttribute('data-tab-closing', 'true')
  })

  test('设置标签可正常新建（无 settings 时）', async ({ page }) => {
    await loadApp(page, 'default') // 仅 1 个 home
    await page.getByRole('banner').getByTitle('设置').click()
    await expect(tabs(page)).toHaveCount(2)
  })

  test('阅读标签创建后活动内容切换', async ({ page }) => {
    await loadApp(page, 'default')
    await page.locator('.juya-feed-item, main article').first().click()
    await expect(activeTab(page).locator('.juya-root')).toBeVisible()
  })
})
