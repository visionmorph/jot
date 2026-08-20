/* Layers tree rendering, selection reveal, hierarchy drag-and-drop, and node icons. */

function expandFramePath(parentFrameId) {
  const visitedFrameIds = new Set();
  let frameId = parentFrameId;

  while (frameId !== null && !visitedFrameIds.has(frameId)) {
    visitedFrameIds.add(frameId);
    expandedFrameIds.add(frameId);
    frameId = getFrameRecord(frameId)?.parentId ?? null;
  }
}

function createIconCell(content) {
  const cell = document.createElement("span");
  cell.className = "icon-cell";
  if (content) cell.append(content);
  return cell;
}

function createSquareIcon() {
  return createLayerTypeIcon("frame");
}

function createLayerTypeIcon(type) {
  if (type === "vector") {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    const transparentRect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    svg.setAttribute("class", "layer-type-icon");
    svg.setAttribute("viewBox", "0 0 32 32");
    svg.setAttribute("fill", "none");
    svg.setAttribute("aria-hidden", "true");
    path.setAttribute("d", "M28,9H14V6H6v8H9V28h2V14h3V11H28ZM12,12H8V8h4Z");
    path.setAttribute("fill", "currentColor");
    transparentRect.setAttribute("width", "32");
    transparentRect.setAttribute("height", "32");
    transparentRect.setAttribute("fill", "none");
    svg.append(path, transparentRect);
    return svg;
  }
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "layer-type-icon");
  svg.setAttribute("viewBox", "0 0 32 32");
  svg.setAttribute("fill", "none");
  svg.setAttribute("aria-hidden", "true");

  const paths = type === "frame"
    ? ["M24 26V28H8V26H24ZM26 24V8C26 6.89543 25.1046 6 24 6H8C6.89543 6 6 6.89543 6 8V24C6 25.1046 6.89543 26 8 26V28C5.79086 28 4 26.2091 4 24V8C4 5.79086 5.79086 4 8 4H24C26.2091 4 28 5.79086 28 8V24C28 26.2091 26.2091 28 24 28V26C25.1046 26 26 25.1046 26 24Z"]
    : ["M5 4H27V6H5V4Z", "M15 6H17V28H15V6Z"];
  paths.forEach((pathData) => {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", pathData);
    path.setAttribute("fill", "currentColor");
    svg.append(path);
  });
  return svg;
}

function setLayerDragData(event, layerType, layerId) {
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", `${layerType}:${layerId}`);
}

function getLayerDragData(event) {
  const [type, rawId] = event.dataTransfer.getData("text/plain").split(":");
  const id = Number(rawId);
  if ((type !== "frame" && type !== "text" && type !== "vector") || !Number.isInteger(id)) return null;
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
  node.setAttribute("aria-selected", String(isLayerSelected("frame", record.id)));
  node.style.setProperty("--tree-indent", `${8 + (depth - 1) * 40}px`);
  if (isLayerSelected("frame", record.id)) node.classList.add("is-selected");
  if (isBranch) node.setAttribute("aria-expanded", String(isExpanded));

  node.addEventListener("click", (event) => selectCanvasFrame(record.element, event.ctrlKey));
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
  const label = document.createElement("span");

  item.className = "dynamic-tree-item";
  node.className = "tree-node tree-node--dynamic";
  node.draggable = true;
  node.setAttribute("role", "treeitem");
  node.setAttribute("tabindex", "0");
  node.setAttribute("aria-level", String(depth));
  node.setAttribute("aria-selected", String(isLayerSelected("text", record.id)));
  node.style.setProperty("--tree-indent", `${8 + (depth - 1) * 40}px`);
  if (isLayerSelected("text", record.id)) node.classList.add("is-selected");

  node.addEventListener("click", (event) => selectCanvasText(record.element, event.ctrlKey));
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
  iconGroup.append(createIconCell(createLayerTypeIcon("text")));
  label.className = "tree-node-label";
  label.textContent = (record.element.textContent ?? "").length > 0
    ? record.element.textContent
    : "Text";
  node.append(iconGroup, label);
  item.append(node);
  return item;
}

function renderVectorTreeNode(record, depth) {
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
  node.setAttribute("aria-selected", String(isLayerSelected("vector", record.id)));
  node.style.setProperty("--tree-indent", `${8 + (depth - 1) * 40}px`);
  if (isLayerSelected("vector", record.id)) node.classList.add("is-selected");

  node.addEventListener("click", (event) => selectCanvasVector(record.element, event.ctrlKey));
  node.addEventListener("keydown", (event) => {
    if (event.target === node && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      selectCanvasVector(record.element);
    }
  });
  node.addEventListener("dragstart", (event) => {
    event.stopPropagation();
    setLayerDragData(event, "vector", record.id);
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
    if (draggedLayer) moveLayerRelative(draggedLayer, { type: "vector", id: record.id }, position);
  });

  iconGroup.className = "branch-icon-group";
  iconGroup.append(createIconCell(createLayerTypeIcon("vector")));
  label.className = "tree-node-label";
  label.textContent = record.name || `Vector ${record.id}`;
  node.append(iconGroup, label);
  item.append(node);
  return item;
}

function renderLayerTreeNode(layer, depth) {
  if (layer.type === "frame") return renderFrameTreeNode(layer.record, depth);
  if (layer.type === "text") return renderTextTreeNode(layer.record, depth);
  return renderVectorTreeNode(layer.record, depth);
}

function renderTree() {
  if (!treeView) return;
  const rootNodes = getLayerChildren(null).map((layer) => renderLayerTreeNode(layer, 1));
  treeView.replaceChildren(...rootNodes);
  updateInspector();
  renderComponentProps();
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
