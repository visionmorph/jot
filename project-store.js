/* Shared document state, hierarchy operations, selection, and undo/redo history. */

const canvas = document.querySelector("#canvas");

const toolbar = document.querySelector(".toolbar");

const canvasRootStack = document.querySelector("[data-canvas-root-stack]");

const treeView = document.querySelector("[data-tree-view]");

const pageInspector = document.querySelector("[data-page-inspector]");

const frameInspector = document.querySelector("[data-frame-inspector]");

const textInspector = document.querySelector("[data-text-inspector]");

const vectorInspector = document.querySelector("[data-vector-inspector]");

const colorPicker = document.querySelector("#canvas-color-picker");

const toolButtons = Array.from(document.querySelectorAll("[data-tool]"));

const fontSelect = document.querySelector("#text-font");

const weightSelect = document.querySelector("#text-weight");

const sizeSelect = document.querySelector("#text-size");

const lineHeightInput = document.querySelector("#text-line-height");

const letterSpacingInput = document.querySelector("#text-letter-spacing");

const textColorPicker = document.querySelector("#text-color-picker");

const vectorColorPicker = document.querySelector("#vector-color-picker");

const colorControls = Array.from(document.querySelectorAll("[data-color-control]"));

const leftSidebar = document.querySelector(".left-sidebar");

const componentsPanel = document.querySelector(".components-panel");

const sidebarDivider = document.querySelector(".sidebar-divider");

const frameSizeInputs = Array.from(document.querySelectorAll("[data-frame-size]"));

const textLayerSizeInputs = Array.from(document.querySelectorAll("[data-text-layer-size]"));

const vectorSizeInputs = Array.from(document.querySelectorAll("[data-vector-size]"));

const sizeModeComboboxes = Array.from(document.querySelectorAll("[data-size-combobox]"));

const framePaddingInputs = Array.from(document.querySelectorAll("[data-frame-padding]"));

const frameRadiusInput = document.querySelector("#frame-radius");

const frameColorPicker = document.querySelector("#frame-color-picker");

const frameDirectionOptions = Array.from(document.querySelectorAll("[data-frame-direction]"));

const frameAlignmentOptions = Array.from(document.querySelectorAll("[data-frame-alignment]"));

const frameAlignmentGrid = document.querySelector("[data-frame-alignment-grid]");

const textAlignmentOptions = Array.from(document.querySelectorAll("[data-text-alignment]"));

const frameOutlineColorPicker = document.querySelector("#frame-outline-color-picker");

const frameOutlinePositionSelect = document.querySelector("#frame-outline-position");

const frameOutlineWeightInput = document.querySelector("#frame-outline-weight");

const frameGapInput = document.querySelector("#frame-gap");

const frameGapCombobox = document.querySelector("[data-gap-combobox]");

const frameGapToggle = document.querySelector("[data-gap-toggle]");

const frameGapMenu = document.querySelector("[data-gap-menu]");

const frameGapAutoOption = document.querySelector("[data-gap-option='auto']");

const frameHtmlTagInput = document.querySelector("#frame-html-tag");

const exportComponentsButton = document.querySelector("[data-export-components]");

const addPropButton = document.querySelector("[data-add-prop]");

const propRowsContainer = document.querySelector("[data-prop-rows]");

const vectorImportButton = document.querySelector("[data-vector-import]");

const vectorFileInput = document.querySelector("[data-vector-file-input]");

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

let selectedCanvasVector = null;

const selectedLayerKeys = new Set();

let nextFrameId = 1;

let nextTextId = 1;

let nextVectorId = 1;

let nextLayerOrder = 1;

let frameRecords = [];

let textRecords = [];

let vectorRecords = [];

let componentProps = [];

let nextComponentPropId = 1;

let suppressNextTextCreation = false;

let suppressNextCanvasSurfaceClick = false;

const expandedFrameIds = new Set();

const undoHistory = [];

const redoHistory = [];

const HISTORY_LIMIT = 100;

let isRestoringHistory = false;

let isBatchingHistory = false;

let canvasColorValue = colorPicker instanceof HTMLInputElement ? colorPicker.value : "#121619";

let canvasColorOpacity = 100;

let resizeInteraction = null;

let observedResizeElement = null;

const resizeOverlay = document.createElement("div");

const selectedLayerResizeObserver = typeof ResizeObserver === "function"
  ? new ResizeObserver(() => requestAnimationFrame(positionResizeOverlay))
  : null;

