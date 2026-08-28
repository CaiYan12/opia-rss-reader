import { test, expect, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { makeStubScript, type Scenario } from './helpers'

/** 加载渲染产物页面（去掉 CSP meta 以免拦截测试注入），并注入 window.opia 内存桩。 */
export async function loadApp(page: Page, scenario: Scenario): Promise<void> {
  const html = readFileSync(join(__dirname, '../../out/renderer/index.html'), 'utf-8').replace(
    /<meta[\s\S]*?Content-Security-Policy[\s\S]*?>/,
    ''
  )
  await page.route('**/*', (route) => {
    if (route.request().resourceType() === 'document') {
      void route.fulfill({ body: html, contentType: 'text/html; charset=utf-8' })
    } else {
      void route.continue()
    }
  })
  await page.addInitScript(makeStubScript(scenario))
  await page.goto('/')
  // App ready：标题栏「设置」按钮出现即初始化完成
  await page.getByTitle('设置').waitFor({ state: 'visible' })
}

export async function openSettings(page: Page): Promise<void> {
  await page.getByTitle('设置').click()
  await page.getByText('橘鸦定制阅读风格').waitFor({ state: 'visible' })
}

/** 活动标签内容容器（keep-alive：inactive 标签带 hidden 类仍留在 DOM，
 *  断言必须限定活动容器，否则同一页面存在多个 .juya-root）。 */
export function activeTab(page: Page) {
  return page.locator('div.min-h-0.w-full').first()
}

/** 点击主页中第一篇文章：优先风格化期号卡片（.juya-feed-item），
 *  否则通用 ArticleCard（<article>）。两者都会打开阅读标签。 */
export async function openFirstArticle(page: Page): Promise<void> {
  const styled = page.locator('.juya-feed-item').first()
  const generic = page.locator('main article').first()
  await Promise.race([
    styled.waitFor({ state: 'visible', timeout: 5000 }),
    generic.waitFor({ state: 'visible', timeout: 5000 })
  ]).catch(() => {})
  if (await styled.isVisible().catch(() => false)) {
    await styled.click()
  } else {
    await generic.click()
  }
}
