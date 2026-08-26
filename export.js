/* React and Storybook source generation, SVG serialization, and export downloads. */

function toReactComponentName(value) {
  const name = value
    .trim()
    .replace(/[^a-zA-Z0-9]+(.)/g, (_, character) => character.toUpperCase())
    .replace(/^[a-z]/, (character) => character.toUpperCase())
    .replace(/[^a-zA-Z0-9_$]/g, "");
  if (!name) return "GeneratedComponent";
  return /^\d/.test(name) ? `Component${name}` : name;
}

function formatReactStyle(style, rawProperties = null) {
  const properties = Object.entries(style)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([property, value]) => `${property}: ${rawProperties?.has(property) ? value : JSON.stringify(value)}`);
  return `{ ${properties.join(", ")} }`;
}

function isZeroCssValue(value) {
  return /^-?0(?:\.0+)?(?:px|em|rem|%)?$/i.test(String(value).trim());
}

function getExportOpacity(element) {
  const opacity = Math.max(10, Math.min(100, Number(element.dataset.opacity || "100")));
  return opacity < 100 ? opacity / 100 : undefined;
}

function getExportSizingStyle(type, record) {
  const element = record.element;
  const { parentId, parentDirection: sizingParentDirection } = getLayerSizingContext(type, record);
  const parentDirection = record.exportParentDirection ?? sizingParentDirection;
  const isRoot = Boolean(record.isComponent);
  const widthMode = getLayerDimensionMode(element, "width", type === "text" ? "hug" : "fixed");
  const heightMode = getLayerDimensionMode(element, "height", type === "text" ? "hug" : "fixed");
  const mainDimension = parentDirection === "vertical" ? "height" : "width";
  const mainMode = mainDimension === "width" ? widthMode : heightMode;
  const crossMode = mainDimension === "width" ? heightMode : widthMode;
  const dimensionValue = (dimension, mode, fallback) => {
    if (mode === "fixed") return `${element.dataset[dimension] || fallback}px`;
    if (mode === "hug") {
      return dimension === "width" && type === "text" && isRoot ? "max-content" : undefined;
    }
    return isRoot ? "100%" : "auto";
  };
  return {
    width: dimensionValue("width", widthMode, type === "frame" ? "100" : type === "vector" ? "24" : "0"),
    height: dimensionValue("height", heightMode, type === "frame" ? "100" : type === "vector" ? "24" : "0"),
    flex: isRoot ? undefined : mainMode === "fill" ? "1 1 0" : "0 0 auto",
    alignSelf: !isRoot && crossMode === "fill" ? "stretch" : undefined,
    minWidth: !isRoot && mainDimension === "width" && widthMode === "fill" ? 0 : undefined,
    minHeight: !isRoot && mainDimension === "height" && heightMode === "fill" ? 0 : undefined,
  };
}

function toExportCssLength(value) {
  return value === 0 ? 0 : `${value}px`;
}

function getExportPaddingStyle(element) {
  const top = Number(element.dataset.paddingTop || "10");
  const right = Number(element.dataset.paddingRight || "10");
  const bottom = Number(element.dataset.paddingBottom || "10");
  const left = Number(element.dataset.paddingLeft || "10");
  const values = [top, right, bottom, left];
  if (values.every((value) => value === values[0])) {
    return { padding: toExportCssLength(values[0]) };
  }
  if (top === bottom && right === left) {
    return { padding: `${toExportCssLength(top)} ${toExportCssLength(right)}` };
  }
  if (right === left) {
    return { padding: `${toExportCssLength(top)} ${toExportCssLength(right)} ${toExportCssLength(bottom)}` };
  }
  return {
    paddingTop: toExportCssLength(top),
    paddingRight: toExportCssLength(right),
    paddingBottom: toExportCssLength(bottom),
    paddingLeft: toExportCssLength(left),
  };
}

function getExportTextAlignmentStyle(record) {
  const element = record.element;
  const alignment = normalizeFrameAlignment(element.dataset.alignment || "top-left");
  const [vertical, horizontal] = alignment === "center" ? ["center", "center"] : alignment.split("-");
  const heightMode = getLayerDimensionMode(element, "height", "hug");
  return {
    display: record.parentFrameId === null ? "inline-block" : undefined,
    alignContent: heightMode !== "hug" && vertical !== "top"
      ? (vertical === "center" ? "center" : "end")
      : undefined,
    textAlign: horizontal === "center" ? "center" : horizontal === "right" ? "right" : "left",
  };
}

