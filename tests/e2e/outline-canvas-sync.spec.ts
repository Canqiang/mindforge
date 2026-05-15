import { expect, test, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.spike-canvas')).toBeVisible();
});

test('outline edits sync to the matching canvas node', async ({ page }) => {
  await (await activateEditor(page, 'outline', 'node-1')).fill('Outline edited from E2E');

  await expect(slot(page, 'canvas', 'node-1')).toContainText('Outline edited from E2E');
});

test('canvas edits sync to the matching outline node', async ({ page }) => {
  await (await activateEditor(page, 'canvas', 'node-2')).fill('Canvas edited from E2E');

  await expect(slot(page, 'outline', 'node-2')).toContainText('Canvas edited from E2E');
});

test('canvas selection mirrors to the outline editor for the same node', async ({ page }) => {
  await (await activateEditor(page, 'canvas', 'node-3')).click();
  await page.keyboard.press('ArrowRight');

  await expect(page.locator('.bridge-status')).toContainText('canvas -> node-3');
  await expect(slot(page, 'outline', 'node-3')).toHaveAttribute('data-mirrored', 'true');
  await expect(editor(page, 'outline', 'node-3')).toBeVisible();
});

test('benchmark canvas culls offscreen nodes without breaking edit mirror', async ({ page }) => {
  await page.goto('/?fixture=balanced-1000');
  await page.waitForFunction(() => document.querySelector('.app-shell')?.getAttribute('data-benchmark-ready') === 'true');

  const canvas = page.locator('.spike-canvas');
  const totalNodes = Number(await canvas.getAttribute('data-total-node-count'));
  const visibleNodes = Number(await canvas.getAttribute('data-visible-node-count'));
  expect(totalNodes).toBe(1000);
  expect(visibleNodes).toBeGreaterThan(0);
  expect(visibleNodes).toBeLessThan(totalNodes);

  await (await activateEditor(page, 'outline', 'node-1')).fill('Culling keeps mirror editable');
  await expect(slot(page, 'canvas', 'node-1')).toContainText('Culling keeps mirror editable');
});

async function activateEditor(page: Page, surface: 'outline' | 'canvas', nodeId: string) {
  await slot(page, surface, nodeId).click();
  const activeEditor = editor(page, surface, nodeId);
  await expect(activeEditor).toBeVisible();
  return activeEditor;
}

function slot(page: Page, surface: 'outline' | 'canvas', nodeId: string) {
  return page.locator(`[data-node-id="${nodeId}"][data-editor-surface="${surface}"]`);
}

function editor(page: Page, surface: 'outline' | 'canvas', nodeId: string) {
  return slot(page, surface, nodeId).locator('.ProseMirror');
}
