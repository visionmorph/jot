/* Layers tree rendering, selection reveal, hierarchy drag-and-drop, and node icons. */

function expandFramePath(parentFrameId) {
  isComponentExpanded = true;
  if (currentComponent) currentComponent.expanded = true;
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

function getTreeIndent(depth) {
  return 4 + Math.max(0, depth - 1) * 20;
}

function componentHasChildLayers(component) {
  if (component.id === currentComponent?.id) return getLayerChildren(null).length > 0;
  const workspace = component.workspace;
  return Boolean(
    workspace?.frames?.some((entry) => entry.parentId === null)
    || workspace?.texts?.some((entry) => entry.parentFrameId === null)
    || workspace?.vectors?.some((entry) => entry.parentFrameId === null),
  );
}

function createSquareIcon() {
  return createLayerTypeIcon("frame");
}

function createLayerTypeIcon(type) {
  if (type === "component") {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    svg.setAttribute("class", "layer-type-icon");
    svg.setAttribute("viewBox", "0 0 32 32");
    svg.setAttribute("fill", "none");
    svg.setAttribute("aria-hidden", "true");
    path.setAttribute("d", "M14.5868 3.27128C15.3678 2.49027 16.6338 2.49034 17.4149 3.27128L28.7294 14.5848C29.5101 15.3657 29.51 16.6318 28.7294 17.4129L17.4149 28.7273L17.2635 28.864C16.5304 29.4622 15.4724 29.462 14.7391 28.864L14.5868 28.7273L3.2733 17.4129C2.54129 16.6807 2.49523 15.5226 3.13561 14.7371L3.2733 14.5848L14.5868 3.27128Z");
    path.setAttribute("fill", "currentColor");
    svg.append(path);
    return svg;
  }
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

let treeRenameState = null;

let lastTreeLabelPointer = { key: null, time: 0 };

function getTreeNodeKey(type, id) {
  return `${type}:${id}`;
}

function getTreeNodeName(type, record) {
  if (type === "component") return record.name || "Component";
  if (type === "frame") return record.name || `Frame ${record.id}`;
  if (type === "text") return record.name || record.element.textContent || "Text";
  return record.name || `Vector ${record.id}`;
}

function selectTreeNodeForRename(type, record) {
  if (type === "component") selectComponentTreeNode(record.id);
  else if (type === "frame") selectCanvasFrame(record.element);
  else if (type === "text") selectCanvasText(record.element);
  else selectCanvasVector(record.element);
}

function applyTreeNodeName(type, record, name) {
  if (type === "component") {
    record.name = name;
    record.frameRecord.name = name;
    record.frameRecord.element.setAttribute("aria-label", name);
    return;
  }
  record.name = name;
  record.element.setAttribute("aria-label", name);
}

function beginTreeNodeRename(type, record) {
  treeRenameState = {
    key: getTreeNodeKey(type, record.id),
    originalName: getTreeNodeName(type, record),
  };
  selectTreeNodeForRename(type, record);
}

function createTreeNodeContent(node, iconGroup, type, record) {
  const content = document.createElement("div");
  const labelWrapper = document.createElement("div");
  const key = getTreeNodeKey(type, record.id);
  const name = getTreeNodeName(type, record);

  content.className = "tree-node-content";
  labelWrapper.className = "tree-node-label-wrap";

  if (treeRenameState?.key === key) {
    const input = document.createElement("input");
    let didCommit = false;
    let shouldRevert = false;
    node.classList.add("is-renaming", "is-selected");
    node.setAttribute("aria-selected", "true");
    node.draggable = false;
    input.className = "tree-node-rename-input";
    input.type = "text";
    input.value = treeRenameState.originalName;
    input.setAttribute("aria-label", `Rename ${treeRenameState.originalName}`);
    input.autocomplete = "off";
    input.spellcheck = false;

    const commit = () => {
      if (didCommit) return;
      didCommit = true;
      const originalName = treeRenameState.originalName;
      const nextName = shouldRevert || input.value.trim().length === 0
        ? originalName
        : input.value.trim();
      if (nextName !== originalName) {
        recordHistory();
        applyTreeNodeName(type, record, nextName);
      }
      treeRenameState = null;
      renderTree();
    };

    input.addEventListener("pointerdown", (event) => event.stopPropagation());
    input.addEventListener("click", (event) => event.stopPropagation());
    input.addEventListener("dblclick", (event) => event.stopPropagation());
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        input.blur();
      } else if (event.key === "Escape") {
        event.preventDefault();
        shouldRevert = true;
        input.blur();
      }
    });
    input.addEventListener("blur", commit);
    labelWrapper.append(input);
    requestAnimationFrame(() => {
      if (input.isConnected) {
        input.focus();
        input.select();
      }
    });
  } else {
    const label = document.createElement("span");
    label.className = "tree-node-label";
    label.textContent = name;
    const startRename = (event) => {
      event.preventDefault();
      event.stopPropagation();
      beginTreeNodeRename(type, record);
    };
    labelWrapper.addEventListener("pointerdown", (event) => {
      const now = performance.now();
      const isDoubleClick = event.detail === 2
        || (lastTreeLabelPointer.key === key && now - lastTreeLabelPointer.time <= 500);
      lastTreeLabelPointer = { key, time: now };
      if (isDoubleClick) startRename(event);
    });
    labelWrapper.addEventListener("dblclick", startRename);
    labelWrapper.append(label);
  }

  content.append(iconGroup, labelWrapper);
  return content;
}

