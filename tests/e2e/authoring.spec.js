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

test("adds, renames, and removes a component property", async ({ page }) => {
  await openApp(page);

  const rows = page.locator("[data-prop-rows] [role=row]");
  await page.getByRole("button", { name: "Add prop" }).click();
  await page.getByRole("option", { name: "Boolean" }).click();

  await expect(rows).toHaveCount(1);
  const nameInput = page.getByRole("textbox", { name: "Prop name" });
  await expect(nameInput).toHaveValue("visible");
  await nameInput.fill("Show content");
  await nameInput.press("Tab");
  await expect(nameInput).toHaveValue("Show content");

  await rows.getByRole("button", { name: /^Remove / }).click();
  await expect(rows).toHaveCount(0);

  await page.keyboard.press("ControlOrMeta+z");
  await expect(rows).toHaveCount(1);
  await expect(page.getByRole("textbox", { name: "Prop name" })).toHaveValue("Show content");

  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(rows).toHaveCount(0);
});

test("changes a component property type and default with undo and redo", async ({ page }) => {
  await openApp(page);

  await page.getByRole("button", { name: "Add prop" }).click();
  await page.getByRole("option", { name: "Boolean" }).click();

  const typeControl = page.getByRole("button", { name: "Prop type" });
  const booleanDefault = page.getByRole("switch", { name: "visible value" });
  await expect(typeControl).toContainText("Boolean");
  await expect(booleanDefault).toHaveAttribute("aria-checked", "true");

  await booleanDefault.click();
  const updatedBooleanDefault = page.getByRole("switch", { name: "visible value" });
  await expect(updatedBooleanDefault).toHaveAttribute("aria-checked", "false");
  await expect(updatedBooleanDefault).not.toHaveAttribute("data-transitioning", "true");

  await page.keyboard.press("ControlOrMeta+z");
  await expect(page.getByRole("switch", { name: "visible value" })).toHaveAttribute("aria-checked", "true");

  await typeControl.click();
  await page.getByRole("option", { name: "String", exact: true }).click();
  await expect(page.getByRole("button", { name: "Prop type" })).toContainText("String");
  await expect(page.getByRole("textbox", { name: "Prop name" })).toHaveValue("label");

  await page.keyboard.press("ControlOrMeta+z");
  await expect(page.getByRole("button", { name: "Prop type" })).toContainText("Boolean");

  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(page.getByRole("button", { name: "Prop type" })).toContainText("String");
});

test("adds, renames, and removes a variant property option", async ({ page }) => {
  await openApp(page);

  await page.getByRole("button", { name: "Add prop" }).click();
  await page.getByRole("option", { name: "Variant" }).click();

  const addValue = page.getByRole("textbox", { name: "Add Kind value" });
  await addValue.fill("Primary");
  await addValue.press("Enter");
  await expect(page.getByRole("textbox", { name: "Kind value Primary" })).toBeVisible();

  const primaryValue = page.getByRole("textbox", { name: "Kind value Primary" });
  await primaryValue.dblclick();
  await primaryValue.fill("Secondary");
  await primaryValue.press("Enter");
  await expect(page.getByRole("textbox", { name: "Kind value Secondary" })).toBeVisible();

  await page.getByRole("button", { name: "Dismiss Secondary" }).click();
  await expect(page.getByRole("textbox", { name: "Kind value Secondary" })).toHaveCount(0);

  await page.keyboard.press("ControlOrMeta+z");
  await expect(page.getByRole("textbox", { name: "Kind value Secondary" })).toBeVisible();

  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(page.getByRole("textbox", { name: "Kind value Secondary" })).toHaveCount(0);
});

test("changes a component property target and supports undo and redo", async ({ page }) => {
  await openApp(page);

  const component = page.locator("[data-canvas-root-stack]");
  const text = component.locator(':scope > [data-text-id="1"]');
  await page.getByRole("button", { name: "Text", exact: true }).click();
  await component.click({ position: { x: 50, y: 50 } });
  await text.fill("Target label");
  await text.press("Escape");
  await page.getByRole("treeitem", { name: "Component 1" }).click();

  await page.getByRole("button", { name: "Add prop" }).click();
  await page.getByRole("option", { name: "Boolean" }).click();

  const targetControl = page.getByRole("button", { name: "Target layer" });
  await expect(targetControl).toContainText("Component 1");
  await targetControl.click();
  await page.getByRole("option", { name: "Target label" }).click();
  await expect(page.getByRole("button", { name: "Target layer" })).toContainText("Target label");

  await page.keyboard.press("ControlOrMeta+z");
  await expect(page.getByRole("button", { name: "Target layer" })).toContainText("Component 1");

  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(page.getByRole("button", { name: "Target layer" })).toContainText("Target label");
});

test("changes a String property value and supports undo and redo", async ({ page }) => {
  await openApp(page);

  const component = page.locator("[data-canvas-root-stack]");
  const text = component.locator(':scope > [data-text-id="1"]');
  await page.getByRole("button", { name: "Text", exact: true }).click();
  await component.click({ position: { x: 50, y: 50 } });
  await text.fill("Original label");
  await text.press("Escape");
  await page.getByRole("treeitem", { name: "Component 1" }).click();

  await page.getByRole("button", { name: "Add prop" }).click();
  await page.getByRole("option", { name: "String", exact: true }).click();

  const valueInput = page.getByRole("textbox", { name: "Default label value" });
  await expect(valueInput).toHaveValue("Original label");
  await valueInput.fill("Updated label");
  await valueInput.press("Tab");
  await expect(text).toHaveText("Updated label");

  await page.keyboard.press("ControlOrMeta+z");
  await expect(text).toHaveText("Original label");

  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(text).toHaveText("Updated label");
});
