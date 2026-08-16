const canvas = document.querySelector("#canvas");
const toolbar = document.querySelector(".toolbar");
const treeView = document.querySelector("[data-tree-view]");
const pageInspector = document.querySelector("[data-page-inspector]");
const frameInspector = document.querySelector("[data-frame-inspector]");
const textInspector = document.querySelector("[data-text-inspector]");
const colorPicker = document.querySelector("#canvas-color-picker");
const toolButtons = Array.from(document.querySelectorAll("[data-tool]"));
const fontSelect = document.querySelector("#text-font");
const weightSelect = document.querySelector("#text-weight");
const sizeSelect = document.querySelector("#text-size");
const lineHeightInput = document.querySelector("#text-line-height");
const letterSpacingInput = document.querySelector("#text-letter-spacing");
const textColorPicker = document.querySelector("#text-color-picker");
const leftSidebar = document.querySelector(".left-sidebar");
const componentsPanel = document.querySelector(".components-panel");
const sidebarDivider = document.querySelector(".sidebar-divider");
const frameSizeInputs = Array.from(document.querySelectorAll("[data-frame-size]"));
const textLayerSizeInputs = Array.from(document.querySelectorAll("[data-text-layer-size]"));
const sizeModeComboboxes = Array.from(document.querySelectorAll("[data-size-combobox]"));
const framePaddingInputs = Array.from(document.querySelectorAll("[data-frame-padding]"));
const frameRadiusInput = document.querySelector("#frame-radius");
const frameColorPicker = document.querySelector("#frame-color-picker");
const frameDirectionSelect = document.querySelector("#frame-direction");
const frameGapInput = document.querySelector("#frame-gap");
const frameGapCombobox = document.querySelector("[data-gap-combobox]");
const frameGapToggle = document.querySelector("[data-gap-toggle]");
const frameGapMenu = document.querySelector("[data-gap-menu]");
const frameGapAutoOption = document.querySelector("[data-gap-option='auto']");
const frameHtmlTagInput = document.querySelector("#frame-html-tag");
const exportComponentsButton = document.querySelector("[data-export-components]");

const RESIZE_HANDLE_DIRECTIONS = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

const DEFAULT_FONT_FAMILY = "Inter";
const DEFAULT_FONT_WEIGHT = 400;
const WEIGHT_LABELS = {
  100: "Thin",
  200: "Extra Light",
  300: "Light",
  400: "Regular",
  500: "Medium",
  600: "Semi Bold",
  700: "Bold",
  800: "Extra Bold",
  900: "Black",
};
const FALLBACK_FONT_CATALOG = [
  { family: "Inter", category: "Sans Serif", weights: [100, 200, 300, 400, 500, 600, 700, 800, 900] },
  { family: "Roboto", category: "Sans Serif", weights: [100, 300, 400, 500, 700, 900] },
  { family: "Open Sans", category: "Sans Serif", weights: [300, 400, 500, 600, 700, 800] },
  { family: "Lato", category: "Sans Serif", weights: [100, 300, 400, 700, 900] },
  { family: "Montserrat", category: "Sans Serif", weights: [100, 200, 300, 400, 500, 600, 700, 800, 900] },
  { family: "Merriweather", category: "Serif", weights: [300, 400, 700, 900] },
];

let fontCatalog = FALLBACK_FONT_CATALOG;
const loadedGoogleFonts = new Set();

let activeTool = "select";
let selectedCanvasFrame = null;
let selectedCanvasText = null;
let nextFrameId = 1;
let nextTextId = 1;
let nextLayerOrder = 1;
let frameRecords = [];
let textRecords = [];
let suppressNextTextCreation = false;
const expandedFrameIds = new Set();
const undoHistory = [];
const redoHistory = [];
const HISTORY_LIMIT = 100;
let isRestoringHistory = false;
let isBatchingHistory = false;
let canvasColorValue = colorPicker instanceof HTMLInputElement ? colorPicker.value : "#121619";
let resizeInteraction = null;
let observedResizeElement = null;

const resizeOverlay = document.createElement("div");
resizeOverlay.className = "resize-overlay";
resizeOverlay.hidden = true;
resizeOverlay.setAttribute("aria-hidden", "true");

RESIZE_HANDLE_DIRECTIONS.forEach((direction) => {
  const handle = document.createElement("button");
  handle.className = `resize-handle resize-handle--${direction}`;
  handle.type = "button";
  handle.tabIndex = -1;
  handle.dataset.resizeHandle = direction;
  handle.setAttribute("aria-label", `Resize ${direction}`);
  resizeOverlay.append(handle);
});

if (canvas instanceof HTMLElement) {
  canvas.insertBefore(resizeOverlay, toolbar instanceof Node ? toolbar : null);
}

function getSelectedResizeElement() {
  return selectedCanvasFrame || selectedCanvasText;
}

function getSelectedResizeRecord() {
  const frameRecord = getSelectedFrameRecord();
  if (frameRecord) return { type: "frame", record: frameRecord, parentId: frameRecord.parentId };
  const textRecord = getSelectedTextRecord();
  if (textRecord) return { type: "text", record: textRecord, parentId: textRecord.parentFrameId };
  return null;
}

function positionResizeOverlay() {
  if (!(canvas instanceof HTMLElement)) return;
  const element = getSelectedResizeElement();
  if (!(element instanceof HTMLElement) || !element.isConnected) {
    resizeOverlay.hidden = true;
    return;
  }

  const canvasBounds = canvas.getBoundingClientRect();
  const bounds = element.getBoundingClientRect();
  resizeOverlay.hidden = false;
  resizeOverlay.style.left = `${bounds.left - canvasBounds.left}px`;
  resizeOverlay.style.top = `${bounds.top - canvasBounds.top}px`;
  resizeOverlay.style.width = `${bounds.width}px`;
  resizeOverlay.style.height = `${bounds.height}px`;
}

const selectedLayerResizeObserver = typeof ResizeObserver === "function"
  ? new ResizeObserver(() => requestAnimationFrame(positionResizeOverlay))
  : null;

function syncResizeOverlay() {
  const element = getSelectedResizeElement();
  if (element !== observedResizeElement) {
    selectedLayerResizeObserver?.disconnect();
    observedResizeElement = element;
    if (element instanceof HTMLElement) selectedLayerResizeObserver?.observe(element);
    if (canvas instanceof HTMLElement) selectedLayerResizeObserver?.observe(canvas);
  }
  positionResizeOverlay();
}

function applyResizePointerPosition(clientX, clientY) {
  if (!resizeInteraction) return;
  const { element, layer, direction } = resizeInteraction;
  if (!element.isConnected) return;

  const deltaX = clientX - resizeInteraction.pointerX;
  const deltaY = clientY - resizeInteraction.pointerY;
  const changesWidth = direction.includes("e") || direction.includes("w");
  const changesHeight = direction.includes("n") || direction.includes("s");
  const nextWidth = changesWidth
    ? Math.max(0, Math.round(resizeInteraction.width + (direction.includes("w") ? -deltaX : deltaX)))
    : resizeInteraction.width;
  const nextHeight = changesHeight
    ? Math.max(0, Math.round(resizeInteraction.height + (direction.includes("n") ? -deltaY : deltaY)))
    : resizeInteraction.height;
  const widthChanged = changesWidth && nextWidth !== Number(element.dataset.width || resizeInteraction.width);
  const heightChanged = changesHeight && nextHeight !== Number(element.dataset.height || resizeInteraction.height);

  if (!widthChanged && !heightChanged) return;
  if (!resizeInteraction.hasRecordedHistory) {
    recordHistory();
    resizeInteraction.hasRecordedHistory = true;
  }

  if (changesWidth) {
    element.dataset.widthMode = "fixed";
    element.dataset.width = String(nextWidth);
    element.style.width = `${nextWidth}px`;
    if (layer.parentId === null && direction.includes("w")) {
      element.style.left = `${resizeInteraction.left + resizeInteraction.width - nextWidth}px`;
    }
  }
  if (changesHeight) {
    element.dataset.heightMode = "fixed";
    element.dataset.height = String(nextHeight);
    element.style.height = `${nextHeight}px`;
    if (layer.parentId === null && direction.includes("n")) {
      element.style.top = `${resizeInteraction.top + resizeInteraction.height - nextHeight}px`;
    }
  }

  applyLayerSizing(layer.type, layer.record);
  if (layer.type === "frame") syncInspectorToSelectedFrame();
  else syncSelectedTextSizeInputs();
  positionResizeOverlay();
}