function renderFrameTreeNode(record, depth) {
  const childLayers = getLayerChildren(record.id);
  const isBranch = childLayers.length > 0;
  const isExpanded = expandedFrameIds.has(record.id);
  const item = document.createElement("div");
  const node = document.createElement("div");
  const iconGroup = document.createElement("span");

  item.className = "dynamic-tree-item";
  node.className = "tree-node tree-node--dynamic";
  node.draggable = true;
  node.setAttribute("role", "treeitem");
  node.setAttribute("tabindex", "0");
  node.setAttribute("aria-level", String(depth));
  node.setAttribute("aria-selected", String(isLayerSelected("frame", record.id)));
  node.style.setProperty("--tree-indent", `${getTreeIndent(depth)}px`);
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
  node.append(createTreeNodeContent(node, iconGroup, "frame", record));
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

  item.className = "dynamic-tree-item";
  node.className = "tree-node tree-node--dynamic";
  node.draggable = true;
  node.setAttribute("role", "treeitem");
  node.setAttribute("tabindex", "0");
  node.setAttribute("aria-level", String(depth));
  node.setAttribute("aria-selected", String(isLayerSelected("text", record.id)));
  node.style.setProperty("--tree-indent", `${getTreeIndent(depth)}px`);
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
  node.append(createTreeNodeContent(node, iconGroup, "text", record));
  item.append(node);
  return item;
}

function renderVectorTreeNode(record, depth) {
  const item = document.createElement("div");
  const node = document.createElement("div");
  const iconGroup = document.createElement("span");

  item.className = "dynamic-tree-item";
  node.className = "tree-node tree-node--dynamic";
  node.draggable = true;
  node.setAttribute("role", "treeitem");
  node.setAttribute("tabindex", "0");
  node.setAttribute("aria-level", String(depth));
  node.setAttribute("aria-selected", String(isLayerSelected("vector", record.id)));
  node.style.setProperty("--tree-indent", `${getTreeIndent(depth)}px`);
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
  node.append(createTreeNodeContent(node, iconGroup, "vector", record));
  item.append(node);
  return item;
}

function renderLayerTreeNode(layer, depth) {
  if (layer.type === "frame") return renderFrameTreeNode(layer.record, depth);
  if (layer.type === "text") return renderTextTreeNode(layer.record, depth);
  return renderVectorTreeNode(layer.record, depth);
}

function selectComponentTreeNode(componentId = currentComponent?.id) {
  if (componentId === undefined || componentId === null) return;
  if (currentComponent?.id !== componentId) {
    activateComponent(componentId, { render: false });
    isComponentExpanded = false;
    if (currentComponent) currentComponent.expanded = false;
    renderTree();
    return;
  }
  selectedLayerKeys.clear();
  clearElementSelection();
  selectedComponentId = componentId;
  selectedCanvasFrame = null;
  selectedCanvasText = null;
  selectedCanvasVector = null;
  syncElementSelectionStyles();
  renderTree();
}

function renderComponentTreeNode(component) {
  const item = document.createElement("div");
  const node = document.createElement("div");
  const iconGroup = document.createElement("span");
  const branchToggle = document.createElement("button");
  const chevron = document.createElement("span");
  const isActive = component.id === currentComponent?.id;
  const isBranch = componentHasChildLayers(component);
  const isExpanded = isBranch && isActive && isComponentExpanded;
  const rootLayers = isActive ? getLayerChildren(null) : [];
  const isSelected = selectedComponentId === component.id;

  item.className = "dynamic-tree-item";
  node.className = "tree-node tree-node--dynamic tree-node--component";
  node.setAttribute("role", "treeitem");
  node.setAttribute("tabindex", "0");
  node.setAttribute("aria-level", "1");
  if (isBranch) node.setAttribute("aria-expanded", String(isExpanded));
  node.setAttribute("aria-selected", String(isSelected));
  node.style.setProperty("--tree-indent", `${getTreeIndent(1)}px`);
  if (isSelected) node.classList.add("is-selected");

  node.addEventListener("click", () => selectComponentTreeNode(component.id));
  node.addEventListener("keydown", (event) => {
    if (event.target === node && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      selectComponentTreeNode(component.id);
    }
  });
  if (isActive) {
    node.addEventListener("dragover", (event) => {
      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = "move";
      showTreeDropIndicator(node, "inside");
    });
    node.addEventListener("drop", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const draggedLayer = getLayerDragData(event);
      clearTreeDropIndicators();
      if (draggedLayer) moveLayer(draggedLayer, null, rootLayers.length);
    });
  }

  iconGroup.className = "branch-icon-group";
  if (isBranch) {
    branchToggle.className = "icon-cell branch-toggle";
    branchToggle.type = "button";
    branchToggle.setAttribute("aria-label", `${isExpanded ? "Collapse" : "Expand"} ${component.name}`);
    branchToggle.setAttribute("aria-expanded", String(isExpanded));
    chevron.className = `chevron ${isExpanded ? "chevron--down" : "chevron--right"}`;
    chevron.setAttribute("aria-hidden", "true");
    branchToggle.append(chevron);
    branchToggle.addEventListener("click", (event) => {
      event.stopPropagation();
      if (!isActive) {
        activateComponent(component.id, { render: false });
        isComponentExpanded = true;
        component.expanded = true;
      } else {
        isComponentExpanded = !isComponentExpanded;
        component.expanded = isComponentExpanded;
      }
      renderTree();
    });
    iconGroup.append(branchToggle);
  }
  iconGroup.append(createIconCell(createLayerTypeIcon("component")));

  node.append(createTreeNodeContent(node, iconGroup, "component", component));
  item.append(node);
  if (isExpanded) {
    rootLayers.forEach((layer) => item.append(renderLayerTreeNode(layer, 2)));
  }
  return item;
}

function renderTree() {
  if (!treeView) return;
  treeView.replaceChildren(...components.map(renderComponentTreeNode));
  updateInspector();
  renderComponentProps();
}

addComponentButton?.addEventListener("click", addComponent);

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
