const canvas = document.querySelector("#canvas");
const toolbar = document.querySelector(".toolbar");
const treeView = document.querySelector("[data-tree-view]");
const pageInspector = document.querySelector("[data-page-inspector]");
const textInspector = document.querySelector("[data-text-inspector]");
const colorPicker = document.querySelector("#canvas-color-picker");
const toolButtons = Array.from(document.querySelectorAll("[data-tool]"));

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
  if (pageInspector instanceof HTMLElement) pageInspector.hidden = isTextSelected;
  if (textInspector instanceof HTMLElement) textInspector.hidden = !isTextSelected;
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

renderTree();
