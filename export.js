/* React and Storybook source generation, SVG serialization, and export downloads. */

const REACT_EXPORT_INTERNAL_NAMES = [
  "variant",
  "variants",
  "authoredCombinations",
  "combinationKey",
  "selectedVariant",
];

const JAVASCRIPT_RESERVED_WORDS = new Set([
  "arguments",
  "await",
  "break",
  "case",
  "catch",
  "class",
  "const",
  "continue",
  "debugger",
  "default",
  "delete",
  "do",
  "else",
  "enum",
  "eval",
  "export",
  "extends",
  "false",
  "finally",
  "for",
  "function",
  "if",
  "implements",
  "import",
  "in",
  "instanceof",
  "interface",
  "let",
  "new",
  "null",
  "package",
  "private",
  "protected",
  "public",
  "return",
  "static",
  "super",
  "switch",
  "this",
  "throw",
  "true",
  "try",
  "typeof",
  "var",
  "void",
  "while",
  "with",
  "yield",
]);

function createExportIdentifierAllocator(reservedNames = []) {
  const usedNames = new Set(reservedNames);
  return (value, fallback) => {
    const sanitizedName = String(value ?? "").trim().replace(/[^a-zA-Z0-9_$]/g, "");
    let exportName = /^[a-zA-Z_$]/.test(sanitizedName) && !JAVASCRIPT_RESERVED_WORDS.has(sanitizedName)
      ? sanitizedName
      : fallback;
    const baseName = exportName;
    let suffix = 2;
    while (usedNames.has(exportName) || JAVASCRIPT_RESERVED_WORDS.has(exportName)) {
      exportName = `${baseName}${suffix++}`;
    }
    usedNames.add(exportName);
    return exportName;
  };
}

function createExportCssClassAllocator(reservedNames = []) {
  const usedNames = new Set(reservedNames.map((name) => String(name).toLowerCase()));
  return (value) => {
    const sanitizedName = String(value ?? "")
      .trim()
      .replace(/[^a-zA-Z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "");
    const baseName = /^[a-zA-Z_]/.test(sanitizedName)
      ? sanitizedName
      : sanitizedName
        ? `Component-${sanitizedName}`
        : "GeneratedComponent";
    let className = baseName;
    let suffix = 2;
    while (usedNames.has(className.toLowerCase())) className = `${baseName}-${suffix++}`;
    usedNames.add(className.toLowerCase());
    return className;
  };
}

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
    .map(([property, value]) => {
      const propertyName = property.startsWith("--") ? JSON.stringify(property) : property;
      const propertyValue = rawProperties?.has(property) ? value : JSON.stringify(value);
      return `${propertyName}: ${propertyValue}`;
    });
  return `{ ${properties.join(", ")} }`;
}

function isZeroCssValue(value) {
  return /^-?0(?:\.0+)?(?:px|em|rem|%)?$/i.test(String(value).trim());
}

function getFiniteExportNumber(value, fallback, { min = -Infinity, max = Infinity } = {}) {
  const normalizedValue = value === undefined || value === null || String(value).trim() === ""
    ? fallback
    : value;
  const number = Number(normalizedValue);
  const fallbackNumber = Number(fallback);
  const safeNumber = Number.isFinite(number)
    ? number
    : (Number.isFinite(fallbackNumber) ? fallbackNumber : 0);
  return Math.max(min, Math.min(max, safeNumber));
}

function getExportLayerVisibility(element) {
  return element.dataset.layerVisibility === "hidden" ? "hidden" : undefined;
}