resizeOverlay.addEventListener("pointerdown", (event) => {
  const handle = event.target instanceof HTMLElement ? event.target.closest("[data-resize-handle]") : null;
  const layer = getSelectedResizeRecord();
  const element = getSelectedResizeElement();
  if (!(handle instanceof HTMLButtonElement) || !(element instanceof HTMLElement) || !layer || event.button !== 0) return;

  event.preventDefault();
  event.stopPropagation();
  const canvasBounds = canvas instanceof HTMLElement ? canvas.getBoundingClientRect() : { left: 0, top: 0 };
  const bounds = element.getBoundingClientRect();
  resizeInteraction = {
    element,
    layer,
    direction: handle.dataset.resizeHandle || "se",
    pointerX: event.clientX,
    pointerY: event.clientY,
    width: bounds.width,
    height: bounds.height,
    left: bounds.left - canvasBounds.left,
    top: bounds.top - canvasBounds.top,
    hasRecordedHistory: false,
  };
  handle.setPointerCapture(event.pointerId);
});

resizeOverlay.addEventListener("pointermove", (event) => {
  if (!(event.target instanceof HTMLButtonElement) || !event.target.hasPointerCapture(event.pointerId)) return;
  applyResizePointerPosition(event.clientX, event.clientY);
});

resizeOverlay.addEventListener("pointerup", (event) => {
  if (!(event.target instanceof HTMLButtonElement) || !event.target.hasPointerCapture(event.pointerId)) return;
  applyResizePointerPosition(event.clientX, event.clientY);
  event.target.releasePointerCapture(event.pointerId);
  resizeInteraction = null;
  syncResizeOverlay();
});

resizeOverlay.addEventListener("pointercancel", (event) => {
  if (event.target instanceof HTMLButtonElement && event.target.hasPointerCapture(event.pointerId)) {
    event.target.releasePointerCapture(event.pointerId);
  }
  resizeInteraction = null;
  syncResizeOverlay();
});

window.addEventListener("resize", syncResizeOverlay);

function normalizeFrameHtmlTag(value) {
  return value.trim().toLowerCase() === "button" ? "button" : "div";
}

function resizeLeftSidebarPanels(clientY) {
  if (
    !(leftSidebar instanceof HTMLElement) ||
    !(componentsPanel instanceof HTMLElement) ||
    !(sidebarDivider instanceof HTMLElement)
  ) return;

  const bounds = leftSidebar.getBoundingClientRect();
  const nextHeight = Math.min(bounds.height, Math.max(0, clientY - bounds.top));
  const percentage = bounds.height > 0 ? Math.round((nextHeight / bounds.height) * 100) : 50;
  componentsPanel.style.height = `${nextHeight}px`;
  sidebarDivider.setAttribute("aria-valuenow", String(percentage));
}

sidebarDivider?.addEventListener("pointerdown", (event) => {
  if (!(sidebarDivider instanceof HTMLElement) || event.button !== 0) return;
  event.preventDefault();
  sidebarDivider.setPointerCapture(event.pointerId);
  resizeLeftSidebarPanels(event.clientY);
});

sidebarDivider?.addEventListener("pointermove", (event) => {
  if (!(sidebarDivider instanceof HTMLElement) || !sidebarDivider.hasPointerCapture(event.pointerId)) return;
  resizeLeftSidebarPanels(event.clientY);
});

sidebarDivider?.addEventListener("pointerup", (event) => {
  if (!(sidebarDivider instanceof HTMLElement) || !sidebarDivider.hasPointerCapture(event.pointerId)) return;
  resizeLeftSidebarPanels(event.clientY);
  sidebarDivider.releasePointerCapture(event.pointerId);
});

sidebarDivider?.addEventListener("pointercancel", (event) => {
  if (sidebarDivider instanceof HTMLElement && sidebarDivider.hasPointerCapture(event.pointerId)) {
    sidebarDivider.releasePointerCapture(event.pointerId);
  }
});

function selectTool(toolName) {
  activeTool = toolName;
  canvas?.classList.toggle("is-frame-tool-active", activeTool === "frame");
  canvas?.classList.toggle("is-text-tool-active", activeTool === "text");

  toolButtons.forEach((toolButton) => {
    const isSelected = toolButton.getAttribute("data-tool") === activeTool;
    toolButton.classList.toggle("is-toggled", isSelected);
    toolButton.setAttribute("aria-pressed", String(isSelected));
  });
}

function getFrameRecord(frameId) {
  return frameRecords.find((record) => record.id === frameId);
}

function getTextRecord(textId) {
  return textRecords.find((record) => record.id === textId);
}

function getLayerDimensionMode(element, dimension, fallback = "fixed") {
  const mode = element.dataset[`${dimension}Mode`];
  return mode === "hug" || mode === "fill" ? mode : fallback;
}

function getLayerSizingContext(type, record) {
  const parentId = type === "frame" ? record.parentId : record.parentFrameId;
  const parentRecord = parentId === null ? null : getFrameRecord(parentId);
  const parentDirection = parentRecord?.element.dataset.direction === "vertical" ? "vertical" : "horizontal";
  return { parentId, parentDirection };
}

function applyLayerSizing(type, record) {
  const element = record.element;
  const { parentId, parentDirection } = getLayerSizingContext(type, record);
  const widthMode = getLayerDimensionMode(element, "width", type === "text" ? "hug" : "fixed");
  const heightMode = getLayerDimensionMode(element, "height", type === "text" ? "hug" : "fixed");
  const isRoot = parentId === null;
  const mainDimension = parentDirection === "vertical" ? "height" : "width";
  const mainMode = mainDimension === "width" ? widthMode : heightMode;
  const crossMode = mainDimension === "width" ? heightMode : widthMode;

  const applyDimension = (dimension, mode, fallbackValue) => {
    if (mode === "fixed") {
      element.style[dimension] = `${element.dataset[dimension] || fallbackValue}px`;
    } else if (mode === "hug") {
      element.style[dimension] = "fit-content";
    } else if (isRoot) {
      element.style[dimension] = "100%";
    } else {
      element.style[dimension] = "auto";
    }
  };

  applyDimension("width", widthMode, type === "frame" ? "100" : "0");
  applyDimension("height", heightMode, type === "frame" ? "100" : "0");
  element.style.flex = isRoot ? "" : mainMode === "fill" ? "1 1 0" : "0 0 auto";
  element.style.alignSelf = !isRoot && crossMode === "fill" ? "stretch" : "";
  element.style.minWidth = !isRoot && mainDimension === "width" && widthMode === "fill" ? "0" : "";
  element.style.minHeight = !isRoot && mainDimension === "height" && heightMode === "fill" ? "0" : "";
}

function applyAllLayerSizing() {
  frameRecords.forEach((record) => applyLayerSizing("frame", record));
  textRecords.forEach((record) => applyLayerSizing("text", record));
  requestAnimationFrame(syncResizeOverlay);
}

