const { test, expect } = require("playwright/test");
const { openApp } = require("../support/open-app.cjs");

test("loads the authoring workspace without browser errors", async ({ page }) => {
  const browserErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
  page.on("pageerror", (error) => browserErrors.push(error.message));
  await openApp(page);

  await expect(page.getByRole("main")).toBeVisible();
  await expect(page.getByRole("tree", { name: "Components" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Canvas" })).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Inspector" })).toBeVisible();
  await expect(page.getByRole("treeitem", { name: "Component 1" })).toBeVisible();

  expect(browserErrors).toEqual([]);
});

test("creates and renames a component", async ({ page }) => {
  await openApp(page);
  await page.getByRole("button", { name: "Add component" }).click();

  const nameEditor = page.getByRole("textbox", { name: "Rename Component 2" });
  await expect(nameEditor).toBeVisible();
  await nameEditor.fill("Primary Button");
  await nameEditor.press("Enter");

  await expect(page.getByRole("treeitem", { name: "Primary Button" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("treeitem")).toHaveCount(2);
});

test("changes a component fill and supports undo and redo", async ({ page }) => {
  await openApp(page);
  const colorHex = page.getByRole("textbox", { name: "Frame background hex value" });
  const component = page.locator("[data-canvas-root-stack]");

  await colorHex.fill("336699");
  await colorHex.press("Enter");
  await expect(component).toHaveCSS("background-color", "rgb(51, 102, 153)");

  await page.keyboard.press("ControlOrMeta+z");
  await expect(component).toHaveCSS("background-color", "rgb(255, 255, 255)");

  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(component).toHaveCSS("background-color", "rgb(51, 102, 153)");
});
