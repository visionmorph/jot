const { test, expect } = require("playwright/test");
const { openApp } = require("../support/open-app.cjs");

async function dropSvg(page, name, source) {
  const canvas = page.getByRole("region", { name: "Canvas" });
  await canvas.evaluate((element, file) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([file.source], file.name, { type: "image/svg+xml" }));
    const bounds = element.getBoundingClientRect();
    element.dispatchEvent(new DragEvent("drop", {
      bubbles: true,
      cancelable: true,
      clientX: bounds.left + bounds.width / 2,
      clientY: bounds.top + bounds.height / 2,
      dataTransfer: transfer,
    }));
  }, { name, source });
}

async function createTextLayer(page, content = "Text target") {
  const component = page.locator("[data-canvas-root-stack]");
  const text = component.locator(':scope > [data-text-id="1"]');
  await page.getByRole("button", { name: "Text", exact: true }).click();
  await component.click({ position: { x: 50, y: 50 } });
  await text.fill(content);
  await text.press("Escape");
  return text;
}

async function createGroupedColorFixture(page, { splitColors = false } = {}) {
  await page.evaluate(({ split }) => {
    const root = canvasRootStack;
    root.dataset.frameColor = split ? "#336699" : "";
    root.dataset.frameColorOpacity = "100";
    root.style.backgroundColor = split ? "#336699" : "";
    root.dataset.outlineColor = split ? "" : "#336699";
    root.dataset.outlineColorOpacity = "100";
    root.dataset.outlineWeight = split ? "0" : "1";
    applyFrameOutline(root);

    const textRecord = createCanvasText(currentComponent.frameRecord, 0, 0, {
      beginEditing: false,
      isNew: false,
      textContent: "Grouped color",
    });
    const childColor = split ? "#FFFFFF" : "#336699";
    textRecord.element.dataset.textColor = childColor;
    textRecord.element.style.color = childColor;
    createCanvasVector({
      name: "Grouped icon",
      width: 24,
      height: 24,
      source: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><path d="M2 2h20v20H2z" fill="${childColor}"/></svg>`,
    }, 0, 0, currentComponent.frameRecord, { select: false });
    selectComponentState(currentComponent.id);
    renderTree();
  }, { split: splitColors });
}

test("groups matching descendant colors and edits them as one undoable selection color", async ({ page }) => {
  await openApp(page);
  await createGroupedColorFixture(page);

  const section = page.locator("[data-selection-colors]");
  const root = page.locator("[data-canvas-root-stack]");
  const text = root.locator('[data-text-id="1"]');
  const path = root.locator('[data-vector-id="1"] path');
  await expect(section.getByRole("heading", { name: "Selection colors" })).toBeVisible();
  await expect(section.locator('[data-color-control="selection"]')).toHaveCount(1);

  const colorHex = section.getByRole("textbox", { name: "Selection color 1 hex value" });
  await colorHex.fill("CC5500");
  await expect(root).toHaveAttribute("data-outline-color", "#CC5500");
  await expect(text).toHaveCSS("color", "rgb(204, 85, 0)");
  await expect(path).toHaveCSS("fill", "rgb(204, 85, 0)");
  await colorHex.press("Enter");
  await expect(root).toHaveAttribute("data-outline-color", "#CC5500");
  await expect(text).toHaveCSS("color", "rgb(204, 85, 0)");
  await expect(path).toHaveCSS("fill", "rgb(204, 85, 0)");

  await page.keyboard.press("ControlOrMeta+z");
  await expect(root).toHaveAttribute("data-outline-color", "#336699");
  await expect(text).toHaveCSS("color", "rgb(51, 102, 153)");
  await expect(path).toHaveCSS("fill", "rgb(51, 102, 153)");

  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(text).toHaveCSS("color", "rgb(204, 85, 0)");
  await expect(path).toHaveCSS("fill", "rgb(204, 85, 0)");
});

test("live-updates a matching frame border and nested text from the selection color picker", async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => {
    const frame = createCanvasFrame(0, 0, currentComponent.frameRecord, { select: false });
    frame.element.dataset.outlineColor = "#336699";
    frame.element.dataset.outlineColorOpacity = "100";
    frame.element.dataset.outlineWeight = "2";
    applyFrameOutline(frame.element);
    const text = createCanvasText(frame, 0, 0, {
      beginEditing: false,
      isNew: false,
      textContent: "Matching border",
    });
    text.element.dataset.textColor = "#336699";
    text.element.style.color = "#336699";
    selectLayerKeys([`frame:${frame.id}`], `frame:${frame.id}`);
    syncElementSelectionStyles();
    updateInspector();
  });

  const frame = page.locator('[data-frame-id="1"]');
  const text = frame.locator('[data-text-id="1"]');
  const section = page.locator("[data-frame-inspector] > [data-selection-colors]");
  await expect(section.locator('[data-color-control="selection"]')).toHaveCount(1);
  await section.getByRole("button", { name: "Choose selection color 1" }).click();
  const popupHex = page.getByRole("textbox", { name: "Hex color value" });
  await popupHex.fill("CC5500");

  await expect(frame).toHaveCSS("box-shadow", "rgb(204, 85, 0) 0px 0px 0px 2px inset");
  await expect(text).toHaveCSS("color", "rgb(204, 85, 0)");
  await expect(page.getByRole("textbox", { name: "Frame outline hex value" })).toHaveValue("CC5500");
});

test("propagates selection color opacity to every matching property", async ({ page }) => {
  await openApp(page);
  await createGroupedColorFixture(page);

  const section = page.locator("[data-selection-colors]");
  const root = page.locator("[data-canvas-root-stack]");
  const text = root.locator('[data-text-id="1"]');
  const path = root.locator('[data-vector-id="1"] path');
  const opacity = section.getByRole("textbox", { name: "Selection color 1 opacity" });
  await opacity.fill("50");
  await opacity.press("Tab");

  await expect(root).toHaveAttribute("data-outline-color-opacity", "50");
  await expect(text).toHaveCSS("color", "rgba(51, 102, 153, 0.5)");
  await expect(path).toHaveCSS("fill", "rgba(51, 102, 153, 0.5)");
});

test("keeps distinct selection colors isolated", async ({ page }) => {
  await openApp(page);
  await createGroupedColorFixture(page, { splitColors: true });

  const section = page.locator("[data-selection-colors]");
  const root = page.locator("[data-canvas-root-stack]");
  const text = root.locator('[data-text-id="1"]');
  const path = root.locator('[data-vector-id="1"] path');
  await expect(section.locator('[data-color-control="selection"]')).toHaveCount(2);

  const backgroundHex = section.getByRole("textbox", { name: "Selection color 1 hex value" });
  await expect(backgroundHex).toHaveValue("336699");
  await backgroundHex.fill("7A3E9D");
  await backgroundHex.press("Enter");
  await expect(root).toHaveCSS("background-color", "rgb(122, 62, 157)");
  await expect(text).toHaveCSS("color", "rgb(255, 255, 255)");
  await expect(path).toHaveCSS("fill", "rgb(255, 255, 255)");
});

test("switches between selection color inputs with one click", async ({ page }) => {
  await openApp(page);
  await createGroupedColorFixture(page, { splitColors: true });

  const section = page.locator("[data-selection-colors]");
  const firstHex = section.getByRole("textbox", { name: "Selection color 1 hex value" });
  const secondOpacity = section.getByRole("textbox", { name: "Selection color 2 opacity" });
  const firstOpacity = section.getByRole("textbox", { name: "Selection color 1 opacity" });

  await firstHex.click();
  await expect(firstHex).toBeFocused();
  await secondOpacity.click();
  await expect(secondOpacity).toBeFocused();
  await firstOpacity.click();
  await expect(firstOpacity).toBeFocused();
});

test("refreshes component selection colors after background and border edits", async ({ page }) => {
  await openApp(page);
  await createGroupedColorFixture(page, { splitColors: true });

  const section = page.locator("[data-selection-colors]");
  const controls = section.locator('[data-color-control="selection"]');
  const backgroundHex = page.getByRole("textbox", { name: "Frame background hex value" });
  await backgroundHex.fill("7A3E9D");
  await backgroundHex.press("Enter");
  await expect(controls).toHaveCount(2);
  await expect(section.getByRole("textbox", { name: "Selection color 1 hex value" })).toHaveValue("7A3E9D");

  await page.getByRole("button", { name: "Add frame border" }).click();
  await expect(controls).toHaveCount(3);
  const borderHex = page.getByRole("textbox", { name: "Frame outline hex value" });
  await borderHex.fill("CC5500");
  await borderHex.press("Enter");
  await expect(section.getByRole("textbox", { name: "Selection color 2 hex value" })).toHaveValue("CC5500");
});

test("updates a mask icon through its currentColor value", async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => {
    canvasRootStack.dataset.frameColor = "";
    canvasRootStack.style.backgroundColor = "";
    const textRecord = createCanvasText(currentComponent.frameRecord, 0, 0, {
      beginEditing: false,
      isNew: false,
      textContent: "Icon label",
    });
    textRecord.element.dataset.textColor = "#336699";
    textRecord.element.style.color = "#336699";
    const iconRecord = createCanvasVector({
      name: "Mask icon",
      width: 24,
      height: 24,
      source: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><path d="M2 2h20v20H2z" fill="#336699"/></svg>',
    }, 0, 0, currentComponent.frameRecord, { select: false });
    iconRecord.element.style.maskImage = 'url("src/icons/add.svg")';
    iconRecord.element.style.backgroundColor = "currentcolor";
    iconRecord.element.style.color = "#336699";
    selectComponentState(currentComponent.id);
    renderTree();
  });

  const section = page.locator("[data-selection-colors]");
  const icon = page.locator('[data-canvas-root-stack] [data-vector-id="1"]');
  await expect(section.locator('[data-color-control="selection"]')).toHaveCount(1);
  const colorHex = section.getByRole("textbox", { name: "Selection color 1 hex value" });
  await colorHex.fill("CC5500");
  await colorHex.press("Enter");
  await expect(icon).toHaveCSS("color", "rgb(204, 85, 0)");
  await expect(icon).toHaveCSS("background-color", "rgb(204, 85, 0)");
});

test("shows selection colors for one colored direct child and rolls up deeper colors", async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => {
    canvasRootStack.dataset.frameColor = "";
    canvasRootStack.style.backgroundColor = "";
    const directText = createCanvasText(currentComponent.frameRecord, 0, 0, {
      beginEditing: false,
      isNew: false,
      textContent: "Direct color",
    });
    directText.element.dataset.textColor = "#336699";
    directText.element.style.color = "#336699";

    const wrapper = createCanvasFrame(0, 0, currentComponent.frameRecord, { select: false });
    const nestedText = createCanvasText(wrapper, 0, 0, {
      beginEditing: false,
      isNew: false,
      textContent: "Nested color",
    });
    nestedText.element.dataset.textColor = "#CC5500";
    nestedText.element.style.color = "#CC5500";
    selectComponentState(currentComponent.id);
    renderTree();
  });

  const section = page.locator("[data-selection-colors]");
  await expect(section).toBeVisible();
  await expect(section.locator('[data-color-control="selection"]')).toHaveCount(2);
  await expect(section.getByRole("textbox", { name: "Selection color 1 hex value" })).toHaveValue("336699");
  await expect(section.getByRole("textbox", { name: "Selection color 2 hex value" })).toHaveValue("CC5500");
});

test("does not show selection colors for a single layer", async ({ page }) => {
  await openApp(page);
  await expect(page.locator("[data-selection-colors]")).toBeHidden();
  await expect(page.getByRole("textbox", { name: "Frame background hex value" })).toBeVisible();
});

test("changes frame fill opacity and supports undo and redo", async ({ page }) => {
  await openApp(page);

  const component = page.locator("[data-canvas-root-stack]");
  const colorHex = page.getByRole("textbox", { name: "Frame background hex value" });
  const opacity = page.getByRole("textbox", { name: "Frame background opacity" });

  await colorHex.fill("336699");
  await colorHex.press("Enter");
  await opacity.fill("50");
  await opacity.press("Tab");
  await expect(component).toHaveCSS("background-color", "rgba(51, 102, 153, 0.5)");

  await page.keyboard.press("ControlOrMeta+z");
  await expect(component).toHaveCSS("background-color", "rgb(51, 102, 153)");

  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(component).toHaveCSS("background-color", "rgba(51, 102, 153, 0.5)");
});

test("changes frame layout controls and supports undo and redo", async ({ page }) => {
  await openApp(page);

  const component = page.locator("[data-canvas-root-stack]");
  const horizontalPadding = page.getByRole("textbox", { name: "Horizontal padding" });
  const verticalPadding = page.getByRole("textbox", { name: "Vertical padding" });
  const gapInput = page.locator("#frame-gap");
  const radiusInput = page.getByRole("spinbutton", { name: "Radius" });

  await horizontalPadding.fill("16");
  await horizontalPadding.press("Tab");
  await verticalPadding.fill("12");
  await verticalPadding.press("Tab");
  await gapInput.fill("18");
  await gapInput.press("Tab");
  await radiusInput.fill("8");
  await radiusInput.press("Tab");
  await page.getByRole("button", { name: "Vertical", exact: true }).click();

  await expect(component).toHaveCSS("padding-left", "16px");
  await expect(component).toHaveCSS("padding-top", "12px");
  await expect(component).toHaveCSS("gap", "18px");
  await expect(component).toHaveCSS("border-radius", "8px");
  await expect(component).toHaveCSS("flex-direction", "column");

  await page.keyboard.press("ControlOrMeta+z");
  await expect(component).toHaveCSS("flex-direction", "row");

  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(component).toHaveCSS("flex-direction", "column");
});

test("applies component gap after wrapping text and duplicating its frame", async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => {
    const text = createCanvasText(currentComponent.frameRecord, 0, 0, {
      beginEditing: false,
      isNew: false,
      textContent: "Label",
    });
    selectCanvasText(text.element);
  });
  await page.keyboard.press("Shift+a");
  await page.keyboard.press("ControlOrMeta+d");

  const component = page.locator("[data-canvas-root-stack]");
  const frames = component.locator(":scope > .canvas-frame");
  await expect(frames).toHaveCount(2);
  await page.locator(".tree-node--component").click();
  await page.locator("#frame-gap").fill("32");
  await page.locator("#frame-gap").press("Tab");

  await expect(component).toHaveCSS("gap", "32px");
  await expect.poll(() => frames.evaluateAll((elements) => {
    const [first, second] = elements.map((element) => element.getBoundingClientRect());
    return Math.round(second.left - first.right);
  })).toBe(32);
});

test("displays and bulk-edits direct layout properties for selected variant roots", async ({ page }) => {
  await openApp(page);
  await page.getByRole("button", { name: "Add variant preview" }).click();
  await page.getByRole("button", { name: "Add variant preview" }).click();

  await page.evaluate(() => {
    const [first, second, third] = variantModel.getInstances();
    const setLayout = (instance, values) => {
      Object.entries(values).forEach(([property, value]) => {
        upsertLocalVariantOverride(instance, "component:0", property, value);
      });
    };
    setLayout(first, {
      width: "120px",
      height: "100px",
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "flex-start",
      gap: "12px",
      borderRadius: "8px",
      paddingLeft: "10px",
      paddingTop: "10px",
      paddingRight: "10px",
      paddingBottom: "10px",
    });
    setLayout(second, {
      width: "160px",
      height: "140px",
      flexDirection: "column",
      alignItems: "flex-end",
      justifyContent: "flex-end",
      gap: "24px",
      borderRadius: "12px",
      paddingLeft: "20px",
      paddingTop: "14px",
      paddingRight: "20px",
      paddingBottom: "14px",
    });
    setLayout(third, {
      width: "220px",
      height: "180px",
      flexDirection: "column",
      alignItems: "flex-end",
      justifyContent: "flex-end",
      gap: "30px",
      borderRadius: "20px",
      paddingLeft: "30px",
      paddingTop: "30px",
      paddingRight: "30px",
      paddingBottom: "30px",
    });
    renderVariantInstances();
    selectVariantInstances([first.id, second.id], second.id);
    updateInspector();
  });

  const inspector = page.locator("[data-frame-inspector]");
  const previews = page.locator(".variant-preview");
  const roots = previews.locator(".canvas-root-stack");
  const widthInput = page.getByRole("combobox", { name: "Frame width" });
  const heightInput = page.getByRole("combobox", { name: "Frame height" });
  const gapInput = page.locator("#frame-gap");
  const radiusInput = page.getByRole("spinbutton", { name: "Radius" });
  const horizontalPadding = page.getByRole("textbox", { name: "Horizontal padding" });
  const verticalPadding = page.getByRole("textbox", { name: "Vertical padding" });

  await expect(inspector.getByRole("heading", { name: "Frames", exact: true })).toBeVisible();
  for (const input of [widthInput, heightInput, gapInput, radiusInput, horizontalPadding, verticalPadding]) {
    await expect(input).toHaveValue("");
    await expect(input).toHaveAttribute("placeholder", "Mixed");
  }
  await expect(inspector.locator("[data-frame-direction][aria-pressed='true']")).toHaveCount(0);
  await expect(inspector.locator("[data-frame-alignment][aria-pressed='true']")).toHaveCount(0);

  await widthInput.fill("180");
  await widthInput.press("Enter");
  const heightControl = inspector.locator('[data-size-combobox="frame-height"]');
  await heightControl.getByRole("button", { name: "Open frame height sizing options" }).click();
  await heightControl.getByRole("option", { name: "Fill container" }).click();
  await inspector.getByRole("button", { name: "Horizontal", exact: true }).click();
  await inspector.getByRole("button", { name: "Align horizontal and vertical center" }).click();
  await gapInput.fill("18");
  await gapInput.press("Tab");
  await radiusInput.fill("10");
  await radiusInput.press("Tab");
  await horizontalPadding.fill("24");
  await horizontalPadding.press("Tab");
  await verticalPadding.fill("16");
  await verticalPadding.press("Tab");

  for (let index = 0; index < 2; index += 1) {
    await expect(previews.nth(index)).toHaveAttribute("aria-selected", "true");
    await expect(roots.nth(index)).toHaveCSS("width", "180px");
    await expect(roots.nth(index)).toHaveAttribute("data-height-mode", "fill");
    await expect(roots.nth(index)).toHaveAttribute("style", /height: 100%/);
    await expect(roots.nth(index)).toHaveCSS("flex-direction", "row");
    await expect(roots.nth(index)).toHaveCSS("align-items", "center");
    await expect(roots.nth(index)).toHaveCSS("justify-content", "center");
    await expect(roots.nth(index)).toHaveCSS("gap", "18px");
    await expect(roots.nth(index)).toHaveCSS("border-radius", "10px");
    await expect(roots.nth(index)).toHaveCSS("padding-left", "24px");
    await expect(roots.nth(index)).toHaveCSS("padding-right", "24px");
    await expect(roots.nth(index)).toHaveCSS("padding-top", "16px");
    await expect(roots.nth(index)).toHaveCSS("padding-bottom", "16px");
  }
  await expect(previews.nth(2)).toHaveAttribute("aria-selected", "false");
  await expect(roots.nth(2)).toHaveCSS("width", "220px");
  await expect(roots.nth(2)).toHaveCSS("height", "180px");
  await expect(roots.nth(2)).toHaveCSS("gap", "30px");
  await expect(roots.nth(2)).toHaveCSS("padding-top", "30px");

  await page.keyboard.press("ControlOrMeta+z");
  await expect(roots.nth(0)).toHaveCSS("padding-top", "10px");
  await expect(roots.nth(1)).toHaveCSS("padding-top", "14px");
  await expect(previews.nth(0)).toHaveAttribute("aria-selected", "true");
  await expect(previews.nth(1)).toHaveAttribute("aria-selected", "true");
  await expect(roots.nth(2)).toHaveCSS("padding-top", "30px");

  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(roots.nth(0)).toHaveCSS("padding-top", "16px");
  await expect(roots.nth(1)).toHaveCSS("padding-top", "16px");
});

test("bulk-edits fill and border for selected variant roots", async ({ page }) => {
  await openApp(page);
  await page.getByRole("button", { name: "Add variant preview" }).click();
  await page.getByRole("button", { name: "Add variant preview" }).click();

  await page.evaluate(() => {
    const [first, second, third] = variantModel.getInstances();
    const setPaint = (instance, values) => {
      Object.entries(values).forEach(([property, value]) => {
        upsertLocalVariantOverride(instance, "component:0", property, value);
      });
    };
    setPaint(first, {
      backgroundColor: "#CC0000",
      outlineColor: "#0000CC",
      outlineColorOpacity: "100",
      outlineWeight: "1",
      outlinePosition: "inside",
    });
    setPaint(second, {
      backgroundColor: "rgba(0, 170, 0, 0.5)",
      outlineColor: "#CCAA00",
      outlineColorOpacity: "60",
      outlineWeight: "2",
      outlinePosition: "outside",
    });
    setPaint(third, {
      backgroundColor: "#663399",
      outlineColor: "#008888",
      outlineColorOpacity: "80",
      outlineWeight: "3",
      outlinePosition: "center",
    });
    renderVariantInstances();
    selectVariantInstances([first.id, second.id], second.id);
    updateInspector();
  });

  const inspector = page.locator("[data-frame-inspector]");
  const previews = page.locator(".variant-preview");
  const roots = previews.locator(".canvas-root-stack");
  const selectionColors = inspector.locator(":scope > [data-selection-colors]");
  const fillSection = inspector.locator(":scope > [data-paint-section]").filter({ hasText: "Fill" });
  const borderSection = inspector.locator(":scope > [data-paint-section]").filter({ hasText: "Border" });

  await expect(selectionColors.locator('[data-color-control="selection"]')).toHaveCount(4);
  await expect(fillSection.getByText("Click + to combine colors", { exact: true })).toBeVisible();
  await expect(borderSection.getByText("Click + to combine colors", { exact: true })).toBeVisible();

  const firstSelectionColor = selectionColors.getByRole("textbox", { name: "Selection color 1 hex value" });
  await expect(firstSelectionColor).toHaveValue("CC0000");
  await firstSelectionColor.fill("EE4400");
  await expect(roots.nth(0)).toHaveCSS("background-color", "rgb(238, 68, 0)");
  await expect(roots.nth(1)).toHaveCSS("background-color", "rgba(0, 170, 0, 0.5)");
  await expect(roots.nth(2)).toHaveCSS("background-color", "rgb(102, 51, 153)");

  await page.getByRole("button", { name: "Add frame fill" }).click();
  const fillHex = page.getByRole("textbox", { name: "Frame background hex value" });
  const fillOpacity = page.getByRole("textbox", { name: "Frame background opacity" });
  await expect(fillHex).toHaveValue("EE4400");
  await fillHex.fill("336699");
  await fillOpacity.fill("40");
  for (let index = 0; index < 2; index += 1) {
    await expect(roots.nth(index)).toHaveCSS("background-color", "rgba(51, 102, 153, 0.4)");
  }
  await expect(roots.nth(2)).toHaveCSS("background-color", "rgb(102, 51, 153)");

  await page.getByRole("button", { name: "Add frame border" }).click();
  const borderHex = page.getByRole("textbox", { name: "Frame outline hex value" });
  const borderOpacity = page.getByRole("textbox", { name: "Frame outline opacity" });
  await expect(borderHex).toHaveValue("0000CC");
  await borderHex.fill("445566");
  await borderOpacity.fill("50");
  await page.getByRole("button", { name: "Open border position options" }).click();
  await page.getByRole("option", { name: "Center", exact: true }).click();
  const borderWeight = page.getByRole("spinbutton", { name: "Weight" });
  await borderWeight.fill("4");
  await borderWeight.press("Tab");

  for (let index = 0; index < 2; index += 1) {
    await expect(previews.nth(index)).toHaveAttribute("aria-selected", "true");
    await expect(roots.nth(index)).toHaveAttribute("data-outline-color", "#445566");
    await expect(roots.nth(index)).toHaveAttribute("data-outline-color-opacity", "50");
    await expect(roots.nth(index)).toHaveAttribute("data-outline-position", "center");
    await expect(roots.nth(index)).toHaveAttribute("data-outline-weight", "4");
  }
  await expect(previews.nth(2)).toHaveAttribute("aria-selected", "false");
  await expect(roots.nth(2)).toHaveCSS("background-color", "rgb(102, 51, 153)");
  await expect(roots.nth(2)).toHaveAttribute("data-outline-color", "#008888");
  await expect(roots.nth(2)).toHaveAttribute("data-outline-color-opacity", "80");
  await expect(roots.nth(2)).toHaveAttribute("data-outline-position", "center");
  await expect(roots.nth(2)).toHaveAttribute("data-outline-weight", "3");

  await page.keyboard.press("ControlOrMeta+z");
  await expect(roots.nth(0)).toHaveAttribute("data-outline-weight", "1");
  await expect(roots.nth(1)).toHaveAttribute("data-outline-weight", "2");
  await expect(roots.nth(2)).toHaveAttribute("data-outline-weight", "3");
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(roots.nth(0)).toHaveAttribute("data-outline-weight", "4");
  await expect(roots.nth(1)).toHaveAttribute("data-outline-weight", "4");
});

test("keeps border position and weight visible for partial variant borders", async ({ page }) => {
  await openApp(page);
  await page.getByRole("button", { name: "Add variant preview" }).click();

  await page.evaluate(() => {
    const [first, second] = variantModel.getInstances();
    upsertLocalVariantOverride(first, "component:0", "outlineColor", "#336699");
    upsertLocalVariantOverride(first, "component:0", "outlineColorOpacity", "100");
    upsertLocalVariantOverride(first, "component:0", "outlinePosition", "inside");
    upsertLocalVariantOverride(first, "component:0", "outlineWeight", "1");
    upsertLocalVariantOverride(second, "component:0", "outlineColor", "");
    upsertLocalVariantOverride(second, "component:0", "outlinePosition", "outside");
    upsertLocalVariantOverride(second, "component:0", "outlineWeight", "2");
    renderVariantInstances();
    selectVariantInstances([first.id, second.id], second.id);
    updateInspector();
  });

  const inspector = page.locator("[data-frame-inspector]");
  const borderSection = inspector.locator(":scope > [data-paint-section]").filter({ hasText: "Border" });
  const borderControls = inspector.locator("[data-frame-outline-controls]");
  const position = page.getByRole("combobox", { name: "Position" });
  const weight = page.getByRole("spinbutton", { name: "Weight" });

  await expect(borderSection.getByText("Click + to combine colors", { exact: true })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Frame outline hex value" })).toBeHidden();
  await expect(borderControls).toBeVisible();
  await expect(position).toHaveValue("");
  await expect(position).toHaveAttribute("placeholder", "Mixed");
  await expect(weight).toHaveValue("");
  await expect(weight).toHaveAttribute("placeholder", "Mixed");
});

test("displays and bulk-edits simple properties for multiple selected frames", async ({ page }) => {
  await openApp(page);

  await page.evaluate(() => {
    const first = createCanvasFrame(0, 0, currentComponent.frameRecord, { select: false });
    const second = createCanvasFrame(0, 0, currentComponent.frameRecord, { select: false });
    Object.assign(first.element.dataset, {
      width: "120",
      height: "100",
      direction: "horizontal",
      alignment: "top-left",
      gap: "12",
      gapMode: "fixed",
      radius: "8",
      paddingLeft: "16",
      paddingTop: "12",
      paddingRight: "16",
      paddingBottom: "12",
      frameColor: "#CC5500",
      frameColorOpacity: "100",
      htmlTag: "div",
    });
    Object.assign(second.element.dataset, {
      width: "120",
      height: "140",
      direction: "vertical",
      alignment: "bottom-right",
      gap: "24",
      gapMode: "fixed",
      radius: "8",
      paddingLeft: "16",
      paddingTop: "20",
      paddingRight: "16",
      paddingBottom: "20",
      frameColor: "#336699",
      frameColorOpacity: "100",
      htmlTag: "div",
    });
    first.element.style.width = "120px";
    first.element.style.height = "100px";
    second.element.style.width = "120px";
    second.element.style.height = "140px";
    first.element.style.backgroundColor = "#CC5500";
    second.element.style.backgroundColor = "#336699";
    selectLayerKeys([`frame:${first.id}`, `frame:${second.id}`], `frame:${second.id}`);
    syncElementSelectionStyles();
    updateInspector();
  });

  const inspector = page.locator("[data-frame-inspector]");
  await expect(inspector).toBeVisible();
  await expect(inspector.getByRole("heading", { name: "Frames", exact: true })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Frame width" })).toHaveValue("120");
  await expect(page.getByRole("combobox", { name: "Frame height" })).toHaveValue("");
  await expect(page.getByRole("combobox", { name: "Frame height" })).toHaveAttribute("placeholder", "Mixed");
  await expect(page.locator("#frame-gap")).toHaveValue("");
  await expect(page.locator("#frame-gap")).toHaveAttribute("placeholder", "Mixed");
  await expect(page.getByRole("spinbutton", { name: "Radius" })).toHaveValue("8");
  await expect(page.getByRole("textbox", { name: "Horizontal padding" })).toHaveValue("16");
  await expect(page.getByRole("textbox", { name: "Vertical padding" })).toHaveValue("");
  await expect(page.getByRole("textbox", { name: "Vertical padding" })).toHaveAttribute("placeholder", "Mixed");
  await expect(inspector.locator("[data-frame-direction][aria-pressed='true']")).toHaveCount(0);
  await expect(inspector.locator("[data-frame-alignment][aria-pressed='true']")).toHaveCount(0);
  await expect(page.getByRole("combobox", { name: "Frame width" })).toBeEnabled();
  await expect(page.getByRole("spinbutton", { name: "Radius" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Horizontal", exact: true })).toBeEnabled();
  const selectionColors = inspector.locator(":scope > [data-selection-colors]");
  await expect(selectionColors.locator('[data-color-control="selection"]')).toHaveCount(2);
  await expect(selectionColors.getByRole("textbox", { name: "Selection color 1 hex value" })).toHaveValue("CC5500");
  await expect(selectionColors.getByRole("textbox", { name: "Selection color 2 hex value" })).toHaveValue("336699");
  await expect(inspector.locator(":scope > [data-paint-section]").first()).toBeVisible();
  await expect(inspector.locator(":scope > [data-paint-section]").last()).toBeVisible();

  const frames = page.locator("[data-canvas-root-stack] > [data-frame-id]");
  await selectionColors.getByRole("textbox", { name: "Selection color 1 hex value" }).fill("7A3E9D");
  await expect(frames.nth(0)).toHaveAttribute("data-frame-color", "#7A3E9D");
  await expect(frames.nth(1)).toHaveAttribute("data-frame-color", "#336699");
  const fillSection = inspector.locator(':scope > [data-paint-section]').filter({ hasText: "Fill" });
  await expect(fillSection.getByText("Click + to combine colors", { exact: true })).toBeVisible();
  await expect(fillSection.locator("[data-tooltip-content]")).toHaveText("Add fill");
  const bulkFillHex = page.getByRole("textbox", { name: "Frame background hex value" });
  await expect(bulkFillHex).toBeHidden();
  await page.getByRole("button", { name: "Add frame fill" }).click();
  await expect(frames.nth(0)).toHaveAttribute("data-frame-color", "#7A3E9D");
  await expect(frames.nth(1)).toHaveAttribute("data-frame-color", "#7A3E9D");
  await expect(fillSection.getByText("Click + to combine colors", { exact: true })).toBeHidden();
  await expect(bulkFillHex).toHaveValue("7A3E9D");
  await bulkFillHex.fill("00AA00");
  await expect(frames.nth(0)).toHaveAttribute("data-frame-color", "#00AA00");
  await expect(frames.nth(1)).toHaveAttribute("data-frame-color", "#00AA00");
  await expect(selectionColors).toBeHidden();

  const widthControl = inspector.locator('[data-size-combobox="frame-width"]');
  const widthInput = widthControl.getByRole("combobox", { name: "Frame width" });
  await widthInput.fill("200");
  await widthInput.press("Enter");
  for (let index = 0; index < 2; index += 1) {
    await expect(frames.nth(index)).toHaveAttribute("data-width-mode", "fixed");
    await expect(frames.nth(index)).toHaveCSS("width", "200px");
  }
  await page.keyboard.press("ControlOrMeta+z");
  await expect(frames.nth(0)).toHaveCSS("width", "120px");
  await expect(frames.nth(1)).toHaveCSS("width", "120px");
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(frames.nth(0)).toHaveCSS("width", "200px");
  await expect(frames.nth(1)).toHaveCSS("width", "200px");

  const heightControl = inspector.locator('[data-size-combobox="frame-height"]');
  await heightControl.getByRole("button", { name: "Open frame height sizing options" }).click();
  await heightControl.getByRole("option", { name: "Fill container" }).click();
  for (let index = 0; index < 2; index += 1) {
    await expect(frames.nth(index)).toHaveAttribute("data-height-mode", "fill");
    await expect(frames.nth(index)).toHaveAttribute("style", /height: auto/);
    await expect(frames.nth(index)).toHaveCSS("align-self", "stretch");
  }
  await heightControl.getByRole("button", { name: "Open frame height sizing options" }).click();
  await heightControl.getByRole("option", { name: "Fixed height" }).click();
  await expect(frames.nth(0)).toHaveCSS("height", "100px");
  await expect(frames.nth(1)).toHaveCSS("height", "140px");
  const heightInput = heightControl.getByRole("combobox", { name: "Frame height" });
  await heightInput.fill("160");
  await heightInput.press("Enter");
  await expect(frames.nth(0)).toHaveCSS("height", "160px");
  await expect(frames.nth(1)).toHaveCSS("height", "160px");

  await page.getByRole("spinbutton", { name: "Radius" }).fill("10");
  await page.getByRole("spinbutton", { name: "Radius" }).press("Tab");
  await page.getByRole("textbox", { name: "Horizontal padding" }).fill("24");
  await page.getByRole("textbox", { name: "Horizontal padding" }).press("Tab");
  await page.locator("#frame-gap").fill("18");
  await page.locator("#frame-gap").press("Tab");
  await inspector.getByRole("button", { name: "Horizontal", exact: true }).click();
  await inspector.getByRole("button", { name: "Align horizontal and vertical center" }).click();
  await inspector.getByRole("button", { name: "Open HTML tag options" }).click();
  await inspector.getByRole("option", { name: "button", exact: true }).click();

  for (let index = 0; index < 2; index += 1) {
    await expect(frames.nth(index)).toHaveAttribute("data-radius", "10");
    await expect(frames.nth(index)).toHaveAttribute("data-padding-left", "24");
    await expect(frames.nth(index)).toHaveAttribute("data-padding-right", "24");
    await expect(frames.nth(index)).toHaveAttribute("data-gap", "18");
    await expect(frames.nth(index)).toHaveAttribute("data-direction", "horizontal");
    await expect(frames.nth(index)).toHaveAttribute("data-alignment", "center");
    await expect(frames.nth(index)).toHaveAttribute("data-html-tag", "button");
  }

  await page.keyboard.press("ControlOrMeta+z");
  await expect(frames.nth(0)).toHaveAttribute("data-html-tag", "div");
  await expect(frames.nth(1)).toHaveAttribute("data-html-tag", "div");
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(frames.nth(0)).toHaveAttribute("data-html-tag", "button");
  await expect(frames.nth(1)).toHaveAttribute("data-html-tag", "button");

  await page.evaluate(() => {
    const first = getSelectedFrameRecords()[0];
    selectLayerKeys([`frame:${first.id}`], `frame:${first.id}`);
    syncElementSelectionStyles();
    updateInspector();
  });
  await expect(inspector.getByRole("heading", { name: "Frame", exact: true })).toBeVisible();
  await expect(page.getByRole("spinbutton", { name: "Radius" })).toBeEnabled();
  await page.getByRole("spinbutton", { name: "Radius" }).fill("12");
  await page.getByRole("spinbutton", { name: "Radius" }).press("Tab");
  await expect(page.locator('[data-frame-id="1"]')).toHaveAttribute("data-radius", "12");
  await expect(page.locator('[data-frame-id="2"]')).toHaveAttribute("data-radius", "10");
});

test("bulk-edits shared frame fill and border colors", async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => {
    const frames = [
      createCanvasFrame(0, 0, currentComponent.frameRecord, { select: false }),
      createCanvasFrame(0, 0, currentComponent.frameRecord, { select: false }),
    ];
    frames.forEach((record) => {
      record.element.dataset.frameColor = "#336699";
      record.element.dataset.frameColorOpacity = "100";
      record.element.style.backgroundColor = "#336699";
    });
    const keys = frames.map((record) => `frame:${record.id}`);
    selectLayerKeys(keys, keys.at(-1));
    syncElementSelectionStyles();
    updateInspector();
  });

  const frames = page.locator("[data-canvas-root-stack] > [data-frame-id]");
  await expect(page.locator("[data-frame-inspector] > [data-selection-colors]")).toBeHidden();
  const fillHex = page.getByRole("textbox", { name: "Frame background hex value" });
  await fillHex.fill("CC5500");
  for (let index = 0; index < 2; index += 1) {
    await expect(frames.nth(index)).toHaveAttribute("data-frame-color", "#CC5500");
    await expect(frames.nth(index)).toHaveCSS("background-color", "rgb(204, 85, 0)");
  }
  const fillOpacity = page.getByRole("textbox", { name: "Frame background opacity" });
  await fillOpacity.fill("50");
  for (let index = 0; index < 2; index += 1) {
    await expect(frames.nth(index)).toHaveCSS("background-color", "rgba(204, 85, 0, 0.5)");
  }
  await page.getByRole("button", { name: "Remove frame fill" }).click();
  for (let index = 0; index < 2; index += 1) {
    await expect(frames.nth(index)).toHaveAttribute("data-frame-color", "");
  }

  await page.getByRole("button", { name: "Add frame border" }).click();
  const borderHex = page.getByRole("textbox", { name: "Frame outline hex value" });
  await borderHex.fill("445566");
  const borderOpacity = page.getByRole("textbox", { name: "Frame outline opacity" });
  await borderOpacity.fill("40");
  for (let index = 0; index < 2; index += 1) {
    await expect(frames.nth(index)).toHaveAttribute("data-outline-color", "#445566");
    await expect(frames.nth(index)).toHaveAttribute("data-outline-color-opacity", "40");
    await expect(frames.nth(index)).toHaveCSS("box-shadow", "rgba(68, 85, 102, 0.4) 0px 0px 0px 1px inset");
  }
  await page.getByRole("button", { name: "Remove frame border" }).click();
  for (let index = 0; index < 2; index += 1) {
    await expect(frames.nth(index)).toHaveAttribute("data-outline-color", "");
  }

  await page.keyboard.press("ControlOrMeta+z");
  for (let index = 0; index < 2; index += 1) {
    await expect(frames.nth(index)).toHaveAttribute("data-outline-color", "#445566");
  }
});

test("combines partial frame paints from the first layer in tree order", async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => {
    const first = createCanvasFrame(0, 0, currentComponent.frameRecord, { select: false });
    const second = createCanvasFrame(0, 0, currentComponent.frameRecord, { select: false });
    Object.assign(first.element.dataset, {
      frameColor: "",
      frameColorOpacity: "100",
      outlineColor: "#336699",
      outlineColorOpacity: "40",
      outlineWeight: "2",
    });
    Object.assign(second.element.dataset, {
      frameColor: "#CC5500",
      frameColorOpacity: "60",
      outlineColor: "",
      outlineColorOpacity: "100",
    });
    second.element.style.backgroundColor = getColorWithOpacity("#CC5500", 60);
    applyFrameOutline(first.element);
    const keys = [`frame:${second.id}`, `frame:${first.id}`];
    selectLayerKeys(keys, keys[0]);
    syncElementSelectionStyles();
    updateInspector();
  });

  const inspector = page.locator("[data-frame-inspector]");
  const paintSections = inspector.locator(":scope > [data-paint-section]");
  const fillSection = paintSections.first();
  const borderSection = paintSections.last();
  const frames = page.locator("[data-canvas-root-stack] > [data-frame-id]");
  const fillMixedMessage = fillSection.getByText("Click + to combine colors", { exact: true });
  await expect(fillMixedMessage).toBeVisible();
  await expect(fillMixedMessage).toHaveCSS("font-size", "14px");
  await expect(fillMixedMessage).toHaveCSS("line-height", "16px");
  await expect(borderSection.getByText("Click + to combine colors", { exact: true })).toBeVisible();
  await expect(fillSection.locator("[data-tooltip-content]")).toHaveText("Add fill");
  await expect(borderSection.locator("[data-tooltip-content]")).toHaveText("Add border");

  await page.getByRole("button", { name: "Add frame fill" }).click();
  for (let index = 0; index < 2; index += 1) {
    await expect(frames.nth(index)).toHaveAttribute("data-frame-color", "#CC5500");
    await expect(frames.nth(index)).toHaveAttribute("data-frame-color-opacity", "60");
  }
  await expect(fillSection.getByText("Click + to combine colors", { exact: true })).toBeHidden();

  await page.getByRole("button", { name: "Add frame border" }).click();
  for (let index = 0; index < 2; index += 1) {
    await expect(frames.nth(index)).toHaveAttribute("data-outline-color", "#336699");
    await expect(frames.nth(index)).toHaveAttribute("data-outline-color-opacity", "40");
  }
  await expect(borderSection.getByText("Click + to combine colors", { exact: true })).toBeHidden();

  await page.keyboard.press("ControlOrMeta+z");
  await expect(frames.nth(0)).toHaveAttribute("data-outline-color", "#336699");
  await expect(frames.nth(1)).toHaveAttribute("data-outline-color", "");
  await expect(frames.nth(0)).toHaveAttribute("aria-selected", "true");
  await expect(frames.nth(1)).toHaveAttribute("aria-selected", "true");

  await page.keyboard.press("ControlOrMeta+z");
  await expect(frames.nth(0)).toHaveAttribute("data-frame-color", "");
  await expect(frames.nth(1)).toHaveAttribute("data-frame-color", "#CC5500");
});

test("changes the frame HTML tag and supports undo and redo", async ({ page }) => {
  await openApp(page);

  const component = page.locator("[data-canvas-root-stack]");
  await page.getByRole("button", { name: "Open HTML tag options" }).click();
  await page.getByRole("option", { name: "button", exact: true }).click();
  await expect(component).toHaveAttribute("data-html-tag", "button");

  await page.keyboard.press("ControlOrMeta+z");
  await expect(component).toHaveAttribute("data-html-tag", "div");

  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(component).toHaveAttribute("data-html-tag", "button");
});

test("changes frame sizing modes and supports undo and redo", async ({ page }) => {
  await openApp(page);

  const component = page.locator("[data-canvas-root-stack]");
  const widthControl = page.locator('[data-size-combobox="frame-width"]');
  const widthInput = widthControl.getByRole("combobox", { name: "Frame width" });

  await widthControl.getByRole("button", { name: "Open frame width sizing options" }).click();
  await widthControl.getByRole("option", { name: "Fixed width" }).click();
  await expect(component).toHaveAttribute("data-width-mode", "fixed");

  await widthInput.fill("160");
  await widthInput.press("Enter");
  await expect(component).toHaveCSS("width", "160px");

  await widthControl.getByRole("button", { name: "Open frame width sizing options" }).click();
  await widthControl.getByRole("option", { name: "Fill container" }).click();
  await expect(component).toHaveAttribute("data-width-mode", "fill");
  await expect(component).toHaveAttribute("style", /width: 100%/);

  await page.keyboard.press("ControlOrMeta+z");
  await expect(component).toHaveAttribute("data-width-mode", "fixed");
  await expect(component).toHaveCSS("width", "160px");

  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(component).toHaveAttribute("data-width-mode", "fill");
  await expect(component).toHaveAttribute("style", /width: 100%/);
});

test("changes text color and supports undo and redo", async ({ page }) => {
  await openApp(page);

  const text = await createTextLayer(page, "Color target");

  const colorHex = page.getByRole("textbox", { name: "Text color hex value" });
  await colorHex.fill("7A3E9D");
  await colorHex.press("Enter");
  await expect(text).toHaveCSS("color", "rgb(122, 62, 157)");

  await page.keyboard.press("ControlOrMeta+z");
  await expect(text).toHaveCSS("color", "rgb(0, 0, 0)");

  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(text).toHaveCSS("color", "rgb(122, 62, 157)");
});

test("keeps a selected text range highlighted while using the color picker", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1000 });
  await openApp(page);
  const text = await createTextLayer(page, "Color target");
  await text.dblclick();
  await text.evaluate((element) => {
    const range = document.createRange();
    range.setStart(element.firstChild, 0);
    range.setEnd(element.firstChild, 5);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  });

  const highlightedRange = () => page.evaluate(() => {
    const highlight = CSS.highlights.get("text-color-picker-selection");
    const activeRange = getActiveTextRangeSelection(getSelectedTextRecord());
    return {
      activeOffsets: activeRange ? [activeRange.start, activeRange.end] : null,
      highlightedText: highlight ? [...highlight].map((range) => range.toString()).join("") : "",
    };
  });
  const expectRangeHighlighted = () => expect.poll(highlightedRange).toEqual({
    activeOffsets: [0, 5],
    highlightedText: "Color",
  });
  const expectRangeRetainedButHidden = () => expect.poll(highlightedRange).toEqual({
    activeOffsets: [0, 5],
    highlightedText: "",
  });

  await page.getByRole("button", { name: "Choose text color" }).click();
  const picker = page.getByRole("dialog", { name: "Color picker" });
  await expect(picker).toBeVisible();
  await expectRangeHighlighted();

  const opacitySlider = picker.getByRole("slider", { name: "Opacity", exact: true });
  const opacitySliderBounds = await opacitySlider.boundingBox();
  expect(opacitySliderBounds).not.toBeNull();
  await page.mouse.move(opacitySliderBounds.x + 1, opacitySliderBounds.y + 8);
  await page.mouse.down();
  await expectRangeHighlighted();
  await page.mouse.up();

  const saturationValue = picker.getByRole("slider", { name: "Saturation and value" });
  const saturationValueBounds = await saturationValue.boundingBox();
  expect(saturationValueBounds).not.toBeNull();
  await page.mouse.move(saturationValueBounds.x + 40, saturationValueBounds.y + 30);
  await page.mouse.down();
  await expectRangeRetainedButHidden();
  await page.mouse.move(saturationValueBounds.x + 80, saturationValueBounds.y + 45);
  await expectRangeRetainedButHidden();
  await page.mouse.up();
  await expectRangeHighlighted();
  await picker.getByRole("slider", { name: "Hue", exact: true }).click({ position: { x: 60, y: 8 } });
  await expectRangeHighlighted();
  await picker.getByRole("slider", { name: "Opacity", exact: true }).click({ position: { x: 40, y: 8 } });
  await expectRangeHighlighted();

  const hex = picker.getByRole("textbox", { name: "Hex color value" });
  await hex.click();
  await expectRangeHighlighted();
  await hex.fill("336699");
  await expectRangeRetainedButHidden();
  await hex.press("Enter");
  await expectRangeHighlighted();
  const opacity = picker.getByRole("textbox", { name: "Color opacity" });
  await opacity.click();
  await expectRangeHighlighted();
  await opacity.fill("75");
  await expectRangeRetainedButHidden();
  await opacity.press("Tab");
  await expectRangeHighlighted();

  await page.keyboard.press("Escape");
  await expect(picker).toBeHidden();
  await expect.poll(() => page.evaluate(() => CSS.highlights.has("text-color-picker-selection"))).toBe(false);
});

test("edits and consolidates color runs inside one selected text layer", async ({ page }) => {
  await openApp(page);
  const text = await createTextLayer(page, "Red black");
  await text.dblclick();
  await text.evaluate((element) => {
    const node = element.firstChild;
    const range = document.createRange();
    range.setStart(node, 0);
    range.setEnd(node, 3);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  });

  const fillSection = page.locator("[data-text-inspector] > [data-paint-section]");
  const fillHex = page.getByRole("textbox", { name: "Text color hex value" });
  await expect(fillSection).toBeVisible();
  await fillHex.fill("FF0000");
  await fillHex.press("Enter");
  await expect(text.locator('[data-rich-text-color="#FF0000"]')).toHaveText("Red");
  await expect(text).toHaveText("Red black");

  await text.click();
  const section = page.locator("[data-selection-colors]");
  await expect.poll(() => text.evaluate((element) => {
    const record = getSelectedTextRecord();
    const members = createTextRangeColorMembers(record, {
      element,
      start: 0,
      end: element.textContent.length,
    });
    return {
      active: Boolean(getActiveTextRangeSelection(record)),
      colors: members.map((member) => member.color),
      editable: element.isContentEditable,
    };
  })).toEqual({ active: false, colors: ["#FF0000", "#000000"], editable: false });
  await expect(fillSection).toBeHidden();
  await expect(section.locator('[data-color-control="selection"]')).toHaveCount(2);
  await expect(section.getByRole("textbox", { name: "Selection color 1 hex value" })).toHaveValue("FF0000");
  await expect(section.getByRole("textbox", { name: "Selection color 2 hex value" })).toHaveValue("000000");

  await text.evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  });

  await expect.poll(() => page.evaluate(() => {
    const record = getSelectedTextRecord();
    const range = getActiveTextRangeSelection(record);
    return {
      range: range ? [range.start, range.end] : null,
      colors: getActiveTextRangeColorValues(record).map((value) => value.color),
    };
  })).toEqual({ range: [0, 9], colors: ["#FF0000", "#000000"] });

  await expect(fillSection).toBeHidden();
  await expect(section.locator('[data-color-control="selection"]')).toHaveCount(2);
  await expect(section.getByRole("textbox", { name: "Selection color 1 hex value" })).toHaveValue("FF0000");
  await expect(section.getByRole("textbox", { name: "Selection color 2 hex value" })).toHaveValue("000000");
  const source = await page.evaluate(() => createReactComponentSource("Rich text example"));
  expect(source).toContain("<span style={{ color:");

  const redHex = section.getByRole("textbox", { name: "Selection color 1 hex value" });
  await redHex.fill("000000");
  await redHex.press("Enter");
  await expect(section).toBeHidden();
  await expect(fillSection).toBeVisible();

  await page.keyboard.press("ControlOrMeta+z");
  await expect(text.locator('[data-rich-text-color="#FF0000"]')).toHaveText("Red");
  await expect(section).toBeVisible();
});

test("shows separate selection colors for text runs with the same hex and different opacity", async ({ page }) => {
  await openApp(page);
  const text = await createTextLayer(page, "Full faded");
  await text.evaluate((element) => {
    element.innerHTML = [
      '<span data-rich-text-color="#336699" data-rich-text-color-opacity="100" style="color: #336699">Full</span>',
      '<span data-rich-text-color="#336699" data-rich-text-color-opacity="50" style="color: rgba(51, 102, 153, 0.5)"> faded</span>',
    ].join("");
    const record = getSelectedTextRecord();
    syncTextRecordContent(record, element.textContent, { writeElement: false });
    element.contentEditable = "false";
    clearActiveTextRangeSelection();
    updateInspector();
  });

  const section = page.locator("[data-text-inspector] > [data-selection-colors]");
  const controls = section.locator('[data-color-control="selection"]');
  await expect(section).toBeVisible();
  await expect(controls).toHaveCount(2);
  await expect(section.getByRole("textbox", { name: "Selection color 1 hex value" })).toHaveValue("336699");
  await expect(section.getByRole("textbox", { name: "Selection color 1 opacity" })).toHaveValue("100");
  await expect(section.getByRole("textbox", { name: "Selection color 2 hex value" })).toHaveValue("336699");
  await expect(section.getByRole("textbox", { name: "Selection color 2 opacity" })).toHaveValue("50");
  await expect(page.locator("[data-text-inspector] > [data-paint-section]")).toBeHidden();

  await text.evaluate((element) => {
    element.contentEditable = "true";
    const range = document.createRange();
    range.selectNodeContents(element);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  });
  await expect.poll(() => page.evaluate(() => {
    const range = getActiveTextRangeSelection(getSelectedTextRecord());
    return range ? [range.start, range.end] : null;
  })).toEqual([0, 10]);
  await expect(controls).toHaveCount(2);
});

test("keeps selection colors stable while dragging across differently colored text", async ({ page }) => {
  await openApp(page);
  const text = await createTextLayer(page, "Red black");
  await text.evaluate((element) => {
    element.innerHTML = '<span data-rich-text-color="#FF0000" data-rich-text-color-opacity="100" style="color: #FF0000">Red</span> black';
    syncTextRecordContent(getSelectedTextRecord(), element.textContent, { writeElement: false });
    element.contentEditable = "true";
    updateInspector();
    const section = document.querySelector("[data-selection-colors]");
    window.__selectionColorVisibilityChanges = [];
    window.__selectionColorObserver = new MutationObserver(() => {
      window.__selectionColorVisibilityChanges.push(section.hidden);
    });
    window.__selectionColorObserver.observe(section, { attributes: true, attributeFilter: ["hidden"] });
    element.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0 }));
    const range = document.createRange();
    range.setStart(element.querySelector("span").firstChild, 0);
    range.setEnd(element.querySelector("span").firstChild, 2);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  });

  const section = page.locator("[data-text-inspector] > [data-selection-colors]");
  await page.waitForTimeout(50);
  await expect(section).toBeVisible();
  await text.evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  });
  await page.waitForTimeout(50);
  await expect(section).toBeVisible();
  await page.evaluate(() => document.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, button: 0 })));
  await expect(section.locator('[data-color-control="selection"]')).toHaveCount(2);
  const visibilityChanges = await page.evaluate(() => {
    window.__selectionColorObserver.disconnect();
    return window.__selectionColorVisibilityChanges;
  });
  expect(visibilityChanges).not.toContain(true);
});

test("isolates edits between text selection colors that differ only by opacity", async ({ page }) => {
  await openApp(page);
  const text = await createTextLayer(page, "Full faded");
  await text.evaluate((element) => {
    element.innerHTML = [
      '<span data-rich-text-color="#336699" data-rich-text-color-opacity="100" style="color: #336699">Full</span>',
      '<span data-rich-text-color="#336699" data-rich-text-color-opacity="50" style="color: rgba(51, 102, 153, 0.5)"> faded</span>',
    ].join("");
    syncTextRecordContent(getSelectedTextRecord(), element.textContent, { writeElement: false });
    element.contentEditable = "true";
    const range = document.createRange();
    range.selectNodeContents(element);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  });

  const section = page.locator("[data-text-inspector] > [data-selection-colors]");
  await expect(section.locator('[data-color-control="selection"]')).toHaveCount(2);
  const highlightedText = () => page.evaluate(() => {
    const highlight = CSS.highlights.get("text-color-picker-selection");
    return highlight ? [...highlight].map((range) => range.toString()).join("") : "";
  });

  const secondHex = section.getByRole("textbox", { name: "Selection color 2 hex value" });
  await secondHex.click();
  await expect.poll(highlightedText).toBe("Full faded");
  await secondHex.fill("CC5500");
  await expect.poll(highlightedText).toBe("");
  await secondHex.press("Enter");
  await expect.poll(highlightedText).toBe("Full faded");

  const secondOpacity = section.getByRole("textbox", { name: "Selection color 2 opacity" });
  await secondOpacity.click();
  await expect.poll(highlightedText).toBe("Full faded");
  await secondOpacity.fill("25");
  await expect.poll(highlightedText).toBe("");
  await secondOpacity.press("Tab");
  await expect.poll(highlightedText).toBe("Full faded");

  const fullOpacityRun = text.locator('[data-rich-text-color="#336699"][data-rich-text-color-opacity="100"]');
  const editedRun = text.locator('[data-rich-text-color="#CC5500"][data-rich-text-color-opacity="25"]');
  await expect(fullOpacityRun).toHaveText("Full");
  await expect(fullOpacityRun).toHaveCSS("color", "rgb(51, 102, 153)");
  await expect(editedRun).toHaveText(" faded");
  await expect(editedRun).toHaveCSS("color", "rgba(204, 85, 0, 0.25)");
});

test("keeps the matched run color when selection colors collapse to one", async ({ page }) => {
  await openApp(page);
  const text = await createTextLayer(page, "Red blue");
  await text.evaluate((element) => {
    element.innerHTML = [
      '<span data-rich-text-color="#FF0000" data-rich-text-color-opacity="100" style="color: #FF0000">Red </span>',
      '<span data-rich-text-color="#0000FF" data-rich-text-color-opacity="100" style="color: #0000FF">blue</span>',
    ].join("");
    syncTextRecordContent(getSelectedTextRecord(), element.textContent, { writeElement: false });
    element.contentEditable = "false";
    clearActiveTextRangeSelection();
    updateInspector();
  });

  const section = page.locator("[data-text-inspector] > [data-selection-colors]");
  await expect(section.locator('[data-color-control="selection"]')).toHaveCount(2);
  const blueHex = section.getByRole("textbox", { name: "Selection color 2 hex value" });
  await blueHex.fill("FF0000");
  await blueHex.press("Enter");

  await expect(section).toBeHidden();
  const fillSection = page.locator("[data-text-inspector] > [data-paint-section]");
  await expect(fillSection).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Text color hex value" })).toHaveValue("FF0000");
  await expect(text).toHaveAttribute("data-text-color", "#FF0000");
  await expect(text.locator('[data-rich-text-color="#FF0000"]')).toHaveCount(2);
  await expect(text.locator("span").nth(0)).toHaveCSS("color", "rgb(255, 0, 0)");
  await expect(text.locator("span").nth(1)).toHaveCSS("color", "rgb(255, 0, 0)");

  const fillHex = page.getByRole("textbox", { name: "Text color hex value" });
  await fillHex.fill("00AA00");
  await fillHex.press("Enter");
  await expect(text.locator('[data-rich-text-color="#00AA00"]')).toHaveCount(2);
  await expect(text.locator("span").nth(0)).toHaveCSS("color", "rgb(0, 170, 0)");
  await expect(text.locator("span").nth(1)).toHaveCSS("color", "rgb(0, 170, 0)");
});

test("applies opacity only to the selected sub-range of an existing color run", async ({ page }) => {
  await openApp(page);
  const text = await createTextLayer(page, "RRRRX");
  await text.evaluate((element) => {
    element.innerHTML = '<span data-rich-text-color="#FF0000" data-rich-text-color-opacity="100" style="color: #FF0000">RRRR</span>X';
    syncTextRecordContent(getSelectedTextRecord(), element.textContent, { writeElement: false });
    element.contentEditable = "true";
    const redText = element.querySelector("span").firstChild;
    const range = document.createRange();
    range.setStart(redText, 1);
    range.setEnd(redText, 3);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  });

  await expect(page.locator("[data-text-inspector] > [data-paint-section]")).toBeVisible();
  const opacityScrubber = page.getByRole("button", { name: "Adjust text color opacity" });
  const opacityScrubberBounds = await opacityScrubber.boundingBox();
  expect(opacityScrubberBounds).not.toBeNull();
  await page.mouse.move(
    opacityScrubberBounds.x + opacityScrubberBounds.width / 2,
    opacityScrubberBounds.y + opacityScrubberBounds.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    opacityScrubberBounds.x + opacityScrubberBounds.width / 2 - 50,
    opacityScrubberBounds.y + opacityScrubberBounds.height / 2,
  );
  await page.mouse.up();

  const runs = await text.evaluate(() => getCurrentTextRunData(getSelectedTextRecord()).segments.map((segment) => ({
    start: segment.start,
    end: segment.end,
    color: segment.color,
    opacity: segment.opacity,
  })));
  expect(runs).toEqual([
    { start: 0, end: 1, color: "#FF0000", opacity: 100 },
    { start: 1, end: 3, color: "#FF0000", opacity: 50 },
    { start: 3, end: 4, color: "#FF0000", opacity: 100 },
    { start: 4, end: 5, color: "#000000", opacity: 100 },
  ]);
});

test("isolates a partial run edited through Selection Colors", async ({ page }) => {
  await openApp(page);
  const text = await createTextLayer(page, "RRRRBB");
  await text.evaluate((element) => {
    element.innerHTML = [
      '<span data-rich-text-color="#FF0000" data-rich-text-color-opacity="100" style="color: #FF0000">RRRR</span>',
      '<span data-rich-text-color="#0000FF" data-rich-text-color-opacity="100" style="color: #0000FF">BB</span>',
    ].join("");
    syncTextRecordContent(getSelectedTextRecord(), element.textContent, { writeElement: false });
    element.contentEditable = "true";
    const range = document.createRange();
    range.setStart(element.querySelector("span").firstChild, 2);
    range.setEnd(element.querySelectorAll("span")[1].firstChild, 2);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  });

  const section = page.locator("[data-text-inspector] > [data-selection-colors]");
  await expect(section.locator('[data-color-control="selection"]')).toHaveCount(2);
  const redOpacity = section.getByRole("textbox", { name: "Selection color 1 opacity" });
  await redOpacity.fill("50");
  await redOpacity.press("Tab");

  const runs = await text.evaluate(() => getCurrentTextRunData(getSelectedTextRecord()).segments.map((segment) => ({
    start: segment.start,
    end: segment.end,
    color: segment.color,
    opacity: segment.opacity,
  })));
  expect(runs).toEqual([
    { start: 0, end: 2, color: "#FF0000", opacity: 100 },
    { start: 2, end: 4, color: "#FF0000", opacity: 50 },
    { start: 4, end: 6, color: "#0000FF", opacity: 100 },
  ]);
});

test("shows distinct bulk text colors and edits only matching selected text", async ({ page }) => {
  await openApp(page);

  await page.evaluate(() => {
    const records = ["First", "Second", "Third"].map((textContent) => createCanvasText(
      currentComponent.frameRecord,
      0,
      0,
      { beginEditing: false, isNew: false, textContent },
    ));
    records.forEach((record, index) => {
      const color = index < 2 ? "#112233" : "#445566";
      record.element.dataset.textColor = color;
      record.element.dataset.textColorOpacity = "100";
      record.element.style.color = color;
    });
    const keys = records.map((record) => `text:${record.id}`);
    selectLayerKeys(keys, keys.at(-1));
    syncElementSelectionStyles();
    renderTree();
  });

  const section = page.locator("[data-text-inspector] > [data-selection-colors]");
  const controls = section.locator('[data-color-control="selection"]');
  await expect(section.getByRole("heading", { name: "Selection colors" })).toBeVisible();
  await expect(controls).toHaveCount(2);
  await expect(page.locator("[data-text-inspector] > [data-paint-section]")).toBeHidden();
  await expect(section.getByRole("textbox", { name: "Selection color 1 hex value" })).toHaveValue("112233");
  await expect(section.getByRole("textbox", { name: "Selection color 2 hex value" })).toHaveValue("445566");
  await expect(section).toHaveJSProperty("nextElementSibling", null);

  const firstColor = section.getByRole("textbox", { name: "Selection color 1 hex value" });
  await firstColor.fill("CC5500");
  await firstColor.press("Enter");

  const texts = page.locator("[data-canvas-root-stack] > [data-text-id]");
  await expect(texts.nth(0)).toHaveCSS("color", "rgb(204, 85, 0)");
  await expect(texts.nth(1)).toHaveCSS("color", "rgb(204, 85, 0)");
  await expect(texts.nth(2)).toHaveCSS("color", "rgb(68, 85, 102)");

  const updatedFirstColor = section.getByRole("textbox", { name: "Selection color 1 hex value" });
  await updatedFirstColor.fill("445566");
  await updatedFirstColor.press("Enter");
  await expect(section).toBeHidden();
  await expect(page.locator("[data-text-inspector] > [data-paint-section]")).toBeVisible();
  for (let index = 0; index < 3; index += 1) {
    await expect(texts.nth(index)).toHaveCSS("color", "rgb(68, 85, 102)");
  }

});

test("combines partial text fills from the first painted layer in tree order", async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => {
    const records = ["No fill", "Yellow", "Green"].map((textContent) => createCanvasText(
      currentComponent.frameRecord,
      0,
      0,
      { beginEditing: false, isNew: false, textContent },
    ));
    records[0].element.dataset.textColor = "";
    records[0].element.dataset.textColorOpacity = "0";
    records[0].element.style.color = "transparent";
    records[1].element.dataset.textColor = "#EAB308";
    records[1].element.dataset.textColorOpacity = "70";
    records[1].element.style.color = getColorWithOpacity("#EAB308", 70);
    records[2].element.dataset.textColor = "#22C55E";
    records[2].element.dataset.textColorOpacity = "100";
    records[2].element.style.color = "#22C55E";
    const keys = records.map((record) => `text:${record.id}`).reverse();
    selectLayerKeys(keys, keys[0]);
    syncElementSelectionStyles();
    updateInspector();
  });

  const inspector = page.locator("[data-text-inspector]");
  const fillSection = inspector.locator(":scope > [data-paint-section]");
  const texts = page.locator("[data-canvas-root-stack] > [data-text-id]");
  await expect(fillSection).toBeVisible();
  await expect(fillSection.getByText("Click + to combine colors", { exact: true })).toBeVisible();
  await expect(fillSection.locator("[data-tooltip-content]")).toHaveText("Add fill");
  await expect(page.getByRole("textbox", { name: "Text color hex value" })).toBeHidden();

  await page.getByRole("button", { name: "Add text fill" }).click();
  for (let index = 0; index < 3; index += 1) {
    await expect(texts.nth(index)).toHaveAttribute("data-text-color", "#EAB308");
    await expect(texts.nth(index)).toHaveAttribute("data-text-color-opacity", "70");
  }
  await expect(fillSection.getByText("Click + to combine colors", { exact: true })).toBeHidden();

  await page.keyboard.press("ControlOrMeta+z");
  await expect(texts.nth(0)).toHaveAttribute("data-text-color", "");
  await expect(texts.nth(1)).toHaveAttribute("data-text-color", "#EAB308");
  await expect(texts.nth(2)).toHaveAttribute("data-text-color", "#22C55E");

  await page.evaluate(() => {
    getSelectedTextRecords().forEach(({ element }) => {
      element.dataset.textColor = "";
      element.dataset.textColorOpacity = "0";
      element.style.color = "transparent";
    });
    updateInspector();
  });
  await page.getByRole("button", { name: "Add text fill" }).click();
  for (let index = 0; index < 3; index += 1) {
    await expect(texts.nth(index)).toHaveAttribute("data-text-color", "#000000");
    await expect(texts.nth(index)).toHaveAttribute("data-text-color-opacity", "100");
  }
});

test("applies Fixed, Hug, and Fill sizing modes to selected text layers", async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => {
    const first = createCanvasText(currentComponent.frameRecord, 0, 0, {
      beginEditing: false,
      isNew: false,
      textContent: "First sizing target",
    });
    const second = createCanvasText(currentComponent.frameRecord, 0, 0, {
      beginEditing: false,
      isNew: false,
      textContent: "Second",
    });
    first.element.dataset.widthMode = "fixed";
    first.element.dataset.width = "120";
    applyLayerSizing("text", first);
    applyLayerSizing("text", second);
    const keys = [`text:${first.id}`, `text:${second.id}`];
    selectLayerKeys(keys, keys.at(-1));
    syncElementSelectionStyles();
    updateInspector();
  });

  const texts = page.locator("[data-canvas-root-stack] > [data-text-id]");
  const widthControl = page.locator('[data-size-combobox="text-width"]');
  const widthInput = widthControl.getByRole("combobox", { name: "Text width" });
  await expect(widthInput).toHaveValue("");
  await expect(widthInput).toHaveAttribute("placeholder", "Mixed");
  await expect(widthControl.locator('[data-size-option][aria-selected="true"]')).toHaveCount(0);

  await widthControl.getByRole("button", { name: "Open text width sizing options" }).click();
  await widthControl.getByRole("option", { name: "Fill container" }).click();
  for (let index = 0; index < 2; index += 1) {
    await expect(texts.nth(index)).toHaveAttribute("data-width-mode", "fill");
    await expect(texts.nth(index)).toHaveCSS("flex", "1 1 0px");
  }

  await widthControl.getByRole("button", { name: "Open text width sizing options" }).click();
  await widthControl.getByRole("option", { name: "Hug content" }).click();
  for (let index = 0; index < 2; index += 1) {
    await expect(texts.nth(index)).toHaveAttribute("data-width-mode", "hug");
    await expect(texts.nth(index)).toHaveAttribute("style", /width: max-content/);
  }

  await widthControl.getByRole("button", { name: "Open text width sizing options" }).click();
  await widthControl.getByRole("option", { name: "Fixed width" }).click();
  await widthInput.press("Tab");
  await widthInput.fill("180");
  await widthInput.press("Enter");
  for (let index = 0; index < 2; index += 1) {
    await expect(texts.nth(index)).toHaveAttribute("data-width-mode", "fixed");
    await expect(texts.nth(index)).toHaveCSS("width", "180px");
  }

  await page.keyboard.press("ControlOrMeta+z");
  await expect(texts.nth(0)).toHaveCSS("width", "120px");
  await expect(texts.nth(1)).not.toHaveCSS("width", "180px");
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(texts.nth(0)).toHaveCSS("width", "180px");
  await expect(texts.nth(1)).toHaveCSS("width", "180px");

  const heightControl = page.locator('[data-size-combobox="text-height"]');
  await heightControl.getByRole("button", { name: "Open text height sizing options" }).click();
  await heightControl.getByRole("option", { name: "Fill container" }).click();
  for (let index = 0; index < 2; index += 1) {
    await expect(texts.nth(index)).toHaveAttribute("data-height-mode", "fill");
    await expect(texts.nth(index)).toHaveCSS("align-self", "stretch");
  }
});

test("bulk edits marquee-selected text layers from the inspector", async ({ page }) => {
  await openApp(page);

  const component = page.locator("[data-canvas-root-stack]");
  const texts = component.locator(":scope > [data-text-id]");
  await page.evaluate(() => {
    createCanvasText(currentComponent.frameRecord, 0, 0, {
      beginEditing: false,
      isNew: false,
      textContent: "First",
    });
    createCanvasText(currentComponent.frameRecord, 0, 0, {
      beginEditing: false,
      isNew: false,
      textContent: "Second",
    });
    selectCanvasState();
    syncElementSelectionStyles();
  });

  const componentBounds = await component.boundingBox();
  const firstBounds = await texts.nth(0).boundingBox();
  const secondBounds = await texts.nth(1).boundingBox();
  expect(componentBounds).not.toBeNull();
  expect(firstBounds).not.toBeNull();
  expect(secondBounds).not.toBeNull();
  await page.mouse.move(componentBounds.x - 6, Math.min(firstBounds.y, secondBounds.y) - 2);
  await page.mouse.down();
  await page.mouse.move(
    Math.max(firstBounds.x + firstBounds.width, secondBounds.x + secondBounds.width) + 2,
    Math.max(firstBounds.y + firstBounds.height, secondBounds.y + secondBounds.height) + 2,
    { steps: 8 },
  );
  await page.mouse.up();
  await expect(texts.nth(0)).toHaveAttribute("aria-selected", "true");
  await expect(texts.nth(1)).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("[data-selection-colors]")).toBeHidden();
  await expect(page.locator("[data-text-inspector] > [data-paint-section]")).toBeVisible();

  const fontSize = page.locator("#text-size");
  await fontSize.fill("24");
  await fontSize.press("Enter");
  await page.getByRole("combobox", { name: "Text width" }).fill("180");
  await page.getByRole("combobox", { name: "Text width" }).press("Enter");
  await page.locator("#text-line-height").fill("32");
  await page.locator("#text-line-height").press("Tab");
  await page.locator("#text-letter-spacing").fill("10%");
  await page.locator("#text-letter-spacing").press("Tab");
  await page.getByRole("button", { name: "Open font weight options" }).click();
  await page.getByRole("option", { name: "Bold", exact: true }).click();
  await page.getByRole("button", { name: "Align text vertically and horizontally centered" }).click();
  const colorHex = page.getByRole("textbox", { name: "Text color hex value" });
  await colorHex.fill("7A3E9D");
  await colorHex.press("Enter");

  for (let index = 0; index < 2; index += 1) {
    await expect(texts.nth(index)).toHaveCSS("font-size", "24px");
    await expect(texts.nth(index)).toHaveCSS("width", "180px");
    await expect(texts.nth(index)).toHaveCSS("line-height", "32px");
    await expect(texts.nth(index)).toHaveCSS("letter-spacing", "2.4px");
    await expect(texts.nth(index)).toHaveCSS("font-weight", "700");
    await expect(texts.nth(index)).toHaveCSS("text-align", "center");
    await expect(texts.nth(index)).toHaveCSS("color", "rgb(122, 62, 157)");
  }

  await page.keyboard.press("ControlOrMeta+z");
  await expect(texts.nth(0)).toHaveCSS("color", "rgb(0, 0, 0)");
  await expect(texts.nth(1)).toHaveCSS("color", "rgb(0, 0, 0)");
});

test("shows mixed bulk text values and overrides every selected text layer", async ({ page }) => {
  await openApp(page);

  await page.evaluate(() => {
    const first = createCanvasText(currentComponent.frameRecord, 0, 0, {
      beginEditing: false,
      isNew: false,
      textContent: "First",
    });
    const second = createCanvasText(currentComponent.frameRecord, 0, 0, {
      beginEditing: false,
      isNew: false,
      textContent: "Second",
    });
    Object.assign(first.element.dataset, {
      fontFamily: "Inter",
      fontWeight: "400",
      fontSize: "14",
      lineHeight: "Auto",
      letterSpacing: "0%",
      textColor: "#112233",
    });
    Object.assign(second.element.dataset, {
      fontFamily: "Roboto",
      fontWeight: "700",
      fontSize: "20",
      lineHeight: "28",
      letterSpacing: "10%",
      textColor: "#445566",
    });
    first.element.style.color = "#112233";
    second.element.style.color = "#445566";
    selectLayerKeys([`text:${first.id}`, `text:${second.id}`], `text:${second.id}`);
    syncElementSelectionStyles();
    renderTree();
  });

  for (const selector of ["#text-font", "#text-weight", "#text-size", "#text-line-height", "#text-letter-spacing"]) {
    const input = page.locator(selector);
    await expect(input).toHaveValue("");
    await expect(input).toHaveAttribute("placeholder", "Mixed");
  }
  await expect(page.locator("[data-text-inspector] > [data-paint-section]")).toBeHidden();
  await expect(page.locator("[data-selection-colors]")).toBeVisible();

  await page.getByRole("button", { name: "Open font family options" }).click();
  await page.getByRole("option", { name: "Lato", exact: true }).click();
  await page.getByRole("button", { name: "Open font weight options" }).click();
  await page.getByRole("option", { name: "Regular", exact: true }).click();
  await page.locator("#text-size").fill("24");
  await page.locator("#text-size").press("Enter");
  await page.locator("#text-line-height").fill("32");
  await page.locator("#text-line-height").press("Tab");
  await page.locator("#text-letter-spacing").fill("5%");
  await page.locator("#text-letter-spacing").press("Tab");

  const values = await page.evaluate(() => getSelectedTextRecords().map(({ element }) => ({
    family: element.dataset.fontFamily,
    weight: element.dataset.fontWeight,
    size: element.dataset.fontSize,
    lineHeight: element.dataset.lineHeight,
    letterSpacing: element.dataset.letterSpacing,
  })));
  expect(values).toEqual([
    { family: "Lato", weight: "400", size: "24", lineHeight: "32", letterSpacing: "5%" },
    { family: "Lato", weight: "400", size: "24", lineHeight: "32", letterSpacing: "5%" },
  ]);
  await page.evaluate(() => updateInspector());
  await expect(page.locator("#text-font")).toHaveValue("Lato");
  await expect(page.locator("#text-weight")).toHaveValue("Regular");
  await expect(page.locator("#text-size")).toHaveValue("24");
  await expect(page.locator("#text-line-height")).toHaveValue("32");
  await expect(page.locator("#text-letter-spacing")).toHaveValue("5%");
  await expect(page.locator("#text-size")).not.toHaveAttribute("placeholder", "Mixed");
});

test("shows mixed text alignment and applies one bulk alignment history step", async ({ page }) => {
  await openApp(page);

  await page.evaluate(() => {
    const first = createCanvasText(currentComponent.frameRecord, 0, 0, {
      beginEditing: false,
      isNew: false,
      textContent: "Top left",
    });
    const second = createCanvasText(currentComponent.frameRecord, 0, 0, {
      beginEditing: false,
      isNew: false,
      textContent: "Bottom right",
    });
    first.element.dataset.alignment = "top-left";
    second.element.dataset.alignment = "bottom-right";
    applyTextAlignment(first.element);
    applyTextAlignment(second.element);
    const keys = [`text:${first.id}`, `text:${second.id}`];
    selectLayerKeys(keys, keys.at(-1));
    syncElementSelectionStyles();
    updateInspector();
  });

  const texts = page.locator("[data-canvas-root-stack] > [data-text-id]");
  const selectedAlignmentOptions = page.locator('[data-text-inspector] [data-text-alignment][aria-pressed="true"]');
  await expect(selectedAlignmentOptions).toHaveCount(0);

  await page.getByRole("button", { name: "Align text vertically and horizontally centered" }).click();
  for (let index = 0; index < 2; index += 1) {
    await expect(texts.nth(index)).toHaveAttribute("data-alignment", "center");
    await expect(texts.nth(index)).toHaveAttribute("aria-selected", "true");
  }
  await expect(selectedAlignmentOptions).toHaveCount(1);

  await page.keyboard.press("ControlOrMeta+z");
  await expect(texts.nth(0)).toHaveAttribute("data-alignment", "top-left");
  await expect(texts.nth(1)).toHaveAttribute("data-alignment", "bottom-right");
  await expect(texts.nth(0)).toHaveAttribute("aria-selected", "true");
  await expect(texts.nth(1)).toHaveAttribute("aria-selected", "true");
  await expect(selectedAlignmentOptions).toHaveCount(0);

  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(texts.nth(0)).toHaveAttribute("data-alignment", "center");
  await expect(texts.nth(1)).toHaveAttribute("data-alignment", "center");
});

test("keeps a shift-click text selection through inspector editing and history", async ({ page }) => {
  await openApp(page);

  await page.evaluate(() => {
    createCanvasText(currentComponent.frameRecord, 0, 0, {
      beginEditing: false,
      isNew: false,
      textContent: "First selection",
    });
    createCanvasText(currentComponent.frameRecord, 0, 0, {
      beginEditing: false,
      isNew: false,
      textContent: "Second selection",
    });
    selectCanvasState();
    syncElementSelectionStyles();
  });

  const texts = page.locator("[data-canvas-root-stack] > [data-text-id]");
  await texts.nth(0).click();
  await texts.nth(1).click({ modifiers: ["Shift"] });
  await expect(texts.nth(0)).toHaveAttribute("aria-selected", "true");
  await expect(texts.nth(1)).toHaveAttribute("aria-selected", "true");

  const fontSize = page.locator("#text-size");
  await fontSize.fill("24");
  await fontSize.press("Enter");
  for (let index = 0; index < 2; index += 1) {
    await expect(texts.nth(index)).toHaveCSS("font-size", "24px");
    await expect(texts.nth(index)).toHaveAttribute("aria-selected", "true");
  }

  await page.keyboard.press("ControlOrMeta+z");
  for (let index = 0; index < 2; index += 1) {
    await expect(texts.nth(index)).toHaveCSS("font-size", "14px");
    await expect(texts.nth(index)).toHaveAttribute("aria-selected", "true");
  }

  await texts.nth(1).click({ modifiers: ["Shift"] });
  await expect(texts.nth(0)).toHaveAttribute("aria-selected", "true");
  await expect(texts.nth(1)).toHaveAttribute("aria-selected", "false");
});

test("changes text typography and alignment", async ({ page }) => {
  await openApp(page);

  const text = await createTextLayer(page, "Typography target");
  const sizeInput = page.locator("#text-size");
  const lineHeightInput = page.locator("#text-line-height");
  const letterSpacingInput = page.locator("#text-letter-spacing");

  await sizeInput.fill("24");
  await sizeInput.press("Tab");
  await lineHeightInput.fill("32");
  await lineHeightInput.press("Tab");
  await letterSpacingInput.fill("10%");
  await letterSpacingInput.press("Tab");
  await page.getByRole("button", { name: "Align text vertically and horizontally centered" }).click();

  await expect(text).toHaveCSS("font-size", "24px");
  await expect(text).toHaveCSS("line-height", "32px");
  await expect(text).toHaveCSS("letter-spacing", "2.4px");
  await expect(text).toHaveCSS("text-align", "center");

  await page.keyboard.press("ControlOrMeta+z");
  await expect(text).toHaveCSS("text-align", "left");

  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(text).toHaveCSS("text-align", "center");
});

test("changes text weight and supports undo and redo", async ({ page }) => {
  await openApp(page);

  const text = await createTextLayer(page, "Weight target");
  await page.getByRole("button", { name: "Open font weight options" }).click();
  await page.getByRole("option", { name: "Bold", exact: true }).click();
  await expect(text).toHaveCSS("font-weight", "700");

  await page.keyboard.press("ControlOrMeta+z");
  await expect(text).toHaveCSS("font-weight", "400");

  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(text).toHaveCSS("font-weight", "700");
});

test("changes text sizing modes and supports undo and redo", async ({ page }) => {
  await openApp(page);

  const text = await createTextLayer(page, "Sizing target");
  const widthControl = page.locator('[data-size-combobox="text-width"]');
  const widthInput = widthControl.getByRole("combobox", { name: "Text width" });

  await expect(text).toHaveAttribute("data-width-mode", "hug");
  await widthControl.getByRole("button", { name: "Open text width sizing options" }).click();
  await widthControl.getByRole("option", { name: "Fill container" }).click();
  await expect(text).toHaveAttribute("data-width-mode", "fill");
  await widthInput.press("Enter");

  await widthInput.fill("180");
  await widthInput.press("Enter");
  await expect(text).toHaveAttribute("data-width-mode", "fixed");
  await expect(text).toHaveCSS("width", "180px");

  await page.keyboard.press("ControlOrMeta+z");
  await expect(text).toHaveAttribute("data-width-mode", "fill");

  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(text).toHaveAttribute("data-width-mode", "fixed");
  await expect(text).toHaveCSS("width", "180px");
});

test("changes vector color and supports undo and redo", async ({ page }) => {
  await openApp(page);

  const vector = page.locator('[data-canvas-root-stack] > [data-vector-id="1"]');
  const path = vector.locator("path");
  await dropSvg(
    page,
    "color-target.svg",
    '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><path d="M2 2h20v20H2z" fill="#336699"/></svg>',
  );

  const colorHex = page.getByRole("textbox", { name: "Vector color hex value" });
  await colorHex.fill("CC5500");
  await colorHex.press("Enter");
  await expect(path).toHaveCSS("fill", "rgb(204, 85, 0)");

  await page.keyboard.press("ControlOrMeta+z");
  await expect(path).toHaveCSS("fill", "rgb(51, 102, 153)");

  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(path).toHaveCSS("fill", "rgb(204, 85, 0)");
});

test("bulk edits selected vector dimensions and colors", async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => {
    const definitions = [
      { name: "Red", width: 24, height: 24, color: "#CC0000" },
      { name: "Green", width: 36, height: 40, color: "#00AA00" },
      { name: "Purple", width: 48, height: 52, color: "#663399" },
    ];
    const records = definitions.map((definition) => createCanvasVector({
      name: definition.name,
      width: definition.width,
      height: definition.height,
      source: `<svg xmlns="http://www.w3.org/2000/svg" width="${definition.width}" height="${definition.height}"><path d="M2 2h20v20H2z" fill="${definition.color}"/></svg>`,
    }, 0, 0, currentComponent.frameRecord, { select: false }));
    selectLayerKeys(
      records.slice(0, 2).map((record) => `vector:${record.id}`),
      `vector:${records[1].id}`,
    );
    syncElementSelectionStyles();
    updateInspector();
  });

  const inspector = page.locator("[data-vector-inspector]");
  const vectors = page.locator("[data-canvas-root-stack] > [data-vector-id]");
  const paths = vectors.locator("path");
  const width = page.getByRole("spinbutton", { name: "Vector width" });
  const height = page.getByRole("spinbutton", { name: "Vector height" });
  const selectionColors = inspector.locator(":scope > [data-selection-colors]");

  await expect(inspector.getByRole("heading", { name: "Vectors", exact: true })).toBeVisible();
  await expect(width).toHaveValue("");
  await expect(width).toHaveAttribute("placeholder", "Mixed");
  await expect(height).toHaveValue("");
  await expect(height).toHaveAttribute("placeholder", "Mixed");
  await expect(selectionColors.locator('[data-color-control="selection"]')).toHaveCount(2);
  await expect(inspector.locator(":scope > [data-paint-section]")).toBeHidden();

  const firstColor = selectionColors.getByRole("textbox", { name: "Selection color 1 hex value" });
  await firstColor.fill("EE4400");
  await firstColor.press("Enter");
  await expect(paths.nth(0)).toHaveCSS("fill", "rgb(238, 68, 0)");
  await expect(paths.nth(1)).toHaveCSS("fill", "rgb(0, 170, 0)");
  await expect(paths.nth(2)).toHaveCSS("fill", "rgb(102, 51, 153)");

  const secondColor = selectionColors.getByRole("textbox", { name: "Selection color 2 hex value" });
  await secondColor.fill("EE4400");
  await secondColor.press("Enter");
  await expect(selectionColors).toBeHidden();
  await expect(inspector.locator(":scope > [data-paint-section]")).toBeVisible();

  const color = page.getByRole("textbox", { name: "Vector color hex value" });
  const opacity = page.getByRole("textbox", { name: "Vector color opacity" });
  await color.fill("336699");
  await opacity.fill("50");
  await width.fill("60");
  await width.press("Tab");
  await height.fill("70");
  await height.press("Tab");

  for (let index = 0; index < 2; index += 1) {
    await expect(vectors.nth(index)).toHaveAttribute("aria-selected", "true");
    await expect(vectors.nth(index)).toHaveCSS("width", "60px");
    await expect(vectors.nth(index)).toHaveCSS("height", "70px");
    await expect(paths.nth(index)).toHaveCSS("fill", "rgba(51, 102, 153, 0.5)");
  }
  await expect(vectors.nth(2)).toHaveAttribute("aria-selected", "false");
  await expect(vectors.nth(2)).toHaveCSS("width", "48px");
  await expect(vectors.nth(2)).toHaveCSS("height", "52px");
  await expect(paths.nth(2)).toHaveCSS("fill", "rgb(102, 51, 153)");

  await page.keyboard.press("ControlOrMeta+z");
  await expect(vectors.nth(0)).toHaveCSS("height", "24px");
  await expect(vectors.nth(1)).toHaveCSS("height", "40px");
  await expect(vectors.nth(0)).toHaveAttribute("aria-selected", "true");
  await expect(vectors.nth(1)).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(vectors.nth(0)).toHaveCSS("height", "70px");
  await expect(vectors.nth(1)).toHaveCSS("height", "70px");
});

test("changes vector width and supports undo and redo", async ({ page }) => {
  await openApp(page);

  const vector = page.locator('[data-canvas-root-stack] > [data-vector-id="1"]');
  await dropSvg(
    page,
    "size-target.svg",
    '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><path d="M2 2h20v20H2z" fill="#336699"/></svg>',
  );

  const widthInput = page.getByRole("spinbutton", { name: "Vector width" });
  await widthInput.fill("40");
  await widthInput.press("Tab");
  await expect(vector).toHaveCSS("width", "40px");

  await page.keyboard.press("ControlOrMeta+z");
  await expect(vector).toHaveCSS("width", "24px");

  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(vector).toHaveCSS("width", "40px");
});
