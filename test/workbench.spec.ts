import { test, expect, type Page, type Frame } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
async function sidebar(page: Page): Promise<Frame> {
  let result: Frame | undefined;
  await expect
    .poll(
      async () => {
        for (const frame of page.frames()) {
          if (await frame.getByRole('main', { name: 'DirTree Builder' }).count()) result = frame;
        }
        return !!result;
      },
      { timeout: 20000 },
    )
    .toBe(true);
  await expect(result!.getByRole('button', { name: 'Copy Tree', exact: true })).toBeEnabled();
  return result!;
}
async function command(page: Page, name: string) {
  await page.keyboard.press('F1');
  const input = page.locator('.quick-input-widget input');
  await input.fill('>' + name);
  await page
    .locator('.quick-input-list .monaco-list-row')
    .filter({ hasText: name })
    .first()
    .click();
}
async function theme(page: Page, name: string) {
  await command(page, 'Preferences: Color Theme');
  const input = page.locator('.quick-input-widget input');
  await expect(input).toBeVisible();
  await input.fill(name);
  await page
    .locator('.quick-input-list .monaco-list-row')
    .filter({ hasText: name })
    .first()
    .click();
  if (await input.isVisible()) await input.press('Enter');
  await expect(input).toBeHidden();
}
async function screenshot(page: Page, name: string) {
  const dir = process.env.DIRTREE_SCREENSHOTS_DIR;
  if (dir) {
    await mkdir(dir, { recursive: true });
    await page.screenshot({ path: join(dir, name + '.png') });
  }
}
test('real VS Code sidebar edits, clipboard, restoration and theme integration', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (
      message.type() === 'error' &&
      /Content Security Policy|Refused to|DirTree|webview\.js/.test(message.text())
    )
      errors.push(message.text());
  });
  await page.goto('/');
  await page.getByRole('tab', { name: 'DirTree', exact: true }).click();
  let view = await sidebar(page);
  await view.getByRole('treeitem', { name: 'src, folder', exact: true }).click();
  await page.keyboard.press('n');
  await view.getByRole('textbox', { name: 'Item name' }).fill('helpers.ts');
  await page.keyboard.press('Enter');
  await expect(view.getByRole('treeitem', { name: 'helpers.ts, file', exact: true })).toBeFocused();
  await view.getByRole('button', { name: 'Copy Tree', exact: true }).click();
  await expect(view.getByRole('button', { name: 'Copied', exact: true })).toBeVisible();
  const plain = 'project/\n├── src/\n│   ├── index.ts\n│   └── helpers.ts\n└── README.md';
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(plain);
  await view.getByRole('button', { name: 'Copy options' }).click();
  await view.getByRole('menuitem', { name: 'Copy as Markdown' }).click();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe('```text\n' + plain + '\n```\n');
  await view.getByRole('button', { name: 'Text Preview', exact: false }).click();
  await expect(view.getByLabel('Text preview', { exact: true })).toHaveText(plain);
  await theme(page, 'Light Modern');
  await expect(view.locator('body')).toHaveClass(/vscode-light/);
  await screenshot(page, 'dirtree-light');
  await theme(page, 'Dark Modern');
  await expect(view.locator('body')).toHaveClass(/vscode-dark/);
  await screenshot(page, 'dirtree-dark');
  await theme(page, 'Dark High Contrast');
  await expect(view.locator('body')).toHaveClass(/vscode-high-contrast/);
  await screenshot(page, 'dirtree-high-contrast');
  await theme(page, 'Dark Modern');
  await page.getByRole('tab', { name: 'Explorer', exact: false }).click();
  await page.getByRole('tab', { name: 'DirTree', exact: true }).click();
  view = await sidebar(page);
  await expect(view.getByRole('treeitem', { name: 'helpers.ts, file', exact: true })).toBeVisible();
  await page.reload();
  // The workbench restores the selected Activity Bar view.
  view = await sidebar(page);
  await expect(view.getByRole('treeitem', { name: 'helpers.ts, file', exact: true })).toBeVisible();
  await expect(view.getByLabel('Text preview', { exact: true })).toHaveText(plain);
  expect(errors).toEqual([]);
});
