const sharp = require('sharp');
const pngToIco = require('png-to-ico').default;
const fs = require('fs');

// mdi:rss (filled) from Iconify, recolored: rounded-square bg #d97757 (app default theme accent),
// white RSS glyph. viewBox 24x24, rendered at 512 source for crisp downscaling.
const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="512" height="512"><rect width="24" height="24" rx="5" fill="#d97757"/><path fill="#ffffff" d="M6.18 15.64a2.18 2.18 0 0 1 2.18 2.18C8.36 19 7.38 20 6.18 20C5 20 4 19 4 17.82a2.18 2.18 0 0 1 2.18-2.18M4 4.44A15.56 15.56 0 0 1 19.56 20h-2.83A12.73 12.73 0 0 0 4 7.27zm0 5.66a9.9 9.9 0 0 1 9.9 9.9h-2.83A7.07 7.07 0 0 0 4 12.93z"/></svg>`;

(async () => {
  fs.mkdirSync('resources', { recursive: true });
  const svgBuf = Buffer.from(SVG);

  // ICO: multi-size PNGs (largest first), png-to-ico preserves order
  const icoSizes = [256, 128, 64, 48, 32, 16];
  const pngBufs = [];
  for (const s of icoSizes) {
    const b = await sharp(svgBuf).resize(s, s, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
    pngBufs.push(b);
  }
  const ico = await pngToIco(pngBufs);
  fs.writeFileSync('resources/icon.ico', ico);
  console.log('resources/icon.ico:', ico.length, 'bytes');

  // 512x512 PNG for runtime BrowserWindow icon
  const png512 = await sharp(svgBuf).resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  fs.writeFileSync('resources/icon.png', png512);
  console.log('resources/icon.png:', png512.length, 'bytes');

  // 256 preview for quick visual check
  fs.writeFileSync('resources/_icon_preview_256.png', pngBufs[0]);
  console.log('DONE');
})().catch(e => { console.error('ERR', e); process.exit(1); });