function getFrameRecord(frameId) {
  return frameRecords.find((record) => record.id === frameId);
}

function getTextRecord(textId) {
  return textRecords.find((record) => record.id === textId);
}

function getVectorRecord(vectorId) {
  return vectorRecords.find((record) => record.id === vectorId);
}

function getLayerDimensionMode(element, dimension, fallback = "fixed") {
  const mode = element.dataset[`${dimension}Mode`];
  return mode === "fixed" || mode === "hug" || mode === "fill" ? mode : fallback;
}

function getLayerSizingContext(type, record) {
  const parentId = type === "frame" ? record.parentId : record.parentFrameId;
  const parentRecord = parentId === null ? null : getFrameRecord(parentId);
  const parentDirection = parentRecord?.element.dataset.direction === "vertical" ? "vertical" : "horizontal";
  return { parentId, parentDirection };
}

function getFrameChildren(parentId) {
  return frameRecords.filter((record) => record.parentId === parentId);
}

function getTextChildren(parentFrameId) {
  return textRecords.filter((record) => record.parentFrameId === parentFrameId);
}

function getVectorChildren(parentFrameId) {
  return vectorRecords.filter((record) => record.parentFrameId === parentFrameId);
}

function getLayerChildren(parentFrameId) {
  return [
    ...getFrameChildren(parentFrameId).map((record) => ({ type: "frame", record })),
    ...getTextChildren(parentFrameId).map((record) => ({ type: "text", record })),
    ...getVectorChildren(parentFrameId).map((record) => ({ type: "vector", record })),
  ].sort((a, b) => a.record.order - b.record.order);
}

function getLayerKey(type, id) {
  return `${type}:${id}`;
}

function getFrameSelectionKeys(frameId) {
  const keys = [getLayerKey("frame", frameId)];
  getLayerChildren(frameId).forEach((layer) => {
    if (layer.type === "frame") keys.push(...getFrameSelectionKeys(layer.record.id));
    else keys.push(getLayerKey(layer.type, layer.record.id));
  });
  return keys;
}

function getElementForLayerKey(key) {
  const [type, rawId] = key.split(":");
  const id = Number(rawId);
  if (type === "frame") return getFrameRecord(id)?.element ?? null;
  if (type === "text") return getTextRecord(id)?.element ?? null;
  if (type === "vector") return getVectorRecord(id)?.element ?? null;
  return null;
}

function isLayerSelected(type, id) {
  return selectedLayerKeys.has(getLayerKey(type, id));
}

function setPrimarySelectionFromKey(key) {
  const [type, rawId] = key?.split(":") ?? [];
  const id = Number(rawId);
  selectedCanvasFrame = type === "frame" ? getFrameRecord(id)?.element ?? null : null;
  selectedCanvasText = type === "text" ? getTextRecord(id)?.element ?? null : null;
  selectedCanvasVector = type === "vector" ? getVectorRecord(id)?.element ?? null : null;
}