function getExportFrameStyle(record) {
  const element = record.element;
  const isRoot = Boolean(record.isComponent);
  const isAutoGap = element.dataset.gapMode === "auto";
  const direction = element.dataset.direction || "horizontal";
  const widthMode = getLayerDimensionMode(element, "width", "fixed");
  const heightMode = getLayerDimensionMode(element, "height", "fixed");
  const isButton = normalizeFrameHtmlTag(element.dataset.htmlTag || "div") === "button";
  const hasExplicitDimensions = widthMode !== "hug" || heightMode !== "hug";
  const gap = element.dataset.gap || "10";
  const radius = element.dataset.radius || "0";
  const alignment = getFrameAlignmentValues(element);
  const outlineBoxShadow = getFrameOutlineBoxShadow(element);
  return {
    opacity: getExportOpacity(element),
    display: isRoot && widthMode === "hug" ? "inline-flex" : "flex",
    flexDirection: direction === "vertical" ? "column" : undefined,
    alignItems: alignment.alignItems,
    ...getExportSizingStyle("frame", record),
    ...getExportPaddingStyle(element),
    gap: isAutoGap || isZeroCssValue(`${gap}px`) ? undefined : `${gap}px`,
    justifyContent: isAutoGap || alignment.justifyContent !== "flex-start"
      ? (isAutoGap ? "space-between" : alignment.justifyContent)
      : undefined,
    border: isButton ? 0 : undefined,
    borderRadius: isZeroCssValue(`${radius}px`) ? undefined : `${radius}px`,
    backgroundColor: element.dataset.frameColor
      ? getColorWithOpacity(element.dataset.frameColor, element.dataset.frameColorOpacity || "100")
      : (isButton ? "transparent" : undefined),
    boxShadow: outlineBoxShadow || undefined,
    boxSizing: hasExplicitDimensions ? "border-box" : undefined,
  };
}

function getExportTextStyle(record) {
  const element = record.element;
  const lineHeight = element.dataset.lineHeight || "Auto";
  const letterSpacing = element.style.letterSpacing || "0em";
  const widthMode = getLayerDimensionMode(element, "width", "hug");
  return {
    opacity: getExportOpacity(element),
    ...getExportSizingStyle("text", record),
    color: element.dataset.textColor
      ? getColorWithOpacity(element.dataset.textColor, element.dataset.textColorOpacity || "100")
      : undefined,
    fontFamily: element.style.fontFamily || '"Inter", sans-serif',
    fontSize: `${element.dataset.fontSize || "14"}px`,
    fontWeight: Number(element.dataset.fontWeight || DEFAULT_FONT_WEIGHT),
    lineHeight: lineHeight.toLowerCase() === "auto" ? undefined : `${lineHeight}px`,
    letterSpacing: isZeroCssValue(letterSpacing) ? undefined : letterSpacing,
    whiteSpace: "pre-wrap",
    overflowWrap: widthMode === "hug" ? undefined : "anywhere",
    ...getExportTextAlignmentStyle(record),
  };
}

function getExportVectorStyle(record) {
  return {
    opacity: getExportOpacity(record.element),
    ...getExportSizingStyle("vector", record),
  };
}

function toReactSvgAttributeName(name) {
  const lowerName = name.toLowerCase();
  const exactNames = {
    class: "className",
    tabindex: "tabIndex",
    viewbox: "viewBox",
    preserveaspectratio: "preserveAspectRatio",
    gradientunits: "gradientUnits",
    gradienttransform: "gradientTransform",
    markerwidth: "markerWidth",
    markerheight: "markerHeight",
    refx: "refX",
    refy: "refY",
    textlength: "textLength",
    lengthadjust: "lengthAdjust",
    patternunits: "patternUnits",
    patterncontentunits: "patternContentUnits",
    patterntransform: "patternTransform",
    "xlink:href": "xlinkHref",
    "xml:space": "xmlSpace",
    "xmlns:xlink": "xmlnsXlink",
  };
  if (exactNames[lowerName]) return exactNames[lowerName];
  if (lowerName.startsWith("data-") || lowerName.startsWith("aria-")) return lowerName;
  return name.replace(/[-:]([a-z])/g, (_, character) => character.toUpperCase());
}