function getFrameChildren(parentId) {
  return frameRecords.filter((record) => record.parentId === parentId);
}

function getTextChildren(parentFrameId) {
  return textRecords.filter((record) => record.parentFrameId === parentFrameId);
}

function getLayerChildren(parentFrameId) {
  return [
    ...getFrameChildren(parentFrameId).map((record) => ({ type: "frame", record })),
    ...getTextChildren(parentFrameId).map((record) => ({ type: "text", record })),
  ].sort((a, b) => a.record.order - b.record.order);
}

function captureWorkspaceState() {
  return {
    frames: frameRecords.map((record) => ({
      record,
      parentId: record.parentId,
      order: record.order,
      dataset: { ...record.element.dataset },
      style: record.element.getAttribute("style"),
    })),
    texts: textRecords.map((record) => ({
      record,
      parentFrameId: record.parentFrameId,
      order: record.order,
      isNew: record.isNew,
      dataset: { ...record.element.dataset },
      style: record.element.getAttribute("style"),
      textContent: record.element.textContent ?? "",
      contentEditable: record.element.contentEditable,
    })),
    selectedCanvasFrame,
    selectedCanvasText,
    expandedFrameIds: [...expandedFrameIds],
    nextFrameId,
    nextTextId,
    nextLayerOrder,
    canvasColor: canvasColorValue,
    activeTool,
  };
}

function restoreElementState(element, dataset, style) {
  Object.keys(element.dataset).forEach((key) => delete element.dataset[key]);
  Object.entries(dataset).forEach(([key, value]) => {
    element.dataset[key] = value;
  });
  if (style === null) element.removeAttribute("style");
  else element.setAttribute("style", style);
}

function attachRestoredLayers(parentFrameId, parentElement) {
  getLayerChildren(parentFrameId).forEach((layer) => {
    if (parentElement === canvas) canvas.insertBefore(layer.record.element, toolbar);
    else parentElement.append(layer.record.element);
    if (layer.type === "frame") attachRestoredLayers(layer.record.id, layer.record.element);
  });
}

function restoreWorkspaceState(snapshot) {
  if (!(canvas instanceof HTMLElement)) return;
  isRestoringHistory = true;

  const allElements = new Set([
    ...frameRecords.map((record) => record.element),
    ...textRecords.map((record) => record.element),
    ...snapshot.frames.map((entry) => entry.record.element),
    ...snapshot.texts.map((entry) => entry.record.element),
  ]);
  allElements.forEach((element) => element.remove());

  frameRecords = snapshot.frames.map((entry) => {
    entry.record.parentId = entry.parentId;
    entry.record.order = entry.order;
    restoreElementState(entry.record.element, entry.dataset, entry.style);
    return entry.record;
  });
  textRecords = snapshot.texts.map((entry) => {
    entry.record.parentFrameId = entry.parentFrameId;
    entry.record.order = entry.order;
    entry.record.isNew = entry.isNew;
    restoreElementState(entry.record.element, entry.dataset, entry.style);
    entry.record.element.textContent = entry.textContent;
    entry.record.element.contentEditable = entry.contentEditable;
    return entry.record;
  });

  nextFrameId = snapshot.nextFrameId;
  nextTextId = snapshot.nextTextId;
  nextLayerOrder = snapshot.nextLayerOrder;
  expandedFrameIds.clear();
  snapshot.expandedFrameIds.forEach((frameId) => expandedFrameIds.add(frameId));
  selectedCanvasFrame = snapshot.selectedCanvasFrame;
  selectedCanvasText = snapshot.selectedCanvasText;

  attachRestoredLayers(null, canvas);
  clearElementSelection();
  if (selectedCanvasFrame) {
    selectedCanvasFrame.classList.add("is-selected");
    selectedCanvasFrame.setAttribute("aria-selected", "true");
  }
  if (selectedCanvasText) {
    selectedCanvasText.classList.add("is-selected");
    selectedCanvasText.setAttribute("aria-selected", "true");
  }
  canvas.style.backgroundColor = snapshot.canvasColor;
  canvasColorValue = snapshot.canvasColor;
  if (colorPicker instanceof HTMLInputElement) colorPicker.value = snapshot.canvasColor;
  selectTool(snapshot.activeTool);
  isRestoringHistory = false;
  renderTree();
}

function recordHistory() {
  if (isRestoringHistory || isBatchingHistory) return;
  undoHistory.push(captureWorkspaceState());
  if (undoHistory.length > HISTORY_LIMIT) undoHistory.shift();
  redoHistory.length = 0;
}

function undoWorkspaceChange() {
  const snapshot = undoHistory.pop();
  if (!snapshot) return;
  redoHistory.push(captureWorkspaceState());
  restoreWorkspaceState(snapshot);
}

function redoWorkspaceChange() {
  const snapshot = redoHistory.pop();
  if (!snapshot) return;
  undoHistory.push(captureWorkspaceState());
  restoreWorkspaceState(snapshot);
}

function clearElementSelection() {
  frameRecords.forEach((record) => {
    record.element.classList.remove("is-selected");
    record.element.setAttribute("aria-selected", "false");
  });
  textRecords.forEach((record) => {
    record.element.classList.remove("is-selected");
    record.element.setAttribute("aria-selected", "false");
  });
}

function selectCanvasFrame(frameElement) {
  clearElementSelection();
  frameElement.classList.add("is-selected");
  frameElement.setAttribute("aria-selected", "true");
  selectedCanvasFrame = frameElement;
  selectedCanvasText = null;
  renderTree();
}

function expandFramePath(parentFrameId) {
  const visitedFrameIds = new Set();
  let frameId = parentFrameId;

  while (frameId !== null && !visitedFrameIds.has(frameId)) {
    visitedFrameIds.add(frameId);
    expandedFrameIds.add(frameId);
    frameId = getFrameRecord(frameId)?.parentId ?? null;
  }
}

function selectCanvasText(textElement) {
  const record = textRecords.find((textRecord) => textRecord.element === textElement);
  if (record) expandFramePath(record.parentFrameId);
  clearElementSelection();
  textElement.classList.add("is-selected");
  textElement.setAttribute("aria-selected", "true");
  selectedCanvasText = textElement;
  selectedCanvasFrame = null;
  renderTree();
}

function getSelectedTextRecord() {
  return selectedCanvasText
    ? textRecords.find((record) => record.element === selectedCanvasText)
    : undefined;
}

function getSelectedFrameRecord() {
  return selectedCanvasFrame
    ? frameRecords.find((record) => record.element === selectedCanvasFrame)
    : undefined;
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
  if (sizeSelect instanceof HTMLSelectElement) sizeSelect.value = element.dataset.fontSize || "14";
  if (lineHeightInput instanceof HTMLInputElement) lineHeightInput.value = element.dataset.lineHeight || "Auto";
  if (letterSpacingInput instanceof HTMLInputElement) letterSpacingInput.value = element.dataset.letterSpacing || "0%";
  if (textColorPicker instanceof HTMLInputElement) textColorPicker.value = element.dataset.textColor || "#ffffff";
  syncSelectedTextSizeInputs();
}

function syncInspectorToSelectedFrame() {
  const record = getSelectedFrameRecord();
  if (!record) return;
  const { element } = record;

  if (frameDirectionSelect instanceof HTMLSelectElement) {
    frameDirectionSelect.value = element.dataset.direction || "horizontal";
  }
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

  if (frameRadiusInput instanceof HTMLInputElement) {
    frameRadiusInput.value = element.dataset.radius || "0";
  }
  if (frameColorPicker instanceof HTMLInputElement) {
    const color = element.dataset.frameColor || "";
    frameColorPicker.value = color || "#000000";
    frameColorPicker.classList.toggle("is-transparent", color.length === 0);
  }
  if (frameHtmlTagInput instanceof HTMLSelectElement) {
    frameHtmlTagInput.value = normalizeFrameHtmlTag(element.dataset.htmlTag || "div");
  }
}

