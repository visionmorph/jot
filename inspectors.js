/* Page and layer inspectors, typography controls, component props, and property editing. */

function normalizeFrameHtmlTag(value) {
  return value.trim().toLowerCase() === "button" ? "button" : "div";
}

function normalizeFrameAlignment(value) {
  const alignments = [
    "top-left", "top-center", "top-right",
    "center-left", "center", "center-right",
    "bottom-left", "bottom-center", "bottom-right",
  ];
  return alignments.includes(value) ? value : "top-left";
}

function normalizeHexColor(value) {
  const match = String(value || "").trim().replace(/^#/, "").match(/^([\da-f]{3}|[\da-f]{6})$/i);
  if (!match) return "";
  const hex = match[1].length === 3
    ? [...match[1]].map((character) => character.repeat(2)).join("")
    : match[1];
  return `#${hex.toUpperCase()}`;
}

function normalizeColorOpacity(value) {
  const opacity = Number(value);
  return Number.isFinite(opacity) ? Math.max(0, Math.min(100, opacity)) : 100;
}

function getColorWithOpacity(color, opacity = 100) {
  const normalizedColor = normalizeHexColor(color);
  if (!normalizedColor) return "";
  const normalizedOpacity = normalizeColorOpacity(opacity);
  if (normalizedOpacity === 100) return normalizedColor;
  const red = Number.parseInt(normalizedColor.slice(1, 3), 16);
  const green = Number.parseInt(normalizedColor.slice(3, 5), 16);
  const blue = Number.parseInt(normalizedColor.slice(5, 7), 16);
  const alpha = Number((normalizedOpacity / 100).toFixed(3));
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function syncCustomColorControl(picker, color, opacity = 100) {
  if (!(picker instanceof HTMLInputElement)) return;
  const control = picker.closest("[data-color-control]");
  if (!(control instanceof HTMLElement)) return;
  const normalizedColor = normalizeHexColor(color);
  const normalizedOpacity = normalizeColorOpacity(opacity);
  const hexInput = control.querySelector("[data-color-hex]");
  const opacityInput = control.querySelector("[data-color-opacity]");
  const swatch = control.querySelector("[data-color-swatch]");
  const section = control.closest("[data-paint-section]");
  const actionButton = section?.querySelector("[data-color-action]");
  const actionWrapper = actionButton?.closest(".tooltip");
  const removeButton = control.querySelector("[data-color-remove-action]");
  const removeWrapper = removeButton?.closest(".tooltip");
  const actionTooltip = actionButton?.closest(".tooltip")?.querySelector("[data-tooltip-content]");
  const propertyLabels = {
    canvas: "page fill",
    "frame-background": "frame fill",
    "frame-outline": "frame border",
    text: "text fill",
    vector: "vector fill",
  };
  const isEmpty = !normalizedColor;

  picker.value = normalizedColor || "#000000";
  if (hexInput instanceof HTMLInputElement) hexInput.value = normalizedColor.slice(1);
  if (opacityInput instanceof HTMLInputElement) opacityInput.value = String(normalizedOpacity);
  if (swatch instanceof HTMLElement) {
    swatch.style.backgroundColor = normalizedColor || "transparent";
  }
  control.classList.toggle("is-empty", isEmpty);
  control.hidden = isEmpty;
  if (control.dataset.colorControl === "frame-outline" && frameOutlineControls instanceof HTMLElement) {
    frameOutlineControls.hidden = isEmpty;
  }
  if (actionButton instanceof HTMLButtonElement) {
    const propertyLabel = propertyLabels[control.dataset.colorControl] || "color";
    actionButton.setAttribute("aria-label", `Add ${propertyLabel}`);
  }
  if (actionTooltip instanceof HTMLElement) {
    actionTooltip.textContent = "Add";
  }
  if (actionWrapper instanceof HTMLElement) actionWrapper.hidden = !isEmpty;
  if (removeWrapper instanceof HTMLElement) removeWrapper.hidden = isEmpty;
  syncOpenColorPicker(control, normalizedColor, normalizedOpacity);
}

function getFrameAlignmentValues(element) {
  const alignment = normalizeFrameAlignment(element.dataset.alignment || "top-left");
  const [vertical, horizontal] = alignment === "center" ? ["center", "center"] : alignment.split("-");
  const toFlexValue = (value) => value === "center" ? "center" : value === "right" || value === "bottom" ? "flex-end" : "flex-start";
  const direction = element.dataset.direction === "vertical" ? "vertical" : "horizontal";
  return direction === "vertical"
    ? { alignItems: toFlexValue(horizontal), justifyContent: toFlexValue(vertical) }
    : { alignItems: toFlexValue(vertical), justifyContent: toFlexValue(horizontal) };
}

function syncFrameAlignmentDistribution(element) {
  if (!(frameAlignmentGrid instanceof HTMLElement)) return;
  const isVariantSelected = selectedVariantInstanceId !== null;
  const direction = (isVariantSelected
    ? getSelectedVariantTargetStyleOverride("flexDirection", element.dataset.direction === "vertical" ? "column" : "row")
    : element.dataset.direction === "vertical" ? "column" : "row") === "column"
      ? "vertical"
      : "horizontal";
  const fallbackValues = getFrameAlignmentValues({
    dataset: {
      alignment: element.dataset.alignment,
      direction,
    },
  });
  const alignItems = isVariantSelected
    ? getSelectedVariantTargetStyleOverride("alignItems", element.style.alignItems || fallbackValues.alignItems)
    : element.style.alignItems || fallbackValues.alignItems;
  const justifyContent = isVariantSelected
    ? getSelectedVariantTargetStyleOverride("justifyContent", element.style.justifyContent || fallbackValues.justifyContent)
    : element.style.justifyContent || fallbackValues.justifyContent;
  const isSpaceBetween = isVariantSelected
    ? justifyContent === "space-between"
    : element.dataset.gapMode === "auto";

  frameAlignmentGrid.dataset.direction = direction;
  frameAlignmentGrid.dataset.spaceBetween = String(isSpaceBetween);
  frameAlignmentOptions.forEach((option) => {
    const alignment = normalizeFrameAlignment(option.getAttribute("data-frame-alignment") || "top-left");
    const values = getFrameAlignmentValues({ dataset: { alignment, direction } });
    const isSelected = values.alignItems === alignItems
      && (isSpaceBetween || values.justifyContent === justifyContent);
    option.classList.toggle("is-selected", isSelected);
    option.setAttribute("aria-pressed", String(isSelected));
  });
}

function isFrameAlignmentOptionSelected(element, alignment) {
  const selectedAlignment = normalizeFrameAlignment(element.dataset.alignment || "top-left");
  if (element.dataset.gapMode !== "auto") return selectedAlignment === alignment;
  const selectedAxes = selectedAlignment === "center" ? ["center", "center"] : selectedAlignment.split("-");
  const optionAxes = alignment === "center" ? ["center", "center"] : alignment.split("-");
  return element.dataset.direction === "vertical"
    ? selectedAxes[1] === optionAxes[1]
    : selectedAxes[0] === optionAxes[0];
}

function getTextAlignmentValues(element) {
  const alignment = normalizeFrameAlignment(element.dataset.alignment || "top-left");
  const [vertical, horizontal] = alignment === "center" ? ["center", "center"] : alignment.split("-");
  return {
    display: "block",
    alignContent: vertical === "center" ? "center" : vertical === "bottom" ? "end" : "start",
    textAlign: horizontal === "center" ? "center" : horizontal === "right" ? "right" : "left",
  };
}

function getFrameOutlineBoxShadow(element) {
  const color = getColorWithOpacity(
    element.dataset.outlineColor || "",
    element.dataset.outlineColorOpacity || "100",
  );
  const weight = Math.max(0, Number(element.dataset.outlineWeight || "1"));
  if (!color || !Number.isFinite(weight) || weight === 0) return "";
  const position = ["inside", "outside", "center"].includes(element.dataset.outlinePosition)
    ? element.dataset.outlinePosition
    : "inside";
  if (position === "outside") return `0 0 0 ${weight}px ${color}`;
  if (position === "center") {
    const halfWeight = weight / 2;
    return `0 0 0 ${halfWeight}px ${color}, inset 0 0 0 ${halfWeight}px ${color}`;
  }
  return `inset 0 0 0 ${weight}px ${color}`;
}

function getFontRecord(family) {
  return fontCatalog.find((font) => font.family === family)
    ?? FALLBACK_FONT_CATALOG.find((font) => font.family === family);
}

function getFontFallback(category) {
  if (/serif/i.test(category) && !/sans/i.test(category)) return "serif";
  if (/mono/i.test(category)) return "monospace";
  if (/handwriting/i.test(category)) return "cursive";
  return "sans-serif";
}

function loadGoogleFont(family, weight) {
  const key = `${family}:${weight}`;
  if (loadedGoogleFonts.has(key)) return;

  const link = document.createElement("link");
  const encodedFamily = encodeURIComponent(family).replace(/%20/g, "+");
  link.rel = "stylesheet";
  link.href = `https://fonts.googleapis.com/css2?family=${encodedFamily}:wght@${weight}&display=swap`;
  link.dataset.googleFont = key;
  document.head.append(link);
  loadedGoogleFonts.add(key);
}

function populateWeightOptions(family, selectedWeight = DEFAULT_FONT_WEIGHT) {
  if (!(weightSelect instanceof HTMLSelectElement)) return;
  const font = getFontRecord(family);
  const weights = font?.weights?.length ? font.weights : [DEFAULT_FONT_WEIGHT];
  const resolvedWeight = weights.includes(Number(selectedWeight))
    ? Number(selectedWeight)
    : weights.includes(DEFAULT_FONT_WEIGHT)
      ? DEFAULT_FONT_WEIGHT
      : weights[0];

  weightSelect.replaceChildren(...weights.map((weight) => {
    const option = document.createElement("option");
    option.value = String(weight);
    option.textContent = WEIGHT_LABELS[weight] ?? String(weight);
    option.selected = weight === resolvedWeight;
    return option;
  }));
}

function populateFontOptions() {
  if (!(fontSelect instanceof HTMLSelectElement)) return;
  const currentFamily = fontSelect.value || DEFAULT_FONT_FAMILY;
  fontSelect.replaceChildren(...fontCatalog.map((font) => {
    const option = document.createElement("option");
    option.value = font.family;
    option.textContent = font.family;
    option.selected = font.family === currentFamily;
    return option;
  }));
}

async function loadFontCatalog() {
  try {
    const response = await fetch("google-fonts.json");
    if (!response.ok) throw new Error("Unable to load the font catalog.");
    const catalog = await response.json();
    if (!Array.isArray(catalog) || catalog.length === 0) throw new Error("The font catalog is empty.");
    fontCatalog = catalog;
  } catch {
    fontCatalog = FALLBACK_FONT_CATALOG;
  }

  populateFontOptions();
  populateWeightOptions(fontSelect instanceof HTMLSelectElement ? fontSelect.value : DEFAULT_FONT_FAMILY);
}

function syncSelectedTextSizeInputs() {
  const record = getSelectedTextRecord();
  if (!record) return;
  const { element } = record;
  const bounds = element.getBoundingClientRect();
  textLayerSizeInputs.forEach((input) => {
    if (!(input instanceof HTMLInputElement)) return;
    const dimension = input.dataset.textLayerSize;
    if (dimension !== "width" && dimension !== "height") return;
    const mode = getLayerDimensionMode(element, dimension, "hug");
    input.value = mode === "fixed"
      ? element.dataset[dimension] || String(Math.round(bounds[dimension]))
      : mode === "fill" ? "Fill" : "Hug";
    const wrapper = input.closest("[data-size-combobox]");
    if (wrapper instanceof HTMLElement) updateSizeOptionSelection(wrapper, mode);
  });
}

function syncInspectorToSelectedText() {
  const record = getSelectedTextRecord();
  if (!record) return;

  const { element } = record;
  const styles = record.isVariantInstance ? getComputedStyle(element) : null;
  const family = record.isVariantInstance
    ? styles.fontFamily.split(",")[0].replace(/^['"]|['"]$/g, "").trim() || DEFAULT_FONT_FAMILY
    : element.dataset.fontFamily || DEFAULT_FONT_FAMILY;
  const weight = Number(record.isVariantInstance ? styles.fontWeight : element.dataset.fontWeight || DEFAULT_FONT_WEIGHT);
  if (fontSelect instanceof HTMLSelectElement) fontSelect.value = family;
  populateWeightOptions(family, weight);
  if (sizeSelect instanceof HTMLInputElement) {
    sizeSelect.value = record.isVariantInstance ? String(Number.parseFloat(styles.fontSize) || 14) : element.dataset.fontSize || "14";
    syncTextSizeCombobox(sizeSelect.value);
  }
  if (lineHeightInput instanceof HTMLInputElement) {
    lineHeightInput.value = record.isVariantInstance
      ? styles.lineHeight === "normal" ? "Auto" : String(Number.parseFloat(styles.lineHeight))
      : element.dataset.lineHeight || "Auto";
  }
  if (letterSpacingInput instanceof HTMLInputElement) {
    const renderedSpacing = record.isVariantInstance ? styles.letterSpacing : "";
    letterSpacingInput.value = record.isVariantInstance
      ? renderedSpacing === "normal" ? "0%" : renderedSpacing
      : element.dataset.letterSpacing || "0%";
  }
  if (textColorPicker instanceof HTMLInputElement) {
    const renderedColor = record.isVariantInstance ? styles.color : "";
    const rgbaAlpha = renderedColor.match(/^rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\)$/i);
    const isTransparent = renderedColor === "transparent" || (rgbaAlpha && Number(rgbaAlpha[1]) === 0);
    const color = record.isVariantInstance
      ? isTransparent ? "" : cssColorToHex(renderedColor) || "#000000"
      : Object.prototype.hasOwnProperty.call(element.dataset, "textColor") ? element.dataset.textColor : "#000000";
    const opacity = record.isVariantInstance ? rgbaAlpha ? Number(rgbaAlpha[1]) * 100 : 100 : element.dataset.textColorOpacity || "100";
    syncCustomColorControl(textColorPicker, color, opacity);
  }
  textAlignmentOptions.forEach((option) => {
    const vertical = record.isVariantInstance
      ? styles.alignContent === "center" ? "center" : styles.alignContent === "end" ? "bottom" : "top"
      : null;
    const horizontal = record.isVariantInstance
      ? styles.textAlign === "center" ? "center" : styles.textAlign === "right" ? "right" : "left"
      : null;
    const alignment = record.isVariantInstance
      ? vertical === "center" && horizontal === "center" ? "center" : `${vertical}-${horizontal}`
      : normalizeFrameAlignment(element.dataset.alignment || "top-left");
    const isSelected = option.getAttribute("data-text-alignment") === alignment;
    option.classList.toggle("is-selected", isSelected);
    option.setAttribute("aria-pressed", String(isSelected));
  });
  syncSelectedTextSizeInputs();
}

function syncFramePaddingAxisInputs(element) {
  framePaddingAxisInputs.forEach((input) => {
    if (!(input instanceof HTMLInputElement)) return;
    const sides = input.dataset.framePaddingAxis === "y" ? ["top", "bottom"] : ["left", "right"];
    const values = sides.map((side) => {
      const property = `padding${side[0].toUpperCase()}${side.slice(1)}`;
      const fallback = `${element.dataset[property] || "10"}px`;
      const value = selectedVariantInstanceId !== null
        ? getSelectedVariantTargetStyleOverride(property, fallback)
        : fallback;
      return Number(String(value).replace(/px$/i, ""));
    });
    input.value = values[0] === values[1] ? String(values[0]) : "";
  });
}

function setFramePaddingControlMode(isIndividual) {
  if (framePaddingModeToggle instanceof HTMLButtonElement) {
    framePaddingModeToggle.setAttribute("aria-pressed", String(isIndividual));
  }
  if (framePaddingSides instanceof HTMLElement) framePaddingSides.hidden = !isIndividual;
  if (framePaddingAxes instanceof HTMLElement) framePaddingAxes.hidden = isIndividual;
}

function syncInspectorToSelectedFrame() {
  const record = getSelectedFrameRecord();
  if (!record) return;
  const { element } = record;
  const isVariantSelected = selectedVariantInstanceId !== null;
  const getValue = (property, fallback) => isVariantSelected
    ? getSelectedVariantTargetStyleOverride(property, fallback)
    : fallback;

  if (frameInspectorHeading instanceof HTMLElement) {
    frameInspectorHeading.textContent = record.isComponent
      ? currentComponent?.name || "Component"
      : "Frame";
  }
  if (addVariantAction instanceof HTMLElement) addVariantAction.hidden = !record.isComponent;

  frameDirectionOptions.forEach((option) => {
    const direction = getValue("flexDirection", element.dataset.direction === "vertical" ? "column" : "row") === "column"
      ? "vertical"
      : "horizontal";
    const isSelected = option.getAttribute("data-frame-direction") === direction;
    option.classList.toggle("is-selected", isSelected);
    option.setAttribute("aria-pressed", String(isSelected));
  });
  syncFrameAlignmentDistribution(element);
  if (frameGapInput instanceof HTMLInputElement) {
    const gap = getValue("gap", element.dataset.gapMode === "auto" ? "0px" : `${element.dataset.gap || "10"}px`);
    frameGapInput.value = element.dataset.gapMode === "auto" && !isVariantSelected
      ? "Auto"
      : String(gap).replace(/px$/i, "");
  }

  frameSizeInputs.forEach((input) => {
    if (!(input instanceof HTMLInputElement)) return;
    const dimension = input.dataset.frameSize;
    if (dimension !== "width" && dimension !== "height") return;
    const override = getValue(dimension, "");
    const mode = getLayerDimensionMode(element, dimension);
    input.value = override || (mode === "fixed"
      ? element.dataset[dimension] || "100"
      : mode === "fill" ? "Fill" : "Hug");
    const wrapper = input.closest("[data-size-combobox]");
    if (wrapper instanceof HTMLElement) updateSizeOptionSelection(wrapper, mode);
  });

  framePaddingInputs.forEach((input) => {
    if (!(input instanceof HTMLInputElement)) return;
    const side = input.dataset.framePadding;
    if (!side) return;
    input.value = String(getValue(
      `padding${side[0].toUpperCase()}${side.slice(1)}`,
      `${element.dataset[`padding${side[0].toUpperCase()}${side.slice(1)}`] || "10"}px`,
    )).replace(/px$/, "");
  });
  syncFramePaddingAxisInputs(element);

  if (frameRadiusInput instanceof HTMLInputElement) {
    frameRadiusInput.value = String(getValue("borderRadius", `${element.dataset.radius || "0"}px`)).replace(/px$/, "");
  }
  if (frameColorPicker instanceof HTMLInputElement) {
    const colorValue = getValue("backgroundColor", element.dataset.frameColor || "");
    const rgbaAlpha = String(colorValue).match(/^rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\)$/i);
    const color = normalizeHexColor(colorValue) || cssColorToHex(colorValue) || "";
    const opacity = rgbaAlpha ? Number(rgbaAlpha[1]) * 100 : element.dataset.frameColorOpacity || "100";
    syncCustomColorControl(frameColorPicker, color, opacity);
  }
  if (frameOutlineColorPicker instanceof HTMLInputElement) {
    const color = element.dataset.outlineColor || "";
    syncCustomColorControl(frameOutlineColorPicker, color, element.dataset.outlineColorOpacity || "100");
  }
  if (frameOutlinePositionSelect instanceof HTMLSelectElement) {
    frameOutlinePositionSelect.value = ["inside", "outside", "center"].includes(element.dataset.outlinePosition)
      ? element.dataset.outlinePosition
      : "inside";
  }
  if (frameOutlineWeightInput instanceof HTMLInputElement) {
    frameOutlineWeightInput.value = element.dataset.outlineWeight || "1";
  }
  if (frameHtmlTagInput instanceof HTMLSelectElement) {
    frameHtmlTagInput.value = normalizeFrameHtmlTag(element.dataset.htmlTag || "div");
  }
}

function isSolidSvgPaint(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized || normalized === "none" || normalized === "transparent" || normalized.includes("url(")) return false;
  const rgbaValues = normalized.match(/[\d.]+/g);
  return !(normalized.startsWith("rgba") && rgbaValues?.length >= 4 && Number(rgbaValues[3]) === 0);
}

function cssColorToHex(value) {
  const normalized = String(value || "").trim();
  const hexMatch = normalized.match(/^#([\da-f]{3}|[\da-f]{6})$/i);
  if (hexMatch) {
    const hex = hexMatch[1];
    return `#${hex.length === 3 ? [...hex].map((character) => character.repeat(2)).join("") : hex}`.toLowerCase();
  }
  const colorValues = normalized.match(/[\d.]+/g);
  if (!colorValues || colorValues.length < 3) return null;
  const [red, green, blue] = colorValues.slice(0, 3).map((channel) => Math.max(0, Math.min(255, Math.round(Number(channel)))));
  return `#${[red, green, blue].map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

function getVectorPaintElements(svg) {
  const paintableTags = new Set(["path", "rect", "circle", "ellipse", "line", "polyline", "polygon", "text", "tspan", "use"]);
  return Array.from(svg.querySelectorAll("*")).filter((element) => paintableTags.has(element.localName.toLowerCase()));
}

function getVectorRenderedColor(record) {
  const svg = record.element.querySelector("svg");
  if (!(svg instanceof SVGElement)) return "#000000";
  for (const element of getVectorPaintElements(svg)) {
    const styles = getComputedStyle(element);
    const paint = isSolidSvgPaint(styles.fill) ? styles.fill : isSolidSvgPaint(styles.stroke) ? styles.stroke : null;
    const color = paint ? cssColorToHex(paint) : null;
    if (color) return color;
  }
  return "#000000";
}

function getVectorRenderedOpacity(record) {
  const svg = record.element.querySelector("svg");
  if (!(svg instanceof SVGElement)) return 100;
  for (const element of getVectorPaintElements(svg)) {
    const styles = getComputedStyle(element);
    const paint = isSolidSvgPaint(styles.fill) ? styles.fill : isSolidSvgPaint(styles.stroke) ? styles.stroke : null;
    if (!paint) continue;
    const alpha = paint.match(/^rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\)$/i);
    return normalizeColorOpacity(alpha ? Number(alpha[1]) * 100 : 100);
  }
  return 100;
}

function getVectorPaintProperties(record) {
  const svg = record.element.querySelector("svg");
  if (!(svg instanceof SVGElement)) return [];
  const properties = new Set();
  getVectorPaintElements(svg).forEach((element) => {
    const styles = getComputedStyle(element);
    if (isSolidSvgPaint(styles.fill)) properties.add("fill");
    if (isSolidSvgPaint(styles.stroke)) properties.add("stroke");
  });
  return [...properties];
}

function applyVectorColor(record, color) {
  const canvasSvg = record.element.querySelector("svg");
  if (!(canvasSvg instanceof SVGElement)) return;
  const sourceDocument = new DOMParser().parseFromString(record.svgSource, "image/svg+xml");
  const sourceSvg = sourceDocument.documentElement;
  const canvasPaintElements = getVectorPaintElements(canvasSvg);
  const sourcePaintElements = getVectorPaintElements(sourceSvg);

  canvasPaintElements.forEach((canvasElement, index) => {
    const sourceElement = sourcePaintElements[index];
    if (!(sourceElement instanceof SVGElement)) return;
    const styles = getComputedStyle(canvasElement);
    if (isSolidSvgPaint(styles.fill)) {
      canvasElement.style.fill = color;
      sourceElement.style.fill = color;
    }
    if (isSolidSvgPaint(styles.stroke)) {
      canvasElement.style.stroke = color;
      sourceElement.style.stroke = color;
    }
  });

  record.svgSource = new XMLSerializer().serializeToString(sourceSvg);
  record.element.dataset.vectorColor = color;
}

function removeVectorColor(record) {
  const source = record.originalSvgSource || record.svgSource;
  const sourceDocument = new DOMParser().parseFromString(source, "image/svg+xml");
  const sourceSvg = sourceDocument.documentElement;
  getVectorPaintElements(sourceSvg).forEach((element) => {
    element.style.fill = "none";
    element.style.stroke = "none";
  });
  record.svgSource = new XMLSerializer().serializeToString(sourceSvg);
  record.element.replaceChildren(createCanvasSvg(record.svgSource));
  record.element.dataset.vectorColor = "";
}

function syncInspectorToSelectedVector() {
  const record = getSelectedVectorRecord();
  if (!record) return;
  const bounds = record.element.getBoundingClientRect();
  vectorSizeInputs.forEach((input) => {
    if (!(input instanceof HTMLInputElement)) return;
    const dimension = input.dataset.vectorSize;
    if (dimension !== "width" && dimension !== "height") return;
    input.value = record.element.dataset[dimension] || String(Math.round(bounds[dimension]));
  });
  if (vectorColorPicker instanceof HTMLInputElement) {
    const hasStoredColor = Object.prototype.hasOwnProperty.call(record.element.dataset, "vectorColor");
    const color = hasStoredColor ? record.element.dataset.vectorColor : getVectorRenderedColor(record);
    if (!hasStoredColor) record.element.dataset.vectorColor = color;
    syncCustomColorControl(vectorColorPicker, color, record.element.dataset.vectorColorOpacity || "100");
  }
}

function updateInspector() {
  const isVariantSelected = selectedVariantInstanceId !== null;
  const variantTargetType = isVariantSelected ? getVariantTargetType(selectedVariantLayerTarget) : null;
  const isVariantTextSelected = variantTargetType === "text";
  const isVariantFrameSelected = variantTargetType === "frame";
  const isVariantVectorSelected = variantTargetType === "vector";
  const isComponentSelected = selectedComponentId === currentComponent?.id
    || (isVariantSelected && selectedVariantLayerTarget === null);
  const isTextSelected = isVariantTextSelected || (!isComponentSelected && selectedCanvasText !== null);
  const isFrameSelected = isComponentSelected || isVariantFrameSelected || selectedCanvasFrame !== null;
  const isVectorSelected = isVariantVectorSelected || (!isComponentSelected && selectedCanvasVector !== null);
  if (pageInspector instanceof HTMLElement) pageInspector.hidden = isTextSelected || isFrameSelected || isVectorSelected;
  if (frameInspector instanceof HTMLElement) frameInspector.hidden = !isFrameSelected;
  if (textInspector instanceof HTMLElement) textInspector.hidden = !isTextSelected;
  if (vectorInspector instanceof HTMLElement) vectorInspector.hidden = !isVectorSelected;
  if (isTextSelected) syncInspectorToSelectedText();
  if (isFrameSelected) syncInspectorToSelectedFrame();
  if (isVectorSelected) syncInspectorToSelectedVector();
  if (!isVariantSelected && !isTextSelected && !isFrameSelected && !isVectorSelected && colorPicker instanceof HTMLInputElement) {
    syncCustomColorControl(colorPicker, canvasColorValue, canvasColorOpacity);
  }
  requestAnimationFrame(syncResizeOverlay);
}

function getCompatibleDisabledTargets() {
  const componentFrame = currentComponent?.frameRecord;
  return [componentFrame, ...frameRecords].filter((record) =>
    record
    && record.parentId === null
    && normalizeFrameHtmlTag(record.element.dataset.htmlTag || "div") === "button");
}

function getAllTargetableLayers() {
  return [
    ...(currentComponent?.frameRecord ? [{ type: "frame", record: currentComponent.frameRecord }] : []),
    ...frameRecords.map((record) => ({ type: "frame", record })),
    ...textRecords.map((record) => ({ type: "text", record })),
    ...vectorRecords.map((record) => ({ type: "vector", record })),
  ];
}

function getVisibilityTargetLabel(type, record) {
  if (type === "frame" && record.isComponent) return currentComponent?.name || "Component";
  return getTreeNodeName(type, record);
}

function getTargetLayerIconType(type, record) {
  return type === "frame" && record?.isComponent ? "component" : type;
}

function setBooleanPropProperty(prop, property) {
  if (property === prop.property) return;
  recordHistory();
  if (property === "visibility") {
    const target = getAllTargetableLayers()[0];
    prop.name = "visible";
    prop.property = "visibility";
    prop.defaultValue = true;
    prop.targetFrameId = target?.type === "frame" ? target.record.id : null;
    prop.targetTextId = target?.type === "text" ? target.record.id : null;
    prop.targetVectorId = target?.type === "vector" ? target.record.id : null;
  } else {
    const target = getCompatibleDisabledTargets()[0];
    prop.name = "disabled";
    prop.property = "disabled";
    prop.defaultValue = false;
    prop.targetFrameId = target?.id ?? null;
    prop.targetTextId = null;
    prop.targetVectorId = null;
  }
  syncComponentPropVariantDefinition(prop);
  renderComponentProps();
}

function bindNativeSelectChevron(select, wrap) {
  const closeMenuState = () => wrap.classList.remove("is-open");
  const clearSelectionFocus = () => wrap.classList.remove("is-selection-focused");
  select.addEventListener("pointerdown", () => {
    if (select.disabled) closeMenuState();
    else {
      clearSelectionFocus();
      wrap.classList.add("is-open");
    }
  });
  select.addEventListener("change", () => {
    closeMenuState();
    wrap.classList.add("is-selection-focused");
  });
  select.addEventListener("click", () => requestAnimationFrame(() => {
    closeMenuState();
    if (!select.disabled) wrap.classList.add("is-selection-focused");
  }));
  select.addEventListener("blur", () => {
    closeMenuState();
    clearSelectionFocus();
  });
  select.addEventListener("keydown", (event) => {
    if (event.key === "Escape" || event.key === "Enter") closeMenuState();
    else if (event.key === "ArrowDown" && event.altKey) wrap.classList.add("is-open");
  });
}

document.querySelectorAll(".inspector-select-wrap > select").forEach((select) => {
  if (select instanceof HTMLSelectElement && select.parentElement instanceof HTMLElement) {
    bindNativeSelectChevron(select, select.parentElement);
  }
});

function createPropSelectIcon(iconType, record = null) {
  if (iconType === "prop-boolean") return createSvgAssetIcon("toggle-on", "layer-type-icon prop-type-icon");
  if (iconType === "prop-string") return createSvgAssetIcon("text", "layer-type-icon prop-type-icon");
  if (iconType === "prop-action") return createSvgAssetIcon("cursor-1", "layer-type-icon prop-type-icon");
  if (iconType === "prop-enum") return createSvgAssetIcon("diamond-outline", "layer-type-icon prop-type-icon");
  if (iconType === "frame" && record) return createLayerTypeIcon("frame", record);
  if (iconType === "vector" && record) return createVectorLayerTreeIcon(record);
  return createLayerTypeIcon(iconType, record);
}

function bindPropsActionTooltip(wrapper, button) {
  const tooltipContent = wrapper.querySelector(".tooltip-content");
  if (!(tooltipContent instanceof HTMLElement) || !(button instanceof HTMLButtonElement)) return;
  const positionTooltip = () => {
    const bounds = button.getBoundingClientRect();
    tooltipContent.style.left = `${bounds.left + bounds.width / 2}px`;
    tooltipContent.style.top = `${bounds.top - 4}px`;
  };
  wrapper.addEventListener("pointerenter", positionTooltip);
  wrapper.addEventListener("focusin", positionTooltip);
}

function createPropSelect(options, value, ariaLabel, onChange, disabled = false) {
  const wrap = document.createElement("div");
  const select = document.createElement("select");
  const chevron = document.createElement("span");
  const selectedOptionRecord = options.find((optionRecord) => String(optionRecord.value) === String(value));

  wrap.className = "prop-select-wrap";
  wrap.classList.toggle("is-disabled", disabled);
  select.className = "prop-control prop-select";
  select.setAttribute("aria-label", ariaLabel);
  select.disabled = disabled;
  options.forEach((optionRecord) => {
    const option = document.createElement("option");
    option.value = optionRecord.value;
    option.textContent = optionRecord.label;
    option.disabled = Boolean(optionRecord.disabled);
    select.append(option);
  });
  select.value = value;
  select.addEventListener("change", () => onChange(select.value));
  chevron.className = "chevron inspector-select-chevron";
  chevron.setAttribute("aria-hidden", "true");
  wrap.append(select);
  if (selectedOptionRecord?.iconType) {
    const selectedValue = document.createElement("span");
    const selectedLabel = document.createElement("span");
    selectedValue.className = "prop-select-selected-value";
    selectedLabel.className = "prop-select-selected-label";
    selectedLabel.textContent = selectedOptionRecord.label;
    selectedValue.append(createPropSelectIcon(selectedOptionRecord.iconType, selectedOptionRecord.iconRecord), selectedLabel);
    select.classList.add("prop-select--has-layer-icon");
    wrap.append(selectedValue);
  }
  wrap.append(chevron);
  bindNativeSelectChevron(select, wrap);
  return wrap;
}

const DEFAULT_ENUM_OPTION = "Default";

const OPTION_COMPONENT_PROP_CONFIG = {
  enum: { label: "Enum", options: [DEFAULT_ENUM_OPTION] },
};

const ENUM_COMPONENT_PROPERTY_OPTIONS = [
  { value: "size", label: "Size" },
  { value: "type", label: "Type" },
  { value: "variant", label: "Variant" },
];

function getEnumComponentProperty(prop) {
  const property = String(prop?.property ?? "").toLowerCase();
  if (ENUM_COMPONENT_PROPERTY_OPTIONS.some((option) => option.value === property)) return property;
  const name = String(prop?.name ?? "").trim().toLowerCase();
  return ENUM_COMPONENT_PROPERTY_OPTIONS.some((option) => option.value === name) ? name : "variant";
}

function isOptionComponentProp(propOrType) {
  const type = typeof propOrType === "string" ? propOrType : propOrType?.type;
  return Object.prototype.hasOwnProperty.call(OPTION_COMPONENT_PROP_CONFIG, type);
}

function getComponentPropOptions(prop) {
  const fallbackOptions = OPTION_COMPONENT_PROP_CONFIG[prop.type]?.options ?? [DEFAULT_ENUM_OPTION];
  return Array.isArray(prop.options) && prop.options.length > 0 ? prop.options : fallbackOptions;
}

function getAvailableEnumPropName(currentProp = null) {
  const usedNames = new Set(componentProps
    .filter((prop) => prop !== currentProp && isOptionComponentProp(prop))
    .map((prop) => prop.name.toLowerCase()));
  let index = 1;
  let name = "Variant";
  while (usedNames.has(name.toLowerCase())) name = `Variant ${index += 1}`;
  return name;
}

function configureOptionComponentProp(prop, type) {
  const config = OPTION_COMPONENT_PROP_CONFIG[type];
  if (!config) return;
  prop.name = getAvailableEnumPropName(prop);
  prop.type = type;
  prop.options = [...config.options];
  prop.defaultValue = prop.options[0];
  prop.targetFrameId = null;
  prop.targetTextId = null;
  prop.targetVectorId = null;
  prop.property = "variant";
}

function renderComponentProps() {
  if (!(propRowsContainer instanceof HTMLElement)) return;
  const compatibleTargets = getCompatibleDisabledTargets();
  const rows = componentProps.map((prop) => {
    const row = document.createElement("div");
    row.className = "props-table-row props-property-row";
    row.setAttribute("role", "row");

    const createCell = (isAction = false) => {
      const cell = document.createElement("div");
      cell.className = `props-table-cell${isAction ? " props-table-action-cell" : ""}`;
      cell.setAttribute("role", "cell");
      return cell;
    };

    const nameCell = createCell();
    const nameInput = document.createElement("input");
    nameInput.className = "prop-control";
    nameInput.type = "text";
    nameInput.value = prop.name;
    nameInput.setAttribute("aria-label", "Prop name");
    const commitPropName = () => {
      const fallbackName = prop.type === "string"
        ? "label"
        : prop.type === "action"
          ? "onClick"
          : prop.property === "visibility" ? "visible" : "disabled";
      const name = nameInput.value.trim() || fallbackName;
      if (name === prop.name) return;
      recordHistory();
      prop.name = name;
      if (isVariantBoundComponentProp(prop)) syncComponentPropVariantDefinition(prop);
      nameInput.value = name;
    };
    nameInput.addEventListener("change", commitPropName);
    nameInput.addEventListener("blur", commitPropName);
    nameCell.append(nameInput);

    const typeCell = createCell();
    typeCell.append(createPropSelect(
      [
        { value: "enum", label: "Variant", iconType: "prop-enum" },
        { value: "boolean", label: "Boolean", iconType: "prop-boolean" },
        { value: "string", label: "String", iconType: "prop-string" },
        { value: "action", label: "Action", iconType: "prop-action" },
      ],
      prop.type,
      "Prop type",
      (value) => {
        if (value === prop.type) return;
        recordHistory();
        const wasVariantBoundProp = isVariantBoundComponentProp(prop);
        if (wasVariantBoundProp && value !== "enum" && value !== "boolean") unlinkComponentPropVariantDefinition(prop);
        if (isOptionComponentProp(value)) {
          configureOptionComponentProp(prop, value);
        } else if (value === "string") {
          const target = textRecords[0];
          prop.name = "label";
          prop.type = "string";
          prop.defaultValue = target?.element.textContent ?? "";
          prop.targetFrameId = null;
          prop.targetTextId = target?.id ?? null;
          prop.targetVectorId = null;
          prop.property = "textContent";
        } else if (value === "action") {
          const target = compatibleTargets[0];
          prop.name = "onClick";
          prop.type = "action";
          prop.defaultValue = "";
          prop.targetFrameId = target?.id ?? null;
          prop.targetTextId = null;
          prop.targetVectorId = null;
          prop.property = "onClick";
        } else {
          const target = getAllTargetableLayers()[0];
          prop.name = "visible";
          prop.type = "boolean";
          prop.defaultValue = true;
          prop.targetFrameId = target?.type === "frame" ? target.record.id : null;
          prop.targetTextId = target?.type === "text" ? target.record.id : null;
          prop.targetVectorId = target?.type === "vector" ? target.record.id : null;
          prop.property = "visibility";
        }
        if (!isOptionComponentProp(value)) delete prop.options;
        if (value === "enum" || value === "boolean") syncComponentPropVariantDefinition(prop);
        renderComponentProps();
      },
    ));

    const defaultCell = createCell();
    defaultCell.classList.add("props-table-value-cell");
    defaultCell.dataset.propValueCell = String(prop.id);
    defaultCell.tabIndex = -1;
    if (isOptionComponentProp(prop)) {
      const options = getComponentPropOptions(prop);
      const instance = getVariantInstance();
      let retainValueCellFocusAfterEdit = false;
      const focusValueCell = () => {
        requestAnimationFrame(() => {
          propRowsContainer?.querySelector(`[data-prop-value-cell="${prop.id}"]`)?.focus();
        });
      };
      const currentValue = instance && prop.variantPropId != null
        ? instance.propValues[prop.variantPropId]
        : options[0];
      const setActiveOption = (value) => {
        if (instance) {
          if (prop.variantPropId == null) syncComponentPropVariantDefinition(prop);
          if (prop.variantPropId == null || instance.propValues[prop.variantPropId] === value) return;
          recordHistory();
          instance.propValues[prop.variantPropId] = value;
        } else return;
        defaultCell.querySelectorAll(".prop-value-tag--editable").forEach((tag) => {
          tag.closest(".prop-value-tag")?.classList.toggle("is-active", tag.value === value);
        });
        renderVariantInstances();
      };
      options.forEach((optionValue, optionIndex) => {
        const valueTag = document.createElement("div");
        const valueInput = document.createElement("input");
        const dismissTooltip = document.createElement("span");
        const dismissButton = document.createElement("button");
        const dismissTooltipContent = document.createElement("span");
        valueTag.className = "prop-value-tag";
        valueTag.tabIndex = 0;
        valueInput.type = "text";
        valueInput.className = "prop-value-tag-text prop-value-tag--editable";
        valueInput.value = optionValue;
        valueInput.readOnly = true;
        valueInput.tabIndex = -1;
        valueTag.classList.toggle("is-active", optionValue === currentValue);
        valueTag.classList.toggle("is-default", optionIndex === 0);
        valueInput.setAttribute("aria-label", `${prop.name} value ${optionValue}`);
        if (optionIndex === 0) valueInput.title = "Default value";
        valueTag.addEventListener("focus", () => setActiveOption(optionValue));
        valueTag.addEventListener("click", (event) => {
          if (event.target instanceof Element && event.target.closest('[data-icon-button="prop-value-dismiss"]')) return;
          setActiveOption(optionValue);
          if (!valueInput.classList.contains("is-editing")) valueTag.focus();
        });
        valueInput.addEventListener("pointerdown", (event) => {
          if (valueInput.classList.contains("is-editing")) return;
          event.preventDefault();
          setActiveOption(optionValue);
          valueTag.focus();
        });
        valueTag.addEventListener("dblclick", (event) => {
          if (event.target instanceof Element && event.target.closest('[data-icon-button="prop-value-dismiss"]')) return;
          event.preventDefault();
          valueInput.readOnly = false;
          valueInput.tabIndex = 0;
          valueInput.classList.add("is-editing");
          valueInput.focus();
          valueInput.select();
        });
        valueInput.addEventListener("keydown", (event) => {
          if (event.key === "Enter") {
            retainValueCellFocusAfterEdit = true;
            valueInput.blur();
          }
          if (event.key === "Escape") {
            valueInput.value = optionValue;
            valueInput.blur();
          }
        });
        valueInput.addEventListener("blur", () => {
          const wasEditing = valueInput.classList.contains("is-editing");
          valueInput.readOnly = true;
          valueInput.tabIndex = -1;
          valueInput.classList.remove("is-editing");
          if (!wasEditing) return;
          const nextValue = valueInput.value.trim();
          if (!nextValue || nextValue === optionValue) {
            valueInput.value = optionValue;
            if (retainValueCellFocusAfterEdit) {
              retainValueCellFocusAfterEdit = false;
              focusValueCell();
            }
            return;
          }
          if (getComponentPropOptions(prop).some((value) => value !== optionValue && value === nextValue)) {
            valueInput.value = optionValue;
            if (retainValueCellFocusAfterEdit) {
              retainValueCellFocusAfterEdit = false;
              focusValueCell();
            }
            return;
          }
          recordHistory();
          prop.options = getComponentPropOptions(prop).map((value) => value === optionValue ? nextValue : value);
          if (prop.defaultValue === optionValue) prop.defaultValue = nextValue;
          if (prop.variantPropId != null) {
            variantInstances.forEach((variantInstance) => {
              if (variantInstance.propValues[prop.variantPropId] === optionValue) {
                variantInstance.propValues[prop.variantPropId] = nextValue;
              }
            });
            variantRules.forEach((rule) => {
              if (rule.conditions[prop.variantPropId] === optionValue) rule.conditions[prop.variantPropId] = nextValue;
            });
          }
          syncComponentPropVariantDefinition(prop);
          renderComponentProps();
          if (retainValueCellFocusAfterEdit) {
            retainValueCellFocusAfterEdit = false;
            focusValueCell();
          }
        });
        dismissTooltip.className = "tooltip props-action-tooltip prop-value-tag-dismiss-tooltip";
        dismissButton.className = "icon-button icon-button--size-24 icon-button--circle";
        dismissButton.dataset.iconButton = "prop-value-dismiss";
        dismissButton.type = "button";
        dismissButton.disabled = options.length <= 1;
        dismissButton.setAttribute("aria-label", `Dismiss ${optionValue}`);
        dismissButton.append(createSvgAssetIcon("close"));
        dismissTooltipContent.className = "tooltip-content";
        dismissTooltipContent.setAttribute("role", "tooltip");
        dismissTooltipContent.textContent = "Dismiss";
        dismissButton.addEventListener("click", (event) => {
          event.stopPropagation();
          if (options.length <= 1) return;
          recordHistory();
          prop.options = options.filter((value) => value !== optionValue);
          syncComponentPropVariantDefinition(prop);
          renderVariantInstances();
          renderComponentProps();
        });
        dismissTooltip.append(dismissButton, dismissTooltipContent);
        bindPropsActionTooltip(dismissTooltip, dismissButton);
        valueTag.append(valueInput, dismissTooltip);
        defaultCell.append(valueTag);
      });
      const addValueInput = document.createElement("input");
      const focusAddValueInput = () => {
        requestAnimationFrame(() => {
          propRowsContainer
            ?.querySelector(`[data-prop-value-cell="${prop.id}"] .prop-value-tag-add-input`)
            ?.focus();
        });
      };
      const addValue = (retainFocus = false) => {
        const nextValue = addValueInput.value.trim();
        if (!nextValue) return false;
        const existing = getComponentPropOptions(prop);
        if (existing.includes(nextValue)) {
          addValueInput.select();
          return false;
        }
        recordHistory();
        prop.options = [...existing, nextValue];
        if (instance && prop.variantPropId != null) instance.propValues[prop.variantPropId] = nextValue;
        syncComponentPropVariantDefinition(prop);
        renderComponentProps();
        if (retainFocus) focusAddValueInput();
        return true;
      };
      addValueInput.className = "prop-value-tag-add-input";
      addValueInput.type = "text";
      const propName = prop.name.trim().toLowerCase();
      const placeholderName = propName === "size" || propName === "type" ? propName : "variant";
      addValueInput.placeholder = `Add ${placeholderName}`;
      addValueInput.setAttribute("aria-label", `Add ${prop.name} value`);
      addValueInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          addValue(true);
        } else if (event.key === "Escape") {
          addValueInput.value = "";
          addValueInput.blur();
        }
      });
      addValueInput.addEventListener("blur", () => addValue());
      defaultCell.addEventListener("pointerdown", (event) => {
        if (event.target instanceof Element && event.target.closest(".prop-value-tag, .prop-value-tag-add-input")) return;
        event.preventDefault();
        addValueInput.focus();
        addValueInput.setSelectionRange(0, 0);
      });
      defaultCell.append(addValueInput);
    } else if (prop.type === "boolean" && prop.variantPropId != null) {
      const instance = getVariantInstance();
      const currentValue = instance
        ? normalizeVariantPropValue(
          variantProps.find((variantProp) => variantProp.id === prop.variantPropId),
          instance.propValues[prop.variantPropId],
        )
        : Boolean(prop.defaultValue);
      [false, true].forEach((optionValue) => {
        const valueButton = document.createElement("button");
        valueButton.className = "prop-value-tag prop-value-tag--editable";
        valueButton.type = "button";
        valueButton.textContent = String(optionValue);
        valueButton.classList.toggle("is-active", optionValue === currentValue);
        valueButton.setAttribute("aria-label", `${prop.name} value ${optionValue}`);
        valueButton.addEventListener("click", () => {
          if (!instance || currentValue === optionValue) return;
          recordHistory();
          instance.propValues[prop.variantPropId] = optionValue;
          renderVariantInstances();
          renderComponentProps();
        });
        defaultCell.append(valueButton);
      });
      const booleanDefaultLabel = document.createElement("label");
      const booleanDefaultSelect = document.createElement("select");
      booleanDefaultLabel.className = "prop-boolean-default";
      booleanDefaultLabel.textContent = "Default";
      booleanDefaultSelect.className = "prop-boolean-default-select";
      booleanDefaultSelect.setAttribute("aria-label", `Default ${prop.name} value`);
      [false, true].forEach((optionValue) => {
        const option = document.createElement("option");
        option.value = String(optionValue);
        option.textContent = String(optionValue);
        booleanDefaultSelect.append(option);
      });
      booleanDefaultSelect.value = String(Boolean(prop.defaultValue));
      booleanDefaultSelect.addEventListener("change", () => {
        const nextDefault = booleanDefaultSelect.value === "true";
        if (Boolean(prop.defaultValue) === nextDefault) return;
        recordHistory();
        prop.defaultValue = nextDefault;
        syncComponentPropVariantDefinition(prop);
        renderComponentProps();
      });
      booleanDefaultLabel.append(booleanDefaultSelect);
      defaultCell.append(booleanDefaultLabel);
    } else if (prop.type === "string" && prop.property === "textContent") {
      defaultCell.classList.add("props-table-value-cell--control");
      const valueInput = document.createElement("input");
      valueInput.className = "prop-control";
      valueInput.type = "text";
      valueInput.value = String(prop.defaultValue ?? "");
      valueInput.setAttribute("aria-label", `Default ${prop.name} value`);
      const commitStringValue = () => {
        if (valueInput.value === String(prop.defaultValue ?? "")) return;
        recordHistoryForGesture(valueInput);
        prop.defaultValue = valueInput.value;
        const target = getTextRecord(prop.targetTextId);
        if (target) {
          target.element.textContent = valueInput.value;
          applyLayerSizing("text", target);
          requestAnimationFrame(syncResizeOverlay);
        }
        if (variantInstances.length > 0) scheduleVariantInstanceRender();
        redoHistory.length = 0;
      };
      valueInput.addEventListener("input", commitStringValue);
      valueInput.addEventListener("blur", commitStringValue);
      bindHistoryGesture(valueInput);
      defaultCell.append(valueInput);
    } else {
      const valueTag = document.createElement("span");
      valueTag.className = "prop-value-tag";
      if (prop.type === "boolean") {
        valueTag.textContent = Boolean(prop.defaultValue) ? "True" : "False";
        valueTag.setAttribute("aria-label", `Default Boolean value: ${valueTag.textContent}`);
      } else if (prop.type === "string") {
        const stringValue = String(prop.defaultValue);
        valueTag.textContent = stringValue || '""';
        valueTag.setAttribute("aria-label", `Default string value: ${stringValue || "empty string"}`);
      } else {
        valueTag.classList.add("prop-empty-value");
        valueTag.textContent = "—";
        valueTag.setAttribute("aria-label", "No default value");
      }
      defaultCell.append(valueTag);
    }

    const targetCell = createCell();
    const isStringProp = prop.type === "string";
    const isOptionProp = isOptionComponentProp(prop);
    const isVisibilityProp = prop.type === "boolean" && prop.property === "visibility";
    let targetOptions;
    let currentValue;
    let hasCurrentTarget;
    let targetsEmpty;

    if (isOptionProp) {
      hasCurrentTarget = true;
      currentValue = "component:0";
      targetsEmpty = false;
      targetOptions = [{
        value: "component:0",
        label: currentComponent?.name || "Component",
        iconType: "component",
      }];
    } else if (isStringProp) {
      hasCurrentTarget = textRecords.some((record) => record.id === prop.targetTextId);
      currentValue = hasCurrentTarget ? String(prop.targetTextId) : "";
      targetsEmpty = textRecords.length === 0;
      targetOptions = targetsEmpty
        ? [{ value: "", label: "No text target", disabled: true }]
        : [
            { value: "", label: "Select layer", disabled: true },
            ...textRecords.map((record) => ({
              value: String(record.id),
              label: getTreeNodeName("text", record),
              iconType: "text",
            })),
          ];
    } else if (isVisibilityProp) {
      const allLayers = getAllTargetableLayers();
      const encodedTarget = prop.targetFrameId != null
        ? `frame:${prop.targetFrameId}`
        : prop.targetTextId != null
          ? `text:${prop.targetTextId}`
          : prop.targetVectorId != null
            ? `vector:${prop.targetVectorId}`
            : "";
      hasCurrentTarget = allLayers.some((layer) => `${layer.type}:${layer.record.id}` === encodedTarget);
      currentValue = hasCurrentTarget ? encodedTarget : "";
      targetsEmpty = allLayers.length === 0;
      targetOptions = targetsEmpty
        ? [{ value: "", label: "No layer target", disabled: true }]
        : [
            { value: "", label: "Select layer", disabled: true },
            ...allLayers.map((layer) => ({
              value: `${layer.type}:${layer.record.id}`,
              label: getVisibilityTargetLabel(layer.type, layer.record),
              iconType: getTargetLayerIconType(layer.type, layer.record),
              iconRecord: layer.type === "component" ? null : layer.record,
            })),
          ];
    } else {
      hasCurrentTarget = compatibleTargets.some((record) => record.id === prop.targetFrameId);
      currentValue = hasCurrentTarget ? String(prop.targetFrameId) : "";
      targetsEmpty = compatibleTargets.length === 0;
      targetOptions = targetsEmpty
        ? [{ value: "", label: "No button target", disabled: true }]
        : [
            { value: "", label: "Select layer", disabled: true },
            ...compatibleTargets.map((record) => ({
              value: String(record.id),
              label: record.isComponent
                ? currentComponent?.name || "Component"
                : getTreeNodeName("frame", record),
              iconType: getTargetLayerIconType("frame", record),
              iconRecord: record.isComponent ? null : record,
            })),
          ];
    }

    targetCell.append(createPropSelect(
      targetOptions,
      currentValue,
      "Target layer",
      (value) => {
        if (!value || value === currentValue) return;
        recordHistory();
        if (isOptionProp) {
          return;
        } else if (isStringProp) {
          const targetId = Number(value);
          const target = getTextRecord(targetId);
          prop.targetTextId = targetId;
          prop.targetFrameId = null;
          prop.targetVectorId = null;
          prop.defaultValue = target?.element.textContent ?? "";
        } else if (isVisibilityProp) {
          const [type, rawId] = value.split(":");
          const targetId = Number(rawId);
          prop.targetFrameId = type === "frame" ? targetId : null;
          prop.targetTextId = type === "text" ? targetId : null;
          prop.targetVectorId = type === "vector" ? targetId : null;
        } else {
          const targetId = Number(value);
          prop.targetFrameId = targetId;
          prop.targetTextId = null;
          prop.targetVectorId = null;
        }
        renderComponentProps();
      },
      targetsEmpty,
    ));

    const propertyCell = createCell();
    if (isOptionProp) {
      const enumProperty = getEnumComponentProperty(prop);
      propertyCell.append(createPropSelect(
        ENUM_COMPONENT_PROPERTY_OPTIONS,
        enumProperty,
        "Variant property",
        (value) => {
          if (value === enumProperty) return;
          recordHistory();
          prop.property = value;
          renderComponentProps();
        },
      ));
    } else if (prop.type === "boolean") {
      propertyCell.append(createPropSelect(
        [
          { value: "visibility", label: "Visibility" },
          { value: "disabled", label: "Disabled", disabled: compatibleTargets.length === 0 },
        ],
        prop.property,
        "Target property",
        (value) => setBooleanPropProperty(prop, value),
      ));
    } else {
      propertyCell.append(createPropSelect(
        [{
          value: prop.property,
          label: prop.property === "textContent" ? "Text content" : prop.property,
        }],
        prop.property,
        "Target property",
        () => {},
        !hasCurrentTarget,
      ));
    }

    const actionCell = createCell(true);
    const removeTooltip = document.createElement("span");
    const removeButton = document.createElement("button");
    const removeIcon = document.createElement("span");
    const removeTooltipContent = document.createElement("span");
    removeTooltip.className = "tooltip props-action-tooltip";
    removeButton.className = "icon-button icon-button--size-32 icon-button--square";
    removeButton.type = "button";
    removeButton.setAttribute("aria-label", `Remove ${prop.name} prop`);
    removeIcon.className = "subtract-icon";
    removeIcon.setAttribute("aria-hidden", "true");
    removeTooltipContent.className = "tooltip-content";
    removeTooltipContent.setAttribute("role", "tooltip");
    removeTooltipContent.textContent = "Remove";
    removeButton.append(removeIcon);
    removeButton.addEventListener("click", () => {
      recordHistory();
      if (isVariantBoundComponentProp(prop)) unlinkComponentPropVariantDefinition(prop);
      componentProps = componentProps.filter((componentProp) => componentProp.id !== prop.id);
      renderComponentProps();
    });
    removeTooltip.append(removeButton, removeTooltipContent);
    bindPropsActionTooltip(removeTooltip, removeButton);
    actionCell.append(removeTooltip);

    row.append(nameCell, typeCell, targetCell, propertyCell, defaultCell, actionCell);
    return row;
  });
  propRowsContainer.replaceChildren(...rows);
}

function addComponentProp() {
  recordHistory();
  const name = getAvailableEnumPropName();
  const options = [DEFAULT_ENUM_OPTION];
  componentProps.push({
    id: nextComponentPropId,
    name,
    type: "enum",
    options,
    defaultValue: options[0],
    targetFrameId: null,
    targetTextId: null,
    targetVectorId: null,
    property: "variant",
  });
  syncComponentPropVariantDefinition(componentProps[componentProps.length - 1]);
  nextComponentPropId += 1;
  renderComponentProps();
}

function getCustomColorState(control) {
  const property = control.dataset.colorControl;
  if (property === "canvas") {
    return { property, color: canvasColorValue, opacity: canvasColorOpacity, picker: colorPicker };
  }
  if (property === "text") {
    const record = getSelectedTextRecord();
    if (!record) return null;
    const renderedColor = record.isVariantInstance ? getComputedStyle(record.element).color : "";
    const rgbaAlpha = renderedColor.match(/^rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\)$/i);
    const isTransparent = renderedColor === "transparent" || (rgbaAlpha && Number(rgbaAlpha[1]) === 0);
    const color = record.isVariantInstance
      ? isTransparent ? "" : cssColorToHex(renderedColor) || "#000000"
      : Object.prototype.hasOwnProperty.call(record.element.dataset, "textColor") ? record.element.dataset.textColor : "#000000";
    return {
      property,
      record,
      color,
      opacity: normalizeColorOpacity(record.isVariantInstance && rgbaAlpha ? Number(rgbaAlpha[1]) * 100 : record.element.dataset.textColorOpacity || "100"),
      picker: textColorPicker,
    };
  }
  if (property === "vector") {
    const record = getSelectedVectorRecord();
    if (!record) return null;
    const variantPaintProperties = record.isVariantInstance ? getVectorPaintProperties(record) : [];
    const color = record.isVariantInstance
      ? variantPaintProperties.length > 0 ? getVectorRenderedColor(record) : ""
      : Object.prototype.hasOwnProperty.call(record.element.dataset, "vectorColor")
        ? record.element.dataset.vectorColor
        : getVectorRenderedColor(record);
    return {
      property,
      record,
      color,
      opacity: record.isVariantInstance
        ? getVectorRenderedOpacity(record)
        : normalizeColorOpacity(record.element.dataset.vectorColorOpacity || "100"),
      picker: vectorColorPicker,
    };
  }
  const record = getSelectedFrameRecord();
  if (!record) return null;
  if (property === "frame-background") {
    return {
      property,
      record,
      color: record.element.dataset.frameColor || "",
      opacity: normalizeColorOpacity(record.element.dataset.frameColorOpacity || "100"),
      picker: frameColorPicker,
    };
  }
  if (property === "frame-outline") {
    return {
      property,
      record,
      color: record.element.dataset.outlineColor || "",
      opacity: normalizeColorOpacity(record.element.dataset.outlineColorOpacity || "100"),
      picker: frameOutlineColorPicker,
    };
  }
  return null;
}

function applyCustomColorValue(control, color, opacity) {
  const state = getCustomColorState(control);
  if (!state || !(state.picker instanceof HTMLInputElement)) return false;
  const normalizedColor = normalizeHexColor(color);
  const normalizedOpacity = normalizeColorOpacity(opacity);
  if (selectedVariantInstanceId !== null && state.property === "frame-background") {
    if (normalizedColor) control.dataset.lastColor = normalizedColor;
    if (state.color !== normalizedColor || state.opacity !== normalizedOpacity) recordHistoryForGesture(control);
    setSelectedVariantFrameStyleOverride("backgroundColor", getColorWithOpacity(normalizedColor, normalizedOpacity), { record: false });
    syncCustomColorControl(state.picker, normalizedColor, normalizedOpacity);
    return true;
  }
  if (selectedVariantInstanceId !== null && state.property === "frame-outline") {
    if (normalizedColor) control.dataset.lastColor = normalizedColor;
    if (state.color !== normalizedColor || state.opacity !== normalizedOpacity) recordHistoryForGesture(control);
    const shouldEnableOutline = Boolean(normalizedColor)
      && !normalizeHexColor(state.color)
      && Number(state.record.element.dataset.outlineWeight || "0") <= 0;
    setSelectedVariantFrameStyleOverride("outlineColor", normalizedColor, { record: false, render: false });
    setSelectedVariantFrameStyleOverride("outlineColorOpacity", String(normalizedOpacity), { record: false, render: false });
    if (shouldEnableOutline) {
      setSelectedVariantFrameStyleOverride("outlineWeight", "1", { record: false, render: false });
      if (frameOutlineWeightInput instanceof HTMLInputElement) frameOutlineWeightInput.value = "1";
    }
    syncCustomColorControl(state.picker, normalizedColor, normalizedOpacity);
    return true;
  }
  if (selectedVariantInstanceId !== null && state.property === "text" && state.record.isVariantInstance) {
    if (normalizedColor) control.dataset.lastColor = normalizedColor;
    const isTransparent = !normalizedColor;
    const renderedColor = isTransparent ? "transparent" : getColorWithOpacity(normalizedColor, normalizedOpacity);
    const nextOpacity = isTransparent ? 0 : normalizedOpacity;
    if (state.color !== normalizedColor || state.opacity !== nextOpacity) recordHistoryForGesture(control);
    state.record.element.dataset.textColor = normalizedColor;
    state.record.element.dataset.textColorOpacity = String(nextOpacity);
    state.record.element.style.color = renderedColor;
    setSelectedVariantLayerOverride("color", renderedColor);
    syncVariantLayerStylePreviews(selectedVariantLayerTarget, "color", state.record.element);
    syncCustomColorControl(state.picker, normalizedColor, nextOpacity);
    return true;
  }
  if (selectedVariantInstanceId !== null && state.property === "vector" && state.record.isVariantInstance) {
    if (normalizedColor) control.dataset.lastColor = normalizedColor;
    if (normalizeHexColor(state.color) === normalizedColor && state.opacity === normalizedOpacity) {
      syncCustomColorControl(state.picker, normalizedColor, normalizedOpacity);
      return true;
    }
    recordHistoryForGesture(control);
    const paintProperties = getVectorPaintProperties(state.record);
    const renderedColor = getColorWithOpacity(normalizedColor, normalizedOpacity);
    state.record.element.dataset.vectorColor = normalizedColor;
    state.record.element.dataset.vectorColorOpacity = String(normalizedOpacity);
    if (normalizedColor) applyVectorColor(state.record, renderedColor);
    else removeVectorColor(state.record);
    const overrideProperties = paintProperties.length > 0 ? paintProperties : ["fill"];
    overrideProperties.forEach((property) => {
      setSelectedVariantLayerOverride(property, normalizedColor ? renderedColor : "none");
    });
    syncCustomColorControl(state.picker, normalizedColor, normalizedOpacity);
    return true;
  }
  if (normalizedColor) control.dataset.lastColor = normalizedColor;
  if (state.color === normalizedColor && state.opacity === normalizedOpacity) {
    syncCustomColorControl(state.picker, normalizedColor, normalizedOpacity);
    return true;
  }

  recordHistoryForGesture(control);
  const renderedColor = getColorWithOpacity(normalizedColor, normalizedOpacity);
  const shouldEnableFrameOutline = state.property === "frame-outline"
    && Boolean(normalizedColor)
    && !normalizeHexColor(state.color)
    && Number(state.record?.element.dataset.outlineWeight || "0") <= 0;
  if (state.property === "canvas") {
    canvasColorValue = normalizedColor;
    canvasColorOpacity = normalizedOpacity;
    if (canvas instanceof HTMLElement) canvas.style.backgroundColor = renderedColor || "transparent";
  } else if (state.property === "text") {
    const isTransparent = !normalizedColor;
    state.record.element.dataset.textColor = normalizedColor;
    state.record.element.dataset.textColorOpacity = String(isTransparent ? 0 : normalizedOpacity);
    state.record.element.style.color = isTransparent ? "transparent" : renderedColor;
    if (variantInstances.length > 0) scheduleVariantInstanceRender();
  } else if (state.property === "frame-background") {
    state.record.element.dataset.frameColor = normalizedColor;
    state.record.element.dataset.frameColorOpacity = String(normalizedOpacity);
    state.record.element.style.backgroundColor = renderedColor;
  } else if (state.property === "frame-outline") {
    state.record.element.dataset.outlineColor = normalizedColor;
    state.record.element.dataset.outlineColorOpacity = String(normalizedOpacity);
    if (shouldEnableFrameOutline) {
      state.record.element.dataset.outlineWeight = "1";
      if (frameOutlineWeightInput instanceof HTMLInputElement) frameOutlineWeightInput.value = "1";
    }
    applyFrameOutline(state.record.element);
  } else if (state.property === "vector") {
    state.record.element.dataset.vectorColorOpacity = String(normalizedOpacity);
    if (normalizedColor) {
      const source = state.record.originalSvgSource || state.record.svgSource;
      state.record.svgSource = source;
      state.record.element.replaceChildren(createCanvasSvg(source));
      applyVectorColor(state.record, renderedColor);
      state.record.element.dataset.vectorColor = normalizedColor;
    } else {
      removeVectorColor(state.record);
    }
  }

  syncCustomColorControl(state.picker, normalizedColor, normalizedOpacity);
  return true;
}

function colorPickerKnobMarkup() {
  return '<span class="color-picker-knob" aria-hidden="true"><span class="color-picker-knob-middle"><span class="color-picker-knob-color"></span></span></span>';
}

function hsvToHex(hue, saturation, value) {
  const chroma = value * saturation;
  const sector = ((hue % 360) + 360) % 360 / 60;
  const secondary = chroma * (1 - Math.abs((sector % 2) - 1));
  const match = value - chroma;
  const [red, green, blue] = sector < 1 ? [chroma, secondary, 0]
    : sector < 2 ? [secondary, chroma, 0]
      : sector < 3 ? [0, chroma, secondary]
        : sector < 4 ? [0, secondary, chroma]
          : sector < 5 ? [secondary, 0, chroma]
            : [chroma, 0, secondary];
  const channel = (number) => Math.round((number + match) * 255).toString(16).padStart(2, "0");
  return `#${channel(red)}${channel(green)}${channel(blue)}`.toUpperCase();
}

function hexToHsv(color) {
  const normalizedColor = normalizeHexColor(color) || "#000000";
  const red = Number.parseInt(normalizedColor.slice(1, 3), 16) / 255;
  const green = Number.parseInt(normalizedColor.slice(3, 5), 16) / 255;
  const blue = Number.parseInt(normalizedColor.slice(5, 7), 16) / 255;
  const maximum = Math.max(red, green, blue);
  const minimum = Math.min(red, green, blue);
  const delta = maximum - minimum;
  let hue = 0;
  if (delta && maximum === red) hue = 60 * (((green - blue) / delta) % 6);
  else if (delta && maximum === green) hue = 60 * (((blue - red) / delta) + 2);
  else if (delta) hue = 60 * (((red - green) / delta) + 4);
  return {
    hue: (hue + 360) % 360,
    saturation: maximum === 0 ? 0 : delta / maximum,
    value: maximum,
  };
}

const colorPickerPopup = document.createElement("div");
colorPickerPopup.className = "color-picker-popup";
colorPickerPopup.hidden = true;
colorPickerPopup.setAttribute("role", "dialog");
colorPickerPopup.setAttribute("aria-label", "Color picker");
colorPickerPopup.innerHTML = `
  <div class="color-picker-sv" data-picker-sv role="slider" aria-label="Saturation and value">${colorPickerKnobMarkup()}</div>
  <div class="color-picker-sliders">
    <div class="color-picker-slider color-picker-hue" data-picker-hue role="slider" aria-label="Hue">${colorPickerKnobMarkup()}</div>
    <div class="color-picker-slider color-picker-opacity" data-picker-opacity role="slider" aria-label="Opacity">${colorPickerKnobMarkup()}</div>
  </div>
  <div class="color-picker-fields">
    <div class="custom-color-value"><input class="custom-color-hex" type="text" inputmode="text" maxlength="6" aria-label="Hex color value" autocomplete="off" autocapitalize="characters" spellcheck="false" data-picker-hex></div>
    <div class="custom-color-divider" aria-hidden="true"></div>
    <div class="custom-color-opacity"><input type="text" inputmode="decimal" maxlength="3" aria-label="Color opacity" data-picker-opacity-input><span aria-hidden="true">%</span></div>
  </div>`;
document.body.append(colorPickerPopup);

const colorPickerSv = colorPickerPopup.querySelector("[data-picker-sv]");
const colorPickerHue = colorPickerPopup.querySelector("[data-picker-hue]");
const colorPickerOpacity = colorPickerPopup.querySelector("[data-picker-opacity]");
const colorPickerHex = colorPickerPopup.querySelector("[data-picker-hex]");
const colorPickerOpacityInput = colorPickerPopup.querySelector("[data-picker-opacity-input]");
let activeColorControl = null;
let pickerHue = 0;
let pickerSaturation = 0;
let pickerValue = 1;
let pickerOpacity = 100;
let isApplyingPickerColor = false;
let colorPickerDrag = null;
let hasCustomColorPickerPosition = false;

function renderColorPicker() {
  const currentColor = hsvToHex(pickerHue, pickerSaturation, pickerValue);
  const hueColor = hsvToHex(pickerHue, 1, 1);
  colorPickerPopup.style.setProperty("--picker-color", currentColor);
  colorPickerPopup.style.setProperty("--picker-hue", hueColor);
  colorPickerPopup.style.setProperty("--picker-opacity", `${pickerOpacity}%`);
  const svKnob = colorPickerSv?.querySelector(".color-picker-knob");
  const hueKnob = colorPickerHue?.querySelector(".color-picker-knob");
  const opacityKnob = colorPickerOpacity?.querySelector(".color-picker-knob");
  if (svKnob instanceof HTMLElement) {
    svKnob.style.left = `${pickerSaturation * 100}%`;
    svKnob.style.top = `${(1 - pickerValue) * 100}%`;
  }
  if (hueKnob instanceof HTMLElement) hueKnob.style.left = `${8 + (pickerHue / 360) * 192}px`;
  if (opacityKnob instanceof HTMLElement) opacityKnob.style.left = `${8 + ((100 - pickerOpacity) / 100) * 192}px`;
  if (colorPickerHex instanceof HTMLInputElement) colorPickerHex.value = currentColor.slice(1);
  if (colorPickerOpacityInput instanceof HTMLInputElement) colorPickerOpacityInput.value = String(pickerOpacity);
  colorPickerSv?.setAttribute("aria-valuetext", `${Math.round(pickerSaturation * 100)}% saturation, ${Math.round(pickerValue * 100)}% value`);
  colorPickerHue?.setAttribute("aria-valuenow", String(Math.round(pickerHue)));
  colorPickerOpacity?.setAttribute("aria-valuenow", String(pickerOpacity));
}

function syncOpenColorPicker(control, color, opacity) {
  if (activeColorControl !== control || colorPickerPopup.hidden) return;
  pickerOpacity = normalizeColorOpacity(opacity);
  if (!isApplyingPickerColor) {
    const hsv = hexToHsv(color);
    pickerHue = hsv.hue;
    pickerSaturation = hsv.saturation;
    pickerValue = hsv.value;
  }
  renderColorPicker();
}

function positionColorPicker() {
  if (!(activeColorControl instanceof HTMLElement) || colorPickerPopup.hidden || hasCustomColorPickerPosition) return;
  const rect = activeColorControl.getBoundingClientRect();
  colorPickerPopup.style.left = `${rect.left - colorPickerPopup.offsetWidth - 4}px`;
  colorPickerPopup.style.top = `${rect.top}px`;
}

function openColorPicker(control) {
  const state = getCustomColorState(control);
  if (!state || !normalizeHexColor(state.color)) return;
  activeColorControl = control;
  const hsv = hexToHsv(state.color);
  pickerHue = hsv.hue;
  pickerSaturation = hsv.saturation;
  pickerValue = hsv.value;
  pickerOpacity = state.opacity;
  hasCustomColorPickerPosition = false;
  colorPickerPopup.hidden = false;
  syncOpenColorPicker(control, state.color, state.opacity);
  positionColorPicker();
}

function closeColorPicker() {
  if (activeColorControl) endHistoryGesture(activeColorControl);
  colorPickerPopup.hidden = true;
  colorPickerPopup.style.removeProperty("left");
  colorPickerPopup.style.removeProperty("top");
  hasCustomColorPickerPosition = false;
  colorPickerDrag = null;
  activeColorControl = null;
}

function isColorPickerContent(target) {
  return target instanceof Element && Boolean(target.closest(".color-picker-sv, .color-picker-sliders, .color-picker-fields"));
}

colorPickerPopup.addEventListener("pointerdown", (event) => {
  if (event.button !== 0 || colorPickerPopup.hidden || isColorPickerContent(event.target)) return;
  const bounds = colorPickerPopup.getBoundingClientRect();
  colorPickerDrag = {
    pointerId: event.pointerId,
    offsetX: event.clientX - bounds.left,
    offsetY: event.clientY - bounds.top,
  };
  colorPickerPopup.setPointerCapture(event.pointerId);
  event.preventDefault();
});

colorPickerPopup.addEventListener("pointermove", (event) => {
  if (!colorPickerDrag || event.pointerId !== colorPickerDrag.pointerId) return;
  const maxLeft = Math.max(4, window.innerWidth - colorPickerPopup.offsetWidth - 4);
  const maxTop = Math.max(4, window.innerHeight - colorPickerPopup.offsetHeight - 4);
  const left = Math.max(4, Math.min(event.clientX - colorPickerDrag.offsetX, maxLeft));
  const top = Math.max(4, Math.min(event.clientY - colorPickerDrag.offsetY, maxTop));
  colorPickerPopup.style.left = `${left}px`;
  colorPickerPopup.style.top = `${top}px`;
  hasCustomColorPickerPosition = true;
});

function finishColorPickerDrag(event) {
  if (!colorPickerDrag || event.pointerId !== colorPickerDrag.pointerId) return;
  if (colorPickerPopup.hasPointerCapture(event.pointerId)) {
    colorPickerPopup.releasePointerCapture(event.pointerId);
  }
  colorPickerDrag = null;
}

colorPickerPopup.addEventListener("pointerup", finishColorPickerDrag);
colorPickerPopup.addEventListener("pointercancel", finishColorPickerDrag);

function applyPickerColor() {
  if (!(activeColorControl instanceof HTMLElement)) return;
  isApplyingPickerColor = true;
  applyCustomColorValue(activeColorControl, hsvToHex(pickerHue, pickerSaturation, pickerValue), pickerOpacity);
  isApplyingPickerColor = false;
  renderColorPicker();
}

function bindColorPickerPointer(surface, update) {
  if (!(surface instanceof HTMLElement)) return;
  const move = (event) => {
    const rect = surface.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, event.clientX - rect.left));
    const y = Math.max(0, Math.min(rect.height, event.clientY - rect.top));
    update(x / rect.width, y / rect.height);
    applyPickerColor();
  };
  surface.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    if (activeColorControl) beginHistoryGesture(activeColorControl);
    surface.setPointerCapture(event.pointerId);
    move(event);
  });
  surface.addEventListener("pointermove", (event) => {
    if (surface.hasPointerCapture(event.pointerId)) move(event);
  });
  const endPointerGesture = () => {
    if (activeColorControl) endHistoryGesture(activeColorControl);
  };
  surface.addEventListener("pointerup", endPointerGesture);
  surface.addEventListener("pointercancel", endPointerGesture);
  surface.addEventListener("lostpointercapture", endPointerGesture);
}

