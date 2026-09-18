const { test, expect } = require("playwright/test");
const { openApp } = require("../support/open-app.cjs");

test("renders one composable tree without requiring an authored combination", async ({ page }) => {
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
      property: "custom",
    };
    nextComponentPropId += 1;
    componentProps.push(kindProp);
    syncComponentPropVariantDefinition(kindProp, { render: false });
    addVariant({ render: false });
    return createReactComponentSource("Button");
  });

  expect(source).not.toContain("const styleValues =");
  expect(source).toContain('style={{ ...variantStyles["component:0"], ...style }}');
  expect(source).not.toContain("return null;");
  expect(source).not.toContain("const variants = {");
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
  expect(source).toContain("function NestedButton({ onClick, disabled = false, className, style, ...rest }, ref)");
  expect(source).toContain("<div {...rest} ref={ref} className={className}");
  expect(source).toContain('<button type="button" disabled={disabled} onClick={disabled ? undefined : onClick}');
  expect(source).toContain('cursor: disabled ? "not-allowed" : "pointer"');
  const rootMarkup = source.match(/<div[^>]+>/)?.[0] ?? "";
  expect(rootMarkup).not.toContain("cursor:");
});

test("exports button cursor semantics without requiring an onClick prop", async ({ page }) => {
  await openApp(page);

  const { enabledSource, disabledSource } = await page.evaluate(() => {
    const button = currentComponent.frameRecord;
    button.element.dataset.htmlTag = "button";
    const enabledSource = createReactComponentSource("Button");
    button.element.toggleAttribute("disabled", true);
    const disabledSource = createReactComponentSource("DisabledButton");
    return { enabledSource, disabledSource };
  });

  expect(enabledSource).toContain('cursor: "pointer"');
  expect(enabledSource).not.toContain("style={{ ...{");
  expect(enabledSource).not.toContain("onClick=");
  expect(disabledSource).toContain('cursor: "not-allowed"');
  expect(disabledSource).toContain(" disabled");
  expect(disabledSource).not.toContain("onClick=");
});

test("exports input frames as void elements", async ({ page }) => {
  await openApp(page);

  const source = await page.evaluate(() => {
    currentComponent.frameRecord.element.dataset.htmlTag = "input";
    return createReactComponentSource("Input");
  });

  expect(source).toContain("<input");
  expect(source).toContain(" />");
  expect(source).not.toContain("</input>");
});

test("exports a disabled prop for an input nested in a label", async ({ page }) => {
  await openApp(page);

  const { actionTargetIds, disabledTargetIds, inputId, source } = await page.evaluate(() => {
    currentComponent.frameRecord.element.dataset.htmlTag = "label";
    const input = createCanvasFrame(0, 0, currentComponent.frameRecord, { select: false });
    input.element.dataset.htmlTag = "input";
    componentProps.push({
      id: nextComponentPropId,
      name: "disabled",
      type: "boolean",
      defaultValue: false,
      targetFrameId: input.id,
      targetTextId: null,
      targetVectorId: null,
      property: "disabled",
    });
    return {
      actionTargetIds: getCompatibleActionTargets().map((record) => record.id),
      disabledTargetIds: getCompatibleDisabledTargets().map((record) => record.id),
      inputId: input.id,
      source: createReactComponentSource("TextInput"),
    };
  });

  expect(disabledTargetIds).toEqual([inputId]);
  expect(actionTargetIds).toEqual([]);
  expect(source).toContain("function TextInput({ disabled = false, className, style, ...rest }, ref)");
  expect(source).toContain("<input disabled={disabled}");
});

test("exports an input placeholder String property", async ({ page }) => {
  await openApp(page);

  const source = await page.evaluate(() => {
    const input = currentComponent.frameRecord;
    input.element.dataset.htmlTag = "input";
    input.element.dataset.placeholder = "Email address";
    componentProps.push({
      id: nextComponentPropId,
      name: "placeholder",
      type: "string",
      defaultValue: "Email address",
      targetFrameId: input.id,
      targetTextId: null,
      targetVectorId: null,
      property: "placeholder",
    });
    return createReactComponentSource("Input");
  });

  expect(source).toContain('function Input({ placeholder = "Email address", className, style, ...rest }, ref)');
  expect(source).toContain("<input {...rest} ref={ref} className={className} placeholder={placeholder}");
});