function parseSvgStyle(styleValue) {
  return styleValue.split(";").reduce((style, declaration) => {
    const separatorIndex = declaration.indexOf(":");
    if (separatorIndex < 0) return style;
    const property = declaration.slice(0, separatorIndex).trim();
    const value = declaration.slice(separatorIndex + 1).trim();
    if (!property || !value || property.startsWith("--")) return style;
    const reactProperty = property.replace(/-([a-z])/g, (_, character) => character.toUpperCase());
    style[reactProperty] = value;
    return style;
  }, {});
}

function serializeSvgElementToJsx(element, depth, rootStyle = null, rawProperties = null) {
  const indent = "  ".repeat(depth);
  const attributes = [];
  let inlineStyle = {};

  Array.from(element.attributes).forEach((attribute) => {
    if (attribute.name.toLowerCase() === "style") {
      inlineStyle = parseSvgStyle(attribute.value);
      return;
    }
    attributes.push(` ${toReactSvgAttributeName(attribute.name)}=${JSON.stringify(attribute.value)}`);
  });
  const combinedStyle = rootStyle ? { ...inlineStyle, ...rootStyle } : inlineStyle;
  if (Object.keys(combinedStyle).length > 0) attributes.push(` style={${formatReactStyle(combinedStyle, rawProperties)}}`);

  const children = Array.from(element.childNodes).flatMap((node) => {
    if (node.nodeType === Node.ELEMENT_NODE) {
      return [serializeSvgElementToJsx(node, depth + 1)];
    }
    if ((node.nodeType === Node.TEXT_NODE || node.nodeType === Node.CDATA_SECTION_NODE)
      && (node.textContent || "").trim().length > 0) {
      return [`${"  ".repeat(depth + 1)}{${JSON.stringify(node.textContent)}}`];
    }
    return [];
  });
  const tagName = element.tagName;
  if (children.length === 0) return `${indent}<${tagName}${attributes.join("")} />`;
  return `${indent}<${tagName}${attributes.join("")}>\n${children.join("\n")}\n${indent}</${tagName}>`;
}

function findVisibilityProp(exportProps, type, id) {
  return exportProps.find((prop) => prop.type === "boolean" && prop.property === "visibility" && (
    (type === "frame" && prop.targetFrameId === id)
    || (type === "text" && prop.targetTextId === id)
    || (type === "vector" && prop.targetVectorId === id)
  ));
}

function withVisibilityStyle(styleObject, visibilityProp) {
  if (!visibilityProp) return { style: styleObject, rawProperties: null };
  const controlledStyle = { ...styleObject };
  delete controlledStyle.visibility;
  const originalDisplay = controlledStyle.display;
  const trueBranch = originalDisplay === undefined ? "undefined" : JSON.stringify(originalDisplay);
  return {
    style: { ...controlledStyle, display: `${visibilityProp.exportName} ? ${trueBranch} : "none"` },
    rawProperties: new Set(["display"]),
  };
}

function renderExportVector(record, depth, exportProps) {
  const parsed = new DOMParser().parseFromString(record.svgSource, "image/svg+xml");
  const visibilityProp = findVisibilityProp(exportProps, "vector", record.id);
  const { style, rawProperties } = withVisibilityStyle(getExportVectorStyle(record), visibilityProp);
  return serializeSvgElementToJsx(parsed.documentElement, depth, style, rawProperties);
}

function getExportComponentProps({ reservedNames = [], excludedVariantPropIds = new Set() } = {}) {
  const usedNames = new Set(reservedNames);
  return componentProps.flatMap((prop, index) => {
    if (prop.variantPropId != null && excludedVariantPropIds.has(prop.variantPropId)) return [];
    const targetFrame = getFrameRecord(prop.targetFrameId);
    const targetText = getTextRecord(prop.targetTextId);
    const targetVector = getVectorRecord(prop.targetVectorId);
    const hasCompatibleButtonTarget = Boolean(
      targetFrame
      && targetFrame.parentId === null
      && normalizeFrameHtmlTag(targetFrame.element.dataset.htmlTag || "div") === "button",
    );
    const isValid = prop.type === "boolean"
      ? prop.property === "disabled"
        ? hasCompatibleButtonTarget
        : prop.property === "visibility" && Boolean(targetFrame || targetText || targetVector)
      : prop.type === "string"
        ? prop.property === "textContent" && Boolean(targetText)
        : prop.property === "onClick" && hasCompatibleButtonTarget;
    if (!isValid) return [];

    let exportName = prop.name.trim().replace(/[^a-zA-Z0-9_$]/g, "");
    if (!/^[a-zA-Z_$]/.test(exportName)) exportName = `prop${index + 1}`;
    const baseName = exportName || `prop${index + 1}`;
    let suffix = 2;
    while (usedNames.has(exportName)) {
      exportName = `${baseName}${suffix}`;
      suffix += 1;
    }
    usedNames.add(exportName);
    return [{ ...prop, exportName }];
  });
}