bindColorPickerPointer(colorPickerSv, (x, y) => {
  pickerSaturation = x;
  pickerValue = 1 - y;
});
bindColorPickerPointer(colorPickerHue, (x) => {
  pickerHue = x * 360;
});
bindColorPickerPointer(colorPickerOpacity, (x) => {
  pickerOpacity = Math.round((1 - x) * 100);
});

colorPickerHex?.addEventListener("input", () => {
  if (!(colorPickerHex instanceof HTMLInputElement) || !/^[\da-f]{6}$/i.test(colorPickerHex.value.trim())) return;
  const hsv = hexToHsv(colorPickerHex.value);
  pickerHue = hsv.hue;
  pickerSaturation = hsv.saturation;
  pickerValue = hsv.value;
  applyPickerColor();
});
colorPickerHex?.addEventListener("focus", () => {
  if (activeColorControl) beginHistoryGesture(activeColorControl);
});
colorPickerHex?.addEventListener("blur", () => {
  if (activeColorControl) endHistoryGesture(activeColorControl);
});

colorPickerOpacityInput?.addEventListener("input", () => {
  if (!(colorPickerOpacityInput instanceof HTMLInputElement) || colorPickerOpacityInput.value.trim() === "" || !Number.isFinite(Number(colorPickerOpacityInput.value))) return;
  pickerOpacity = normalizeColorOpacity(colorPickerOpacityInput.value);
  applyPickerColor();
});
colorPickerOpacityInput?.addEventListener("focus", () => {
  if (activeColorControl) beginHistoryGesture(activeColorControl);
});
colorPickerOpacityInput?.addEventListener("blur", () => {
  if (activeColorControl) endHistoryGesture(activeColorControl);
});

