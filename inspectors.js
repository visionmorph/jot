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
  frameAlignmentGrid.dataset.spaceBetween = String(element.dataset.gapMode === "auto");
  frameAlignmentOptions.forEach((option) => {
    const alignment = normalizeFrameAlignment(option.getAttribute("data-frame-alignment") || "top-left");
    const isSelected = isFrameAlignmentOptionSelected(element, alignment);
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
  const family = element.dataset.fontFamily || DEFAULT_FONT_FAMILY;
  const weight = Number(element.dataset.fontWeight || DEFAULT_FONT_WEIGHT);
  if (fontSelect instanceof HTMLSelectElement) fontSelect.value = family;
  populateWeightOptions(family, weight);
  if (sizeSelect instanceof HTMLInputElement) {
    sizeSelect.value = element.dataset.fontSize || "14";
    syncTextSizeCombobox(sizeSelect.value);
  }
  if (lineHeightInput instanceof HTMLInputElement) lineHeightInput.value = element.dataset.lineHeight || "Auto";
  if (letterSpacingInput instanceof HTMLInputElement) letterSpacingInput.value = element.dataset.letterSpacing || "0%";
  if (textColorPicker instanceof HTMLInputElement) {
    const color = Object.prototype.hasOwnProperty.call(element.dataset, "textColor")
      ? element.dataset.textColor
      : "#ffffff";
    syncCustomColorControl(textColorPicker, color, element.dataset.textColorOpacity || "100");
  }
  textAlignmentOptions.forEach((option) => {
    const isSelected = option.getAttribute("data-text-alignment") === normalizeFrameAlignment(element.dataset.alignment || "top-left");
    option.classList.toggle("is-selected", isSelected);
    option.setAttribute("aria-pressed", String(isSelected));
  });
  syncSelectedTextSizeInputs();
}

function syncFramePaddingAxisInputs(element) {
  framePaddingAxisInputs.forEach((input) => {
    if (!(input instanceof HTMLInputElement)) return;
    const sides = input.dataset.framePaddingAxis === "y" ? ["top", "bottom"] : ["left", "right"];
    const values = sides.map((side) => Number(element.dataset[`padding${side[0].toUpperCase()}${side.slice(1)}`] || "10"));
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

  if (frameInspectorHeading instanceof HTMLElement) {
    frameInspectorHeading.textContent = record.isComponent
      ? currentComponent?.name || "Component"
      : "Frame";
  }

  frameDirectionOptions.forEach((option) => {
    const isSelected = option.getAttribute("data-frame-direction") === (element.dataset.direction || "horizontal");
    option.classList.toggle("is-selected", isSelected);
    option.setAttribute("aria-pressed", String(isSelected));
  });
  if (frameAlignmentGrid instanceof HTMLElement) {
    frameAlignmentGrid.dataset.direction = element.dataset.direction === "vertical" ? "vertical" : "horizontal";
  }
  syncFrameAlignmentDistribution(element);
  if (frameGapInput instanceof HTMLInputElement) {
    frameGapInput.value = element.dataset.gapMode === "auto"
      ? "Auto"
      : `${element.dataset.gap || "10"}px`;
  }

  frameSizeInputs.forEach((input) => {
    if (!(input instanceof HTMLInputElement)) return;
    const dimension = input.dataset.frameSize;
    if (dimension !== "width" && dimension !== "height") return;
    const mode = getLayerDimensionMode(element, dimension);
    input.value = mode === "fixed"
      ? element.dataset[dimension] || "100"
      : mode === "fill" ? "Fill" : "Hug";
    const wrapper = input.closest("[data-size-combobox]");
    if (wrapper instanceof HTMLElement) updateSizeOptionSelection(wrapper, mode);
  });

  framePaddingInputs.forEach((input) => {
    if (!(input instanceof HTMLInputElement)) return;
    const side = input.dataset.framePadding;
    if (!side) return;
    input.value = element.dataset[`padding${side[0].toUpperCase()}${side.slice(1)}`] || "10";
  });
  syncFramePaddingAxisInputs(element);

  if (frameRadiusInput instanceof HTMLInputElement) {
    frameRadiusInput.value = element.dataset.radius || "0";
  }
  if (frameColorPicker instanceof HTMLInputElement) {
    const color = element.dataset.frameColor || "";
    syncCustomColorControl(frameColorPicker, color, element.dataset.frameColorOpacity || "100");
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
  const isTextSelected = selectedCanvasText !== null;
  const isFrameSelected = selectedCanvasFrame !== null || selectedComponentId === currentComponent?.id;
  const isVectorSelected = selectedCanvasVector !== null;
  if (pageInspector instanceof HTMLElement) pageInspector.hidden = isTextSelected || isFrameSelected || isVectorSelected;
  if (frameInspector instanceof HTMLElement) frameInspector.hidden = !isFrameSelected;
  if (textInspector instanceof HTMLElement) textInspector.hidden = !isTextSelected;
  if (vectorInspector instanceof HTMLElement) vectorInspector.hidden = !isVectorSelected;
  if (isTextSelected) syncInspectorToSelectedText();
  if (isFrameSelected) syncInspectorToSelectedFrame();
  if (isVectorSelected) syncInspectorToSelectedVector();
  if (!isTextSelected && !isFrameSelected && !isVectorSelected && colorPicker instanceof HTMLInputElement) {
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
  renderComponentProps();
}

function bindNativeSelectChevron(select, wrap) {
  const closeMenuState = () => wrap.classList.remove("is-open");
  select.addEventListener("pointerdown", () => wrap.classList.add("is-open"));
  select.addEventListener("change", closeMenuState);
  select.addEventListener("blur", closeMenuState);
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

function createPropSelect(options, value, ariaLabel, onChange, disabled = false) {
  const wrap = document.createElement("div");
  const select = document.createElement("select");
  const chevron = document.createElement("span");
  const selectedOptionRecord = options.find((optionRecord) => String(optionRecord.value) === String(value));

  wrap.className = "prop-select-wrap";
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
    selectedValue.className = "prop-target-selected-value";
    selectedLabel.className = "prop-target-selected-label";
    selectedLabel.textContent = selectedOptionRecord.label;
    selectedValue.append(selectedLabel, createLayerTypeIcon(selectedOptionRecord.iconType));
    select.classList.add("prop-select--has-layer-icon");
    wrap.append(selectedValue);
  }
  wrap.append(chevron);
  bindNativeSelectChevron(select, wrap);
  return wrap;
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
    nameInput.addEventListener("change", () => {
      const fallbackName = prop.type === "string"
        ? "label"
        : prop.type === "action"
          ? "onClick"
          : prop.property === "visibility" ? "visible" : "disabled";
      const name = nameInput.value.trim() || fallbackName;
      if (name === prop.name) return;
      recordHistory();
      prop.name = name;
      nameInput.value = name;
    });
    nameCell.append(nameInput);

    const typeCell = createCell();
    typeCell.append(createPropSelect(
      [
        { value: "boolean", label: "Boolean" },
        { value: "string", label: "String" },
        { value: "action", label: "Action" },
      ],
      prop.type,
      "Prop type",
      (value) => {
        if (value === prop.type) return;
        recordHistory();
        if (value === "string") {
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
          const target = compatibleTargets[0];
          prop.name = "disabled";
          prop.type = "boolean";
          prop.defaultValue = false;
          prop.targetFrameId = target?.id ?? null;
          prop.targetTextId = null;
          prop.targetVectorId = null;
          prop.property = "disabled";
        }
        renderComponentProps();
      },
    ));

    const defaultCell = createCell();
    if (prop.type === "boolean") {
      const defaultToggle = document.createElement("div");
      defaultToggle.className = "frame-direction-toggle prop-boolean-toggle";
      defaultToggle.setAttribute("role", "group");
      defaultToggle.setAttribute("aria-label", "Default Boolean value");
      [false, true].forEach((value) => {
        const option = document.createElement("button");
        const isSelected = Boolean(prop.defaultValue) === value;
        option.className = `frame-direction-option${isSelected ? " is-selected" : ""}`;
        option.type = "button";
        option.textContent = value ? "True" : "False";
        option.setAttribute("aria-pressed", String(isSelected));
        option.addEventListener("click", () => {
          if (Boolean(prop.defaultValue) === value) return;
          recordHistory();
          prop.defaultValue = value;
          renderComponentProps();
        });
        defaultToggle.append(option);
      });
      defaultCell.append(defaultToggle);
    } else if (prop.type === "string") {
      const defaultInput = document.createElement("input");
      let hasRecordedHistory = false;
      defaultInput.className = "prop-control";
      defaultInput.type = "text";
      defaultInput.value = String(prop.defaultValue);
      defaultInput.setAttribute("aria-label", "Default string value");
      defaultInput.addEventListener("input", () => {
        if (!hasRecordedHistory) {
          recordHistory();
          hasRecordedHistory = true;
        }
        prop.defaultValue = defaultInput.value;
        const target = getTextRecord(prop.targetTextId);
        if (target) target.element.textContent = defaultInput.value;
      });
      defaultInput.addEventListener("change", renderTree);
      defaultCell.append(defaultInput);
    } else {
      const emptyValue = document.createElement("span");
      emptyValue.className = "prop-empty-value";
      emptyValue.textContent = "—";
      emptyValue.setAttribute("aria-label", "No default value");
      defaultCell.append(emptyValue);
    }

    const targetCell = createCell();
    const isStringProp = prop.type === "string";
    const isVisibilityProp = prop.type === "boolean" && prop.property === "visibility";
    let targetOptions;
    let currentValue;
    let hasCurrentTarget;
    let targetsEmpty;

    if (isStringProp) {
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
        if (isStringProp) {
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
    if (prop.type === "boolean") {
      propertyCell.append(createPropSelect(
        [
          { value: "disabled", label: "Disabled" },
          { value: "visibility", label: "Visibility" },
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
    const removeButton = document.createElement("button");
    const removeIcon = document.createElement("span");
    removeButton.className = "prop-remove-button";
    removeButton.type = "button";
    removeButton.setAttribute("aria-label", `Remove ${prop.name} prop`);
    removeIcon.className = "subtract-icon";
    removeIcon.setAttribute("aria-hidden", "true");
    removeButton.append(removeIcon);
    removeButton.addEventListener("click", () => {
      recordHistory();
      componentProps = componentProps.filter((componentProp) => componentProp.id !== prop.id);
      renderComponentProps();
    });
    actionCell.append(removeButton);

    row.append(nameCell, typeCell, defaultCell, targetCell, propertyCell, actionCell);
    return row;
  });
  propRowsContainer.replaceChildren(...rows);
}

function addDisabledProp() {
  recordHistory();
  const target = getCompatibleDisabledTargets()[0];
  componentProps.push({
    id: nextComponentPropId,
    name: "disabled",
    type: "boolean",
    defaultValue: false,
    targetFrameId: target?.id ?? null,
    targetTextId: null,
    targetVectorId: null,
    property: "disabled",
  });
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
    const color = Object.prototype.hasOwnProperty.call(record.element.dataset, "textColor")
      ? record.element.dataset.textColor
      : "#ffffff";
    return {
      property,
      record,
      color,
      opacity: normalizeColorOpacity(record.element.dataset.textColorOpacity || "100"),
      picker: textColorPicker,
    };
  }
  if (property === "vector") {
    const record = getSelectedVectorRecord();
    if (!record) return null;
    const color = Object.prototype.hasOwnProperty.call(record.element.dataset, "vectorColor")
      ? record.element.dataset.vectorColor
      : getVectorRenderedColor(record);
    return {
      property,
      record,
      color,
      opacity: normalizeColorOpacity(record.element.dataset.vectorColorOpacity || "100"),
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
  if (normalizedColor) control.dataset.lastColor = normalizedColor;
  if (state.color === normalizedColor && state.opacity === normalizedOpacity) {
    syncCustomColorControl(state.picker, normalizedColor, normalizedOpacity);
    return true;
  }

  recordHistory();
  const renderedColor = getColorWithOpacity(normalizedColor, normalizedOpacity);
  if (state.property === "canvas") {
    canvasColorValue = normalizedColor;
    canvasColorOpacity = normalizedOpacity;
    if (canvas instanceof HTMLElement) canvas.style.backgroundColor = renderedColor || "transparent";
  } else if (state.property === "text") {
    state.record.element.dataset.textColor = normalizedColor;
    state.record.element.dataset.textColorOpacity = String(normalizedOpacity);
    state.record.element.style.color = renderedColor;
  } else if (state.property === "frame-background") {
    state.record.element.dataset.frameColor = normalizedColor;
    state.record.element.dataset.frameColorOpacity = String(normalizedOpacity);
    state.record.element.style.backgroundColor = renderedColor;
  } else if (state.property === "frame-outline") {
    state.record.element.dataset.outlineColor = normalizedColor;
    state.record.element.dataset.outlineColorOpacity = String(normalizedOpacity);
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

colorControls.forEach((control) => {
  if (!(control instanceof HTMLElement)) return;
  const picker = control.querySelector("input[type='color']");
  const hexInput = control.querySelector("[data-color-hex]");
  const opacityInput = control.querySelector("[data-color-opacity]");
  const section = control.closest("[data-paint-section]");
  const actionButton = section?.querySelector("[data-color-action]");
  const removeButton = control.querySelector("[data-color-remove-action]");

  picker?.addEventListener("input", () => {
    if (!(picker instanceof HTMLInputElement)) return;
    const state = getCustomColorState(control);
    if (!state) return;
    applyCustomColorValue(control, picker.value, state.opacity);
  });

  hexInput?.addEventListener("focus", () => {
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
  hexInput?.addEventListener("blur", commitHexInput);

  opacityInput?.addEventListener("focus", () => {
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
  });

  actionButton?.addEventListener("click", () => {
    const state = getCustomColorState(control);
    if (!state) return;
    const fallbackColors = {
      canvas: "#121619",
      "frame-background": "#000000",
      "frame-outline": "#000000",
      text: "#FFFFFF",
      vector: "#000000",
    };
    const nextColor = normalizeHexColor(control.dataset.lastColor)
      || fallbackColors[control.dataset.colorControl]
      || "#000000";
    applyCustomColorValue(control, nextColor, state.opacity);
  });

  removeButton?.addEventListener("click", () => {
    const state = getCustomColorState(control);
    if (state?.color) applyCustomColorValue(control, "", state.opacity);
  });
});

if (colorPicker instanceof HTMLInputElement) {
  syncCustomColorControl(colorPicker, canvasColorValue, canvasColorOpacity);
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
  if ((record.element.dataset.fontSize || "14") !== normalizedValue) recordHistory();
  record.element.dataset.fontSize = normalizedValue;
  record.element.style.fontSize = `${normalizedValue}px`;
  if (normalize) sizeSelect.value = normalizedValue;
  syncTextSizeCombobox(normalizedValue);
  requestAnimationFrame(syncSelectedTextSizeInputs);
  return true;
}

sizeSelect?.addEventListener("focus", () => {
  if (sizeSelect instanceof HTMLInputElement) sizeSelect.select();
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
    if ((record.element.dataset.lineHeight || "Auto") !== "Auto") recordHistory();
    lineHeightInput.value = "Auto";
    record.element.dataset.lineHeight = "Auto";
    record.element.style.lineHeight = "normal";
    requestAnimationFrame(syncSelectedTextSizeInputs);
    return true;
  }

  if (!/^\d+(?:\.\d+)?$/.test(value)) return false;
  const numberValue = Math.max(0, Number(value));
  if ((record.element.dataset.lineHeight || "Auto") !== String(numberValue)) recordHistory();
  lineHeightInput.value = String(numberValue);
  record.element.dataset.lineHeight = String(numberValue);
  record.element.style.lineHeight = `${numberValue}px`;
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

function applyLetterSpacingValue(normalizeDisplay = true) {
  const record = getSelectedTextRecord();
  if (!record || !(letterSpacingInput instanceof HTMLInputElement)) return false;
  const match = letterSpacingInput.value.trim().match(/^(-?\d+(?:\.\d+)?)(%|px)?$/i);
  if (!match) return false;
  const unit = match[2]?.toLowerCase() || "%";
  const value = `${Number(match[1])}${unit}`;
  if ((record.element.dataset.letterSpacing || "0%") !== value) recordHistory();
  if (normalizeDisplay) letterSpacingInput.value = value;
  record.element.dataset.letterSpacing = value;
  record.element.style.letterSpacing = unit === "%"
    ? `${Number(match[1]) / 100}em`
    : value;
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

textAlignmentOptions.forEach((option) => {
  option.addEventListener("click", () => {
    const record = getSelectedTextRecord();
    const alignment = normalizeFrameAlignment(option.getAttribute("data-text-alignment") || "top-left");
    if (!record || normalizeFrameAlignment(record.element.dataset.alignment || "top-left") === alignment) return;
    recordHistory();
    record.element.dataset.alignment = alignment;
    applyTextAlignment(record.element);
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
    if (!record || (dimension !== "width" && dimension !== "height") || !Number.isFinite(value) || value < 0) return;
    if (Number(record.element.dataset[dimension] || "24") !== value) recordHistory();
    record.element.dataset[`${dimension}Mode`] = "fixed";
    record.element.dataset[dimension] = String(value);
    applyLayerSizing("vector", record);
    requestAnimationFrame(syncResizeOverlay);
  });
  input.addEventListener("blur", syncInspectorToSelectedVector);
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

  const currentMode = getLayerDimensionMode(element, dimension, type === "text" ? "hug" : "fixed");
  const mode = numberMatch ? "fixed" : requestedMode;
  let fixedValue = Number(element.dataset[dimension]);
  if (numberMatch) fixedValue = Math.max(0, Number(numberMatch[0]));
  if (mode === "fixed" && !Number.isFinite(fixedValue)) {
    fixedValue = Math.round(element.getBoundingClientRect()[dimension]);
  }
  const hasChange = currentMode !== mode
    || (mode === "fixed" && Number(element.dataset[dimension]) !== fixedValue);
  if (hasChange) recordHistory();

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
    if (Number(record.element.dataset[propertyName] || "10") !== value) recordHistory();
    record.element.dataset[propertyName] = String(value);
    record.element.style[propertyName] = `${value}px`;
    syncFramePaddingAxisInputs(record.element);
  });
  input.addEventListener("blur", syncInspectorToSelectedFrame);
});

framePaddingAxisInputs.forEach((input) => {
  if (!(input instanceof HTMLInputElement)) return;
  input.addEventListener("focus", () => input.select());
  input.addEventListener("input", () => {
    const record = getSelectedFrameRecord();
    const axis = input.dataset.framePaddingAxis;
    const value = Number(input.value);
    if (!record || (axis !== "x" && axis !== "y") || input.value.trim() === "" || !Number.isFinite(value) || value < 0) return;
    const sides = axis === "x" ? ["left", "right"] : ["top", "bottom"];
    const hasChange = sides.some((side) => {
      const propertyName = `padding${side[0].toUpperCase()}${side.slice(1)}`;
      return Number(record.element.dataset[propertyName] || "10") !== value;
    });
    if (hasChange) recordHistory();
    sides.forEach((side) => {
      const propertyName = `padding${side[0].toUpperCase()}${side.slice(1)}`;
      record.element.dataset[propertyName] = String(value);
      record.element.style[propertyName] = `${value}px`;
      const sideInput = framePaddingInputs.find((candidate) => candidate.dataset.framePadding === side);
      if (sideInput instanceof HTMLInputElement) sideInput.value = String(value);
    });
  });
  input.addEventListener("blur", syncInspectorToSelectedFrame);
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
  if (Number(record.element.dataset.radius || "0") !== value) recordHistory();
  record.element.dataset.radius = String(value);
  record.element.style.borderRadius = `${value}px`;
});

frameRadiusInput?.addEventListener("blur", syncInspectorToSelectedFrame);

frameDirectionOptions.forEach((option) => {
  option.addEventListener("click", () => {
    option.focus();
    const record = getSelectedFrameRecord();
    const direction = option.getAttribute("data-frame-direction") === "vertical" ? "vertical" : "horizontal";
    if (!record || (record.element.dataset.direction || "horizontal") === direction) return;
    recordHistory();
    record.element.dataset.direction = direction;
    record.element.style.flexDirection = direction === "vertical" ? "column" : "row";
    applyFrameAlignment(record.element);
    applyAllLayerSizing();
    syncInspectorToSelectedFrame();
  });
});

frameAlignmentOptions.forEach((option) => {
  let wasSelectedAtFirstClick = false;
  option.addEventListener("click", (event) => {
    option.focus();
    const record = getSelectedFrameRecord();
    const alignment = normalizeFrameAlignment(option.getAttribute("data-frame-alignment") || "top-left");
    if (event.detail === 1) {
      wasSelectedAtFirstClick = Boolean(record && isFrameAlignmentOptionSelected(record.element, alignment));
    }
    if (!record || isFrameAlignmentOptionSelected(record.element, alignment)) return;
    recordHistory();
    record.element.dataset.alignment = alignment;
    applyFrameAlignment(record.element);
    syncInspectorToSelectedFrame();
  });
  option.addEventListener("dblclick", (event) => {
    const record = getSelectedFrameRecord();
    const alignment = normalizeFrameAlignment(option.getAttribute("data-frame-alignment") || "top-left");
    if (
      !record
      || !wasSelectedAtFirstClick
      || !isFrameAlignmentOptionSelected(record.element, alignment)
    ) return;
    event.preventDefault();
    recordHistory();
    const enableSpaceBetween = record.element.dataset.gapMode !== "auto";
    record.element.dataset.gapMode = enableSpaceBetween ? "auto" : "fixed";
    record.element.style.gap = enableSpaceBetween ? "0px" : `${record.element.dataset.gap || "10"}px`;
    applyFrameAlignment(record.element);
    syncInspectorToSelectedFrame();
    wasSelectedAtFirstClick = false;
  });
});

frameOutlinePositionSelect?.addEventListener("change", () => {
  const record = getSelectedFrameRecord();
  if (!record || !(frameOutlinePositionSelect instanceof HTMLSelectElement)) return;
  const position = ["outside", "center"].includes(frameOutlinePositionSelect.value)
    ? frameOutlinePositionSelect.value
    : "inside";
  if ((record.element.dataset.outlinePosition || "inside") === position) return;
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
  if (Number(record.element.dataset.outlineWeight || "1") !== weight) recordHistory();
  record.element.dataset.outlineWeight = String(weight);
  applyFrameOutline(record.element);
});

frameOutlineWeightInput?.addEventListener("blur", syncInspectorToSelectedFrame);

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

  if (/^auto$/i.test(value)) {
    if (record.element.dataset.gapMode !== "auto") recordHistory();
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
    recordHistory();
  }
  record.element.dataset.gapMode = "fixed";
  record.element.dataset.gap = String(gap);
  record.element.style.gap = `${gap}px`;
  applyFrameAlignment(record.element);
  syncFrameAlignmentDistribution(record.element);
  if (normalize) frameGapInput.value = `${gap}px`;
  return true;
}

frameGapInput?.addEventListener("focus", () => {
  if (frameGapInput instanceof HTMLInputElement) frameGapInput.select();
});

frameGapInput?.addEventListener("input", () => applyFrameGapValue(false));

frameGapInput?.addEventListener("blur", (event) => {
  if (frameGapCombobox instanceof HTMLElement && event.relatedTarget instanceof Node && frameGapCombobox.contains(event.relatedTarget)) return;
  if (!applyFrameGapValue()) syncInspectorToSelectedFrame();
  setFrameGapMenuOpen(false);
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
});

document.addEventListener("pointerdown", (event) => {
  if (!(frameGapCombobox instanceof HTMLElement) || !(event.target instanceof Node)) return;
  if (!frameGapCombobox.contains(event.target)) setFrameGapMenuOpen(false);
});

frameHtmlTagInput?.addEventListener("change", () => {
  const record = getSelectedFrameRecord();
  if (!record || !(frameHtmlTagInput instanceof HTMLSelectElement)) return;
  const htmlTag = normalizeFrameHtmlTag(frameHtmlTagInput.value);
  if ((record.element.dataset.htmlTag || "div") !== htmlTag) recordHistory();
  record.element.dataset.htmlTag = htmlTag;
  renderComponentProps();
});

addPropButton?.addEventListener("click", addDisabledProp);