function clearLayerSelection() {
  if (!selectedCanvasFrame && !selectedCanvasText) return;
  clearElementSelection();
  selectedCanvasFrame = null;
  selectedCanvasText = null;
  renderTree();
}

function removeCanvasText(textElement, suppressCreationForCurrentClick = false) {
  const textRecord = textRecords.find((record) => record.element === textElement);
  textElement.remove();
  if (textRecord) {
    textRecords = textRecords.filter((record) => record.id !== textRecord.id);
  }
  if (selectedCanvasText === textElement) selectedCanvasText = null;

  if (suppressCreationForCurrentClick) {
    suppressNextTextCreation = true;
    setTimeout(() => {
      suppressNextTextCreation = false;
    }, 0);
  }

  renderTree();
}

function createIconCell(content) {
  const cell = document.createElement("span");
  cell.className = "icon-cell";
  if (content) cell.append(content);
  return cell;
}

function createSquareIcon() {
  const square = document.createElement("span");
  square.className = "square-icon square-icon--small";
  square.setAttribute("aria-hidden", "true");
  return square;
}

function updateInspector() {
  const isTextSelected = selectedCanvasText !== null;
  const isFrameSelected = selectedCanvasFrame !== null;
  if (pageInspector instanceof HTMLElement) pageInspector.hidden = isTextSelected || isFrameSelected;
  if (frameInspector instanceof HTMLElement) frameInspector.hidden = !isFrameSelected;
  if (textInspector instanceof HTMLElement) textInspector.hidden = !isTextSelected;
  if (isTextSelected) syncInspectorToSelectedText();
  if (isFrameSelected) syncInspectorToSelectedFrame();
  requestAnimationFrame(syncResizeOverlay);
}

function setLayerDragData(event, layerType, layerId) {
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", `${layerType}:${layerId}`);
}

function getLayerDragData(event) {
  const [type, rawId] = event.dataTransfer.getData("text/plain").split(":");
  const id = Number(rawId);
  if ((type !== "frame" && type !== "text") || !Number.isInteger(id)) return null;
  return { type, id };
}

function renderFrameTreeNode(record, depth) {
  const childLayers = getLayerChildren(record.id);
  const isBranch = childLayers.length > 0;
  const isExpanded = expandedFrameIds.has(record.id);
  const item = document.createElement("div");
  const node = document.createElement("div");
  const iconGroup = document.createElement("span");
  const label = document.createElement("span");

  item.className = "dynamic-tree-item";
  node.className = "tree-node tree-node--dynamic";
  node.draggable = true;
  node.setAttribute("role", "treeitem");
  node.setAttribute("tabindex", "0");
  node.setAttribute("aria-level", String(depth));
  node.setAttribute("aria-selected", String(record.element === selectedCanvasFrame));
  node.style.setProperty("--tree-indent", `${8 + (depth - 1) * 40}px`);
  if (record.element === selectedCanvasFrame) node.classList.add("is-selected");
  if (isBranch) node.setAttribute("aria-expanded", String(isExpanded));

  node.addEventListener("click", () => selectCanvasFrame(record.element));
  node.addEventListener("keydown", (event) => {
    if (event.target === node && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      selectCanvasFrame(record.element);
    }
  });
  node.addEventListener("dragstart", (event) => {
    event.stopPropagation();
    setLayerDragData(event, "frame", record.id);
  });
  node.addEventListener("dragend", clearTreeDropIndicators);
  node.addEventListener("dragover", (event) => {
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "move";
    showTreeDropIndicator(node, getTreeDropPosition(event, true));
  });
  node.addEventListener("drop", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const draggedLayer = getLayerDragData(event);
    const position = getTreeDropPosition(event, true);
    clearTreeDropIndicators();
    if (draggedLayer) moveLayerRelative(draggedLayer, { type: "frame", id: record.id }, position);
  });

  iconGroup.className = "branch-icon-group";
  if (isBranch) {
    const branchToggle = document.createElement("button");
    const chevron = document.createElement("span");

    branchToggle.className = "icon-cell branch-toggle";
    branchToggle.type = "button";
    branchToggle.setAttribute("aria-label", `${isExpanded ? "Collapse" : "Expand"} Frame ${record.id}`);
    branchToggle.setAttribute("aria-expanded", String(isExpanded));
    chevron.className = `chevron ${isExpanded ? "chevron--down" : "chevron--right"}`;
    chevron.setAttribute("aria-hidden", "true");
    branchToggle.append(chevron);
    branchToggle.addEventListener("click", (event) => {
      event.stopPropagation();
      if (expandedFrameIds.has(record.id)) expandedFrameIds.delete(record.id);
      else expandedFrameIds.add(record.id);
      renderTree();
    });
    iconGroup.append(branchToggle);
  }

  iconGroup.append(createIconCell(createSquareIcon()));
  label.className = "tree-node-label";
  label.textContent = `Frame ${record.id}`;
  node.append(iconGroup, label);
  item.append(node);

  if (isBranch && isExpanded) {
    childLayers.forEach((layer) => item.append(renderLayerTreeNode(layer, depth + 1)));
  }

  return item;
}

function renderTextTreeNode(record, depth) {
  const item = document.createElement("div");
  const node = document.createElement("div");
  const iconGroup = document.createElement("span");
  const textIcon = document.createElement("span");
  const label = document.createElement("span");

  item.className = "dynamic-tree-item";
  node.className = "tree-node tree-node--dynamic";
  node.draggable = true;
  node.setAttribute("role", "treeitem");
  node.setAttribute("tabindex", "0");
  node.setAttribute("aria-level", String(depth));
  node.setAttribute("aria-selected", String(record.element === selectedCanvasText));
  node.style.setProperty("--tree-indent", `${8 + (depth - 1) * 40}px`);
  if (record.element === selectedCanvasText) node.classList.add("is-selected");

  node.addEventListener("click", () => selectCanvasText(record.element));
  node.addEventListener("keydown", (event) => {
    if (event.target === node && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      selectCanvasText(record.element);
    }
  });
  node.addEventListener("dragstart", (event) => {
    event.stopPropagation();
    setLayerDragData(event, "text", record.id);
  });
  node.addEventListener("dragend", clearTreeDropIndicators);
  node.addEventListener("dragover", (event) => {
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "move";
    showTreeDropIndicator(node, getTreeDropPosition(event, false));
  });
  node.addEventListener("drop", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const draggedLayer = getLayerDragData(event);
    const position = getTreeDropPosition(event, false);
    clearTreeDropIndicators();
    if (draggedLayer) moveLayerRelative(draggedLayer, { type: "text", id: record.id }, position);
  });

  iconGroup.className = "branch-icon-group";
  textIcon.className = "text-layer-icon";
  textIcon.textContent = "T";
  textIcon.setAttribute("aria-hidden", "true");
  iconGroup.append(textIcon);
  label.className = "tree-node-label";
  label.textContent = (record.element.textContent ?? "").length > 0
    ? record.element.textContent
    : "Text";
  node.append(iconGroup, label);
  item.append(node);
  return item;
}

function renderLayerTreeNode(layer, depth) {
  return layer.type === "frame"
    ? renderFrameTreeNode(layer.record, depth)
    : renderTextTreeNode(layer.record, depth);
}