document.addEventListener("pointerdown", (event) => {
  if (colorPickerPopup.hidden || colorPickerPopup.contains(event.target)) return;
  if (activeColorControl?.contains(event.target)) return;
  closeColorPicker();
}, true);

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape" || colorPickerPopup.hidden) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  closeColorPicker();
}, true);

window.addEventListener("resize", positionColorPicker);
document.addEventListener("scroll", positionColorPicker, true);

colorControls.forEach((control) => {
  if (!(control instanceof HTMLElement)) return;
  const picker = control.querySelector("input[type='color']");
  const hexInput = control.querySelector("[data-color-hex]");
  const opacityInput = control.querySelector("[data-color-opacity]");
  const section = control.closest("[data-paint-section]");
  const actionButton = section?.querySelector("[data-color-action]");
  const removeButton = control.querySelector("[data-color-remove-action]");
  const swatch = control.querySelector(".custom-color-swatch");

  if (swatch instanceof HTMLElement) {
    swatch.tabIndex = 0;
    swatch.setAttribute("role", "button");
    swatch.addEventListener("click", (event) => {
      event.preventDefault();
      if (activeColorControl === control && !colorPickerPopup.hidden) closeColorPicker();
      else openColorPicker(control);
    });
    swatch.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      openColorPicker(control);
    });
  }

  picker?.addEventListener("input", () => {
    if (!(picker instanceof HTMLInputElement)) return;
    const state = getCustomColorState(control);
    if (!state) return;
    applyCustomColorValue(control, picker.value, state.opacity);
  });
  picker?.addEventListener("focus", () => beginHistoryGesture(control));
  picker?.addEventListener("change", () => endHistoryGesture(control));
  picker?.addEventListener("blur", () => endHistoryGesture(control));

  hexInput?.addEventListener("focus", () => {
    beginHistoryGesture(control);
    if (hexInput instanceof HTMLInputElement) hexInput.select();
  });
  const commitHexInput = () => {
    if (!(hexInput instanceof HTMLInputElement)) return;
    const state = getCustomColorState(control);
    if (!state || !(state.picker instanceof HTMLInputElement)) return;
    const color = normalizeHexColor(hexInput.value);
    if (color) {
      applyCustomColorValue(control, color, state.opacity);
      return;
    }
    syncCustomColorControl(state.picker, state.color, state.opacity);
  };
  hexInput?.addEventListener("input", () => {
    if (!(hexInput instanceof HTMLInputElement)) return;
    if (!/^[\da-f]{6}$/i.test(hexInput.value.trim())) return;
    const color = normalizeHexColor(hexInput.value);
    const state = getCustomColorState(control);
    if (color && state) applyCustomColorValue(control, color, state.opacity);
  });
  hexInput?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    commitHexInput();
    if (hexInput instanceof HTMLInputElement) hexInput.select();
  });
  hexInput?.addEventListener("blur", () => {
    commitHexInput();
    endHistoryGesture(control);
  });

  opacityInput?.addEventListener("focus", () => {
    beginHistoryGesture(control);
    if (opacityInput instanceof HTMLInputElement) opacityInput.select();
  });
  opacityInput?.addEventListener("input", () => {
    if (!(opacityInput instanceof HTMLInputElement) || opacityInput.value.trim() === "") return;
    const state = getCustomColorState(control);
    if (!state || !Number.isFinite(Number(opacityInput.value))) return;
    applyCustomColorValue(control, state.color, opacityInput.value);
  });
  opacityInput?.addEventListener("keydown", (event) => {
    if (!(opacityInput instanceof HTMLInputElement) || !["ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault();
    const state = getCustomColorState(control);
    if (!state) return;
    const direction = event.key === "ArrowUp" ? 1 : -1;
    applyCustomColorValue(control, state.color, state.opacity + direction);
  });
  opacityInput?.addEventListener("blur", () => {
    const state = getCustomColorState(control);
    if (state && state.picker instanceof HTMLInputElement) {
      syncCustomColorControl(state.picker, state.color, state.opacity);
    }
    endHistoryGesture(control);
  });

  actionButton?.addEventListener("click", () => {
    const state = getCustomColorState(control);
    if (!state) return;
    const fallbackColors = {
      canvas: "#121619",
      "frame-background": "#FFFFFF",
      "frame-outline": "#000000",
      text: "#000000",
      vector: "#000000",
    };
    const nextColor = normalizeHexColor(control.dataset.lastColor)
      || fallbackColors[control.dataset.colorControl]
      || "#000000";
    const nextOpacity = control.dataset.colorControl === "text" && !normalizeHexColor(state.color)
      ? 100
      : state.opacity;
    beginHistoryGesture(control);
    applyCustomColorValue(control, nextColor, nextOpacity);
    endHistoryGesture(control);
  });

  removeButton?.addEventListener("click", () => {
    const state = getCustomColorState(control);
    if (state?.color) {
      beginHistoryGesture(control);
      applyCustomColorValue(control, "", state.opacity);
      endHistoryGesture(control);
      if (activeColorControl === control) closeColorPicker();
    }
  });
});

