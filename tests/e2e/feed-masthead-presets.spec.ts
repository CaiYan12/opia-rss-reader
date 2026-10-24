import { test, expect, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { makeStubScript } from './helpers'
import { activeTab } from './setup'
import { DEFAULT_SOURCE } from '../../src/shared/types'

/** 跨风格预设收口（评审修正）：头版经 scene 槽位在 compact/magazine 预设下同样成立。
 *  newsprint90s 的三预设专项在自身 spec；此处覆盖 folio/y2k/pop/synthwave/nocturne。
 *  亮侧即可覆盖预设与版心交互（亮暗几何由各风格 spec 的宽窄样本守护）。 */

const MASTHEAD_CLASS: Record<string, string> = {
  folio: 'jyfolio-feed-masthead',
  y2k: 'jyy2k-feed-masthead',
  pop: 'jypop-feed-masthead',
  synthwave: 'jysynth-feed-masthead',
  nocturne: 'jynoct-feed-masthead'
}

async function loadFeed(page: Page, style: string, preset: 'compact' | 'magazine'): Promise<void> {
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
  await page.addInitScript(
    `${makeStubScript('wabi')}
     window.__stubData.settings.juyaLightStyleId = ${JSON.stringify(style)};
     window.__stubData.settings.juyaDarkStyleId = ${JSON.stringify(style)};
     window.__stubData.settings.themeMode = 'light';
     window.__stubData.settings.layout = {
       ...window.__stubData.settings.layout,
       preset: ${JSON.stringify(preset)}
     };`
  )
  await page.goto('/')
  await page.getByRole('banner').getByTitle('设置').waitFor({ state: 'visible' })
}

for (const [style, mastheadClass] of Object.entries(MASTHEAD_CLASS)) {
  for (const preset of ['compact', 'magazine'] as const) {
    test(`${style} 订阅页头版在 ${preset} 预设下保留源身份且无横向溢出`, async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await loadFeed(page, style, preset)
      const root = activeTab(page).locator('.juya-root')
      const masthead = root.locator(`.${mastheadClass}`)
      await expect(masthead).toBeVisible()
      await expect(masthead.locator('h1')).toHaveText(DEFAULT_SOURCE.name)
      const overflow = await root.evaluate((element) => {
        const scroller = element.closest('.view-scroll') as HTMLElement
        return scroller.scrollWidth - scroller.clientWidth
      })
      expect(overflow, `${style} ${preset} 横向溢出`).toBeLessThanOrEqual(0)
    })
  }
}