function renderTree() {
  if (!treeView) return;
  const rootNodes = getLayerChildren(null).map((layer) => renderLayerTreeNode(layer, 1));
  treeView.replaceChildren(...rootNodes);
  updateInspector();
}

function canNestFrame(draggedFrameId, parentFrameId) {
  if (draggedFrameId === parentFrameId) return false;
  let ancestor = getFrameRecord(parentFrameId);

  while (ancestor) {
    if (ancestor.id === draggedFrameId) return false;
    ancestor = ancestor.parentId === null ? undefined : getFrameRecord(ancestor.parentId);
  }

  return true;
}

function getLayerParentId(layer) {
  if (layer.type === "frame") return getFrameRecord(layer.id)?.parentId ?? null;
  return getTextRecord(layer.id)?.parentFrameId ?? null;
}

function getLayerRecord(layer) {
  return layer.type === "frame" ? getFrameRecord(layer.id) : getTextRecord(layer.id);
}

function normalizeSiblingOrder(parentFrameId) {
  getLayerChildren(parentFrameId).forEach((layer, index) => {
    layer.record.order = index + 1;
  });
  nextLayerOrder = Math.max(
    1,
    ...frameRecords.map((record) => record.order + 1),
    ...textRecords.map((record) => record.order + 1),
  );
}

function syncLayerDomOrder(parentFrameId) {
  const parentElement = parentFrameId === null ? canvas : getFrameRecord(parentFrameId)?.element;
  if (!(parentElement instanceof HTMLElement)) return;
  getLayerChildren(parentFrameId).forEach((layer) => {
    if (parentFrameId === null) canvas.insertBefore(layer.record.element, toolbar);
    else parentElement.append(layer.record.element);
  });
}

function moveLayer(layer, parentFrameId, targetIndex, rootPosition) {
  const record = getLayerRecord(layer);
  if (!record) return false;
  if (layer.type === "frame" && parentFrameId !== null && !canNestFrame(layer.id, parentFrameId)) return false;

  const previousParentId = getLayerParentId(layer);
  const previousSiblings = getLayerChildren(previousParentId);
  const previousIndex = previousSiblings.findIndex((sibling) => sibling.type === layer.type && sibling.record.id === layer.id);
  const nextSiblings = getLayerChildren(parentFrameId).filter(
    (sibling) => sibling.type !== layer.type || sibling.record.id !== layer.id,
  );
  const insertionIndex = Math.max(0, Math.min(targetIndex ?? nextSiblings.length, nextSiblings.length));
  if (previousParentId === parentFrameId && previousIndex === insertionIndex) return false;

  recordHistory();
  const element = record.element;
  const canvasBounds = canvas instanceof HTMLElement ? canvas.getBoundingClientRect() : null;
  const elementBounds = element.getBoundingClientRect();

  if (layer.type === "frame") record.parentId = parentFrameId;
  else record.parentFrameId = parentFrameId;

  if (parentFrameId === null) {
    const left = rootPosition?.x ?? (canvasBounds ? elementBounds.left - canvasBounds.left : 0);
    const top = rootPosition?.y ?? (canvasBounds ? elementBounds.top - canvasBounds.top : 0);
    element.style.left = `${Math.max(0, left)}px`;
    element.style.top = `${Math.max(0, top)}px`;
  } else {
    element.style.left = "";
    element.style.top = "";
    expandedFrameIds.add(parentFrameId);
  }

  nextSiblings.splice(insertionIndex, 0, { type: layer.type, record });
  nextSiblings.forEach((sibling, index) => {
    sibling.record.order = index + 1;
  });
  normalizeSiblingOrder(previousParentId);
  normalizeSiblingOrder(parentFrameId);
  syncLayerDomOrder(previousParentId);
  if (parentFrameId !== previousParentId) syncLayerDomOrder(parentFrameId);
  applyAllLayerSizing();
  renderTree();
  return true;
}

function nestLayer(layer, parentFrameId) {
  return moveLayer(layer, parentFrameId, getLayerChildren(parentFrameId).length);
}

function moveLayerRelative(layer, targetLayer, position) {
  if (position === "inside" && targetLayer.type === "frame") {
    return nestLayer(layer, targetLayer.id);
  }

  const parentFrameId = getLayerParentId(targetLayer);
  const siblings = getLayerChildren(parentFrameId).filter(
    (sibling) => sibling.type !== layer.type || sibling.record.id !== layer.id,
  );
  const targetIndex = siblings.findIndex(
    (sibling) => sibling.type === targetLayer.type && sibling.record.id === targetLayer.id,
  );
  if (targetIndex < 0) return false;
  return moveLayer(layer, parentFrameId, targetIndex + (position === "after" ? 1 : 0));
}

function clearTreeDropIndicators() {
  document.querySelectorAll(".tree-node.is-drop-before, .tree-node.is-drop-after, .tree-node.is-drop-inside")
    .forEach((node) => node.classList.remove("is-drop-before", "is-drop-after", "is-drop-inside"));
  treeView?.classList.remove("is-drop-root");
}

function getTreeDropPosition(event, allowInside) {
  const bounds = event.currentTarget.getBoundingClientRect();
  const ratio = bounds.height === 0 ? 0.5 : (event.clientY - bounds.top) / bounds.height;
  if (allowInside && ratio >= 0.25 && ratio <= 0.75) return "inside";
  return ratio < 0.5 ? "before" : "after";
}

function showTreeDropIndicator(node, position) {
  clearTreeDropIndicators();
  node.classList.add(`is-drop-${position}`);
}

function startEditingText(textElement) {
  selectCanvasText(textElement);
  textElement.contentEditable = "true";
  textElement.focus();

  const selection = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(textElement);
  selection?.removeAllRanges();
  selection?.addRange(range);
}

function createCanvasText(parentRecord, x, y, options = {}) {
  if (!(canvas instanceof HTMLElement)) return;
  if (suppressNextTextCreation) {
    suppressNextTextCreation = false;
    return;
  }
  if (options.recordHistory !== false) recordHistory();

  const textId = nextTextId;
  nextTextId += 1;
  const text = document.createElement("div");
  const record = {
    id: textId,
    parentFrameId: parentRecord?.id ?? null,
    element: text,
    order: nextLayerOrder,
    isNew: true,
  };
  nextLayerOrder += 1;

  text.className = "canvas-text";
  text.dataset.textId = String(textId);
  text.contentEditable = "false";
  text.spellcheck = false;
  text.setAttribute("aria-label", `Text ${textId}`);
  text.setAttribute("aria-selected", "false");
  text.dataset.fontFamily = DEFAULT_FONT_FAMILY;
  text.dataset.fontWeight = String(DEFAULT_FONT_WEIGHT);
  text.dataset.fontSize = "14";
  text.dataset.lineHeight = "Auto";
  text.dataset.letterSpacing = "0%";
  text.dataset.textColor = "#ffffff";
  text.dataset.widthMode = "hug";
  text.dataset.heightMode = "hug";
  text.style.fontFamily = `${JSON.stringify(DEFAULT_FONT_FAMILY)}, sans-serif`;
  text.style.fontWeight = String(DEFAULT_FONT_WEIGHT);
  text.style.fontSize = "14px";
  text.style.lineHeight = "normal";
  text.style.letterSpacing = "0em";
  text.style.color = "#ffffff";

  if (parentRecord) {
    parentRecord.element.append(text);
  } else {
    text.style.left = `${x}px`;
    text.style.top = `${y}px`;
    canvas.insertBefore(text, toolbar);
  }

  text.addEventListener("click", (event) => {
    event.stopPropagation();
    if (activeTool === "text") startEditingText(text);
    else selectCanvasText(text);
  });
  text.addEventListener("dblclick", (event) => {
    event.stopPropagation();
    startEditingText(text);
  });
  text.addEventListener("input", () => {
    redoHistory.length = 0;
    renderTree();
  });
  text.addEventListener("blur", () => {
    if (isRestoringHistory) return;
    if (record.isNew && (text.textContent ?? "").length === 0) {
      selectTool("select");
      removeCanvasText(text, true);
      return;
    }

    const wasNewText = record.isNew;
    record.isNew = false;
    text.contentEditable = "false";
    if (wasNewText) {
      selectTool("select");
      suppressNextTextCreation = true;
      setTimeout(() => {
        suppressNextTextCreation = false;
      }, 0);
    }
  });
  text.addEventListener("dragstart", (event) => {
    event.preventDefault();
    event.stopPropagation();
  });

  textRecords.push(record);
  applyLayerSizing("text", record);
  renderTree();
  if (options.beginEditing !== false) startEditingText(text);
  return record;
}

