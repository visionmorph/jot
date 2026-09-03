const { test, expect } = require("playwright/test");
const { openApp } = require("../support/open-app.cjs");

test("generates React output with the authored component styles", async ({ page }) => {
  await openApp(page);

  const source = await page.evaluate(() => createReactComponentSource("TestComponent"));

  expect(source).toContain("export default function TestComponent");
  expect(source).toContain('display: "inline-flex"');
  expect(source).toContain('padding: "10px"');
  expect(source).toContain('backgroundColor: "#FFFFFF"');
});

test("converts an SVG into React-compatible JSX", async ({ page }) => {
  await openApp(page);

  const source = await page.evaluate(() => {
    const svg = new DOMParser().parseFromString(
      '<svg viewBox="0 0 10 10"><path stroke-width="2" style="stroke-linecap: round" /></svg>',
      "image/svg+xml",
    ).documentElement;
    return serializeSvgElementToJsx(svg, 0);
  });

  expect(source).toContain('viewBox="0 0 10 10"');
  expect(source).toContain('strokeWidth="2"');
  expect(source).toContain('strokeLinecap: "round"');
});

test("generates React output for authored variants", async ({ page }) => {
  await openApp(page);
  await page.getByRole("button", { name: "Add variant preview" }).click();

  const source = await page.evaluate(() => createReactComponentSource("VariantComponent"));

  expect(source).toContain("export default function VariantComponent");
  expect(source).toContain("const variants = {");
  expect(source).toContain("const authoredCombinations = {");
  expect(source).toContain("const selectedVariant =");
});
