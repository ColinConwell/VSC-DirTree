import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Copy Tree', exact: true })).toBeEnabled();
});
test('add, rename, cancel, undo and restore a draft with keyboard focus intact', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.getByRole('treeitem', { name: 'src, folder', exact: true }).click();
  await page.keyboard.press('n');
  await page.getByRole('textbox', { name: 'Item name' }).fill('helpers.ts');
  await page.keyboard.press('Enter');
  const helper = page.getByRole('treeitem', { name: 'helpers.ts, file', exact: true });
  await expect(helper).toBeFocused();
  await page.keyboard.press('F2');
  await page.getByRole('textbox', { name: 'Item name' }).fill('wrong.ts');
  await page.keyboard.press('Escape');
  await expect(helper).toBeFocused();
  await page.keyboard.press('Delete');
  await expect(helper).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(helper).toBeVisible();
  await page.reload();
  await expect(helper).toBeVisible();
  await page.getByRole('button', { name: 'Text Preview', exact: false }).click();
  await expect(page.getByLabel('Text preview', { exact: true })).toContainText(
    '│   └── helpers.ts',
  );
  expect(errors).toEqual([]);
});
test('copy commits the active input and supports Markdown', async ({ page }) => {
  await page.getByRole('button', { name: 'Add file (N)', exact: true }).click();
  await page.getByRole('textbox', { name: 'Item name' }).fill('notes.md');
  await page.getByRole('button', { name: 'Copy Tree', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Copied', exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as any).__lastCopy.tree.children.at(-1).name)).toBe(
    'notes.md',
  );
  await page.getByRole('button', { name: 'Copy options' }).click();
  await page.getByRole('menuitem', { name: 'Copy as Markdown' }).click();
  expect(await page.evaluate(() => (window as any).__lastCopy.markdown)).toBe(true);
});
test('invalid names remain editable, and Escape on a new item removes it', async ({ page }) => {
  await page.getByRole('button', { name: 'Add file (N)', exact: true }).click();
  await page.getByRole('textbox').fill('README.md');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('alert')).toContainText('already used');
  await expect(page.getByRole('textbox')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('treeitem')).toHaveCount(4);
});
test('keyboard reorder, indent, outdent and subtree undo', async ({ page }) => {
  const readme = page.getByRole('treeitem', { name: 'README.md, file', exact: true });
  await readme.click();
  await page.keyboard.press('Alt+ArrowRight');
  await expect(readme).toHaveAttribute('aria-level', '3');
  await page.keyboard.press('Alt+ArrowLeft');
  await expect(readme).toHaveAttribute('aria-level', '2');
  await page.keyboard.press('Alt+ArrowUp');
  expect(await page.getByRole('treeitem').allTextContents()).toEqual(
    expect.arrayContaining([expect.stringContaining('README.md')]),
  );
  await page.getByRole('treeitem', { name: 'src, folder', exact: true }).click();
  await page.keyboard.press('Delete');
  await expect(page.getByRole('treeitem', { name: 'index.ts, file', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByRole('treeitem', { name: 'index.ts, file', exact: true })).toBeVisible();
});
test('dragging into folders and copying collapsed content', async ({ page }) => {
  const readme = page.getByRole('treeitem', { name: 'README.md, file', exact: true });
  await readme.dragTo(page.getByRole('treeitem', { name: 'src, folder', exact: true }));
  await expect(readme).toHaveAttribute('aria-level', '3');
  await page.getByRole('button', { name: 'Collapse src', exact: true }).click();
  await expect(readme).toHaveCount(0);
  await page.getByRole('button', { name: 'Text Preview', exact: false }).click();
  await expect(page.getByLabel('Text preview', { exact: true })).toContainText('README.md');
});
test('comments, popup keyboard navigation and narrow layout', async ({ page }) => {
  await page.setViewportSize({ width: 240, height: 560 });
  await page.getByRole('treeitem', { name: 'README.md, file', exact: true }).click();
  await page.keyboard.press('Shift+F10');
  await page.getByRole('menuitem', { name: 'Add Comment' }).click();
  await page.getByRole('textbox', { name: 'Item comment' }).fill('Project documentation');
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Text Preview', exact: false }).click();
  await expect(page.getByLabel('Text preview', { exact: true })).toContainText(
    '# Project documentation',
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Keyboard shortcuts' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
