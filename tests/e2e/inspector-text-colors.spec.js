const { test, expect } = require("playwright/test");
const { openApp } = require("../support/open-app.cjs");
const { createTextLayer } = require("../support/inspector-fixtures.cjs");

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

