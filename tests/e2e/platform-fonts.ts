import type { Page } from '@playwright/test'

export type PlatformFont = {
  familyName: string
  postScriptName: string
  isCustomFont: boolean
  glyphCount: number
}

/** Read Chromium's platform-font glyph report for one rendered DOM selector. */
export async function getPlatformFontsForSelector(page: Page, selector: string): Promise<PlatformFont[]> {
  const session = await page.context().newCDPSession(page)
  try {
    await session.send('DOM.enable')
    await session.send('CSS.enable')
    const { root } = await session.send('DOM.getDocument', { depth: -1 })
    const { nodeId } = await session.send('DOM.querySelector', { nodeId: root.nodeId, selector })
    if (!nodeId) throw new Error(`No node found for rendered font probe: ${selector}`)
    const { fonts } = await session.send('CSS.getPlatformFontsForNode', { nodeId })
    return fonts.map((font: PlatformFont) => ({
      familyName: font.familyName,
      postScriptName: font.postScriptName,
      isCustomFont: font.isCustomFont,
      glyphCount: font.glyphCount
    }))
  } finally {
    await session.detach()
  }
}
