const { test, expect } = require("playwright/test");
const { openApp } = require("../support/open-app.cjs");

test("new text authored in a variant has content and size in sibling variants", async ({ page }) => {
  await openApp(page);
  await page.getByRole("button", { name: "Add variant preview" }).click();

  const previews = page.locator(".variant-preview");
  await page.getByRole("button", { name: "Text", exact: true }).click();
  await previews.nth(1).locator(".canvas-root-stack").click({ position: { x: 12, y: 12 } });
  await page.keyboard.type("Shared label");

  const siblingText = previews.nth(0).locator('[data-text-id="1"]');
  await expect(siblingText).toHaveText("Shared label");
  const bounds = await siblingText.boundingBox();
  expect(bounds.width).toBeGreaterThan(1);
  expect(bounds.height).toBeGreaterThan(0);
});
test("starts new variant text with an empty caret", async ({ page }) => {
  await openApp(page);

  await page.getByRole("button", { name: "Add variant preview" }).click();
  const previews = page.locator(".variant-preview");
  const selectedRoot = previews.nth(1).locator(".canvas-root-stack");
  await page.getByRole("button", { name: "Text", exact: true }).click();
  await selectedRoot.click({ position: { x: 40, y: 40 } });

  const text = selectedRoot.locator(":scope > .canvas-text");
  await expect(text).toHaveCount(1);
  await expect(text).toBeFocused();
  await expect(text).toHaveText("");
  await expect.poll(() => text.evaluate((element) => {
    const selection = window.getSelection();
    if (selection?.isCollapsed !== true || !element.contains(selection.anchorNode) || selection.rangeCount === 0) {
      return false;
    }
    const contents = document.createRange();
    contents.selectNodeContents(element);
    return selection.getRangeAt(0).compareBoundaryPoints(Range.END_TO_END, contents) === 0;
  })).toBe(true);
});

test("discards empty text created on a variant background when Escape is pressed", async ({ page }) => {
  await openApp(page);

  await page.getByRole("button", { name: "Add variant preview" }).click();
  const previews = page.locator(".variant-preview");
  const selectedRoot = previews.nth(1).locator(".canvas-root-stack");
  await page.getByRole("button", { name: "Text", exact: true }).click();
  await selectedRoot.click({ position: { x: 40, y: 40 } });

  await expect(selectedRoot.locator(":scope > .canvas-text")).toBeFocused();
  await page.keyboard.press("Escape");

  await expect(previews.locator(".canvas-text")).toHaveCount(0);
});

test("keeps variant text with at least one character when Escape is pressed", async ({ page }) => {
  await openApp(page);

  await page.getByRole("button", { name: "Add variant preview" }).click();
  const previews = page.locator(".variant-preview");
  const selectedRoot = previews.nth(1).locator(".canvas-root-stack");
  await page.getByRole("button", { name: "Text", exact: true }).click();
  await selectedRoot.click({ position: { x: 40, y: 40 } });

  const text = selectedRoot.locator(":scope > .canvas-text");
  await text.pressSequentially("A");
  await page.keyboard.press("Escape");

  await expect(selectedRoot.locator(":scope > .canvas-text")).toHaveText("A");
  await expect(previews.locator(".canvas-text")).toHaveCount(2);
});
