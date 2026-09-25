// Export the editable Layered Branches master and theme-aware toolbar mark.
import { chromium } from '@playwright/test';
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
const destination = 'media/icons';
await mkdir(destination, { recursive: true });
const master = await readFile('media/icon.svg', 'utf8');
const mono = await readFile('media/dirtree.svg', 'utf8');
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  for (const size of [16, 24, 32, 48, 64, 128, 256, 512, 1024]) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(
      `<style>html,body{margin:0;background:transparent}svg{width:100vw;height:100vh}</style>${master}`,
    );
    await page.screenshot({ path: `${destination}/dirtree-${size}.png`, omitBackground: true });
  }
  await copyFile(`${destination}/dirtree-256.png`, 'media/icon.png');
  for (const [theme, color] of [
    ['light', '#424242'],
    ['dark', '#c5c5c5'],
    ['high-contrast', '#ffffff'],
  ]) {
    await writeFile(`${destination}/dirtree-${theme}.svg`, mono.replaceAll('#c5c5c5', color));
  }
  await page.setViewportSize({ width: 1000, height: 480 });
  const panels = [
    ['Light', '#ffffff', '#424242'],
    ['Dark', '#1f1f1f', '#c5c5c5'],
  ]
    .map(
      ([label, background, foreground]) =>
        `<section style="background:${background};color:${foreground}"><h2>${label}</h2><div class="hero">${master}</div><div class="sizes">${[16, 24, 32, 48, 64].map((size) => `<div>${master.replace('width="256" height="256"', `width="${size}" height="${size}"`)}<small>${size}px</small></div>`).join('')}<div>${mono.replace('<svg ', '<svg width="24" height="24" ').replaceAll('#c5c5c5', foreground)}<small>Activity Bar</small></div></div></section>`,
    )
    .join('');
  await page.setContent(
    `<style>body{margin:0;display:flex;font:14px system-ui}section{box-sizing:border-box;width:500px;height:480px;padding:28px}h2{margin:0;font-size:18px}.hero{height:280px;display:grid;place-items:center}.sizes{display:flex;align-items:center;justify-content:space-between;gap:16px}.sizes div{text-align:center}small{display:block;margin-top:12px;font-size:11px}</style>${panels}`,
  );
  await page.screenshot({ path: `${destination}/preview.png` });
} finally {
  await browser.close();
}
