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
  await valueInput.focus();
  await valueInput.press("End");
  await valueInput.press("X");
  await expect(valueInput).toBeFocused();
  await valueInput.press("Backspace");
  await valueInput.fill("Updated label");
  await valueInput.press("Tab");
  await expect(text).toHaveText("Updated label");

  await page.keyboard.press("ControlOrMeta+z");
  await expect(text).toHaveText("Original label");

  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(text).toHaveText("Updated label");
});

test("targets an input placeholder with a String property", async ({ page }) => {
  await openApp(page);

  await page.evaluate(() => {
    currentComponent.frameRecord.element.dataset.htmlTag = "input";
    renderComponentProps();
  });
  await page.getByRole("button", { name: "Add prop" }).click();
  await page.getByRole("option", { name: "String", exact: true }).click();

  await expect(page.getByRole("textbox", { name: "Prop name" })).toHaveValue("placeholder");
  await expect(page.getByRole("button", { name: "Target layer" })).toContainText("Component 1");
  const propertyControl = page.getByRole("button", { name: "Target property" });
  await expect(propertyControl).toContainText("Placeholder");
  await propertyControl.click();
  await expect(page.getByRole("option", { name: "Placeholder", exact: true })).toBeEnabled();
  await page.getByRole("option", { name: "Placeholder", exact: true }).click();

  const valueInput = page.getByRole("textbox", { name: "Default placeholder value" });
  await valueInput.fill("Email address");
  await valueInput.press("Tab");
  await expect(page.locator("[data-canvas-root-stack]")).toHaveAttribute("data-placeholder", "Email address");

  await page.keyboard.press("ControlOrMeta+z");
  await expect(page.locator("[data-canvas-root-stack]")).not.toHaveAttribute("data-placeholder", /.+/);

  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(page.locator("[data-canvas-root-stack]")).toHaveAttribute("data-placeholder", "Email address");
});

test("targets an interactive frame with an Interaction state property", async ({ page }) => {
  await openApp(page);

  const targetIds = await page.evaluate(() => {
    const input = createCanvasFrame(0, 0, currentComponent.frameRecord, { select: false });
    input.name = "Input field";
    input.element.dataset.htmlTag = "input";
    const button = createCanvasFrame(0, 0, currentComponent.frameRecord, { select: false });
    button.name = "Submit button";
    button.element.dataset.htmlTag = "button";
    renderTree();
    renderComponentProps();
    return { input: input.id, button: button.id };
  });

  await page.getByRole("button", { name: "Add prop" }).click();
  await page.getByRole("option", { name: "Variant" }).click();
  await page.getByRole("button", { name: "Variant property" }).click();
  await page.getByRole("option", { name: "State" }).click();

  await expect(page.getByRole("textbox", { name: "Prop name" })).toHaveValue("Interaction");
  const targetControl = page.getByRole("button", { name: "Target layer" });
  await expect(targetControl).toContainText("Input field");
  await targetControl.click();
  await expect(page.getByRole("option", { name: "Input field" })).toBeEnabled();
  await expect(page.getByRole("option", { name: "Submit button" })).toBeEnabled();
  await page.getByRole("option", { name: "Submit button" }).click();
  await expect(page.getByRole("button", { name: "Target layer" })).toContainText("Submit button");
  await expect.poll(() => page.evaluate(() => componentProps[0].targetFrameId)).toBe(targetIds.button);

  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(() => page.evaluate(() => componentProps[0].targetFrameId)).toBe(targetIds.input);

  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect.poll(() => page.evaluate(() => componentProps[0].targetFrameId)).toBe(targetIds.button);
});

test("targets an input with an Invalid Boolean property", async ({ page }) => {
  await openApp(page);

  await page.evaluate(() => {
    currentComponent.frameRecord.element.dataset.htmlTag = "input";
    renderComponentProps();
  });
  await page.getByRole("button", { name: "Add prop" }).click();
  await page.getByRole("option", { name: "Boolean" }).click();
  await page.getByRole("button", { name: "Target property" }).click();
  await expect(page.getByRole("option", { name: "Invalid", exact: true })).toBeEnabled();
  await page.getByRole("option", { name: "Invalid", exact: true }).click();

  await expect(page.getByRole("textbox", { name: "Prop name" })).toHaveValue("invalid");
  await expect(page.getByRole("button", { name: "Target layer" })).toContainText("Component 1");
  const invalidToggle = page.getByRole("switch", { name: "invalid value" });
  await expect(invalidToggle).toHaveAttribute("aria-checked", "false");
  await invalidToggle.click();
  await expect(page.locator("[data-canvas-root-stack]")).toHaveAttribute("data-invalid", "true");
  await expect(page.locator("[data-canvas-root-stack]")).toHaveAttribute("aria-invalid", "true");

  await page.keyboard.press("ControlOrMeta+z");
  await expect(page.locator("[data-canvas-root-stack]")).not.toHaveAttribute("data-invalid", /.+/);
  await expect(page.locator("[data-canvas-root-stack]")).not.toHaveAttribute("aria-invalid", /.+/);

  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(page.locator("[data-canvas-root-stack]")).toHaveAttribute("data-invalid", "true");
  await expect(page.locator("[data-canvas-root-stack]")).toHaveAttribute("aria-invalid", "true");
});
