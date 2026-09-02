/* Style collection and React/CSS value conversion for component exports. */

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

function toReactStyleProperty(property) {
  return property.replace(/-([a-z])/g, (_, character) => character.toUpperCase());
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