function toReactStyleProperty(property) {
  return property.replace(/-([a-z])/g, (_, character) => character.toUpperCase());
}

function getVariantExportStyle(exportContext, target) {
  const operations = exportContext?.operationsByTarget.get(target) ?? [];
  return Object.fromEntries(operations.flatMap((operation) => {
    if (["textContent", "disabled", "fill", "stroke"].includes(operation.property)) return [];
    if (operation.property === "visibility") {
      return [["visibility", variantBoolean(operation.value) ? "visible" : "hidden"]];
    }
    return [[toReactStyleProperty(operation.property), String(operation.value ?? "")]];
  }));
}

function createVariantExportContext(instance) {
  if (!instance || !(canvasRootStack instanceof HTMLElement)) return null;
  const root = canvasRootStack.cloneNode(true);
  const operations = resolveVariantOperations(instance);
  operations.forEach((operation) => applyVariantOperation(root, operation));
  const operationsByTarget = new Map();
  operations.forEach((operation) => {
    const targetOperations = operationsByTarget.get(operation.target) ?? [];
    const existingIndex = targetOperations.findIndex((entry) => entry.property === operation.property);
    if (existingIndex >= 0) targetOperations.splice(existingIndex, 1);
    targetOperations.push(operation);
    operationsByTarget.set(operation.target, targetOperations);
  });
  return { instance, root, operationsByTarget };
}

function getVariantExportRecord(type, record, exportContext) {
  if (!exportContext) return record;
  const target = record.isComponent ? "component:0" : `${type}:${record.id}`;
  const element = findVariantTarget(exportContext.root, target);
  if (!(element instanceof HTMLElement)) return record;
  const parentId = type === "frame" ? record.parentId : record.parentFrameId;
  const parentTarget = parentId === null ? "component:0" : `frame:${parentId}`;
  const parentElement = record.isComponent ? null : findVariantTarget(exportContext.root, parentTarget);
  return {
    ...record,
    element,
    ...(parentElement instanceof HTMLElement
      ? { exportParentDirection: parentElement.style.flexDirection === "column" ? "vertical" : "horizontal" }
      : {}),
  };
}

function getExportVariants() {
  const usedKeys = new Set();
  return variantInstances.map((instance, index) => {
    const baseKey = instance.name.trim() || `Variant ${index + 1}`;
    let key = baseKey;
    let suffix = 2;
    while (usedKeys.has(key)) key = `${baseKey} ${suffix++}`;
    usedKeys.add(key);
    return { instance, key };
  });
}

function isDirectVisibilityPropAxis(variantProp) {
  return componentProps.some((componentProp) => (
    componentProp.type === "boolean"
    && componentProp.property === "visibility"
    && (
      (componentProp.variantPropId != null
        && variantProp.id != null
        && String(componentProp.variantPropId) === String(variantProp.id))
      || (variantProp.sourceComponentPropId != null
        && componentProp.id != null
        && String(variantProp.sourceComponentPropId) === String(componentProp.id))
      || (String(variantProp.name ?? "").trim() !== ""
        && String(variantProp.name).trim() === String(componentProp.name ?? "").trim())
    )
  ));
}

function getExportVariantAxes() {
  const usedNames = new Set(["variant"]);
  return variantProps
    .filter((prop) => prop.type === "enum" || prop.type === "boolean")
    .filter((prop) => !isDirectVisibilityPropAxis(prop))
    .map((prop, index) => {
      let exportName = prop.name.trim().replace(/[^a-zA-Z0-9_$]/g, "");
      if (!/^[a-zA-Z_$]/.test(exportName)) exportName = `variantProp${index + 1}`;
      const baseName = exportName || `variantProp${index + 1}`;
      let suffix = 2;
      while (usedNames.has(exportName)) exportName = `${baseName}${suffix++}`;
      usedNames.add(exportName);
      return { ...prop, exportName };
    });
}