if (colorPicker instanceof HTMLInputElement) {
  syncCustomColorControl(colorPicker, canvasColorValue, canvasColorOpacity);
}

function persistVariantTextStyle(record, property, value) {
  if (!record?.isVariantInstance) return;
  setSelectedVariantLayerOverride(property, value);
}

fontSelect?.addEventListener("change", () => {
  const record = getSelectedTextRecord();
  if (!record || !(fontSelect instanceof HTMLSelectElement)) return;
  const family = fontSelect.value;
  const font = getFontRecord(family);
  const previousWeight = Number(record.element.dataset.fontWeight || DEFAULT_FONT_WEIGHT);
  populateWeightOptions(family, previousWeight);
  const weight = weightSelect instanceof HTMLSelectElement
    ? Number(weightSelect.value)
    : DEFAULT_FONT_WEIGHT;
  if (record.element.dataset.fontFamily !== family || previousWeight !== weight) recordHistory();
  record.element.dataset.fontFamily = family;
  record.element.dataset.fontWeight = String(weight);
  record.element.style.fontFamily = `${JSON.stringify(family)}, ${getFontFallback(font?.category || "Sans Serif")}`;
  record.element.style.fontWeight = String(weight);
  persistVariantTextStyle(record, "fontFamily", record.element.style.fontFamily);
  persistVariantTextStyle(record, "fontWeight", String(weight));
  loadGoogleFont(family, weight);
  requestAnimationFrame(syncSelectedTextSizeInputs);
});