function createCanvasFrame(x, y, parentRecord = null, options = {}) {
  if (!(canvas instanceof HTMLElement)) return;
  if (options.recordHistory !== false) recordHistory();

  const frameId = nextFrameId;
  nextFrameId += 1;
  const frame = document.createElement("div");
  const record = {
    id: frameId,
    parentId: parentRecord?.id ?? null,
    element: frame,
    order: nextLayerOrder,
  };
  nextLayerOrder += 1;

  frame.className = "canvas-frame";
  frame.draggable = true;
  frame.dataset.frameId = String(frameId);
  frame.setAttribute("aria-label", `Frame ${frameId}`);
  frame.setAttribute("aria-selected", "false");
  frame.dataset.paddingLeft = "10";
  frame.dataset.paddingTop = "10";
  frame.dataset.paddingRight = "10";
  frame.dataset.paddingBottom = "10";
  frame.dataset.width = "100";
  frame.dataset.height = "100";
  frame.dataset.widthMode = "fixed";
  frame.dataset.heightMode = "fixed";
  frame.dataset.radius = "0";
  frame.dataset.frameColor = "";
  frame.dataset.direction = "horizontal";
  frame.dataset.gap = "10";
  frame.dataset.gapMode = "fixed";
  frame.dataset.htmlTag = "div";
  frame.style.width = "100px";
  frame.style.height = "100px";
  if (parentRecord) {
    frame.style.left = "";
    frame.style.top = "";
  } else {
    frame.style.left = `${x}px`;
    frame.style.top = `${y}px`;
  }

  frame.addEventListener("click", (event) => {
    event.stopPropagation();
    if (event.target !== frame) return;

    if (activeTool === "text") {
      const frameBounds = frame.getBoundingClientRect();
      createCanvasText(record, event.clientX - frameBounds.left, event.clientY - frameBounds.top);
      return;
    }

    if (activeTool === "frame") {
      createCanvasFrame(0, 0, record);
      expandedFrameIds.add(record.id);
      selectTool("select");
      return;
    }

    selectCanvasFrame(frame);
  });
  frame.addEventListener("dragstart", (event) => {
    event.stopPropagation();
    setLayerDragData(event, "frame", frameId);
  });
  frame.addEventListener("dragover", (event) => {
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "move";
  });
  frame.addEventListener("drop", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const draggedLayer = getLayerDragData(event);
    if (draggedLayer) nestLayer(draggedLayer, frameId);
  });

  frameRecords.push(record);
  if (parentRecord) {
    parentRecord.element.append(frame);
    expandedFrameIds.add(parentRecord.id);
  } else {
    canvas.insertBefore(frame, toolbar);
  }
  applyLayerSizing("frame", record);
  renderTree();
  return record;
}

function copyElementDataset(source, target, excludedKeys) {
  Object.entries(source.dataset).forEach(([key, value]) => {
    if (!excludedKeys.includes(key)) target.dataset[key] = value;
  });
}

function duplicateTextRecord(sourceRecord, parentRecord, offsetRoot = false) {
  const source = sourceRecord.element;
  const x = Number.parseFloat(source.style.left || "0") + (offsetRoot ? 16 : 0);
  const y = Number.parseFloat(source.style.top || "0") + (offsetRoot ? 16 : 0);
  const duplicateRecord = createCanvasText(parentRecord, x, y, {
    beginEditing: false,
    recordHistory: false,
  });
  if (!duplicateRecord) return;

  const duplicate = duplicateRecord.element;
  copyElementDataset(source, duplicate, ["textId"]);
  duplicate.setAttribute("style", source.getAttribute("style") || "");
  duplicate.style.left = parentRecord ? "" : `${x}px`;
  duplicate.style.top = parentRecord ? "" : `${y}px`;
  duplicate.textContent = source.textContent ?? "";
  duplicate.contentEditable = "false";
  duplicateRecord.isNew = false;
  return duplicateRecord;
}

function duplicateFrameRecord(sourceRecord, parentRecord, offsetRoot = false) {
  const source = sourceRecord.element;
  const x = Number.parseFloat(source.style.left || "0") + (offsetRoot ? 16 : 0);
  const y = Number.parseFloat(source.style.top || "0") + (offsetRoot ? 16 : 0);
  const duplicateRecord = createCanvasFrame(x, y, parentRecord, { recordHistory: false });
  if (!duplicateRecord) return;

  const duplicate = duplicateRecord.element;
  copyElementDataset(source, duplicate, ["frameId"]);
  duplicate.setAttribute("style", source.getAttribute("style") || "");
  duplicate.style.left = parentRecord ? "" : `${x}px`;
  duplicate.style.top = parentRecord ? "" : `${y}px`;

  getLayerChildren(sourceRecord.id).forEach((childLayer) => {
    if (childLayer.type === "frame") duplicateFrameRecord(childLayer.record, duplicateRecord);
    else duplicateTextRecord(childLayer.record, duplicateRecord);
  });
  return duplicateRecord;
}

function duplicateSelectedLayer() {
  const selectedFrameRecord = getSelectedFrameRecord();
  const selectedTextRecord = getSelectedTextRecord();
  if (!selectedFrameRecord && !selectedTextRecord) return;

  recordHistory();
  isBatchingHistory = true;
  suppressNextTextCreation = false;
  try {
    if (selectedFrameRecord) {
      const parentRecord = selectedFrameRecord.parentId === null
        ? null
        : getFrameRecord(selectedFrameRecord.parentId);
      const duplicateRecord = duplicateFrameRecord(
        selectedFrameRecord,
        parentRecord,
        selectedFrameRecord.parentId === null,
      );
      if (!duplicateRecord) return;
      moveLayerRelative(
        { type: "frame", id: duplicateRecord.id },
        { type: "frame", id: selectedFrameRecord.id },
        "after",
      );
      selectCanvasFrame(duplicateRecord.element);
      return;
    }

    const parentRecord = selectedTextRecord.parentFrameId === null
      ? null
      : getFrameRecord(selectedTextRecord.parentFrameId);
    const duplicateRecord = duplicateTextRecord(
      selectedTextRecord,
      parentRecord,
      selectedTextRecord.parentFrameId === null,
    );
    if (!duplicateRecord) return;
    moveLayerRelative(
      { type: "text", id: duplicateRecord.id },
      { type: "text", id: selectedTextRecord.id },
      "after",
    );
    selectCanvasText(duplicateRecord.element);
  } finally {
    isBatchingHistory = false;
  }
}

function collectFrameAndDescendantIds(frameId) {
  const ids = new Set([frameId]);
  let foundChild = true;

  while (foundChild) {
    foundChild = false;
    frameRecords.forEach((record) => {
      if (record.parentId !== null && ids.has(record.parentId) && !ids.has(record.id)) {
        ids.add(record.id);
        foundChild = true;
      }
    });
  }

  return ids;
}

