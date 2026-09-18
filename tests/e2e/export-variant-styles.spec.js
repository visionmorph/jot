const { test, expect } = require("playwright/test");
const { openApp } = require("../support/open-app.cjs");

test("generates React output for authored variants", async ({ page }) => {
  await openApp(page);
  await page.getByRole("button", { name: "Add variant preview" }).click();

  const source = await page.evaluate(() => createReactComponentSource("VariantComponent"));

  expect(source).toContain("const VariantComponent = React.forwardRef(function VariantComponent({ className, style, ...rest }, ref)");
  expect(source).toContain("const baseStyles = {");
  expect(source).not.toContain("const variantStyleDeltas");
  expect(source).not.toContain("const variantStyleAxisOrder");
  expect(source).toContain("const variantStyles = baseStyles;");
  expect(source).not.toContain("const styleValues =");
  expect(source).toContain("return (");
  expect(source).not.toContain("const variants = {");
  expect(source).not.toContain("authoredCombinations");
  expect(source).not.toContain("selectedVariant");
});

test("lowers authored variant outlines to layout-neutral box shadows", async ({ page }) => {
  await openApp(page);

  const source = await page.evaluate(() => {
    const root = currentComponent.frameRecord;
    const selectedProp = {
      id: nextComponentPropId++,
      name: "selected",
      type: "boolean",
      defaultValue: false,
      targetFrameId: root.id,
      targetTextId: null,
      targetVectorId: null,
      property: "selected",
    };
    componentProps.push(selectedProp);
    syncComponentPropVariantDefinition(selectedProp, { render: false });
    ensureInitialVariant();
    const selectedVariant = addVariant({ render: false });
    const selectedAxis = variantModel.getProps().find(axis => axis.id === selectedProp.variantPropId);
    setVariantPropValue(selectedVariant, selectedAxis.id, true);
    upsertLocalVariantOverride(selectedVariant, "component:0", "outlineColor", "#0067FF");
    upsertLocalVariantOverride(selectedVariant, "component:0", "outlineColorOpacity", "100");
    upsertLocalVariantOverride(selectedVariant, "component:0", "outlineWeight", "3");
    upsertLocalVariantOverride(selectedVariant, "component:0", "outlinePosition", "inside");
    return createReactComponentSource("TabItem");
  });

  expect(source).toContain('boxShadow: "inset 0 0 0 3px #0067FF"');
  expect(source).not.toContain("outlineWeight:");
  expect(source).not.toContain("outlineColorOpacity:");
  expect(source).not.toContain("outlinePosition:");
});

test("preserves authored styles for combined boolean variants", async ({ page }) => {
  await openApp(page);

  const source = await page.evaluate(() => {
    const root = currentComponent.frameRecord;
    const selectedProp = {
      id: nextComponentPropId++,
      name: "selected",
      type: "boolean",
      defaultValue: true,
      targetFrameId: root.id,
      targetTextId: null,
      targetVectorId: null,
      property: "selected",
    };
    const disabledProp = {
      id: nextComponentPropId++,
      name: "disabled",
      type: "boolean",
      defaultValue: false,
      targetFrameId: root.id,
      targetTextId: null,
      targetVectorId: null,
      property: "disabled",
    };
    componentProps.push(selectedProp, disabledProp);
    syncComponentPropVariantDefinition(selectedProp, { render: false });
    syncComponentPropVariantDefinition(disabledProp, { render: false });
    ensureInitialVariant();
    const selectedAxis = variantModel.getProps().find(axis => axis.id === selectedProp.variantPropId);
    const disabledAxis = variantModel.getProps().find(axis => axis.id === disabledProp.variantPropId);
    const addCombination = (selected, disabled, backgroundColor) => {
      const variant = addVariant({ render: false });
      setVariantPropValue(variant, selectedAxis.id, selected);
      setVariantPropValue(variant, disabledAxis.id, disabled);
      upsertLocalVariantOverride(variant, "component:0", "backgroundColor", backgroundColor);
    };
    addCombination(false, false, "transparent");
    addCombination(true, true, "#2B2B2B");
    addCombination(false, true, "transparent");
    return createReactComponentSource("TabItem");
  });

  expect(source).toContain("const simpleVariantStyles = {");
  expect(source).toContain("const simpleVariantCombinationStyles = {");
  expect(source).toContain('"selectedFalseDisabledTrue": {');
  expect(source).toContain('"component:0": { backgroundColor: "transparent" }');
  expect(source).toContain('...(!selected ? simpleVariantStyles.selected["false"]?.["component:0"] : undefined)');
  expect(source).toContain('...(disabled ? simpleVariantStyles.disabled["true"]?.["component:0"] : undefined)');
  expect(source).not.toContain("const styleValues =");
  expect(source).toContain('...(!selected && disabled ? simpleVariantCombinationStyles["selectedFalseDisabledTrue"]["component:0"] : undefined)');
  expect(source).not.toContain("variantStyleAxisOrder");
  expect(source).not.toContain("getVariantStyle");
  expect(source).not.toContain("Object.fromEntries");
  expect(source).not.toContain("JSON.stringify");
  const { transformWithEsbuild } = await import("vite");
  await expect(transformWithEsbuild(source, "TabItem.jsx", { loader: "jsx" }))
    .resolves.toHaveProperty("code");
});

test("generates Storybook click actions with a shared fn spy", async ({ page }) => {
  await openApp(page);
  await page.getByRole("button", { name: "Open semantic element options" }).click();
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
      property: "custom",
    };
    nextComponentPropId += 1;
    componentProps.push(kindProp);
    syncComponentPropVariantDefinition(kindProp, { render: false });
    addVariant({ render: false });
    addVariant({ render: false });

    const axis = variantModel.getProps().find((prop) => prop.id === kindProp.variantPropId);
    const colors = ["#0060FF", "#555555", "transparent"];
    const weights = ["400", "600", "700"];
    variantModel.getVariants().forEach((variant, index) => {
      setVariantPropValue(variant, axis.id, axis.options[index]);
      upsertLocalVariantOverride(variant, "component:0", "backgroundColor", colors[index]);
      upsertLocalVariantOverride(variant, "component:0", "fontWeight", weights[index]);
    });

    return {
      componentSource: createReactComponentSource("Button"),
      storySource: createStorySource("Button"),
    };
  });

  expect(componentSource).toContain('kind2 = "primary"');
  expect(componentSource).not.toContain("const styleValues =");
  expect(componentSource).toContain('className={[variantClassName, className].filter(Boolean).join(" ")}');
  expect(componentSource).not.toContain("JSON.stringify([kind2])");
  expect(componentSource).not.toContain("authoredCombinations");
  expect(componentSource).toContain("const baseStyles = {");
  expect(componentSource).toContain("const simpleVariantStyles = {");
  expect(componentSource).toContain('...simpleVariantStyles.kind2[String(kind2)]?.["component:0"]');
  expect(componentSource).not.toContain("variantStyleAxisOrder");
  expect(componentSource).not.toContain("getVariantStyle");
  expect(componentSource).not.toContain("Object.fromEntries");
  expect(componentSource).toContain('backgroundColor: "#0060FF"');
  expect(componentSource).toContain('backgroundColor: "#555555"');
  expect(componentSource).toContain('backgroundColor: "transparent"');
  expect(componentSource).toContain('fontWeight: "400"');
  expect(componentSource).toContain('fontWeight: "600"');
  expect(componentSource).toContain('fontWeight: "700"');
  expect(storySource).toContain('kind2: { control: "select", options: ["primary","secondary","tertiary"] }');
  expect(storySource).not.toContain("Kind2");
});