test("exports an input Invalid Boolean property as aria-invalid", async ({ page }) => {
  await openApp(page);

  const { componentSource, storySource } = await page.evaluate(() => {
    const input = currentComponent.frameRecord;
    input.element.dataset.htmlTag = "input";
    componentProps.push({
      id: nextComponentPropId,
      name: "invalid",
      type: "boolean",
      defaultValue: false,
      targetFrameId: input.id,
      targetTextId: null,
      targetVectorId: null,
      property: "invalid",
    });
    return {
      componentSource: createReactComponentSource("Input"),
      storySource: createStorySource("Input"),
    };
  });

  expect(componentSource).toContain("function Input({ invalid = false, className, style, ...rest }, ref)");
  expect(componentSource).toContain("aria-invalid={invalid}");
  expect(storySource).toContain('invalid: { control: "boolean" }');
});

test("exports an authored Boolean toggle as a semantic stateful switch", async ({ page }) => {
  await openApp(page);

  const { componentSource, storySource } = await page.evaluate(() => {
    const toggle = currentComponent.frameRecord;
    toggle.element.dataset.htmlTag = "button";
    const checkedProp = {
      id: nextComponentPropId,
      name: "checked",
      type: "boolean",
      defaultValue: false,
      targetFrameId: toggle.id,
      targetTextId: null,
      targetVectorId: null,
      property: "checked",
    };
    nextComponentPropId += 1;
    componentProps.push(checkedProp);
    syncComponentPropVariantDefinition(checkedProp, { render: false });
    ensureInitialVariant();
    const onVariant = addVariant({ render: false });
    const axis = variantModel.getProps().find((prop) => prop.id === checkedProp.variantPropId);
    setVariantPropValue(onVariant, axis.id, true);
    ["paddingTop", "paddingRight", "paddingBottom", "paddingLeft"].forEach((property) => {
      upsertLocalVariantOverride(onVariant, "component:0", property, "4px");
    });
    return {
      componentSource: createReactComponentSource("Toggle"),
      storySource: createStorySource("Toggle"),
    };
  });

  expect(componentSource).toContain("function Toggle({ checked: checkedProp, defaultChecked = false, onCheckedChange, className, style, ...rest }, ref)");
  expect(componentSource).toContain("<button {...rest} ref={ref}");
  expect(componentSource).toContain("const [internalChecked, setInternalChecked] = React.useState(defaultChecked)");
  expect(componentSource).toContain("const checked = checkedProp ?? internalChecked");
  expect(componentSource).toContain("if (checkedProp === undefined) setInternalChecked(nextChecked)");
  expect(componentSource).toContain('role="switch" aria-checked={checked}');
  expect(componentSource).toContain("onClick={handleCheckedChange}");
  expect(componentSource).toContain('paddingLeft: "10px"');
  expect(componentSource).toContain('paddingLeft: "4px"');
  expect(componentSource).not.toContain('padding: "2px"');
  expect(componentSource).not.toContain("const styleValues =");
  expect(componentSource).toContain('checked ? "on" : "off"');
  expect(componentSource).not.toContain("authoredCombinations");
  expect(storySource).toContain('onCheckedChange: fn().mockName("onCheckedChange")');
  expect(storySource).toContain('onCheckedChange: { action: "checked changed", control: false }');
  expect(storySource).toContain('import { useArgs } from "storybook/preview-api"');
  expect(storySource).toContain("updateArgs({ checked: nextChecked })");
});

test("exports camel-case and native ARIA label props without emitting blank labels", async ({ page }) => {
  await openApp(page);

  const { componentSource, blankSource, storySource } = await page.evaluate(() => {
    const toggle = currentComponent.frameRecord;
    toggle.element.dataset.htmlTag = "button";
    const ariaLabelProp = {
      id: nextComponentPropId++,
      name: "ariaLabel",
      type: "string",
      defaultValue: "Dark mode",
      targetFrameId: toggle.id,
      targetTextId: null,
      targetVectorId: null,
      property: "ariaLabel",
    };
    componentProps.push(ariaLabelProp);
    const componentSource = createReactComponentSource("Toggle");
    const storySource = createStorySource("Toggle");
    ariaLabelProp.defaultValue = "";
    return {
      componentSource,
      blankSource: createReactComponentSource("Toggle"),
      storySource,
    };
  });

  expect(componentSource).toContain('function Toggle({ ariaLabel, "aria-label": nativeAriaLabel, className, style, ...rest }, ref)');
  expect(componentSource).toContain('const resolvedAriaLabel = ariaLabel?.trim() || nativeAriaLabel?.trim() || "Dark mode";');
  expect(componentSource).toContain("aria-label={resolvedAriaLabel}");
  expect(componentSource).not.toContain('role="switch"');
  expect(componentSource).not.toContain("aria-checked=");
  expect(blankSource).toContain("const resolvedAriaLabel = ariaLabel?.trim() || nativeAriaLabel?.trim() || undefined;");
  expect(blankSource).not.toContain('ariaLabel = ""');
  expect(storySource).toContain('ariaLabel: { control: "text" }');
  expect(storySource).toContain('ariaLabel: "Dark mode"');
});