weightSelect?.addEventListener("change", () => {
  const record = getSelectedTextRecord();
  if (!record || !(weightSelect instanceof HTMLSelectElement)) return;
  const family = record.element.dataset.fontFamily || DEFAULT_FONT_FAMILY;
  const weight = Number(weightSelect.value);
  if (Number(record.element.dataset.fontWeight || DEFAULT_FONT_WEIGHT) !== weight) recordHistory();
  record.element.dataset.fontWeight = String(weight);
  record.element.style.fontWeight = String(weight);
  persistVariantTextStyle(record, "fontWeight", String(weight));
  loadGoogleFont(family, weight);
  requestAnimationFrame(syncSelectedTextSizeInputs);
});

function syncTextSizeCombobox(value) {
  textSizeOptions.forEach((option) => {
    option.setAttribute("aria-selected", String(option.getAttribute("data-text-size-option") === String(value)));
  });
}

function setTextSizeComboboxOpen(isOpen) {
  if (!(textSizeMenu instanceof HTMLElement) || !(sizeSelect instanceof HTMLInputElement)) return;
  textSizeMenu.hidden = !isOpen;
  sizeSelect.setAttribute("aria-expanded", String(isOpen));
  textSizeToggle?.setAttribute("aria-expanded", String(isOpen));
}

