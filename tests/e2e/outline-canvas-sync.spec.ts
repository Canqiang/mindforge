import { expect, test, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.spike-canvas')).toBeVisible();
});

test('outline edits sync to the matching canvas node', async ({ page }) => {
  await editor(page, 'outline', 'node-1').fill('Outline edited from E2E');

  await expect(editor(page, 'canvas', 'node-1')).toContainText('Outline edited from E2E');
});

test('canvas edits sync to the matching outline node', async ({ page }) => {
  await editor(page, 'canvas', 'node-2').fill('Canvas edited from E2E');

  await expect(editor(page, 'outline', 'node-2')).toContainText('Canvas edited from E2E');
});

test('canvas selection mirrors to the outline editor for the same node', async ({ page }) => {
  await editor(page, 'canvas', 'node-3').click();
  await page.keyboard.press('ArrowRight');

  await expect(page.locator('.bridge-status')).toContainText('canvas -> node-3');
  await expect(page.locator('[data-node-id="node-3"][data-editor-surface="outline"]')).toHaveAttribute('data-mirrored', 'true');
});

function editor(page: Page, surface: 'outline' | 'canvas', nodeId: string) {
  return page.locator(`[data-node-id="${nodeId}"][data-editor-surface="${surface}"] .ProseMirror`);
}