function setPrimarySelectionToLatest() {
  const keys = [...selectedLayerKeys];
  setPrimarySelectionFromKey(keys[keys.length - 1]);
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
    vectors: vectorRecords.map((record) => ({
      record,
      parentFrameId: record.parentFrameId,
      order: record.order,
      name: record.name,
      svgSource: record.svgSource,
      originalSvgSource: record.originalSvgSource,
      dataset: { ...record.element.dataset },
      style: record.element.getAttribute("style"),
    })),
    selectedCanvasFrame,
    selectedCanvasText,
    selectedCanvasVector,
    selectedLayerKeys: [...selectedLayerKeys],
    expandedFrameIds: [...expandedFrameIds],
    nextFrameId,
    nextTextId,
    nextVectorId,
    nextLayerOrder,
    componentProps: componentProps.map((prop) => ({ ...prop })),
    nextComponentPropId,
    canvasColor: canvasColorValue,
    canvasColorOpacity,
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
    if (parentElement === canvas && layer.type === "frame" && canvasRootStack instanceof HTMLElement) {
      canvasRootStack.append(layer.record.element);
    } else if (parentElement === canvas) canvas.insertBefore(layer.record.element, toolbar);
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
    ...vectorRecords.map((record) => record.element),
    ...snapshot.frames.map((entry) => entry.record.element),
    ...snapshot.texts.map((entry) => entry.record.element),
    ...(snapshot.vectors ?? []).map((entry) => entry.record.element),
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
  vectorRecords = (snapshot.vectors ?? []).map((entry) => {
    entry.record.parentFrameId = entry.parentFrameId;
    entry.record.order = entry.order;
    entry.record.name = entry.name;
    entry.record.svgSource = entry.svgSource;
    entry.record.originalSvgSource = entry.originalSvgSource ?? entry.record.originalSvgSource ?? entry.svgSource;
    restoreElementState(entry.record.element, entry.dataset, entry.style);
    entry.record.element.replaceChildren(createCanvasSvg(entry.record.svgSource));
    return entry.record;
  });

  nextFrameId = snapshot.nextFrameId;
  nextTextId = snapshot.nextTextId;
  nextVectorId = snapshot.nextVectorId ?? 1;
  nextLayerOrder = snapshot.nextLayerOrder;
  componentProps = (snapshot.componentProps ?? []).map((prop) => ({ ...prop }));
  nextComponentPropId = snapshot.nextComponentPropId ?? 1;
  expandedFrameIds.clear();
  snapshot.expandedFrameIds.forEach((frameId) => expandedFrameIds.add(frameId));
  selectedCanvasFrame = snapshot.selectedCanvasFrame;
  selectedCanvasText = snapshot.selectedCanvasText;
  selectedCanvasVector = snapshot.selectedCanvasVector ?? null;
  selectedLayerKeys.clear();
  (snapshot.selectedLayerKeys ?? []).forEach((key) => selectedLayerKeys.add(key));
  if (selectedLayerKeys.size === 0) {
    if (selectedCanvasFrame) {
      const record = frameRecords.find((frameRecord) => frameRecord.element === selectedCanvasFrame);
      if (record) selectedLayerKeys.add(getLayerKey("frame", record.id));
    }
    if (selectedCanvasText) {
      const record = textRecords.find((textRecord) => textRecord.element === selectedCanvasText);
      if (record) selectedLayerKeys.add(getLayerKey("text", record.id));
    }
    if (selectedCanvasVector) {
      const record = vectorRecords.find((vectorRecord) => vectorRecord.element === selectedCanvasVector);
      if (record) selectedLayerKeys.add(getLayerKey("vector", record.id));
    }
  }

  attachRestoredLayers(null, canvas);
  syncElementSelectionStyles();
  canvasColorValue = snapshot.canvasColor ?? "#121619";
  canvasColorOpacity = Math.max(0, Math.min(100, Number(snapshot.canvasColorOpacity ?? 100)));
  canvas.style.backgroundColor = canvasColorValue ? getColorWithOpacity(canvasColorValue, canvasColorOpacity) : "transparent";
  if (colorPicker instanceof HTMLInputElement) {
    syncCustomColorControl(colorPicker, canvasColorValue, canvasColorOpacity);
  }
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

function getSelectedVectorRecord() {
  return selectedCanvasVector
    ? vectorRecords.find((record) => record.element === selectedCanvasVector)
    : undefined;
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
  if (layer.type === "text") return getTextRecord(layer.id)?.parentFrameId ?? null;
  return getVectorRecord(layer.id)?.parentFrameId ?? null;
}

function getLayerRecord(layer) {
  if (layer.type === "frame") return getFrameRecord(layer.id);
  if (layer.type === "text") return getTextRecord(layer.id);
  return getVectorRecord(layer.id);
}

function normalizeSiblingOrder(parentFrameId) {
  getLayerChildren(parentFrameId).forEach((layer, index) => {
    layer.record.order = index + 1;
  });
  nextLayerOrder = Math.max(
    1,
    ...frameRecords.map((record) => record.order + 1),
    ...textRecords.map((record) => record.order + 1),
    ...vectorRecords.map((record) => record.order + 1),
  );
}

function syncLayerDomOrder(parentFrameId) {
  const parentElement = parentFrameId === null ? canvas : getFrameRecord(parentFrameId)?.element;
  if (!(parentElement instanceof HTMLElement)) return;
  getLayerChildren(parentFrameId).forEach((layer) => {
    if (parentFrameId === null && layer.type === "frame" && canvasRootStack instanceof HTMLElement) {
      canvasRootStack.append(layer.record.element);
    } else if (parentFrameId === null) canvas.insertBefore(layer.record.element, toolbar);
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
