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

test("removes unsupported important priorities from SVG React styles", async ({ page }) => {
  await openApp(page);

  const source = await page.evaluate(() => {
    const svg = new DOMParser().parseFromString(
      '<svg style="fill: red !important"><path style="stroke: blue !important" /></svg>',
      "image/svg+xml",
    ).documentElement;
    return serializeSvgElementToJsx(svg, 0);
  });

  expect(source).toContain('fill: "red"');
  expect(source).toContain('stroke: "blue"');
  expect(source).not.toContain("!important");
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

test("generates Storybook click actions with a shared fn spy", async ({ page }) => {
  await openApp(page);
  await page.getByRole("button", { name: "Open HTML tag options" }).click();
  await page.getByRole("option", { name: "button", exact: true }).click();
  await page.getByRole("button", { name: "Add prop" }).click();
  await page.getByRole("option", { name: "Action" }).click();

  const source = await page.evaluate(() => createStorySource("Button"));

  expect(source).toContain('import { fn } from "storybook/test";');
  expect(source).toContain('args: {\n    onClick: fn().mockName("onClick"),\n  },');
  expect(source).toContain('onClick: { action: "clicked", control: false }');
  expect(source).not.toContain("storybook/actions");
  expect(source).not.toContain("onClickAction");
});

test("exports lower-camel variant args that select each authored style", async ({ page }) => {
  await openApp(page);

  const { componentSource, storySource } = await page.evaluate(() => {
    const kindProp = {
      id: nextComponentPropId,
      name: "Kind 2",
      type: "enum",
      options: ["primary", "secondary", "tertiary"],
      defaultValue: "primary",
      targetFrameId: null,
      targetTextId: null,
      targetVectorId: null,
      property: "kind",
    };
    nextComponentPropId += 1;
    componentProps.push(kindProp);
    syncComponentPropVariantDefinition(kindProp, { render: false });
    addVariantInstance({ render: false });
    addVariantInstance({ render: false });

    const axis = variantModel.getProps().find((prop) => prop.id === kindProp.variantPropId);
    const colors = ["#0060FF", "#555555", "transparent"];
    const weights = ["400", "600", "700"];
    variantModel.getInstances().forEach((instance, index) => {
      setVariantInstancePropValue(instance, axis.id, axis.options[index]);
      upsertLocalVariantOverride(instance, "component:0", "backgroundColor", colors[index]);
      upsertLocalVariantOverride(instance, "component:0", "fontWeight", weights[index]);
    });

    return {
      componentSource: createReactComponentSource("Button"),
      storySource: createStorySource("Button"),
    };
  });

  expect(componentSource).toContain('kind2 = "primary"');
  expect(componentSource).toContain('JSON.stringify([kind2])');
  expect(componentSource).toContain('"[\\"primary\\"]": "Variant 1"');
  expect(componentSource).toContain('"[\\"secondary\\"]": "Variant 2"');
  expect(componentSource).toContain('"[\\"tertiary\\"]": "Variant 3"');
  expect(componentSource).toContain('backgroundColor: "#0060FF"');
  expect(componentSource).toContain('backgroundColor: "#555555"');
  expect(componentSource).toContain('backgroundColor: "transparent"');
  expect(componentSource).toContain('fontWeight: "400"');
  expect(componentSource).toContain('fontWeight: "600"');
  expect(componentSource).toContain('fontWeight: "700"');
  expect(storySource).toContain('kind2: { control: "select", options: ["primary","secondary","tertiary"] }');
  expect(storySource).not.toContain("Kind2");
});

test("does not render the default variant for an unauthored combination", async ({ page }) => {
  await openApp(page);

  const source = await page.evaluate(() => {
    const kindProp = {
      id: nextComponentPropId,
      name: "Kind",
      type: "enum",
      options: ["primary", "secondary"],
      defaultValue: "primary",
      targetFrameId: null,
      targetTextId: null,
      targetVectorId: null,
      property: "kind",
    };
    nextComponentPropId += 1;
    componentProps.push(kindProp);
    syncComponentPropVariantDefinition(kindProp, { render: false });
    addVariantInstance({ render: false });
    return createReactComponentSource("Button");
  });

  expect(source).toContain("return null;");
  expect(source).toContain("return variants[selectedVariant];");
  expect(source).not.toContain("?? variants[");
});

test("exports action and disabled props for a nested button", async ({ page }) => {
  await openApp(page);

  const { compatibleTargetIds, source } = await page.evaluate(() => {
    const nestedButton = createCanvasFrame(0, 0, currentComponent.frameRecord, { select: false });
    nestedButton.element.dataset.htmlTag = "button";
    const actionProp = {
      id: nextComponentPropId,
      name: "onClick",
      type: "action",
      defaultValue: "",
      targetFrameId: nestedButton.id,
      targetTextId: null,
      targetVectorId: null,
      property: "onClick",
    };
    nextComponentPropId += 1;
    const disabledProp = {
      id: nextComponentPropId,
      name: "Disabled",
      type: "boolean",
      defaultValue: false,
      targetFrameId: nestedButton.id,
      targetTextId: null,
      targetVectorId: null,
      property: "disabled",
    };
    nextComponentPropId += 1;
    componentProps.push(actionProp, disabledProp);
    return {
      compatibleTargetIds: getCompatibleDisabledTargets().map((record) => record.id),
      source: createReactComponentSource("NestedButton"),
    };
  });

  expect(compatibleTargetIds).toEqual([1]);
  expect(source).toContain("function NestedButton({ onClick, disabled = false })");
  expect(source).toContain('<button type="button" disabled={disabled} onClick={onClick}');
});
