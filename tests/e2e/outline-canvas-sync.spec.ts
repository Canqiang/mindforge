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
  const visibleEdges = Number(await canvas.getAttribute('data-visible-edge-count'));
  await expect(canvas).toHaveAttribute('data-viewport-measured', 'true');
  expect(totalNodes).toBe(1000);
  expect(visibleNodes).toBeGreaterThan(0);
  expect(visibleNodes).toBeLessThan(totalNodes);
  expect(visibleEdges).toBeGreaterThan(0);

  await (await activateEditor(page, 'outline', 'node-1')).fill('Culling keeps mirror editable');
  await expect(slot(page, 'canvas', 'node-1')).toContainText('Culling keeps mirror editable');
});

test('theme selector switches CSS variables across the document', async ({ page }) => {
  const html = page.locator('html');
  await expect(html).toHaveAttribute('data-theme', 'default');

  await page.getByLabel('Theme').selectOption('mono');
  await expect(html).toHaveAttribute('data-theme', 'mono');

  await page.getByLabel('Theme').selectOption('minimal');
  await expect(html).toHaveAttribute('data-theme', 'minimal');

  await page.getByLabel('Theme').selectOption('default');
  await expect(html).toHaveAttribute('data-theme', 'default');
});

test('outline chevron collapses a subtree on both panes', async ({ page }) => {
  // node-1 has children (outline-content, outline-selection in the spike seed).
  const outlineChevron = slot(page, 'outline', 'node-1').locator('xpath=preceding-sibling::button[@class="outline-chevron"]');
  await expect(outlineChevron).toHaveAttribute('aria-expanded', 'true');

  // The first child should be visible in the outline before collapse.
  await expect(page.locator('[data-node-id="outline-content"][data-editor-surface="outline"]')).toBeVisible();

  await outlineChevron.click();

  await expect(outlineChevron).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('[data-node-id="outline-content"][data-editor-surface="outline"]')).toHaveCount(0);

  // Canvas pane: the corresponding child should also disappear from the layout.
  await expect(page.locator('[data-node-id="outline-content"][data-editor-surface="canvas"]')).toHaveCount(0);

  // Expanding restores the children on both panes.
  await outlineChevron.click();
  await expect(outlineChevron).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('[data-node-id="outline-content"][data-editor-surface="outline"]')).toBeVisible();
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
