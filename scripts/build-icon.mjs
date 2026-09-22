// Render the editable product icon to the PNG required by the marketplaces.
import { chromium } from '@playwright/test';
import { readFile } from 'node:fs/promises';
const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: 256, height: 256 },
    deviceScaleFactor: 1,
  });
  await page.setContent(
    '<style>html,body{margin:0;background:transparent}</style>' +
      (await readFile('media/icon.svg', 'utf8')),
  );
  await page.screenshot({ path: 'media/icon.png', omitBackground: true });
} finally {
  await browser.close();
}
