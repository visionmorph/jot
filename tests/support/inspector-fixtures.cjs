async function createTextLayer(page, content = "Text target") {
  const component = page.locator("[data-canvas-root-stack]");
  const text = component.locator(':scope > [data-text-id="1"]');
  await page.getByRole("button", { name: "Text", exact: true }).click();
  await component.click({ position: { x: 50, y: 50 } });
  await text.fill(content);
  await text.press("Escape");
  return text;
}

module.exports = { createTextLayer };
