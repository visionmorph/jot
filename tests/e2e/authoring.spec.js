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

test("deletes a component from the left panel and supports undo and redo", async ({ page }) => {
  await openApp(page);
  await page.getByRole("button", { name: "Add component" }).click();

  const nameEditor = page.getByRole("textbox", { name: "Rename Component 2" });
  await nameEditor.fill("Card");
  await nameEditor.press("Enter");
  await page.getByRole("button", { name: "Frame", exact: true }).click();
  await page.locator("[data-canvas-root-stack]").click({ position: { x: 40, y: 40 } });
  await page.keyboard.press("Escape");
  await page.getByRole("treeitem", { name: "Card" }).click();

  await page.keyboard.press("Delete");
  await expect(page.getByRole("treeitem", { name: "Card" })).toHaveCount(0);
  await expect(page.getByRole("treeitem", { name: "Component 1" })).toHaveAttribute("aria-selected", "true");

  await page.keyboard.press("ControlOrMeta+z");
  await expect(page.getByRole("treeitem", { name: "Card" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("treeitem", { name: "Frame 1" })).toBeVisible();

  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(page.getByRole("treeitem", { name: "Card" })).toHaveCount(0);
  await expect(page.getByRole("treeitem", { name: "Component 1" })).toHaveAttribute("aria-selected", "true");
});

test("restores a deleted component set with its variants", async ({ page }) => {
  await openApp(page);
  await page.getByRole("button", { name: "Add component" }).click();
  const nameEditor = page.getByRole("textbox", { name: "Rename Component 2" });
  await nameEditor.fill("Button set");
  await nameEditor.press("Enter");
  await page.getByRole("button", { name: "Add variant preview" }).click();
  await expect(page.locator(".variant-preview")).toHaveCount(2);
  await page.getByRole("treeitem", { name: "Button set" }).click();

  await page.keyboard.press("Delete");
  await expect(page.getByRole("treeitem", { name: "Button set" })).toHaveCount(0);
  await expect(page.locator(".variant-preview")).toHaveCount(0);

  await page.keyboard.press("ControlOrMeta+z");
  await expect(page.getByRole("treeitem", { name: "Button set" })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".variant-preview")).toHaveCount(2);

  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(page.getByRole("treeitem", { name: "Button set" })).toHaveCount(0);
  await expect(page.locator(".variant-preview")).toHaveCount(0);
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

  const propertyControl = page.getByRole("button", { name: "Variant property" });
  await expect(propertyControl).toContainText("Basic variant");
  await propertyControl.click();
  await expect(page.getByRole("option", { name: "Basic variant", exact: true })).toBeVisible();
  await expect(page.getByRole("option", { name: "Interaction", exact: true })).toBeVisible();
  await expect(page.getByRole("option", { name: "Size", exact: true })).toHaveCount(0);
  await expect(page.getByRole("option", { name: "Kind", exact: true })).toHaveCount(0);
  await page.keyboard.press("Escape");

  const addValue = page.getByRole("textbox", { name: "Add Custom value" });
  await addValue.fill("Primary");
  await addValue.press("Enter");
  await expect(page.getByRole("textbox", { name: "Custom value Primary" })).toBeVisible();

  const primaryValue = page.getByRole("textbox", { name: "Custom value Primary" });
  await primaryValue.dblclick();
  await primaryValue.fill("Secondary");
  await primaryValue.press("Enter");
  await expect(page.getByRole("textbox", { name: "Custom value Secondary" })).toBeVisible();

  await page.getByRole("button", { name: "Dismiss Secondary" }).click();
  await expect(page.getByRole("textbox", { name: "Custom value Secondary" })).toHaveCount(0);

  await page.keyboard.press("ControlOrMeta+z");
  await expect(page.getByRole("textbox", { name: "Custom value Secondary" })).toBeVisible();

  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(page.getByRole("textbox", { name: "Custom value Secondary" })).toHaveCount(0);
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

test("configures href without offering target as a variant property", async ({ page }) => {
  await openApp(page);

  await page.getByRole("button", { name: "Open semantic element options" }).click();
  await page.getByRole("option", { name: "a", exact: true }).click();

  await page.getByRole("button", { name: "Add prop" }).click();
  await page.getByRole("option", { name: "String" }).click();
  await page.getByRole("button", { name: "Target property" }).click();
  await page.getByRole("option", { name: "Href" }).click();
  await page.getByRole("textbox", { name: "Default href value" }).fill("/docs");

  await page.getByRole("button", { name: "Add prop" }).click();
  await page.getByRole("option", { name: "Variant" }).click();
  await page.getByRole("button", { name: "Variant property" }).click();
  await expect(page.getByRole("option", { name: "Target", exact: true })).toHaveCount(0);

  const props = await page.evaluate(() => componentProps.map((prop) => ({
    name: prop.name,
    property: prop.property,
    defaultValue: prop.defaultValue,
    options: prop.options,
    targetFrameId: prop.targetFrameId,
  })));
  expect(props[0]).toMatchObject({ name: "href", property: "href", defaultValue: "/docs" });
});

test("allows an Interaction state to target an anchor", async ({ page }) => {
  await openApp(page);

  await page.getByRole("button", { name: "Open semantic element options" }).click();
  await page.getByRole("option", { name: "a", exact: true }).click();
  await page.getByRole("button", { name: "Add prop" }).click();
  await page.getByRole("option", { name: "Variant" }).click();
  await page.getByRole("button", { name: "Variant property" }).click();
  await page.getByRole("option", { name: "Interaction" }).click();

  await expect(page.getByRole("button", { name: "Target layer" })).toContainText("Component 1");
  const propTarget = await page.evaluate(() => ({
    property: componentProps[0].property,
    targetFrameId: componentProps[0].targetFrameId,
    componentFrameId: currentComponent.frameRecord.id,
  }));
  expect(propTarget.property).toBe("state");
  expect(propTarget.targetFrameId).toBe(propTarget.componentFrameId);
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

test("configures a user-defined ARIA label String property", async ({ page }) => {
  await openApp(page);

  await page.evaluate(() => {
    currentComponent.frameRecord.element.dataset.htmlTag = "button";
    renderComponentProps();
  });
  await page.getByRole("button", { name: "Add prop" }).click();
  await page.getByRole("option", { name: "String", exact: true }).click();
  await page.getByRole("button", { name: "Target property" }).click();
  await expect(page.getByRole("option", { name: "ARIA label", exact: true })).toBeEnabled();
  await page.getByRole("option", { name: "ARIA label", exact: true }).click();

  await expect(page.getByRole("textbox", { name: "Prop name" })).toHaveValue("ariaLabel");
  await expect(page.getByRole("button", { name: "Target layer" })).toContainText("Component 1");
  const valueInput = page.getByRole("textbox", { name: "Default ariaLabel value" });
  await valueInput.fill("Dark mode");
  await valueInput.press("Tab");
  await expect.poll(() => page.evaluate(() => componentProps[0].defaultValue)).toBe("Dark mode");
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
  await page.getByRole("option", { name: "Interaction" }).click();

  await expect(page.getByRole("textbox", { name: "Prop name" })).toHaveValue("Interaction");
  await expect(page.getByRole("textbox", { name: "Interaction value default" })).toBeVisible();
  const targetControl = page.getByRole("button", { name: "Target layer" });
  await expect(targetControl).toContainText("Input field");
  await targetControl.click();
  await expect(page.getByRole("option", { name: "Input field" })).toBeEnabled();
  await expect(page.getByRole("option", { name: "Submit button" })).toBeEnabled();
  await page.getByRole("option", { name: "Submit button" }).click();
  await expect(page.getByRole("button", { name: "Target layer" })).toContainText("Submit button");
  await expect(page.getByRole("textbox", { name: "Interaction value active" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Interaction value focus-visible" })).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "Interaction value disabled" })).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => componentProps[0].targetFrameId)).toBe(targetIds.button);

  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(() => page.evaluate(() => componentProps[0].targetFrameId)).toBe(targetIds.input);

  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect.poll(() => page.evaluate(() => componentProps[0].targetFrameId)).toBe(targetIds.button);
});

test("creates a Focus variant property with fixed focus values", async ({ page }) => {
  await openApp(page);

  await page.evaluate(() => {
    currentComponent.frameRecord.element.dataset.htmlTag = "button";
    renderComponentProps();
  });
  await page.getByRole("button", { name: "Add prop" }).click();
  await page.getByRole("option", { name: "Variant" }).click();
  await page.getByRole("button", { name: "Variant property" }).click();
  await page.getByRole("option", { name: "Focus", exact: true }).click();

  await expect(page.getByRole("textbox", { name: "Prop name" })).toHaveValue("Focus");
  await expect(page.getByRole("textbox", { name: "Focus value none" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Focus value focus", exact: true })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Focus value focus-visible" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Target layer" })).toContainText("Component 1");
  await expect.poll(() => page.evaluate(() => ({
    property: componentProps[0].property,
    subtype: componentProps[0].variantSubtype,
    options: componentProps[0].options,
  }))).toEqual({
    property: "focus",
    subtype: "focus",
    options: ["none", "focus", "focus-visible"],
  });
});

test("opens prop dropdown menus above the trigger near the viewport edge", async ({ page }) => {
  await openApp(page);
  await page.setViewportSize({ width: 1280, height: 500 });
  await page.evaluate(() => {
    for (let index = 0; index < 8; index += 1) addComponentProp("boolean");
  });

  const lastPropertyControl = page.getByRole("button", { name: "Target property" }).last();
  await lastPropertyControl.scrollIntoViewIfNeeded();
  await lastPropertyControl.click();
  await expect(lastPropertyControl.locator("xpath=..")).toHaveClass(/is-dropup/);
  const menu = lastPropertyControl.locator("xpath=../*[contains(@class, 'prop-select-menu')]");
  await expect(menu).toHaveCSS("position", "fixed");
  await expect(menu).toHaveCSS("max-height", "176px");
  expect((await menu.boundingBox()).y).toBeGreaterThanOrEqual(8);
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

test("configures a button as a semantic Toggle Boolean property", async ({ page }) => {
  await openApp(page);

  await page.evaluate(() => {
    currentComponent.frameRecord.element.dataset.htmlTag = "button";
    renderComponentProps();
  });
  await page.getByRole("button", { name: "Add prop" }).click();
  await page.getByRole("option", { name: "Boolean" }).click();
  await page.getByRole("button", { name: "Target property" }).click();
  await expect(page.getByRole("option", { name: "Toggle", exact: true })).toBeEnabled();
  await page.getByRole("option", { name: "Toggle", exact: true }).click();

  await expect(page.getByRole("textbox", { name: "Prop name" })).toHaveValue("checked");
  await expect(page.getByRole("button", { name: "Target layer" })).toContainText("Component 1");
  const checkedControl = page.getByRole("switch", { name: "checked value" });
  const component = page.locator("[data-canvas-root-stack]");
  await expect(checkedControl).toHaveAttribute("aria-checked", "false");
  await expect(component).toHaveAttribute("role", "switch");
  await expect(component).toHaveAttribute("aria-checked", "false");

  await checkedControl.click();
  await expect(component).toHaveAttribute("aria-checked", "true");

  await page.keyboard.press("ControlOrMeta+z");
  await expect(component).toHaveAttribute("aria-checked", "false");

  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(component).toHaveAttribute("aria-checked", "true");
});

test("configures a button as a semantic Selected Boolean property", async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => {
    currentComponent.frameRecord.element.dataset.htmlTag = "button";
    renderComponentProps();
  });
  await page.getByRole("button", { name: "Add prop" }).click();
  await page.getByRole("option", { name: "Boolean" }).click();
  await page.getByRole("button", { name: "Target property" }).click();
  await page.getByRole("option", { name: "Selected", exact: true }).click();

  const component = page.locator("[data-canvas-root-stack]");
  const control = page.getByRole("switch", { name: "selected value" });
  await expect(page.getByRole("textbox", { name: "Prop name" })).toHaveValue("selected");
  await expect(component).toHaveAttribute("role", "tab");
  await expect(control).toHaveAttribute("aria-checked", "false");
  await expect(control.locator(".toggle__label")).toHaveText("Unselected");
  await control.click();
  await expect(control).toHaveAttribute("aria-checked", "true");
  await expect(control.locator(".toggle__label")).toHaveText("Selected");
  await page.keyboard.press("ControlOrMeta+z");
  await expect(page.getByRole("switch", { name: "selected value" })).toHaveAttribute("aria-checked", "false");
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(page.getByRole("switch", { name: "selected value" })).toHaveAttribute("aria-checked", "true");
  await page.getByRole("button", { name: "Target property" }).click();
  await page.getByRole("option", { name: "Basic boolean", exact: true }).click();
  await expect(component).not.toHaveAttribute("aria-selected", /.+/);
});

test("configures a tab list with a semantic Disabled Boolean", async ({ page }) => {
  await openApp(page);
  await page.getByRole("button", { name: "Open semantic element options" }).click();
  await page.getByRole("option", { name: "Tab list", exact: true }).click();
  await page.getByRole("button", { name: "Add prop" }).click();
  await page.getByRole("option", { name: "Boolean" }).click();
  await page.getByRole("button", { name: "Target property" }).click();
  await page.getByRole("option", { name: "Disabled", exact: true }).click();

  const component = page.locator("[data-canvas-root-stack]");
  await expect(page.getByRole("textbox", { name: "Prop name" })).toHaveValue("disabled");
  await expect(page.getByRole("switch", { name: "disabled value" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Target layer" })).toContainText("Component 1");
  await expect(component).toHaveAttribute("role", "tablist");
  await expect.poll(() => page.evaluate(() => componentProps[0].property)).toBe("disabled");
});

test("configures Basic Boolean as a non-semantic Boolean variant axis", async ({ page }) => {
  await openApp(page);

  await page.getByRole("button", { name: "Add prop" }).click();
  await page.getByRole("option", { name: "Boolean" }).click();
  await page.getByRole("button", { name: "Target property" }).click();
  await page.getByRole("option", { name: "Basic boolean", exact: true }).click();

  await expect(page.getByRole("textbox", { name: "Prop name" })).toHaveValue("boolean");
  await expect(page.getByRole("button", { name: "Target layer" })).toContainText("Component 1");
  const state = await page.evaluate(() => {
    const prop = componentProps[0];
    const axis = variantModel.getProps().find((candidate) => candidate.id === prop.variantPropId);
    return {
      prop: {
        property: prop.property,
        defaultValue: prop.defaultValue,
        targetFrameId: prop.targetFrameId,
        targetTextId: prop.targetTextId,
        targetVectorId: prop.targetVectorId,
      },
      axis: axis ? { type: axis.type, defaultValue: axis.defaultValue } : null,
      attributes: {
        role: canvasRootStack.getAttribute("role"),
        ariaChecked: canvasRootStack.getAttribute("aria-checked"),
        ariaDisabled: canvasRootStack.getAttribute("aria-disabled"),
        ariaInvalid: canvasRootStack.getAttribute("aria-invalid"),
        disabled: canvasRootStack.hasAttribute("disabled"),
      },
    };
  });

  expect(state.prop).toEqual({
    property: "custom",
    defaultValue: false,
    targetFrameId: null,
    targetTextId: null,
    targetVectorId: null,
  });
  expect(state.axis).toEqual({ type: "boolean", defaultValue: false });
  expect(state.attributes).toEqual({
    role: null,
    ariaChecked: null,
    ariaDisabled: null,
    ariaInvalid: null,
    disabled: false,
  });
});