function getExportVariantAxisValue(instance, axis) {
  return normalizeVariantPropValue(axis, instance?.propValues?.[axis.id]);
}

function getExportVariantAxisDefaultValue(axis) {
  return getVariantPropDefaultValue(axis);
}

function getExportVariantCombinationKey(instance, axes) {
  return JSON.stringify(axes.map((axis) => getExportVariantAxisValue(instance, axis)));
}

function getExportVariantEntries(axes) {
  return getExportVariants().map((entry) => ({
    ...entry,
    combinationKey: getExportVariantCombinationKey(entry.instance, axes),
  }));
}

function renderExportLayer(layer, depth, exportProps, exportContext = null) {
  const indent = "  ".repeat(depth);
  const record = getVariantExportRecord(layer.type, layer.record, exportContext);
  const target = record.isComponent ? "component:0" : `${layer.type}:${record.id}`;
  if (layer.type === "vector") {
    const variantStyle = getVariantExportStyle(exportContext, target);
    const parsed = new DOMParser().parseFromString(record.svgSource, "image/svg+xml");
    const renderedSvg = record.element.querySelector("svg");
    const svgElement = renderedSvg instanceof SVGElement ? renderedSvg : parsed.documentElement;
    const visibilityProp = findVisibilityProp(exportProps, "vector", record.id);
    const { style, rawProperties } = withVisibilityStyle({ ...getExportVectorStyle(record), ...variantStyle }, visibilityProp);
    return serializeSvgElementToJsx(svgElement, depth, style, rawProperties);
  }
  if (layer.type === "text") {
    const value = record.element.textContent || "";
    const stringProp = exportProps.find((prop) => prop.targetTextId === record.id && prop.property === "textContent");
    const content = stringProp ? stringProp.exportName : JSON.stringify(value);
    const textVisibilityProp = findVisibilityProp(exportProps, "text", record.id);
    const variantStyle = getVariantExportStyle(exportContext, target);
    const { style: textStyleObject, rawProperties: textRawProperties } = withVisibilityStyle({ ...getExportTextStyle(record), ...variantStyle }, textVisibilityProp);
    return `${indent}<span style={${formatReactStyle(textStyleObject, textRawProperties)}}>{${content}}</span>`;
  }

  const children = record.isComponent
    ? getLayerChildren(null)
    : getLayerChildren(record.id);
  const frameVisibilityProp = findVisibilityProp(exportProps, "frame", record.id);
  const variantStyle = getVariantExportStyle(exportContext, target);
  const { style: frameStyleObject, rawProperties: frameRawProperties } = withVisibilityStyle({ ...getExportFrameStyle(record), ...variantStyle }, frameVisibilityProp);
  const style = formatReactStyle(frameStyleObject, frameRawProperties);
  const htmlTag = normalizeFrameHtmlTag(record.element.dataset.htmlTag || "div");
  const disabledProp = exportProps.find((prop) => prop.targetFrameId === record.id && prop.property === "disabled");
  const onClickProp = exportProps.find((prop) => prop.targetFrameId === record.id && prop.property === "onClick");
  const isVariantDisabled = record.element.hasAttribute("disabled");
  const attributes = htmlTag === "button"
    ? ` type="button"${disabledProp ? ` disabled={${disabledProp.exportName}}` : isVariantDisabled ? " disabled" : ""}${onClickProp ? ` onClick={${onClickProp.exportName}}` : ""}`
    : "";
  if (children.length === 0) return `${indent}<${htmlTag}${attributes} style={${style}} />`;
  const childMarkup = children.map((child) => renderExportLayer(child, depth + 1, exportProps, exportContext)).join("\n");
  return `${indent}<${htmlTag}${attributes} style={${style}}>\n${childMarkup}\n${indent}</${htmlTag}>`;
}