function applyTextSizeValue(rawValue = sizeSelect?.value, normalize = true) {
  const record = getSelectedTextRecord();
  if (!record || !(sizeSelect instanceof HTMLInputElement)) return false;
  const value = String(rawValue || "").trim();
  if (!/^\d+(?:\.\d+)?$/.test(value)) return false;
  const numberValue = Math.max(0, Number(value));
  const normalizedValue = String(numberValue);
  if ((record.element.dataset.fontSize || "14") !== normalizedValue) recordHistoryForGesture(sizeSelect);
  record.element.dataset.fontSize = normalizedValue;
  record.element.style.fontSize = `${normalizedValue}px`;
  persistVariantTextStyle(record, "fontSize", `${normalizedValue}px`);
  if (normalize) sizeSelect.value = normalizedValue;
  syncTextSizeCombobox(normalizedValue);
  requestAnimationFrame(syncSelectedTextSizeInputs);
  return true;
}

sizeSelect?.addEventListener("focus", () => {
  if (sizeSelect instanceof HTMLInputElement) sizeSelect.select();
  textSizeCombobox?.classList.add("is-selection-focused");
});

sizeSelect?.addEventListener("click", () => {
  if (sizeSelect instanceof HTMLInputElement) sizeSelect.select();
});

sizeSelect?.addEventListener("input", () => {
  if (sizeSelect instanceof HTMLInputElement) applyTextSizeValue(sizeSelect.value, false);
});

sizeSelect?.addEventListener("blur", (event) => {
  if (event.relatedTarget instanceof Node && textSizeCombobox?.contains(event.relatedTarget)) return;
  if (!applyTextSizeValue()) syncInspectorToSelectedText();
  setTextSizeComboboxOpen(false);
  textSizeCombobox?.classList.remove("is-selection-focused");
});

sizeSelect?.addEventListener("keydown", (event) => {
  if (!(sizeSelect instanceof HTMLInputElement)) return;
  if (event.key === "ArrowDown") {
    event.preventDefault();
    setTextSizeComboboxOpen(true);
    return;
  }
  if (event.key === "Escape") {
    event.preventDefault();
    setTextSizeComboboxOpen(false);
    syncInspectorToSelectedText();
    return;
  }
  if (event.key !== "Enter") return;
  event.preventDefault();
  if (!applyTextSizeValue()) syncInspectorToSelectedText();
  setTextSizeComboboxOpen(false);
  sizeSelect.select();
});
if (sizeSelect instanceof HTMLElement) bindHistoryGesture(sizeSelect);

textSizeToggle?.addEventListener("click", () => {
  if (!(textSizeMenu instanceof HTMLElement) || !(sizeSelect instanceof HTMLInputElement)) return;
  setTextSizeComboboxOpen(textSizeMenu.hidden);
});

textSizeOptions.forEach((option) => {
  option.addEventListener("pointerdown", (event) => event.preventDefault());
  option.addEventListener("click", () => {
    const value = option.getAttribute("data-text-size-option");
    if (value) applyTextSizeValue(value);
    setTextSizeComboboxOpen(false);
    if (sizeSelect instanceof HTMLInputElement) {
      sizeSelect.focus();
      sizeSelect.select();
    }
    textSizeCombobox?.classList.add("is-selection-focused");
  });
});

document.addEventListener("pointerdown", (event) => {
  if (!(event.target instanceof Node) || !(textSizeCombobox instanceof HTMLElement)) return;
  if (!textSizeCombobox.contains(event.target)) setTextSizeComboboxOpen(false);
});

function applyLineHeightValue() {
  const record = getSelectedTextRecord();
  if (!record || !(lineHeightInput instanceof HTMLInputElement)) return false;
  const value = lineHeightInput.value.trim();
  if (/^(?:a|auto)$/i.test(value)) {
    if ((record.element.dataset.lineHeight || "Auto") !== "Auto") recordHistoryForGesture(lineHeightInput);
    lineHeightInput.value = "Auto";
    record.element.dataset.lineHeight = "Auto";
    record.element.style.lineHeight = "normal";
    persistVariantTextStyle(record, "lineHeight", "normal");
    requestAnimationFrame(syncSelectedTextSizeInputs);
    return true;
  }

  if (!/^\d+(?:\.\d+)?$/.test(value)) return false;
  const numberValue = Math.max(0, Number(value));
  if ((record.element.dataset.lineHeight || "Auto") !== String(numberValue)) recordHistoryForGesture(lineHeightInput);
  lineHeightInput.value = String(numberValue);
  record.element.dataset.lineHeight = String(numberValue);
  record.element.style.lineHeight = `${numberValue}px`;
  persistVariantTextStyle(record, "lineHeight", `${numberValue}px`);
  requestAnimationFrame(syncSelectedTextSizeInputs);
  return true;
}