function getExportOpacity(element) {
  const opacity = getFiniteExportNumber(element.dataset.opacity, 100, { min: 10, max: 100 });
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
    if (mode === "fixed") {
      return `${getFiniteExportNumber(element.dataset[dimension], fallback, { min: 0 })}px`;
    }
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
  const top = getFiniteExportNumber(element.dataset.paddingTop, 10, { min: 0 });
  const right = getFiniteExportNumber(element.dataset.paddingRight, 10, { min: 0 });
  const bottom = getFiniteExportNumber(element.dataset.paddingBottom, 10, { min: 0 });
  const left = getFiniteExportNumber(element.dataset.paddingLeft, 10, { min: 0 });
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
  const gap = getFiniteExportNumber(element.dataset.gap, 10, { min: 0 });
  const radius = getFiniteExportNumber(element.dataset.radius, 0, { min: 0 });
  const alignment = getFrameAlignmentValues(element);
  const outlineBoxShadow = getFrameOutlineBoxShadow(element);
  return {
    opacity: getExportOpacity(element),
    visibility: getExportLayerVisibility(element),
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
  const fontSize = getFiniteExportNumber(element.dataset.fontSize, 14, { min: 0 });
  const fontWeight = getFiniteExportNumber(element.dataset.fontWeight, DEFAULT_FONT_WEIGHT, { min: 1, max: 1000 });
  const exportedLineHeight = lineHeight.toLowerCase() === "auto"
    ? undefined
    : `${getFiniteExportNumber(lineHeight, fontSize, { min: 0 })}px`;
  return {
    opacity: getExportOpacity(element),
    visibility: getExportLayerVisibility(element),
    ...getExportSizingStyle("text", record),
    color: Object.prototype.hasOwnProperty.call(element.dataset, "textColor")
      ? element.dataset.textColor
        ? getColorWithOpacity(element.dataset.textColor, element.dataset.textColorOpacity || "100")
        : "transparent"
      : undefined,
    fontFamily: element.style.fontFamily || '"Inter", sans-serif',
    fontSize: `${fontSize}px`,
    fontWeight,
    lineHeight: exportedLineHeight,
    letterSpacing: isZeroCssValue(letterSpacing) ? undefined : letterSpacing,
    whiteSpace: "pre-wrap",
    overflowWrap: widthMode === "hug" ? undefined : "anywhere",
    ...getExportTextAlignmentStyle(record),
  };
}

function getExportVectorStyle(record) {
  return {
    opacity: getExportOpacity(record.element),
    visibility: getExportLayerVisibility(record.element),
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
  const parsedStyle = document.createElement("span").style;
  parsedStyle.cssText = String(styleValue ?? "");
  return Array.from(parsedStyle).reduce((style, property) => {
    const value = parsedStyle.getPropertyValue(property).trim();
    if (!value) return style;
    const reactProperty = property.startsWith("--") ? property : toReactStyleProperty(property);
    style[reactProperty] = parsedStyle.getPropertyPriority(property) === "important"
      ? `${value} !important`
      : value;
    return style;
  }, {});
}

function serializeSvgElementToJsx(element, depth, rootStyle = null, rawProperties = null, rootClassName = "") {
  const indent = "  ".repeat(depth);
  const attributes = [];
  let inlineStyle = {};
  let existingClassName = "";

  Array.from(element.attributes).forEach((attribute) => {
    if (attribute.name.toLowerCase() === "style") {
      inlineStyle = parseSvgStyle(attribute.value);
      return;
    }
    if (attribute.name.toLowerCase() === "class") {
      existingClassName = attribute.value;
      return;
    }
    attributes.push(` ${toReactSvgAttributeName(attribute.name)}=${JSON.stringify(attribute.value)}`);
  });
  const className = [existingClassName, rootClassName].filter(Boolean).join(" ");
  if (className) attributes.push(` className=${JSON.stringify(className)}`);
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

function getExportComponentProps({
  allocateIdentifier = createExportIdentifierAllocator(),
  excludedVariantPropIds = new Set(),
} = {}) {
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

    const exportName = allocateIdentifier(prop.name, `prop${index + 1}`);
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
    const property = toReactStyleProperty(operation.property);
    const value = String(operation.value ?? "").trim();
    // An authored frame with no fill is represented by an empty background
    // override. Export it explicitly so the browser's native button styling
    // cannot supply an opaque background.
    if (property === "backgroundColor" && value === "") {
      return [[property, "transparent"]];
    }
    return [[property, value]];
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
  return variantModel.getInstances().map((instance, index) => {
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

function getExportVariantAxes(
  allocateIdentifier = createExportIdentifierAllocator(REACT_EXPORT_INTERNAL_NAMES),
) {
  return variantModel.getProps()
    .filter((prop) => prop.type === "enum" || prop.type === "boolean")
    .filter((prop) => !isDirectVisibilityPropAxis(prop))
    .filter((prop) => prop.variantSubtype !== "state")
    .map((prop, index) => {
      return { ...prop, exportName: allocateIdentifier(prop.name, `variantProp${index + 1}`) };
    });
}

function getStateVariantAxes() {
  return variantModel.getProps().filter((prop) => prop.type === "enum" && prop.variantSubtype === "state");
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

function isDefaultStateInstance(instance, stateAxes) {
  return stateAxes.every((axis) => (
    getExportVariantAxisValue(instance, axis) === getExportVariantAxisDefaultValue(axis)
  ));
}

function getBaseExportVariantEntries(axes, stateAxes = getStateVariantAxes()) {
  const grouped = new Map();
  getExportVariantEntries(axes).forEach((entry) => {
    const current = grouped.get(entry.combinationKey);
    if (!current || (!isDefaultStateInstance(current.instance, stateAxes)
      && isDefaultStateInstance(entry.instance, stateAxes))) {
      grouped.set(entry.combinationKey, entry);
    }
  });
  return [...grouped.values()];
}

function getExportScopeClass(cssClassName, index) {
  return `${cssClassName}--variant-${index + 1}`;
}

function getExportTargetClassName(cssClassName, target) {
  if (target === "component:0") return cssClassName;
  const [type, id] = target.split(":");
  return `${cssClassName}__${type}-${id}`;
}

function getExportLayerClassName(cssClassName, target, rootScopeClass = "") {
  return [getExportTargetClassName(cssClassName, target), target === "component:0" ? rootScopeClass : ""]
    .filter(Boolean)
    .join(" ");
}

function renderExportLayer(layer, depth, exportProps, exportContext = null, exportClasses = null) {
  const indent = "  ".repeat(depth);
  const record = getVariantExportRecord(layer.type, layer.record, exportContext);
  const target = record.isComponent ? "component:0" : `${layer.type}:${record.id}`;
  const className = exportClasses
    ? getExportLayerClassName(exportClasses.cssClassName, target, exportClasses.rootScopeClass)
    : "";
  if (layer.type === "vector") {
    const variantStyle = getVariantExportStyle(exportContext, target);
    const parsed = new DOMParser().parseFromString(record.svgSource, "image/svg+xml");
    const renderedSvg = record.element.querySelector("svg");
    const svgElement = renderedSvg instanceof SVGElement ? renderedSvg : parsed.documentElement;
    const visibilityProp = findVisibilityProp(exportProps, "vector", record.id);
    const { style, rawProperties } = withVisibilityStyle({ ...getExportVectorStyle(record), ...variantStyle }, visibilityProp);
    return serializeSvgElementToJsx(svgElement, depth, style, rawProperties, className);
  }
  if (layer.type === "text") {
    const value = record.element.textContent || "";
    const stringProp = exportProps.find((prop) => prop.targetTextId === record.id && prop.property === "textContent");
    const content = stringProp ? stringProp.exportName : JSON.stringify(value);
    const textVisibilityProp = findVisibilityProp(exportProps, "text", record.id);
    const variantStyle = getVariantExportStyle(exportContext, target);
    const { style: textStyleObject, rawProperties: textRawProperties } = withVisibilityStyle({ ...getExportTextStyle(record), ...variantStyle }, textVisibilityProp);
    return `${indent}<span${className ? ` className=${JSON.stringify(className)}` : ""} style={${formatReactStyle(textStyleObject, textRawProperties)}}>{${content}}</span>`;
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
  const classAttribute = className ? ` className=${JSON.stringify(className)}` : "";
  const attributes = htmlTag === "button"
    ? ` type="button"${disabledProp ? ` disabled={${disabledProp.exportName}}` : isVariantDisabled ? " disabled" : ""}${onClickProp ? ` onClick={${onClickProp.exportName}}` : ""}`
    : "";
  if (children.length === 0) return `${indent}<${htmlTag}${classAttribute}${attributes} style={${style}} />`;
  const childMarkup = children.map((child) => renderExportLayer(child, depth + 1, exportProps, exportContext, exportClasses)).join("\n");
  return `${indent}<${htmlTag}${classAttribute}${attributes} style={${style}}>\n${childMarkup}\n${indent}</${htmlTag}>`;
}

function getInteractionPseudoClass(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "hover") return ":hover";
  if (normalized === "active") return ":active";
  if (["focus", "focus-visible", "focus visible"].includes(normalized)) return ":focus-visible";
  return "";
}

function getContextOperationMap(context) {
  const result = new Map();
  context?.operationsByTarget.forEach((operations, target) => {
    const properties = new Map();
    operations.forEach((operation) => properties.set(operation.property, operation.value));
    result.set(target, properties);
  });
  return result;
}

function toCssPropertyName(property) {
  return property.replace(/[A-Z]/g, (character) => `-${character.toLowerCase()}`);
}

function normalizeStateCssDeclaration(property, rawValue) {
  if (["textContent", "disabled", "outlineColorOpacity", "outlinePosition"].includes(property)) return null;
  if (property === "visibility") {
    return { property: "visibility", value: variantBoolean(rawValue) ? "visible" : "hidden" };
  }
  if (property === "outlineWeight") {
    const value = String(rawValue ?? "").trim();
    return { property: "outline-width", value: /^-?\d+(?:\.\d+)?$/.test(value) ? `${value}px` : value };
  }
  const cssProperty = property === "outlineColor" ? "outline-color" : toCssPropertyName(property);
  const value = String(rawValue ?? "").trim();
  if (cssProperty === "background-color" && value === "") return { property: cssProperty, value: "transparent" };
  if (!value) return null;
  return { property: cssProperty, value };
}

function createStateStylesheetSource(
  componentName,
  cssClassName = createExportCssClassAllocator()(componentName),
) {
  const stateAxes = getStateVariantAxes();
  if (stateAxes.length === 0) return "";
  const variantAxes = getExportVariantAxes();
  const baseEntries = getBaseExportVariantEntries(variantAxes, stateAxes)
    .map((entry, index) => ({ ...entry, scopeClass: getExportScopeClass(cssClassName, index) }));
  const baseByCombination = new Map(baseEntries.map((entry) => [entry.combinationKey, entry]));
  const rules = [];

  getExportVariantEntries(variantAxes).forEach((stateEntry) => {
    const pseudoClasses = stateAxes
      .map((axis) => getInteractionPseudoClass(getExportVariantAxisValue(stateEntry.instance, axis)))
      .filter(Boolean);
    if (pseudoClasses.length === 0) return;
    const baseEntry = baseByCombination.get(stateEntry.combinationKey);
    if (!baseEntry) return;
    const baseOperations = getContextOperationMap(createVariantExportContext(baseEntry.instance));
    const stateOperations = getContextOperationMap(createVariantExportContext(stateEntry.instance));

    stateOperations.forEach((properties, target) => {
      const declarations = [];
      properties.forEach((value, property) => {
        if (baseOperations.get(target)?.get(property) === value) return;
        const declaration = normalizeStateCssDeclaration(property, value);
        if (declaration) declarations.push(declaration);
      });
      if (declarations.length === 0) return;
      const rootSelector = `.${cssClassName}.${baseEntry.scopeClass}${pseudoClasses.join("")}`;
      const targetClass = getExportTargetClassName(cssClassName, target);
      let selector = target === "component:0" ? rootSelector : `${rootSelector} .${targetClass}`;
      if (declarations.some(({ property }) => property === "fill" || property === "stroke")) {
        selector = `${selector},\n${selector} *`;
      }
      const declarationRows = declarations
        .map(({ property, value }) => `  ${property}: ${value} !important;`)
        .join("\n");
      rules.push(`${selector} {\n${declarationRows}\n}`);
    });
  });

  return `/* Interaction states authored in ${componentName}. */\n${rules.join("\n\n")}\n`;
}

function createReactComponentSource(
  componentName,
  cssClassName = createExportCssClassAllocator()(componentName),
) {
  const hasVariants = variantModel.getInstances().length > 0;
  const allocateIdentifier = createExportIdentifierAllocator(REACT_EXPORT_INTERNAL_NAMES);
  const variantAxes = hasVariants ? getExportVariantAxes(allocateIdentifier) : [];
  const stateAxes = hasVariants ? getStateVariantAxes() : [];
  const excludedVariantPropIds = new Set([...variantAxes, ...stateAxes].map((axis) => axis.id));
  const exportProps = getExportComponentProps({
    allocateIdentifier,
    excludedVariantPropIds,
  });
  const defaultVariant = getDefaultVariantInstance();
  if (hasVariants && defaultVariant) {
    const exportVariants = getBaseExportVariantEntries(variantAxes, stateAxes)
      .map((entry, index) => ({ ...entry, scopeClass: getExportScopeClass(cssClassName, index) }));
    const defaultExportVariant = exportVariants.find(({ instance }) => instance === defaultVariant) ?? exportVariants[0];
    const variantMarkup = exportVariants.map(({ instance, key, scopeClass }) => {
      const context = createVariantExportContext(instance);
      const markup = renderExportLayer(
        { type: "frame", record: currentComponent.frameRecord },
        3,
        exportProps,
        context,
        { cssClassName, rootScopeClass: scopeClass },
      );
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
    const stateStyleImport = stateAxes.length > 0 ? `import "./${componentName}.css";\n` : "";
    return `import React from "react";\n${stateStyleImport}\nexport default function ${componentName}({ ${parameters} }) {\n  const variants = {\n${variantMarkup}\n  };\n  const authoredCombinations = {\n${combinationRows}\n  };\n  const combinationKey = JSON.stringify([${axisValues}]);\n  const selectedVariant = variant ?? authoredCombinations[combinationKey];\n  if (!selectedVariant || !variants[selectedVariant]) {\n    console.warn(${JSON.stringify(`${componentName}: no authored variant matches the supplied variant properties.`)}, { ${axisValues} });\n  }\n  return variants[selectedVariant] ?? variants[${JSON.stringify(defaultExportVariant.key)}];\n}\n`;
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
  const hasVariants = variantModel.getInstances().length > 0;
  const allocateIdentifier = createExportIdentifierAllocator(REACT_EXPORT_INTERNAL_NAMES);
  const variantAxes = hasVariants ? getExportVariantAxes(allocateIdentifier) : [];
  const stateAxes = hasVariants ? getStateVariantAxes() : [];
  const excludedVariantPropIds = new Set([...variantAxes, ...stateAxes].map((axis) => axis.id));
  const exportProps = getExportComponentProps({
    allocateIdentifier,
    excludedVariantPropIds,
  });
  const exportVariants = getBaseExportVariantEntries(variantAxes, stateAxes);
  const actionProps = exportProps.filter((prop) => prop.type === "action");
  const actionImport = actionProps.length > 0 ? `import { action } from "storybook/actions";\n` : "";
  const actionDeclarations = actionProps.length > 0
    ? `${actionProps.map((prop) => `const ${prop.exportName}Action = action("${prop.property === "onClick" ? "clicked" : prop.exportName}");`).join("\n")}\n\n`
    : "";
  const variantAxisArgTypes = variantAxes.map((axis) => axis.type === "boolean"
    ? `    ${axis.exportName}: { control: "boolean" },`
    : `    ${axis.exportName}: { control: "select", options: ${JSON.stringify(getVariantPropValues(axis))} },`);
  const hasSelectableVariants = exportVariants.length > 1;
  const variantEscapeArgType = hasSelectableVariants
    ? "    variant: { control: false, table: { disable: true } },"
    : "";
  const argTypes = exportProps.length > 0 || variantAxes.length > 0 || hasSelectableVariants
    ? `\n  argTypes: {\n${[...variantAxisArgTypes, variantEscapeArgType, ...exportProps.map((prop) => prop.type === "action"
      ? `    ${prop.exportName}: { control: false },`
      : `    ${prop.exportName}: { control: "${prop.type === "string" ? "text" : "boolean"}" },`)].filter(Boolean).join("\n")}\n  },`
    : "";
  const defaultVariant = getDefaultVariantInstance();
  const defaultExportVariant = exportVariants.find(({ instance }) => instance === defaultVariant) ?? exportVariants[0];
  const defaultArgRows = [
    ...variantAxes.map((axis) => `    ${axis.exportName}: ${JSON.stringify(getExportVariantAxisDefaultValue(axis))},`),
    ...exportProps.map((prop) => prop.type === "action"
      ? `    ${prop.exportName}: ${prop.exportName}Action,`
      : `    ${prop.exportName}: ${JSON.stringify(prop.defaultValue)},`),
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
  return `${actionImport}import ${componentName} from "./${componentName}";\n\n${actionDeclarations}const meta = {\n  title: "Components/${componentName}",\n  component: ${componentName},${argTypes}\n};\n\nexport default meta;\n\nexport const Default = ${defaultArgs};${variantStories}\n`;
}

function downloadExportFile(fileName, source) {
  const type = fileName.endsWith(".css") ? "text/css;charset=utf-8" : "text/javascript;charset=utf-8";
  const blob = new Blob([source], { type });
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
  const usedComponentNames = new Set();
  const allocateCssClassName = createExportCssClassAllocator();

  try {
    components.forEach((component) => {
      activateComponent(component.id, { saveCurrent: false, selectComponent: false, render: false });
      const baseName = toReactComponentName(component.name || "Generated Component");
      let componentName = baseName;
      let suffix = 2;
      while (usedComponentNames.has(componentName.toLowerCase())) {
        componentName = `${baseName}${suffix++}`;
      }
      usedComponentNames.add(componentName.toLowerCase());
      const cssClassName = allocateCssClassName(componentName);
      const stateStylesheet = createStateStylesheetSource(componentName, cssClassName);
      exportFiles.push(
        { name: `${componentName}.jsx`, source: createReactComponentSource(componentName, cssClassName) },
        { name: `${componentName}.stories.jsx`, source: createStorySource(componentName) },
        ...(stateStylesheet ? [{ name: `${componentName}.css`, source: stateStylesheet }] : []),
      );
    });
  } finally {
    activateComponent(originalComponentId, { saveCurrent: false, selectComponent: false });
  }

  exportFiles.forEach((file) => downloadExportFile(file.name, file.source));
}

exportComponentsButton?.addEventListener("click", exportAllComponents);