function createReactComponentSource(componentName) {
  const hasVariants = variantInstances.length > 0;
  const variantAxes = hasVariants ? getExportVariantAxes() : [];
  const excludedVariantPropIds = new Set(variantAxes.map((axis) => axis.id));
  const exportProps = getExportComponentProps({
    reservedNames: ["variant", ...variantAxes.map((axis) => axis.exportName)],
    excludedVariantPropIds,
  });
  const defaultVariant = getDefaultVariantInstance();
  if (hasVariants && defaultVariant) {
    const exportVariants = getExportVariantEntries(variantAxes);
    const defaultExportVariant = exportVariants.find(({ instance }) => instance === defaultVariant) ?? exportVariants[0];
    const variantMarkup = exportVariants.map(({ instance, key }) => {
      const context = createVariantExportContext(instance);
      const markup = renderExportLayer({ type: "frame", record: currentComponent.frameRecord }, 3, exportProps, context);
      return `    ${JSON.stringify(key)}: (\n${markup}\n    ),`;
    }).join("\n");
    const combinationOwners = new Map();
    [defaultExportVariant, ...exportVariants.filter((entry) => entry !== defaultExportVariant)].forEach((entry) => {
      if (!combinationOwners.has(entry.combinationKey)) combinationOwners.set(entry.combinationKey, entry.key);
    });
    const combinationRows = [...combinationOwners.entries()]
      .map(([combinationKey, key]) => `    ${JSON.stringify(combinationKey)}: ${JSON.stringify(key)},`)
      .join("\n");
    const defaultAxisParameters = variantAxes.map((axis) => (
      `${axis.exportName} = ${JSON.stringify(getExportVariantAxisDefaultValue(axis))}`
    ));
    const parameters = [
      ...defaultAxisParameters,
      "variant",
      ...exportProps.map((prop) => prop.type === "action"
        ? prop.exportName
        : `${prop.exportName} = ${JSON.stringify(prop.defaultValue)}`),
    ].join(", ");
    const axisValues = variantAxes.map((axis) => axis.exportName).join(", ");
    return `import React from "react";\n\nexport default function ${componentName}({ ${parameters} }) {\n  const variants = {\n${variantMarkup}\n  };\n  const authoredCombinations = {\n${combinationRows}\n  };\n  const combinationKey = JSON.stringify([${axisValues}]);\n  const selectedVariant = variant ?? authoredCombinations[combinationKey];\n  if (!selectedVariant || !variants[selectedVariant]) {\n    console.warn(${JSON.stringify(`${componentName}: no authored variant matches the supplied variant properties.`)}, { ${axisValues} });\n  }\n  return variants[selectedVariant] ?? variants[${JSON.stringify(defaultExportVariant.key)}];\n}\n`;
  }
  const componentMarkup = currentComponent?.frameRecord
    ? renderExportLayer({ type: "frame", record: currentComponent.frameRecord }, 2, exportProps)
    : "    <></>";
  const parameters = exportProps.length > 0
    ? `{ ${exportProps.map((prop) => prop.type === "action"
      ? prop.exportName
      : `${prop.exportName} = ${JSON.stringify(prop.defaultValue)}`).join(", ")} }`
    : "";

  return `import React from "react";\n\nexport default function ${componentName}(${parameters}) {\n  return (\n${componentMarkup}\n  );\n}\n`;
}

