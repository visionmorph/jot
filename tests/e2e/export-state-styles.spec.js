const { test, expect } = require("playwright/test");
const { openApp } = require("../support/open-app.cjs");

test("exports label frames with their child layers", async ({ page }) => {
  await openApp(page);

  const source = await page.evaluate(() => {
    currentComponent.frameRecord.element.dataset.htmlTag = "label";
    createCanvasText(currentComponent.frameRecord, 0, 0, {
      beginEditing: false,
      isNew: false,
      textContent: "Email address",
    });
    const input = createCanvasFrame(0, 0, currentComponent.frameRecord, { select: false });
    input.element.dataset.htmlTag = "input";
    return createReactComponentSource("Label");
  });

  expect(source).toContain("<label");
  expect(source).toContain("<span");
  expect(source).toContain("<input");
  expect(source).toContain("</label>");
});

test("exports compound interaction and focus selectors", async ({ page }) => {
  await openApp(page);

  const { componentSource, stylesheet, storySource } = await page.evaluate(() => {
    currentComponent.frameRecord.element.dataset.htmlTag = "label";
    const input = createCanvasFrame(0, 0, currentComponent.frameRecord, { select: false });
    input.element.dataset.htmlTag = "input";
    const interactionProp = {
      id: nextComponentPropId,
      name: "Interaction",
      type: "enum",
      options: [...INTERACTION_STATE_OPTIONS],
      defaultValue: "default",
      targetFrameId: input.id,
      targetTextId: null,
      targetVectorId: null,
      property: "state",
      variantSubtype: "state",
    };
    nextComponentPropId += 1;
    const focusProp = {
      id: nextComponentPropId,
      name: "Focus",
      type: "enum",
      options: [...FOCUS_STATE_OPTIONS],
      defaultValue: "none",
      targetFrameId: input.id,
      targetTextId: null,
      targetVectorId: null,
      property: "focus",
      variantSubtype: "focus",
    };
    nextComponentPropId += 1;
    componentProps.push(interactionProp, focusProp);
    syncComponentPropVariantDefinition(interactionProp, { render: false });
    syncComponentPropVariantDefinition(focusProp, { render: false });
    const focusedVariant = addVariant({ render: false });
    const defaultVariant = getDefaultVariant();
    const interactionAxis = variantModel.getProps().find((prop) => prop.id === interactionProp.variantPropId);
    const focusAxis = variantModel.getProps().find((prop) => prop.id === focusProp.variantPropId);
    setVariantPropValue(defaultVariant, interactionAxis.id, "default");
    setVariantPropValue(defaultVariant, focusAxis.id, "none");
    setVariantPropValue(focusedVariant, interactionAxis.id, "hover");
    setVariantPropValue(focusedVariant, focusAxis.id, "focus");
    upsertLocalVariantOverride(focusedVariant, "component:0", "backgroundColor", "#E6F0FF");
    upsertLocalVariantOverride(focusedVariant, "component:0", "outlineColor", "#0067FF");
    upsertLocalVariantOverride(focusedVariant, "component:0", "outlineColorOpacity", "100");
    upsertLocalVariantOverride(focusedVariant, "component:0", "outlineWeight", "3");
    upsertLocalVariantOverride(focusedVariant, "component:0", "outlinePosition", "outside");
    return {
      componentSource: createReactComponentSource("TextInput"),
      stylesheet: createStateStylesheetSource("TextInput", "TextInput"),
      storySource: createStorySource("TextInput"),
    };
  });

  expect(componentSource).toContain('className="TextInput__frame-1"');
  expect(componentSource).not.toContain("disabled = false");
  expect(storySource).not.toContain('disabled: { control: "boolean" }');
  expect(componentSource).toContain('const variantClassName = "TextInput TextInput--default";');
  expect(stylesheet).toContain(
    ".TextInput.TextInput--default:has(.TextInput__frame-1:hover):has(.TextInput__frame-1:focus) {",
  );
  expect(stylesheet).toContain("background-color: #E6F0FF !important;");
  expect(stylesheet).toContain("box-shadow: 0 0 0 3px #0067FF !important;");
  expect(stylesheet).toContain("outline: none !important;");
  expect(stylesheet).not.toContain("outline-weight");
  expect(stylesheet).not.toContain("outline-color-opacity");
  expect(stylesheet).not.toContain(":focus-visible");
});

test("groups identical interaction CSS across visual axes", async ({ page }) => {
  await openApp(page);

  const stylesheet = await page.evaluate(() => {
    const root = currentComponent.frameRecord;
    root.element.dataset.htmlTag = "button";
    const sizeProp = {
      id: nextComponentPropId++,
      name: "size",
      type: "enum",
      options: ["sm", "md"],
      defaultValue: "sm",
      targetFrameId: null,
      targetTextId: null,
      targetVectorId: null,
      property: "custom",
    };
    const interactionProp = {
      id: nextComponentPropId++,
      name: "Interaction",
      type: "enum",
      options: [...INTERACTION_STATE_OPTIONS],
      defaultValue: "default",
      targetFrameId: root.id,
      targetTextId: null,
      targetVectorId: null,
      property: "state",
      variantSubtype: "state",
    };
    componentProps.push(sizeProp, interactionProp);
    syncComponentPropVariantDefinition(sizeProp, { render: false });
    syncComponentPropVariantDefinition(interactionProp, { render: false });
    ensureInitialVariant();
    while (variantModel.getVariants().length < 4) addVariant({ render: false });
    const sizeAxis = variantModel.getProps().find((axis) => axis.id === sizeProp.variantPropId);
    const interactionAxis = variantModel.getProps().find((axis) => (
      axis.id === interactionProp.variantPropId
    ));
    const combinations = [
      ["sm", "default"],
      ["md", "default"],
      ["sm", "hover"],
      ["md", "hover"],
    ];
    variantModel.getVariants().forEach((variant, index) => {
      const [size, interaction] = combinations[index];
      setVariantPropValue(variant, sizeAxis.id, size);
      setVariantPropValue(variant, interactionAxis.id, interaction);
      if (interaction === "hover") {
        upsertLocalVariantOverride(variant, "component:0", "backgroundColor", "#224466");
      }
    });
    return createStateStylesheetSource("Button", "Button");
  });

  expect(stylesheet).toContain(
    ".Button.Button--sm:hover,\n.Button.Button--md:hover {",
  );
  expect(stylesheet.match(/background-color: #224466 !important;/g)).toHaveLength(1);
});
