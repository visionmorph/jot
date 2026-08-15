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
const framePaddingInputs = Array.from(document.querySelectorAll("[data-frame-padding]"));
const frameRadiusInput = document.querySelector("#frame-radius");
const frameColorPicker = document.querySelector("#frame-color-picker");

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

function selectCanvasText(textElement) {
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
}

function syncInspectorToSelectedFrame() {
  const record = getSelectedFrameRecord();
  if (!record) return;
  const { element } = record;

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
  node.addEventListener("dragover", (event) => {
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "move";
  });
  node.addEventListener("drop", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const draggedLayer = getLayerDragData(event);
    if (draggedLayer) nestLayer(draggedLayer, record.id);
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

function nestLayer(layer, parentFrameId) {
  const parentRecord = getFrameRecord(parentFrameId);
  if (!parentRecord) return;

  if (layer.type === "frame") {
    if (!canNestFrame(layer.id, parentFrameId)) return;
    const draggedRecord = getFrameRecord(layer.id);
    if (!draggedRecord) return;
    draggedRecord.parentId = parentFrameId;
    draggedRecord.element.style.left = "";
    draggedRecord.element.style.top = "";
    parentRecord.element.append(draggedRecord.element);
  } else {
    const draggedRecord = getTextRecord(layer.id);
    if (!draggedRecord) return;
    draggedRecord.parentFrameId = parentFrameId;
    draggedRecord.element.style.left = "";
    draggedRecord.element.style.top = "";
    parentRecord.element.append(draggedRecord.element);
  }

  expandedFrameIds.add(parentFrameId);
  renderTree();
}

function startEditingText(textElement) {
  selectCanvasText(textElement);
  textElement.contentEditable = "true";
  textElement.focus();

  const selection = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(textElement);
  range.collapse(false);
  selection?.removeAllRanges();
  selection?.addRange(range);
}

function createCanvasText(parentRecord, x, y) {
  if (!(canvas instanceof HTMLElement)) return;
  if (suppressNextTextCreation) {
    suppressNextTextCreation = false;
    return;
  }

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
    selectCanvasText(text);
  });
  text.addEventListener("dblclick", (event) => {
    event.stopPropagation();
    startEditingText(text);
  });
  text.addEventListener("input", renderTree);
  text.addEventListener("blur", () => {
    if (record.isNew && (text.textContent ?? "").length === 0) {
      selectTool("select");
      removeCanvasText(text, true);
      return;
    }

    record.isNew = false;
    text.contentEditable = "false";
  });
  text.addEventListener("dragstart", (event) => {
    event.preventDefault();
    event.stopPropagation();
  });

  textRecords.push(record);
  renderTree();
  startEditingText(text);
}

function createCanvasFrame(x, y) {
  if (!(canvas instanceof HTMLElement)) return;

  const frameId = nextFrameId;
  nextFrameId += 1;
  const frame = document.createElement("div");
  const record = {
    id: frameId,
    parentId: null,
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
  frame.dataset.radius = "0";
  frame.dataset.frameColor = "";
  frame.style.left = `${x}px`;
  frame.style.top = `${y}px`;

  frame.addEventListener("click", (event) => {
    event.stopPropagation();
    if (event.target !== frame) return;

    if (activeTool === "text") {
      const frameBounds = frame.getBoundingClientRect();
      createCanvasText(record, event.clientX - frameBounds.left, event.clientY - frameBounds.top);
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
  canvas.insertBefore(frame, toolbar);
  renderTree();
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
  if (event.key === "Escape") {
    selectTool("select");
    const activeText = document.activeElement instanceof HTMLElement && document.activeElement.classList.contains("canvas-text")
      ? document.activeElement
      : null;
    activeText?.blur();
    return;
  }

  const shortcutTarget = event.target;
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

  if (
    !selectedCanvasFrame ||
    (event.key !== "Delete" && event.key !== "Backspace")
  ) return;

  const target = event.target;
  if (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  ) return;

  event.preventDefault();
  const selectedRecord = frameRecords.find((record) => record.element === selectedCanvasFrame);
  if (!selectedRecord) return;

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
  record.element.dataset.fontFamily = family;
  record.element.dataset.fontWeight = String(weight);
  record.element.style.fontFamily = `${JSON.stringify(family)}, ${getFontFallback(font?.category || "Sans Serif")}`;
  record.element.style.fontWeight = String(weight);
  loadGoogleFont(family, weight);
});

weightSelect?.addEventListener("change", () => {
  const record = getSelectedTextRecord();
  if (!record || !(weightSelect instanceof HTMLSelectElement)) return;
  const family = record.element.dataset.fontFamily || DEFAULT_FONT_FAMILY;
  const weight = Number(weightSelect.value);
  record.element.dataset.fontWeight = String(weight);
  record.element.style.fontWeight = String(weight);
  loadGoogleFont(family, weight);
});

sizeSelect?.addEventListener("change", () => {
  const record = getSelectedTextRecord();
  if (!record || !(sizeSelect instanceof HTMLSelectElement)) return;
  record.element.dataset.fontSize = sizeSelect.value;
  record.element.style.fontSize = `${sizeSelect.value}px`;
});

function applyLineHeightValue() {
  const record = getSelectedTextRecord();
  if (!record || !(lineHeightInput instanceof HTMLInputElement)) return false;
  const value = lineHeightInput.value.trim();
  if (/^auto$/i.test(value)) {
    lineHeightInput.value = "Auto";
    record.element.dataset.lineHeight = "Auto";
    record.element.style.lineHeight = "normal";
    return true;
  }

  if (!/^\d+(?:\.\d+)?$/.test(value)) return false;
  const numberValue = Math.max(0, Number(value));
  lineHeightInput.value = String(numberValue);
  record.element.dataset.lineHeight = String(numberValue);
  record.element.style.lineHeight = `${numberValue}px`;
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
  letterSpacingInput.value = value;
  record.element.dataset.letterSpacing = value;
  record.element.style.letterSpacing = match[2].toLowerCase() === "%"
    ? `${Number(match[1]) / 100}em`
    : value;
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
  record.element.dataset.textColor = textColorPicker.value;
  record.element.style.color = textColorPicker.value;
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
  record.element.dataset.radius = String(value);
  record.element.style.borderRadius = `${value}px`;
});
frameRadiusInput?.addEventListener("blur", syncInspectorToSelectedFrame);

frameColorPicker?.addEventListener("input", () => {
  const record = getSelectedFrameRecord();
  if (!record || !(frameColorPicker instanceof HTMLInputElement)) return;
  record.element.dataset.frameColor = frameColorPicker.value;
  record.element.style.backgroundColor = frameColorPicker.value;
  frameColorPicker.classList.remove("is-transparent");
});

loadGoogleFont(DEFAULT_FONT_FAMILY, DEFAULT_FONT_WEIGHT);
loadFontCatalog();
renderTree();