lineHeightInput?.addEventListener("focus", () => {
  if (lineHeightInput instanceof HTMLInputElement) lineHeightInput.select();
});

lineHeightInput?.addEventListener("click", () => {
  if (lineHeightInput instanceof HTMLInputElement) lineHeightInput.select();
});

lineHeightInput?.addEventListener("input", applyLineHeightValue);

lineHeightInput?.addEventListener("blur", () => {
  if (!applyLineHeightValue()) syncInspectorToSelectedText();
});

lineHeightInput?.addEventListener("keydown", (event) => {
  if (!(lineHeightInput instanceof HTMLInputElement)) return;
  if (event.key === "Enter" && /^a$/i.test(lineHeightInput.value.trim())) {
    event.preventDefault();
    lineHeightInput.value = "Auto";
    applyLineHeightValue();
    return;
  }
  if (!["ArrowUp", "ArrowDown"].includes(event.key)) return;
  const record = getSelectedTextRecord();
  if (!record) return;
  event.preventDefault();
  const direction = event.key === "ArrowUp" ? 1 : -1;
  const value = lineHeightInput.value.trim();
  let base = Number(value);
  if (/^auto$/i.test(value) || !Number.isFinite(base)) {
    const styles = getComputedStyle(record.element);
    base = Number.parseFloat(styles.lineHeight);
    if (!Number.isFinite(base)) base = Number.parseFloat(styles.fontSize) * 1.2;
    base = Math.round(base);
  }
  lineHeightInput.value = String(Math.max(0, base + direction));
  applyLineHeightValue();
});
if (lineHeightInput instanceof HTMLElement) bindHistoryGesture(lineHeightInput);

function applyLetterSpacingValue(normalizeDisplay = true) {
  const record = getSelectedTextRecord();
  if (!record || !(letterSpacingInput instanceof HTMLInputElement)) return false;
  const match = letterSpacingInput.value.trim().match(/^(-?\d+(?:\.\d+)?)(%|px)?$/i);
  if (!match) return false;
  const unit = match[2]?.toLowerCase() || "%";
  const value = `${Number(match[1])}${unit}`;
  if ((record.element.dataset.letterSpacing || "0%") !== value) recordHistoryForGesture(letterSpacingInput);
  if (normalizeDisplay) letterSpacingInput.value = value;
  record.element.dataset.letterSpacing = value;
  record.element.style.letterSpacing = unit === "%"
    ? `${Number(match[1]) / 100}em`
    : value;
  persistVariantTextStyle(record, "letterSpacing", record.element.style.letterSpacing);
  requestAnimationFrame(syncSelectedTextSizeInputs);
  return true;
}

letterSpacingInput?.addEventListener("click", () => {
  if (letterSpacingInput instanceof HTMLInputElement) letterSpacingInput.select();
});

letterSpacingInput?.addEventListener("input", () => applyLetterSpacingValue(false));

letterSpacingInput?.addEventListener("blur", () => {
  if (!applyLetterSpacingValue()) syncInspectorToSelectedText();
});

letterSpacingInput?.addEventListener("keydown", (event) => {
  if (!(letterSpacingInput instanceof HTMLInputElement)) return;
  if (event.key === "Enter") {
    event.preventDefault();
    if (!applyLetterSpacingValue()) syncInspectorToSelectedText();
    letterSpacingInput.select();
    return;
  }
  if (!["ArrowUp", "ArrowDown"].includes(event.key)) return;
  const match = letterSpacingInput.value.trim().match(/^(-?\d+(?:\.\d+)?)(%|px)?$/i);
  if (!match) return;
  event.preventDefault();
  const direction = event.key === "ArrowUp" ? 1 : -1;
  letterSpacingInput.value = `${Number(match[1]) + direction}${match[2]?.toLowerCase() || "%"}`;
  applyLetterSpacingValue();
});
if (letterSpacingInput instanceof HTMLElement) bindHistoryGesture(letterSpacingInput);

textAlignmentOptions.forEach((option) => {
  option.addEventListener("click", () => {
    const record = getSelectedTextRecord();
    const alignment = normalizeFrameAlignment(option.getAttribute("data-text-alignment") || "top-left");
    if (!record || (!record.isVariantInstance && normalizeFrameAlignment(record.element.dataset.alignment || "top-left") === alignment)) return;
    recordHistory();
    record.element.dataset.alignment = alignment;
    applyTextAlignment(record.element);
    persistVariantTextStyle(record, "display", record.element.style.display);
    persistVariantTextStyle(record, "alignContent", record.element.style.alignContent);
    persistVariantTextStyle(record, "textAlign", record.element.style.textAlign);
    syncInspectorToSelectedText();
    requestAnimationFrame(syncResizeOverlay);
  });
});

vectorSizeInputs.forEach((input) => {
  if (!(input instanceof HTMLInputElement)) return;
  input.addEventListener("focus", () => input.select());
  input.addEventListener("input", () => {
    const record = getSelectedVectorRecord();
    const dimension = input.dataset.vectorSize;
    const value = Number(input.value);
    if (!record || (dimension !== "width" && dimension !== "height") || !Number.isFinite(value)) return;
    const fixedValue = Math.max(MIN_INTERACTIVE_LAYER_SIZE, value);
    if (record.isVariantInstance) {
      recordHistoryForGesture(input);
      record.element.dataset[`${dimension}Mode`] = "fixed";
      record.element.dataset[dimension] = String(fixedValue);
      record.element.style[dimension] = `${fixedValue}px`;
      setSelectedVariantLayerOverride(dimension, `${fixedValue}px`);
      requestAnimationFrame(syncResizeOverlay);
      return;
    }
    if (Number(record.element.dataset[dimension] || "24") !== fixedValue) recordHistoryForGesture(input);
    record.element.dataset[`${dimension}Mode`] = "fixed";
    record.element.dataset[dimension] = String(fixedValue);
    applyLayerSizing("vector", record);
    requestAnimationFrame(syncResizeOverlay);
  });
  input.addEventListener("blur", syncInspectorToSelectedVector);
  bindHistoryGesture(input);
});

function getSizeInputContext(input) {
  const frameDimension = input.dataset.frameSize;
  const textDimension = input.dataset.textLayerSize;
  if (frameDimension === "width" || frameDimension === "height") {
    const record = getSelectedFrameRecord();
    return record ? { type: "frame", record, dimension: frameDimension } : null;
  }
  if (textDimension === "width" || textDimension === "height") {
    const record = getSelectedTextRecord();
    return record ? { type: "text", record, dimension: textDimension } : null;
  }
  return null;
}

function setSizeComboboxOpen(wrapper, isOpen) {
  const input = wrapper.querySelector("input");
  const toggle = wrapper.querySelector("[data-size-toggle]");
  const menu = wrapper.querySelector("[data-size-menu]");
  if (!(input instanceof HTMLInputElement) || !(menu instanceof HTMLElement)) return;
  sizeModeComboboxes.forEach((combobox) => {
    const otherMenu = combobox.querySelector("[data-size-menu]");
    const otherInput = combobox.querySelector("input");
    const otherToggle = combobox.querySelector("[data-size-toggle]");
    if (otherMenu instanceof HTMLElement) otherMenu.hidden = true;
    otherInput?.setAttribute("aria-expanded", "false");
    otherToggle?.setAttribute("aria-expanded", "false");
  });
  menu.hidden = !isOpen;
  input.setAttribute("aria-expanded", String(isOpen));
  toggle?.setAttribute("aria-expanded", String(isOpen));
}

function updateSizeOptionSelection(wrapper, mode) {
  wrapper.querySelectorAll("[data-size-option]").forEach((option) => {
    option.setAttribute("aria-selected", String(option.getAttribute("data-size-option") === mode));
  });
}

function applySizeInputValue(input, rawValue = input.value, normalize = true) {
  const context = getSizeInputContext(input);
  if (!context) return false;
  const { type, record, dimension } = context;
  const element = record.element;
  const trimmedValue = rawValue.trim();
  const requestedMode = /^hug$/i.test(trimmedValue)
    ? "hug"
    : /^fill$/i.test(trimmedValue)
      ? "fill"
      : /^fixed$/i.test(trimmedValue)
        ? "fixed"
        : null;
  const numberMatch = trimmedValue.match(/^\d+(?:\.\d+)?$/);
  if (!requestedMode && !numberMatch) return false;
  const fixedNumber = numberMatch
    ? Math.max(MIN_INTERACTIVE_LAYER_SIZE, Number(numberMatch[0]))
    : null;

  if (selectedVariantInstanceId !== null && type === "frame" && record.isVariantInstance) {
    const value = numberMatch
      ? `${fixedNumber}px`
      : requestedMode === "fill" ? "100%" : "auto";
    recordHistoryForGesture(input);
    setSelectedVariantFrameStyleOverride(dimension, value, { record: false });
    if (normalize) input.value = numberMatch ? String(fixedNumber) : requestedMode === "fill" ? "Fill" : "Hug";
    return true;
  }
  if (selectedVariantInstanceId !== null && type === "text" && record.isVariantInstance) {
    const value = numberMatch
      ? `${fixedNumber}px`
      : requestedMode === "fill" ? "100%" : "auto";
    recordHistoryForGesture(input);
    element.style[dimension] = value;
    element.dataset[`${dimension}Mode`] = numberMatch ? "fixed" : requestedMode;
    if (numberMatch) element.dataset[dimension] = String(fixedNumber);
    setSelectedVariantLayerOverride(dimension, value);
    if (normalize) input.value = numberMatch ? String(fixedNumber) : requestedMode === "fill" ? "Fill" : "Hug";
    const wrapper = input.closest("[data-size-combobox]");
    if (wrapper instanceof HTMLElement) updateSizeOptionSelection(wrapper, numberMatch ? "fixed" : requestedMode);
    requestAnimationFrame(syncResizeOverlay);
    return true;
  }

  const currentMode = getLayerDimensionMode(element, dimension, type === "text" ? "hug" : "fixed");
  const mode = numberMatch ? "fixed" : requestedMode;
  let fixedValue = Number(element.dataset[dimension]);
  if (numberMatch) fixedValue = fixedNumber;
  if (mode === "fixed" && !Number.isFinite(fixedValue)) {
    fixedValue = Math.max(MIN_INTERACTIVE_LAYER_SIZE, Math.round(element.getBoundingClientRect()[dimension]));
  }
  const hasChange = currentMode !== mode
    || (mode === "fixed" && Number(element.dataset[dimension]) !== fixedValue);
  if (hasChange) recordHistoryForGesture(input);

  element.dataset[`${dimension}Mode`] = mode;
  if (mode === "fixed") element.dataset[dimension] = String(fixedValue);
  applyLayerSizing(type, record);
  if (normalize) input.value = mode === "fixed" ? String(fixedValue) : mode === "fill" ? "Fill" : "Hug";
  const wrapper = input.closest("[data-size-combobox]");
  if (wrapper instanceof HTMLElement) updateSizeOptionSelection(wrapper, mode);
  requestAnimationFrame(syncResizeOverlay);
  return true;
}

sizeModeComboboxes.forEach((wrapper) => {
  const input = wrapper.querySelector("input");
  const toggle = wrapper.querySelector("[data-size-toggle]");
  const menu = wrapper.querySelector("[data-size-menu]");
  if (!(input instanceof HTMLInputElement) || !(menu instanceof HTMLElement)) return;

  input.addEventListener("focus", () => input.select());
  input.addEventListener("input", () => applySizeInputValue(input, input.value, false));
  input.addEventListener("blur", (event) => {
    if (event.relatedTarget instanceof Node && wrapper.contains(event.relatedTarget)) return;
    if (!applySizeInputValue(input)) {
      if (input.dataset.frameSize) syncInspectorToSelectedFrame();
      else syncInspectorToSelectedText();
    }
    setSizeComboboxOpen(wrapper, false);
    wrapper.classList.remove("is-selection-focused");
  });
  input.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSizeComboboxOpen(wrapper, true);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      setSizeComboboxOpen(wrapper, false);
      if (input.dataset.frameSize) syncInspectorToSelectedFrame();
      else syncInspectorToSelectedText();
      return;
    }
    if (event.key !== "Enter") return;
    event.preventDefault();
    if (!applySizeInputValue(input)) {
      if (input.dataset.frameSize) syncInspectorToSelectedFrame();
      else syncInspectorToSelectedText();
    }
    setSizeComboboxOpen(wrapper, false);
  });
  bindHistoryGesture(input);

  toggle?.addEventListener("click", () => {
    setSizeComboboxOpen(wrapper, menu.hidden);
  });

  wrapper.querySelectorAll("[data-size-option]").forEach((option) => {
    option.addEventListener("pointerdown", (event) => event.preventDefault());
    option.addEventListener("click", () => {
      const mode = option.getAttribute("data-size-option");
      if (mode) applySizeInputValue(input, mode);
      setSizeComboboxOpen(wrapper, false);
      input.focus();
      wrapper.classList.add("is-selection-focused");
    });
  });
});

document.addEventListener("pointerdown", (event) => {
  if (!(event.target instanceof Node)) return;
  if (sizeModeComboboxes.some((wrapper) => wrapper.contains(event.target))) return;
  const firstCombobox = sizeModeComboboxes[0];
  if (firstCombobox instanceof HTMLElement) setSizeComboboxOpen(firstCombobox, false);
});

framePaddingInputs.forEach((input) => {
  if (!(input instanceof HTMLInputElement)) return;
  input.addEventListener("focus", () => input.select());
  input.addEventListener("input", () => {
    const record = getSelectedFrameRecord();
    const side = input.dataset.framePadding;
    const value = Number(input.value);
    if (!record || !side || !Number.isFinite(value) || value < 0) return;
    const propertyName = `padding${side[0].toUpperCase()}${side.slice(1)}`;
    if (selectedVariantInstanceId !== null) {
      if (getSelectedVariantTargetStyleOverride(propertyName, `${record.element.dataset[propertyName] || "10"}px`) === `${value}px`) return;
      recordHistoryForGesture(input);
      setSelectedVariantFrameStyleOverride(propertyName, `${value}px`, { record: false });
      syncFramePaddingAxisInputs(record.element);
      return;
    }
    if (Number(record.element.dataset[propertyName] || "10") !== value) recordHistoryForGesture(input);
    record.element.dataset[propertyName] = String(value);
    record.element.style[propertyName] = `${value}px`;
    syncFramePaddingAxisInputs(record.element);
    requestAnimationFrame(syncResizeOverlay);
  });
  input.addEventListener("blur", syncInspectorToSelectedFrame);
  bindHistoryGesture(input);
});

