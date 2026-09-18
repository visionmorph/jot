const { test, expect } = require("playwright/test");
const { openApp } = require("../support/open-app.cjs");

test("exports an href prop and leaves native target available through rest props", async ({ page }) => {
  await openApp(page);

  const { componentSource, underlinedSource, storySource } = await page.evaluate(() => {
    const link = currentComponent.frameRecord;
    link.element.dataset.htmlTag = "a";
    componentProps.push({
      id: nextComponentPropId++,
      name: "href",
      type: "string",
      defaultValue: "/docs",
      targetFrameId: link.id,
      targetTextId: null,
      targetVectorId: null,
      property: "href",
    });
    const componentSource = createReactComponentSource("Link");
    const storySource = createStorySource("Link");
    link.element.style.textDecoration = "underline";
    return {
      componentSource,
      underlinedSource: createReactComponentSource("UnderlinedLink"),
      storySource,
    };
  });

  expect(componentSource).toContain('function Link({ href = "/docs", className, style, ...rest }, ref)');
  expect(componentSource).toContain("<a {...rest} ref={ref} className={className} href={href}");
  expect(componentSource).toContain('textDecoration: "none"');
  expect(underlinedSource).toContain('textDecoration: "underline"');
  expect(componentSource).not.toContain("target={target}");
  expect(storySource).not.toContain("target:");
  expect(storySource).toContain('href: "/docs"');
});

test("synthesizes disabled behavior for an anchor", async ({ page }) => {
  await openApp(page);

  const source = await page.evaluate(() => {
    const link = currentComponent.frameRecord;
    link.element.dataset.htmlTag = "a";
    componentProps.push(
      {
        id: nextComponentPropId++,
        name: "href",
        type: "string",
        defaultValue: "/docs",
        targetFrameId: link.id,
        targetTextId: null,
        targetVectorId: null,
        property: "href",
      },
      {
        id: nextComponentPropId++,
        name: "disabled",
        type: "boolean",
        defaultValue: false,
        targetFrameId: link.id,
        targetTextId: null,
        targetVectorId: null,
        property: "disabled",
      },
    );
    return createReactComponentSource("Link");
  });

  expect(source).toContain('function Link({ href = "/docs", disabled = false, className, style, ...rest }, ref)');
  expect(source).toContain('href={disabled ? undefined : href}');
  expect(source).not.toContain("target={target}");
  expect(source).toContain('role={disabled ? "link" : undefined}');
  expect(source).toContain('aria-disabled={disabled || undefined}');
  expect(source).toContain('onClick={disabled ? (event) => { event.preventDefault(); event.stopPropagation(); } : rest.onClick}');
  expect(source).toContain('cursor: disabled ? "not-allowed" : "pointer"');
  expect(source).not.toContain(' disabled={disabled}');
});

test("strips a native href passed through rest when an anchor is disabled", async ({ page }) => {
  await openApp(page);

  const source = await page.evaluate(() => {
    const link = currentComponent.frameRecord;
    link.element.dataset.htmlTag = "a";
    componentProps.push({
      id: nextComponentPropId++,
      name: "disabled",
      type: "boolean",
      defaultValue: false,
      targetFrameId: link.id,
      targetTextId: null,
      targetVectorId: null,
      property: "disabled",
    });
    return createReactComponentSource("Link");
  });

  expect(source).toContain("function Link({ disabled = false, className, style, ...rest }, ref)");
  expect(source).toContain("<a {...rest} ref={ref}");
  expect(source).toContain("href={disabled ? undefined : rest.href}");
});

test("exports disabled variant paint changes for a visible link icon", async ({ page }) => {
  await openApp(page);

  const source = await page.evaluate(() => {
    const link = currentComponent.frameRecord;
    link.element.dataset.htmlTag = "a";
    const icon = createCanvasVector({
      name: "Link icon",
      width: 24,
      height: 24,
      source: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M2 2h20v20H2z" fill="#0F62FE"/></svg>',
    }, 0, 0, link, { select: false, recordHistory: false });
    const disabledProp = {
      id: nextComponentPropId++,
      name: "disabled",
      type: "boolean",
      defaultValue: false,
      targetFrameId: link.id,
      targetTextId: null,
      targetVectorId: null,
      property: "disabled",
    };
    const iconVisibleProp = {
      id: nextComponentPropId++,
      name: "iconVisible",
      type: "boolean",
      defaultValue: true,
      targetFrameId: null,
      targetTextId: null,
      targetVectorId: icon.id,
      property: "visibility",
    };
    componentProps.push(disabledProp, iconVisibleProp);
    syncComponentPropVariantDefinition(disabledProp, { render: false });
    syncComponentPropVariantDefinition(iconVisibleProp, { render: false });
    ensureInitialVariant();
    const disabledVariant = addVariant({ render: false });
    const disabledAxis = variantModel.getProps().find((axis) => axis.id === disabledProp.variantPropId);
    setVariantPropValue(disabledVariant, disabledAxis.id, true);
    upsertLocalVariantOverride(disabledVariant, `vector:${icon.id}`, "fill", "#8D8D8D");
    return createReactComponentSource("Link");
  });

  expect(source).toContain('"vector:1": {');
  expect(source).toContain('fill: "#0F62FE"');
  expect(source).toContain('"disabled": {\n      "true": {\n        "vector:1": { fill: "#8D8D8D" }');
  expect(source).toContain('style={variantStyles["vector:1"]}');
  expect(source).toContain('style={{ fill: variantStyles["vector:1"]?.fill }}');
  expect(source).not.toContain('getVariantStyle("vector:1", styleValues)');
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