function createStorySource(componentName) {
  const hasVariants = variantInstances.length > 0;
  const variantAxes = hasVariants ? getExportVariantAxes() : [];
  const excludedVariantPropIds = new Set(variantAxes.map((axis) => axis.id));
  const exportProps = getExportComponentProps({
    reservedNames: ["variant", ...variantAxes.map((axis) => axis.exportName)],
    excludedVariantPropIds,
  });
  const exportVariants = getExportVariantEntries(variantAxes);
  const actionProps = exportProps.filter((prop) => prop.type === "action");
  const actionImport = actionProps.length > 0 ? `import { action } from "storybook/actions";\n` : "";
  const actionDeclarations = actionProps.length > 0
    ? `${actionProps.map((prop) => `const ${prop.exportName}Action = action("${prop.property === "onClick" ? "clicked" : prop.exportName}");`).join("\n")}\n\n`
    : "";
  const storyRender = actionProps.length > 0
    ? `\n  render: (args) => (\n    <${componentName}\n      {...args}\n${actionProps.map((prop) => `      ${prop.exportName}={() => ${prop.exportName}Action()}`).join("\n")}\n    />\n  ),`
    : "";
  const variantAxisArgTypes = variantAxes.map((axis) => axis.type === "boolean"
    ? `    ${axis.exportName}: { control: "boolean" },`
    : `    ${axis.exportName}: { control: "select", options: ${JSON.stringify(getVariantPropValues(axis))} },`);
  const variantEscapeArgType = hasVariants
    ? "    variant: { control: false, table: { disable: true } },"
    : "";
  const argTypes = exportProps.length > 0 || hasVariants
    ? `\n  argTypes: {\n${[...variantAxisArgTypes, variantEscapeArgType, ...exportProps.map((prop) => prop.type === "action"
      ? `    ${prop.exportName}: { control: false },`
      : `    ${prop.exportName}: { control: "${prop.type === "string" ? "text" : "boolean"}" },`)].filter(Boolean).join("\n")}\n  },`
    : "";
  const propsWithDefaults = exportProps.filter((prop) => prop.type !== "action");
  const defaultVariant = getDefaultVariantInstance();
  const defaultExportVariant = exportVariants.find(({ instance }) => instance === defaultVariant) ?? exportVariants[0];
  const defaultArgRows = [
    ...variantAxes.map((axis) => `    ${axis.exportName}: ${JSON.stringify(getExportVariantAxisDefaultValue(axis))},`),
    ...propsWithDefaults.map((prop) => `    ${prop.exportName}: ${JSON.stringify(prop.defaultValue)},`),
  ];
  const defaultArgs = defaultArgRows.length > 0
    ? `{\n  args: {\n${defaultArgRows.join("\n")}\n  },\n}`
    : "{}";
  const usedStoryNames = new Set(["Default"]);
  const canonicalCombinationOwner = new Map();
  if (defaultExportVariant) {
    [defaultExportVariant, ...exportVariants.filter((entry) => entry !== defaultExportVariant)].forEach((entry) => {
      if (!canonicalCombinationOwner.has(entry.combinationKey)) canonicalCombinationOwner.set(entry.combinationKey, entry.key);
    });
  }
  const variantStories = exportVariants
    .filter(({ instance }) => instance !== defaultVariant)
    .map(({ instance, key }, index) => {
      let storyName = toReactComponentName(instance.name || `Variant ${index + 2}`);
      const baseName = storyName === "Default" ? "VariantDefault" : storyName;
      storyName = baseName;
      let suffix = 2;
      while (usedStoryNames.has(storyName)) storyName = `${baseName}${suffix++}`;
      usedStoryNames.add(storyName);
      const axisRows = variantAxes
        .map((axis) => `    ${axis.exportName}: ${JSON.stringify(getExportVariantAxisValue(instance, axis))},`);
      const needsNamedEscape = canonicalCombinationOwner.get(
        getExportVariantCombinationKey(instance, variantAxes),
      ) !== key;
      const escapeRow = needsNamedEscape ? [`    variant: ${JSON.stringify(key)},`] : [];
      return `\nexport const ${storyName} = {\n  args: {\n    ...Default.args,\n${[...axisRows, ...escapeRow].join("\n")}\n  },\n};`;
    }).join("\n");
  return `${actionImport}import ${componentName} from "./${componentName}";\n\n${actionDeclarations}const meta = {\n  title: "Components/${componentName}",\n  component: ${componentName},${argTypes}${storyRender}\n};\n\nexport default meta;\n\nexport const Default = ${defaultArgs};${variantStories}\n`;
}

function downloadExportFile(fileName, source) {
  const blob = new Blob([source], { type: "text/javascript;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function exportAllComponents() {
  if (!currentComponent) return;
  saveCurrentComponentWorkspace();
  const originalComponentId = currentComponent.id;
  const exportFiles = [];

  components.forEach((component) => {
    activateComponent(component.id, { saveCurrent: false, selectComponent: false, render: false });
    const componentName = toReactComponentName(component.name || "Generated Component");
    exportFiles.push(
      { name: `${componentName}.jsx`, source: createReactComponentSource(componentName) },
      { name: `${componentName}.stories.jsx`, source: createStorySource(componentName) },
    );
  });

  activateComponent(originalComponentId, { saveCurrent: false, selectComponent: false });
  exportFiles.forEach((file) => downloadExportFile(file.name, file.source));
}

exportComponentsButton?.addEventListener("click", exportAllComponents);