framePaddingAxisInputs.forEach((input) => {
  if (!(input instanceof HTMLInputElement)) return;
  const wrapper = input.closest(".prefixed-number-control");
  input.addEventListener("focus", () => {
    input.select();
    wrapper?.classList.add("is-selection-focused");
  });
  input.addEventListener("input", () => {
    const record = getSelectedFrameRecord();
    const axis = input.dataset.framePaddingAxis;
    const value = Number(input.value);
    if (!record || (axis !== "x" && axis !== "y") || input.value.trim() === "" || !Number.isFinite(value) || value < 0) return;
    const sides = axis === "x" ? ["left", "right"] : ["top", "bottom"];
    if (selectedVariantInstanceId !== null) {
      const hasVariantChange = sides.some((side) => {
        const propertyName = `padding${side[0].toUpperCase()}${side.slice(1)}`;
        return getSelectedVariantTargetStyleOverride(propertyName, `${record.element.dataset[propertyName] || "10"}px`) !== `${value}px`;
      });
      if (!hasVariantChange) return;
      recordHistoryForGesture(input);
      sides.forEach((side) => setSelectedVariantFrameStyleOverride(`padding${side[0].toUpperCase()}${side.slice(1)}`, `${value}px`, { record: false }));
      syncFramePaddingAxisInputs(record.element);
      return;
    }
    const hasChange = sides.some((side) => {
      const propertyName = `padding${side[0].toUpperCase()}${side.slice(1)}`;
      return Number(record.element.dataset[propertyName] || "10") !== value;
    });
    if (hasChange) recordHistoryForGesture(input);
    sides.forEach((side) => {
      const propertyName = `padding${side[0].toUpperCase()}${side.slice(1)}`;
      record.element.dataset[propertyName] = String(value);
      record.element.style[propertyName] = `${value}px`;
      const sideInput = framePaddingInputs.find((candidate) => candidate.dataset.framePadding === side);
      if (sideInput instanceof HTMLInputElement) sideInput.value = String(value);
    });
    requestAnimationFrame(syncResizeOverlay);
  });
  input.addEventListener("blur", () => {
    syncInspectorToSelectedFrame();
    wrapper?.classList.remove("is-selection-focused");
  });
  bindHistoryGesture(input);
});

framePaddingModeToggle?.addEventListener("click", () => {
  if (!(framePaddingModeToggle instanceof HTMLButtonElement)) return;
  framePaddingModeToggle.focus();
  const isIndividual = framePaddingModeToggle.getAttribute("aria-pressed") !== "true";
  setFramePaddingControlMode(isIndividual);
  const record = getSelectedFrameRecord();
  if (record) syncFramePaddingAxisInputs(record.element);
});

frameRadiusInput?.addEventListener("focus", () => {
  if (frameRadiusInput instanceof HTMLInputElement) frameRadiusInput.select();
});

frameRadiusInput?.addEventListener("input", () => {
  const record = getSelectedFrameRecord();
  if (!record || !(frameRadiusInput instanceof HTMLInputElement)) return;
  const value = Number(frameRadiusInput.value);
  if (!Number.isFinite(value) || value < 0) return;
  if (selectedVariantInstanceId !== null) {
    if (getSelectedVariantTargetStyleOverride("borderRadius", `${record.element.dataset.radius || "0"}px`) === `${value}px`) return;
    recordHistoryForGesture(frameRadiusInput);
    setSelectedVariantFrameStyleOverride("borderRadius", `${value}px`, { record: false });
    return;
  }
  if (Number(record.element.dataset.radius || "0") !== value) recordHistoryForGesture(frameRadiusInput);
  record.element.dataset.radius = String(value);
  record.element.style.borderRadius = `${value}px`;
});

frameRadiusInput?.addEventListener("blur", syncInspectorToSelectedFrame);
if (frameRadiusInput instanceof HTMLElement) bindHistoryGesture(frameRadiusInput);

frameDirectionOptions.forEach((option) => {
  option.addEventListener("click", () => {
    option.focus();
    const record = getSelectedFrameRecord();
    const direction = option.getAttribute("data-frame-direction") === "vertical" ? "vertical" : "horizontal";
    if (selectedVariantInstanceId !== null) {
      setSelectedVariantFrameStyleOverride("flexDirection", direction === "vertical" ? "column" : "row");
      syncInspectorToSelectedFrame();
      return;
    }
    if (!record || (record.element.dataset.direction || "horizontal") === direction) return;
    recordHistory();
    record.element.dataset.direction = direction;
    record.element.style.flexDirection = direction === "vertical" ? "column" : "row";
    applyFrameAlignment(record.element);
    applyAllLayerSizing();
    syncInspectorToSelectedFrame();
    renderTree();
  });
});

frameAlignmentOptions.forEach((option) => {
  let variantWasSpaceBetweenAtFirstClick = false;
  option.addEventListener("click", (event) => {
    option.focus();
    const record = getSelectedFrameRecord();
    const alignment = normalizeFrameAlignment(option.getAttribute("data-frame-alignment") || "top-left");
    if (selectedVariantInstanceId !== null) {
      const values = getFrameAlignmentValues({ dataset: { alignment, direction: getSelectedVariantTargetStyleOverride("flexDirection", record?.element.dataset.direction === "vertical" ? "column" : "row") === "column" ? "vertical" : "horizontal" } });
      const isSpaceBetween = getSelectedVariantTargetStyleOverride("justifyContent", record?.element.style.justifyContent || "flex-start") === "space-between";
      if (event.detail === 1) variantWasSpaceBetweenAtFirstClick = isSpaceBetween;
      if (event.detail === 2 && variantWasSpaceBetweenAtFirstClick) return;
      if (
        getSelectedVariantTargetStyleOverride("alignItems", record?.element.style.alignItems || "flex-start") === values.alignItems
        && getSelectedVariantTargetStyleOverride("justifyContent", record?.element.style.justifyContent || "flex-start") === values.justifyContent
      ) return;
      recordHistory();
      setSelectedVariantFrameStyleOverride("alignItems", values.alignItems, { record: false });
      setSelectedVariantFrameStyleOverride("justifyContent", values.justifyContent, { record: false });
      syncInspectorToSelectedFrame();
      return;
    }
    if (!record || isFrameAlignmentOptionSelected(record.element, alignment)) return;
    recordHistory();
    record.element.dataset.alignment = alignment;
    applyFrameAlignment(record.element);
    syncInspectorToSelectedFrame();
    renderTree();
  });
  option.addEventListener("dblclick", (event) => {
    const record = getSelectedFrameRecord();
    const alignment = normalizeFrameAlignment(option.getAttribute("data-frame-alignment") || "top-left");
    event.preventDefault();
    if (!record) return;
    if (selectedVariantInstanceId !== null) {
      const values = getFrameAlignmentValues({ dataset: { alignment, direction: getSelectedVariantTargetStyleOverride("flexDirection", record.element.dataset.direction === "vertical" ? "column" : "row") === "column" ? "vertical" : "horizontal" } });
      if (variantWasSpaceBetweenAtFirstClick) {
        setSelectedVariantFrameStyleOverride("justifyContent", values.justifyContent, { record: false });
      } else if (getSelectedVariantTargetStyleOverride("justifyContent", record.element.style.justifyContent || "flex-start") !== "space-between") {
        recordHistory();
        setSelectedVariantFrameStyleOverride("justifyContent", "space-between", { record: false });
      }
      variantWasSpaceBetweenAtFirstClick = false;
      syncInspectorToSelectedFrame();
      return;
    }
    recordHistory();
    const enableSpaceBetween = record.element.dataset.gapMode !== "auto";
    record.element.dataset.gapMode = enableSpaceBetween ? "auto" : "fixed";
    record.element.style.gap = enableSpaceBetween ? "0px" : `${record.element.dataset.gap || "10"}px`;
    applyFrameAlignment(record.element);
    syncInspectorToSelectedFrame();
  });
});

frameOutlinePositionSelect?.addEventListener("change", () => {
  const record = getSelectedFrameRecord();
  if (!record || !(frameOutlinePositionSelect instanceof HTMLSelectElement)) return;
  const position = ["outside", "center"].includes(frameOutlinePositionSelect.value)
    ? frameOutlinePositionSelect.value
    : "inside";
  if ((record.element.dataset.outlinePosition || "inside") === position) return;
  if (selectedVariantInstanceId !== null && record.isVariantInstance) {
    setSelectedVariantFrameStyleOverride("outlinePosition", position);
    return;
  }
  recordHistory();
  record.element.dataset.outlinePosition = position;
  applyFrameOutline(record.element);
});

frameOutlineWeightInput?.addEventListener("focus", () => {
  if (frameOutlineWeightInput instanceof HTMLInputElement) frameOutlineWeightInput.select();
});

frameOutlineWeightInput?.addEventListener("input", () => {
  const record = getSelectedFrameRecord();
  if (!record || !(frameOutlineWeightInput instanceof HTMLInputElement)) return;
  const weight = Number(frameOutlineWeightInput.value);
  if (!Number.isFinite(weight) || weight < 0) return;
  if (Number(record.element.dataset.outlineWeight || "1") !== weight) recordHistoryForGesture(frameOutlineWeightInput);
  if (selectedVariantInstanceId !== null && record.isVariantInstance) {
    setSelectedVariantFrameStyleOverride("outlineWeight", String(weight), { record: false, render: false });
    return;
  }
  record.element.dataset.outlineWeight = String(weight);
  applyFrameOutline(record.element);
});

frameOutlineWeightInput?.addEventListener("blur", syncInspectorToSelectedFrame);
if (frameOutlineWeightInput instanceof HTMLElement) bindHistoryGesture(frameOutlineWeightInput);

function setFrameGapMenuOpen(isOpen) {
  if (!(frameGapMenu instanceof HTMLElement) || !(frameGapInput instanceof HTMLInputElement)) return;
  frameGapMenu.hidden = !isOpen;
  frameGapInput.setAttribute("aria-expanded", String(isOpen));
  frameGapToggle?.setAttribute("aria-expanded", String(isOpen));
}

function applyFrameGapValue(normalize = true) {
  const record = getSelectedFrameRecord();
  if (!record || !(frameGapInput instanceof HTMLInputElement)) return false;
  const value = frameGapInput.value.trim();

  if (selectedVariantInstanceId !== null) {
    if (/^auto$/i.test(value)) {
      recordHistoryForGesture(frameGapInput);
      return setSelectedVariantFrameStyleOverride("gap", "0px", { record: false });
    }
    const variantMatch = value.match(/^(\d+(?:\.\d+)?)(?:px)?$/i);
    if (!variantMatch) return false;
    const gap = `${Math.max(0, Number(variantMatch[1]))}px`;
    recordHistoryForGesture(frameGapInput);
    setSelectedVariantFrameStyleOverride("gap", gap, { record: false });
    if (normalize) frameGapInput.value = String(Math.max(0, Number(variantMatch[1])));
    return true;
  }

  if (/^auto$/i.test(value)) {
    if (record.element.dataset.gapMode !== "auto") recordHistoryForGesture(frameGapInput);
    record.element.dataset.gapMode = "auto";
    record.element.style.gap = "0px";
    applyFrameAlignment(record.element);
    syncFrameAlignmentDistribution(record.element);
    if (normalize) frameGapInput.value = "Auto";
    return true;
  }

  const match = value.match(/^(\d+(?:\.\d+)?)(?:px)?$/i);
  if (!match) return false;
  const gap = Math.max(0, Number(match[1]));
  if (record.element.dataset.gapMode !== "fixed" || Number(record.element.dataset.gap || "10") !== gap) {
    recordHistoryForGesture(frameGapInput);
  }
  record.element.dataset.gapMode = "fixed";
  record.element.dataset.gap = String(gap);
  record.element.style.gap = `${gap}px`;
  applyFrameAlignment(record.element);
  syncFrameAlignmentDistribution(record.element);
  if (normalize) frameGapInput.value = String(gap);
  return true;
}

frameGapInput?.addEventListener("focus", () => {
  if (frameGapInput instanceof HTMLInputElement) frameGapInput.select();
  frameGapCombobox?.classList.add("is-selection-focused");
});

frameGapInput?.addEventListener("input", () => applyFrameGapValue(false));

frameGapInput?.addEventListener("blur", (event) => {
  if (frameGapCombobox instanceof HTMLElement && event.relatedTarget instanceof Node && frameGapCombobox.contains(event.relatedTarget)) return;
  if (!applyFrameGapValue()) syncInspectorToSelectedFrame();
  setFrameGapMenuOpen(false);
  frameGapCombobox?.classList.remove("is-selection-focused");
});

frameGapInput?.addEventListener("keydown", (event) => {
  if (event.key === "ArrowDown") {
    event.preventDefault();
    setFrameGapMenuOpen(true);
    return;
  }
  if (event.key === "Escape") {
    setFrameGapMenuOpen(false);
    syncInspectorToSelectedFrame();
    return;
  }
  if (event.key !== "Enter") return;
  event.preventDefault();
  if (!applyFrameGapValue()) syncInspectorToSelectedFrame();
  setFrameGapMenuOpen(false);
});
if (frameGapInput instanceof HTMLElement) bindHistoryGesture(frameGapInput);

frameGapToggle?.addEventListener("click", () => {
  if (!(frameGapMenu instanceof HTMLElement) || !(frameGapInput instanceof HTMLInputElement)) return;
  const willOpen = frameGapMenu.hidden;
  setFrameGapMenuOpen(willOpen);
});

frameGapAutoOption?.addEventListener("pointerdown", (event) => event.preventDefault());

frameGapAutoOption?.addEventListener("click", () => {
  if (!(frameGapInput instanceof HTMLInputElement)) return;
  frameGapInput.value = "Auto";
  applyFrameGapValue();
  setFrameGapMenuOpen(false);
  frameGapInput.focus();
  frameGapCombobox?.classList.add("is-selection-focused");
});

document.addEventListener("pointerdown", (event) => {
  if (!(frameGapCombobox instanceof HTMLElement) || !(event.target instanceof Node)) return;
  if (!frameGapCombobox.contains(event.target)) setFrameGapMenuOpen(false);
});

frameHtmlTagInput?.addEventListener("change", () => {
  const record = getSelectedFrameRecord();
  if (!record || !(frameHtmlTagInput instanceof HTMLSelectElement)) return;
  const htmlTag = normalizeFrameHtmlTag(frameHtmlTagInput.value);
  const sourceRecord = record.isVariantInstance
    ? selectedVariantLayerTarget?.startsWith("frame:")
      ? getFrameRecord(record.id)
      : currentComponent?.frameRecord
    : record;
  if (!sourceRecord) return;
  if ((sourceRecord.element.dataset.htmlTag || "div") !== htmlTag) recordHistory();
  sourceRecord.element.dataset.htmlTag = htmlTag;
  if (record.isVariantInstance) renderVariantInstances();
  renderComponentProps();
});

addPropButton?.addEventListener("click", addComponentProp);

const addPropTooltip = addPropButton?.closest(".props-action-tooltip");
if (addPropTooltip instanceof HTMLElement && addPropButton instanceof HTMLButtonElement) {
  bindPropsActionTooltip(addPropTooltip, addPropButton);
}