toolButtons.forEach((button) => {
  button.addEventListener("click", () => {
    selectTool(button.getAttribute("data-tool") || "select");
  });
});

treeView?.addEventListener("dragover", (event) => {
  if (event.target !== treeView) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = "move";
  clearTreeDropIndicators();
  treeView.classList.add("is-drop-root");
});

treeView?.addEventListener("drop", (event) => {
  if (event.target !== treeView) return;
  event.preventDefault();
  const draggedLayer = getLayerDragData(event);
  clearTreeDropIndicators();
  if (draggedLayer) moveLayer(draggedLayer, null, getLayerChildren(null).length);
});

canvas?.addEventListener("dragover", (event) => {
  if (event.target !== canvas) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = "move";
});

canvas?.addEventListener("drop", (event) => {
  if (!(canvas instanceof HTMLElement) || event.target !== canvas) return;
  event.preventDefault();
  const draggedLayer = getLayerDragData(event);
  if (!draggedLayer) return;
  const bounds = canvas.getBoundingClientRect();
  moveLayer(
    draggedLayer,
    null,
    getLayerChildren(null).length,
    { x: event.clientX - bounds.left, y: event.clientY - bounds.top },
  );
});

canvas?.addEventListener("click", (event) => {
  if (!(canvas instanceof HTMLElement) || event.target !== canvas) return;

  clearLayerSelection();
  const canvasBounds = canvas.getBoundingClientRect();
  const x = event.clientX - canvasBounds.left;
  const y = event.clientY - canvasBounds.top;

  if (activeTool === "text") {
    createCanvasText(null, x, y);
    return;
  }

  if (activeTool !== "frame") return;
  createCanvasFrame(x, y);
  selectTool("select");
});

document.addEventListener("keydown", (event) => {
  const shortcutTarget = event.target;
  const isContentEditing = shortcutTarget instanceof HTMLElement && shortcutTarget.isContentEditable;
  const isFormEditing =
    shortcutTarget instanceof HTMLInputElement ||
    shortcutTarget instanceof HTMLTextAreaElement ||
    shortcutTarget instanceof HTMLSelectElement;
  const isCommandShortcut = event.ctrlKey || event.metaKey;

  if (isCommandShortcut && event.key.toLowerCase() === "z" && !isContentEditing) {
    event.preventDefault();
    if (event.shiftKey) redoWorkspaceChange();
    else undoWorkspaceChange();
    return;
  }

  if (isCommandShortcut && event.key.toLowerCase() === "d" && !isContentEditing && !isFormEditing) {
    event.preventDefault();
    duplicateSelectedLayer();
    return;
  }

  if (event.key === "Escape") {
    selectTool("select");
    const activeText = document.activeElement instanceof HTMLElement && document.activeElement.classList.contains("canvas-text")
      ? document.activeElement
      : null;
    activeText?.blur();
    return;
  }

  const isTyping =
    shortcutTarget instanceof HTMLInputElement ||
    shortcutTarget instanceof HTMLTextAreaElement ||
    shortcutTarget instanceof HTMLSelectElement ||
    (shortcutTarget instanceof HTMLElement && shortcutTarget.isContentEditable);
  const toolShortcut = {
    v: "select",
    t: "text",
    f: "frame",
  }[event.key.toLowerCase()];

  if (!isTyping && toolShortcut && !event.ctrlKey && !event.metaKey && !event.altKey) {
    event.preventDefault();
    selectTool(toolShortcut);
    return;
  }

  if (event.key !== "Delete" && event.key !== "Backspace") return;

  const target = event.target;
  if (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  ) return;

  if (selectedCanvasText) {
    event.preventDefault();
    recordHistory();
    removeCanvasText(selectedCanvasText);
    return;
  }

  if (!selectedCanvasFrame) return;

  event.preventDefault();
  const selectedRecord = frameRecords.find((record) => record.element === selectedCanvasFrame);
  if (!selectedRecord) return;

  recordHistory();
  const idsToDelete = collectFrameAndDescendantIds(selectedRecord.id);
  selectedCanvasFrame.remove();
  frameRecords = frameRecords.filter((record) => !idsToDelete.has(record.id));
  textRecords = textRecords.filter(
    (record) => record.parentFrameId === null || !idsToDelete.has(record.parentFrameId),
  );
  idsToDelete.forEach((frameId) => expandedFrameIds.delete(frameId));
  selectedCanvasFrame = null;
  renderTree();
});

colorPicker?.addEventListener("input", () => {
  if (canvas && colorPicker instanceof HTMLInputElement) {
    if (canvasColorValue !== colorPicker.value) recordHistory();
    canvasColorValue = colorPicker.value;
    canvas.style.backgroundColor = colorPicker.value;
  }
});

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

sizeSelect?.addEventListener("change", () => {
  const record = getSelectedTextRecord();
  if (!record || !(sizeSelect instanceof HTMLSelectElement)) return;
  if ((record.element.dataset.fontSize || "14") !== sizeSelect.value) recordHistory();
  record.element.dataset.fontSize = sizeSelect.value;
  record.element.style.fontSize = `${sizeSelect.value}px`;
  requestAnimationFrame(syncSelectedTextSizeInputs);
});

function applyLineHeightValue() {
  const record = getSelectedTextRecord();
  if (!record || !(lineHeightInput instanceof HTMLInputElement)) return false;
  const value = lineHeightInput.value.trim();
  if (/^auto$/i.test(value)) {
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

function applyLetterSpacingValue() {
  const record = getSelectedTextRecord();
  if (!record || !(letterSpacingInput instanceof HTMLInputElement)) return false;
  const match = letterSpacingInput.value.trim().match(/^(-?\d+(?:\.\d+)?)(%|px)$/i);
  if (!match) return false;
  const value = `${Number(match[1])}${match[2].toLowerCase()}`;
  if ((record.element.dataset.letterSpacing || "0%") !== value) recordHistory();
  letterSpacingInput.value = value;
  record.element.dataset.letterSpacing = value;
  record.element.style.letterSpacing = match[2].toLowerCase() === "%"
    ? `${Number(match[1]) / 100}em`
    : value;
  requestAnimationFrame(syncSelectedTextSizeInputs);
  return true;
}

letterSpacingInput?.addEventListener("input", applyLetterSpacingValue);
letterSpacingInput?.addEventListener("blur", () => {
  if (!applyLetterSpacingValue()) syncInspectorToSelectedText();
});
letterSpacingInput?.addEventListener("keydown", (event) => {
  if (!(letterSpacingInput instanceof HTMLInputElement) || !["ArrowUp", "ArrowDown"].includes(event.key)) return;
  const match = letterSpacingInput.value.trim().match(/^(-?\d+(?:\.\d+)?)(%|px)$/i);
  if (!match) return;
  event.preventDefault();
  const direction = event.key === "ArrowUp" ? 1 : -1;
  letterSpacingInput.value = `${Number(match[1]) + direction}${match[2].toLowerCase()}`;
  applyLetterSpacingValue();
});

textColorPicker?.addEventListener("input", () => {
  const record = getSelectedTextRecord();
  if (!record || !(textColorPicker instanceof HTMLInputElement)) return;
  if ((record.element.dataset.textColor || "#ffffff") !== textColorPicker.value) recordHistory();
  record.element.dataset.textColor = textColorPicker.value;
  record.element.style.color = textColorPicker.value;
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
    input.focus();
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
  });
  input.addEventListener("blur", syncInspectorToSelectedFrame);
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

frameColorPicker?.addEventListener("input", () => {
  const record = getSelectedFrameRecord();
  if (!record || !(frameColorPicker instanceof HTMLInputElement)) return;
  if ((record.element.dataset.frameColor || "") !== frameColorPicker.value) recordHistory();
  record.element.dataset.frameColor = frameColorPicker.value;
  record.element.style.backgroundColor = frameColorPicker.value;
  frameColorPicker.classList.remove("is-transparent");
});

frameDirectionSelect?.addEventListener("change", () => {
  const record = getSelectedFrameRecord();
  if (!record || !(frameDirectionSelect instanceof HTMLSelectElement)) return;
  const direction = frameDirectionSelect.value === "vertical" ? "vertical" : "horizontal";
  if ((record.element.dataset.direction || "horizontal") !== direction) recordHistory();
  record.element.dataset.direction = direction;
  record.element.style.flexDirection = direction === "vertical" ? "column" : "row";
  applyAllLayerSizing();
});

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
    record.element.style.justifyContent = "space-between";
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
  record.element.style.justifyContent = "flex-start";
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
  frameGapInput.focus();
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
});