test("uses semantic classes and disables toggle click handling dynamically", async ({ page }) => {
  await openApp(page);

  const { componentSource, storySource } = await page.evaluate(() => {
    const toggle = currentComponent.frameRecord;
    toggle.element.dataset.htmlTag = "button";
    const props = [
      { name: "checked", type: "boolean", defaultValue: false, property: "checked" },
      { name: "disabled", type: "boolean", defaultValue: false, property: "disabled" },
      { name: "Size", type: "enum", options: ["sm", "md"], defaultValue: "sm", property: "custom" },
    ].map((config) => ({
      id: nextComponentPropId++,
      targetFrameId: config.type === "boolean" ? toggle.id : null,
      targetTextId: null,
      targetVectorId: null,
      ...config,
    }));
    componentProps.push(...props);
    props.forEach((prop) => syncComponentPropVariantDefinition(prop, { render: false }));
    ensureInitialVariant();
    while (variantModel.getVariants().length < 8) addVariant({ render: false });
    const axes = Object.fromEntries(props.map((prop) => [
      prop.name.toLowerCase(),
      variantModel.getProps().find((axis) => axis.id === prop.variantPropId),
    ]));
    const combinations = [
      [false, false, "sm"], [true, false, "sm"],
      [false, true, "sm"], [true, true, "sm"],
      [false, false, "md"], [true, false, "md"],
      [false, true, "md"], [true, true, "md"],
    ];
    variantModel.getVariants().forEach((variant, index) => {
      const [checked, disabled, size] = combinations[index];
      setVariantPropValue(variant, axes.checked.id, checked);
      setVariantPropValue(variant, axes.disabled.id, disabled);
      setVariantPropValue(variant, axes.size.id, size);
    });
    return {
      componentSource: createReactComponentSource("Toggle"),
      storySource: createStorySource("Toggle"),
    };
  });

  expect(componentSource).not.toContain("const styleValues =");
  expect(componentSource).toContain("const variantStyles = baseStyles;");
  expect(componentSource).toContain('disabled ? "disabled" : "enabled"');
  expect(componentSource).toContain('checked ? "on" : "off"');
  expect(componentSource).not.toMatch(/copy/i);
  expect(componentSource).toContain("disabled={disabled}");
  expect(componentSource).toContain("onClick={disabled ? undefined : handleCheckedChange}");
  expect(componentSource).not.toContain("const variants = {");
  expect(componentSource).not.toContain("authoredCombinations");
  expect(storySource).toContain("export const SmEnabledOn");
  expect(storySource).toContain("export const MdDisabledOff");
});

test("keeps an authored variant axis named variant as a public prop", async ({ page }) => {
  await openApp(page);

  const componentSource = await page.evaluate(() => {
    const prop = {
      id: nextComponentPropId++,
      name: "variant",
      type: "enum",
      options: ["primary", "secondary"],
      defaultValue: "primary",
      targetFrameId: null,
      targetTextId: null,
      targetVectorId: null,
      property: "custom",
    };
    componentProps.push(prop);
    syncComponentPropVariantDefinition(prop, { render: false });
    ensureInitialVariant();
    const secondary = addVariant({ render: false });
    const axis = variantModel.getProps().find((entry) => entry.id === prop.variantPropId);
    setVariantPropValue(secondary, axis.id, "secondary");
    upsertLocalVariantOverride(secondary, "component:0", "backgroundColor", "#222222");
    return createReactComponentSource("Button");
  });

  expect(componentSource).toContain('function Button({ variant = "primary", className, style, ...rest }, ref)');
  expect(componentSource).not.toContain("const styleValues =");
  expect(componentSource).toContain('"variant": {');
  expect(componentSource).not.toContain("authoredCombinations");
  expect(componentSource).not.toContain("selectedVariant");
});

test("exports a Custom Boolean as a visual axis without synthesized attributes", async ({ page }) => {
  await openApp(page);

  const { componentSource, storySource } = await page.evaluate(() => {
    const prop = {
      id: nextComponentPropId++,
      name: "inverse",
      type: "boolean",
      defaultValue: false,
      targetFrameId: null,
      targetTextId: null,
      targetVectorId: null,
      property: "custom",
    };
    componentProps.push(prop);
    syncComponentPropVariantDefinition(prop, { render: false });
    ensureInitialVariant();
    const inverse = addVariant({ render: false });
    const axis = variantModel.getProps().find((candidate) => candidate.id === prop.variantPropId);
    setVariantPropValue(inverse, axis.id, true);
    upsertLocalVariantOverride(inverse, "component:0", "backgroundColor", "#161616");
    return {
      componentSource: createReactComponentSource("Link"),
      storySource: createStorySource("Link"),
    };
  });

  expect(componentSource).toContain("function Link({ inverse = false, className, style, ...rest }, ref)");
  expect(componentSource).not.toContain("const styleValues =");
  expect(componentSource).toContain('inverse ? "inverse" : "not-inverse"');
  expect(componentSource).not.toContain("inverse={inverse}");
  expect(componentSource).not.toContain("aria-disabled={inverse}");
  expect(componentSource).not.toContain("aria-invalid={inverse}");
  expect(componentSource).not.toContain("disabled={inverse}");
  expect(storySource).toContain('inverse: { control: "boolean" }');
});

test("exports sparse per-axis style deltas in a fixed semantic merge order", async ({ page }) => {
  await openApp(page);

  const componentSource = await page.evaluate(() => {
    const root = currentComponent.frameRecord;
    root.element.dataset.htmlTag = "button";
    const props = [
      { name: "disabled", type: "boolean", defaultValue: false, property: "disabled" },
      { name: "checked", type: "boolean", defaultValue: false, property: "checked" },
      { name: "size", type: "enum", options: ["sm", "md"], defaultValue: "sm", property: "custom" },
    ].map((config) => ({
      id: nextComponentPropId++,
      targetFrameId: root.id,
      targetTextId: null,
      targetVectorId: null,
      ...config,
    }));
    componentProps.push(...props);
    props.forEach((prop) => syncComponentPropVariantDefinition(prop, { render: false }));
    ensureInitialVariant();
    while (variantModel.getVariants().length < 4) addVariant({ render: false });
    const axes = Object.fromEntries(props.map((prop) => [
      prop.name.toLowerCase(),
      variantModel.getProps().find((axis) => axis.id === prop.variantPropId),
    ]));
    const combinations = [
      [false, false, "sm"],
      [false, false, "md"],
      [false, true, "sm"],
      [true, false, "sm"],
    ];
    variantModel.getVariants().forEach((variant, index) => {
      const [disabled, checked, size] = combinations[index];
      setVariantPropValue(variant, axes.disabled.id, disabled);
      setVariantPropValue(variant, axes.checked.id, checked);
      setVariantPropValue(variant, axes.size.id, size);
    });
    upsertLocalVariantOverride(variantModel.getVariants()[1], "component:0", "width", "48px");
    upsertLocalVariantOverride(variantModel.getVariants()[2], "component:0", "justifyContent", "flex-end");
    upsertLocalVariantOverride(variantModel.getVariants()[3], "component:0", "backgroundColor", "#888888");
    return createReactComponentSource("Toggle");
  });

  expect(componentSource).toContain('const variantStyleAxisOrder = ["size", "checked", "disabled"]');
  expect(componentSource).toContain('"size": {\n      "md": {');
  expect(componentSource).toContain('"checked": {\n      "true": {');
  expect(componentSource).toContain('"disabled": {\n      "true": {');
  expect(componentSource).toContain('width: "48px"');
  expect(componentSource).toContain('justifyContent: "flex-end"');
  expect(componentSource).toContain('backgroundColor: "#888888"');
  expect(componentSource).not.toContain('"false": {');
});