function toReactComponentName(value) {
  const name = value
    .trim()
    .replace(/[^a-zA-Z0-9]+(.)/g, (_, character) => character.toUpperCase())
    .replace(/^[a-z]/, (character) => character.toUpperCase())
    .replace(/[^a-zA-Z0-9_$]/g, "");
  if (!name) return "GeneratedComponent";
  return /^\d/.test(name) ? `Component${name}` : name;
}

function formatReactStyle(style) {
  const properties = Object.entries(style)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([property, value]) => `${property}: ${JSON.stringify(value)}`);
  return `{ ${properties.join(", ")} }`;
}

function isZeroCssValue(value) {
  return /^-?0(?:\.0+)?(?:px|em|rem|%)?$/i.test(String(value).trim());
}

function getExportSizingStyle(type, record) {
  const element = record.element;
  const { parentId, parentDirection } = getLayerSizingContext(type, record);
  const isRoot = parentId === null;
  const widthMode = getLayerDimensionMode(element, "width", type === "text" ? "hug" : "fixed");
  const heightMode = getLayerDimensionMode(element, "height", type === "text" ? "hug" : "fixed");
  const mainDimension = parentDirection === "vertical" ? "height" : "width";
  const mainMode = mainDimension === "width" ? widthMode : heightMode;
  const crossMode = mainDimension === "width" ? heightMode : widthMode;
  const dimensionValue = (dimension, mode, fallback) => {
    if (mode === "fixed") return `${element.dataset[dimension] || fallback}px`;
    if (mode === "hug") return "fit-content";
    return isRoot ? "100%" : "auto";
  };
  return {
    width: dimensionValue("width", widthMode, type === "frame" ? "100" : "0"),
    height: dimensionValue("height", heightMode, type === "frame" ? "100" : "0"),
    flex: isRoot ? undefined : mainMode === "fill" ? "1 1 0" : "0 0 auto",
    alignSelf: !isRoot && crossMode === "fill" ? "stretch" : undefined,
    minWidth: !isRoot && mainDimension === "width" && widthMode === "fill" ? 0 : undefined,
    minHeight: !isRoot && mainDimension === "height" && heightMode === "fill" ? 0 : undefined,
  };
}

function getExportFrameStyle(record) {
  const element = record.element;
  const isAutoGap = element.dataset.gapMode === "auto";
  const direction = element.dataset.direction || "horizontal";
  const gap = element.dataset.gap || "10";
  const radius = element.dataset.radius || "0";
  return {
    display: "flex",
    flexDirection: direction === "vertical" ? "column" : undefined,
    alignItems: "flex-start",
    ...getExportSizingStyle("frame", record),
    paddingLeft: `${element.dataset.paddingLeft || "10"}px`,
    paddingTop: `${element.dataset.paddingTop || "10"}px`,
    paddingRight: `${element.dataset.paddingRight || "10"}px`,
    paddingBottom: `${element.dataset.paddingBottom || "10"}px`,
    gap: isAutoGap || isZeroCssValue(`${gap}px`) ? undefined : `${gap}px`,
    justifyContent: isAutoGap ? "space-between" : undefined,
    border: "0",
    borderRadius: isZeroCssValue(`${radius}px`) ? undefined : `${radius}px`,
    backgroundColor: element.dataset.frameColor || "transparent",
    boxSizing: "border-box",
  };
}

function getExportTextStyle(record) {
  const element = record.element;
  const lineHeight = element.dataset.lineHeight || "Auto";
  const letterSpacing = element.style.letterSpacing || "0em";
  const widthMode = getLayerDimensionMode(element, "width", "hug");
  return {
    ...getExportSizingStyle("text", record),
    color: element.dataset.textColor || "#ffffff",
    fontFamily: element.style.fontFamily || '"Inter", sans-serif',
    fontSize: `${element.dataset.fontSize || "14"}px`,
    fontWeight: Number(element.dataset.fontWeight || DEFAULT_FONT_WEIGHT),
    lineHeight: lineHeight.toLowerCase() === "auto" ? undefined : `${lineHeight}px`,
    letterSpacing: isZeroCssValue(letterSpacing) ? undefined : letterSpacing,
    whiteSpace: "pre-wrap",
    overflowWrap: widthMode === "hug" ? undefined : "anywhere",
  };
}

function renderExportLayer(layer, depth) {
  const indent = "  ".repeat(depth);
  if (layer.type === "text") {
    const value = layer.record.element.textContent || "";
    return `${indent}<span style={${formatReactStyle(getExportTextStyle(layer.record))}}>{${JSON.stringify(value)}}</span>`;
  }

  const children = getLayerChildren(layer.record.id);
  const style = formatReactStyle(getExportFrameStyle(layer.record));
  const htmlTag = normalizeFrameHtmlTag(layer.record.element.dataset.htmlTag || "div");
  const attributes = htmlTag === "button" ? ' type="button"' : "";
  if (children.length === 0) return `${indent}<${htmlTag}${attributes} style={${style}} />`;
  const childMarkup = children.map((child) => renderExportLayer(child, depth + 1)).join("\n");
  return `${indent}<${htmlTag}${attributes} style={${style}}>\n${childMarkup}\n${indent}</${htmlTag}>`;
}

function createReactComponentSource(componentName) {
  const rootLayers = getLayerChildren(null);
  const componentMarkup = rootLayers.length === 0
    ? "    <></>"
    : rootLayers.length === 1
      ? renderExportLayer(rootLayers[0], 2)
      : `    <>\n${rootLayers.map((layer) => renderExportLayer(layer, 3)).join("\n")}\n    </>`;

  return `import React from "react";\n\nexport default function ${componentName}() {\n  return (\n${componentMarkup}\n  );\n}\n`;
}

function createStorySource(componentName) {
  return `import ${componentName} from "./${componentName}";\n\nconst meta = {\n  title: "Components/${componentName}",\n  component: ${componentName},\n};\n\nexport default meta;\n\nexport const Default = {};\n`;
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
  const componentItems = Array.from(document.querySelectorAll(".contained-list-item"));
  componentItems.forEach((item) => {
    const componentName = toReactComponentName(item.textContent || "Generated Component");
    downloadExportFile(`${componentName}.jsx`, createReactComponentSource(componentName));
    downloadExportFile(`${componentName}.stories.jsx`, createStorySource(componentName));
  });
}

exportComponentsButton?.addEventListener("click", exportAllComponents);

loadGoogleFont(DEFAULT_FONT_FAMILY, DEFAULT_FONT_WEIGHT);
loadGoogleFont(DEFAULT_FONT_FAMILY, 600);
loadFontCatalog();
renderTree();
