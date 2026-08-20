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
  syncCurrentComponentExpansionState();
}

function syncCurrentComponentExpansionState() {
  if (!currentComponent) return;
  currentComponent.expanded = isComponentExpanded;
  currentComponent.expandedFrameIds = [...expandedFrameIds];
  if (currentComponent.workspace) {
    currentComponent.workspace.expandedFrameIds = [...expandedFrameIds];
  }
}

function createIconCell(content) {
  const cell = document.createElement("span");
  cell.className = "icon-cell";
  if (content) cell.append(content);
  return cell;
}

function getTreeIndent(depth) {
  return Math.max(0, depth - 1) * 20;
}

function getComponentLayerChildren(component, parentFrameId) {
  if (component.id === currentComponent?.id) return getLayerChildren(parentFrameId);
  const workspace = component.workspace;
  if (!workspace) return [];
  return [
    ...(workspace.frames ?? [])
      .filter((entry) => entry.parentId === parentFrameId)
      .map((entry) => ({ type: "frame", record: entry.record })),
    ...(workspace.texts ?? [])
      .filter((entry) => entry.parentFrameId === parentFrameId)
      .map((entry) => ({ type: "text", record: entry.record })),
    ...(workspace.vectors ?? [])
      .filter((entry) => entry.parentFrameId === parentFrameId)
      .map((entry) => ({ type: "vector", record: entry.record })),
  ].sort((a, b) => a.record.order - b.record.order);
}

function getComponentExpandedFrameIds(component) {
  if (component.id === currentComponent?.id) return expandedFrameIds;
  return new Set(component.expandedFrameIds ?? component.workspace?.expandedFrameIds ?? []);
}

function setComponentFrameExpanded(component, frameId, isExpanded) {
  if (component.id === currentComponent?.id) {
    if (isExpanded) expandedFrameIds.add(frameId);
    else expandedFrameIds.delete(frameId);
    syncCurrentComponentExpansionState();
    return;
  }

  const componentFrameIds = getComponentExpandedFrameIds(component);
  if (isExpanded) componentFrameIds.add(frameId);
  else componentFrameIds.delete(frameId);
  component.expandedFrameIds = [...componentFrameIds];
  if (component.workspace) component.workspace.expandedFrameIds = [...componentFrameIds];
}

function componentHasChildLayers(component) {
  return getComponentLayerChildren(component, null).length > 0;
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

function getTreeNodeKey(type, id, componentId = currentComponent?.id) {
  return `${componentId ?? "none"}:${type}:${id}`;
}

function getTreeNodeName(type, record) {
  if (type === "component") return record.name || "Component";
  if (type === "frame") return record.name || `Frame ${record.id}`;
  if (type === "text") return record.name || record.element.textContent || "Text";
  return record.name || `Vector ${record.id}`;
}

function selectComponentLayerTreeNode(component, type, record, additive = false) {
  const isChangingComponent = component.id !== currentComponent?.id;
  if (isChangingComponent && !activateComponent(component.id, { render: false })) return;
  const activeRecord = type === "frame"
    ? getFrameRecord(record.id)
    : type === "text"
      ? getTextRecord(record.id)
      : getVectorRecord(record.id);
  if (!activeRecord) return;
  if (type === "frame") selectCanvasFrame(activeRecord.element, isChangingComponent ? false : additive);
  else if (type === "text") selectCanvasText(activeRecord.element, isChangingComponent ? false : additive);
  else selectCanvasVector(activeRecord.element, isChangingComponent ? false : additive);
}

function selectTreeNodeForRename(type, record, component) {
  if (type === "component") selectComponentTreeNode(record.id);
  else selectComponentLayerTreeNode(component, type, record);
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

function beginTreeNodeRename(type, record, component) {
  treeRenameState = {
    key: getTreeNodeKey(type, record.id, component.id),
    originalName: getTreeNodeName(type, record),
  };
  selectTreeNodeForRename(type, record, component);
}

function getTreeLayerElement(type, record, component) {
  if (type === "component") return component.id === currentComponent?.id ? canvasRootStack : null;
  return record.element;
}

function getWorkspaceLayerEntry(component, type, recordId) {
  if (type === "component") return component.workspace?.componentFrame ?? null;
  const entries = type === "frame"
    ? component.workspace?.frames
    : type === "text"
      ? component.workspace?.texts
      : component.workspace?.vectors;
  return entries?.find((entry) => entry.record.id === recordId) ?? null;
}

function getTreeLayerVisibility(type, record, component) {
  if (component.id !== currentComponent?.id) {
    return getWorkspaceLayerEntry(component, type, record.id)?.dataset?.layerVisibility !== "hidden";
  }
  return isLayerVisible(getTreeLayerElement(type, record, component));
}

function createLayerVisibilityGraphic(isVisible, isTopLevel) {
  if (!isVisible && !isTopLevel) {
    const dot = document.createElement("span");
    dot.className = "layer-visibility-dot";
    dot.setAttribute("aria-hidden", "true");
    return dot;
  }

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  const eye = document.createElementNS("http://www.w3.org/2000/svg", "path");
  svg.setAttribute("class", "layer-visibility-icon");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("fill", "none");
  svg.setAttribute("aria-hidden", "true");
  eye.setAttribute("d", "M1 8s2.5-4 7-4 7 4 7 4-2.5 4-7 4S1 8 1 8Z");
  eye.setAttribute("stroke", "currentColor");
  eye.setAttribute("stroke-width", "1.25");
  eye.setAttribute("stroke-linejoin", "round");
  svg.append(eye);

  const pupil = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  pupil.setAttribute("cx", "8");
  pupil.setAttribute("cy", "8");
  pupil.setAttribute("r", "2");
  pupil.setAttribute("fill", "currentColor");
  svg.append(pupil);

  if (!isVisible) {
    const slash = document.createElementNS("http://www.w3.org/2000/svg", "path");
    slash.setAttribute("d", "M2 2l12 12");
    slash.setAttribute("stroke", "currentColor");
    slash.setAttribute("stroke-width", "1.5");
    slash.setAttribute("stroke-linecap", "round");
    svg.append(slash);
  }
  return svg;
}

function createVectorLayerTreeIcon(record) {
  const source = record.originalSvgSource || record.svgSource;
  if (!source) return createLayerTypeIcon("vector");

  const svg = createCanvasSvg(source);
  svg.classList.add("layer-type-icon", "vector-layer-preview-icon");
  svg.setAttribute("aria-hidden", "true");
  svg.querySelectorAll("path, rect, circle, ellipse, line, polyline, polygon, use").forEach((shape) => {
    if (shape.closest("defs, clipPath, mask, pattern, symbol")) return;
    shape.style.setProperty("fill", "none", "important");
    shape.style.setProperty("stroke", "currentColor", "important");
    shape.style.setProperty("stroke-width", "1px", "important");
    shape.style.setProperty("vector-effect", "non-scaling-stroke", "important");
  });
  return svg;
}

function toggleTreeLayerVisibility(type, record, component) {
  const isVisible = getTreeLayerVisibility(type, record, component);
  const nextVisibility = isVisible ? "hidden" : "visible";

  if (component.id !== currentComponent?.id) {
    const workspaceEntry = getWorkspaceLayerEntry(component, type, record.id);
    if (!workspaceEntry) return;
    workspaceEntry.dataset = { ...workspaceEntry.dataset, layerVisibility: nextVisibility };
    if (record.element instanceof HTMLElement) {
      record.element.dataset.layerVisibility = nextVisibility;
      syncLayerVisibility(record.element);
    }
  } else {
    const element = getTreeLayerElement(type, record, component);
    if (!(element instanceof HTMLElement)) return;
    recordHistory();
    element.dataset.layerVisibility = nextVisibility;
    syncLayerVisibility(element);
    requestAnimationFrame(syncResizeOverlay);
  }
  renderTree();
}

function createTreeNodeContent(node, iconGroup, type, record, depth, component) {
  const content = document.createElement("div");
  const labelWrapper = document.createElement("div");
  const visibilityButton = document.createElement("button");
  const key = getTreeNodeKey(type, record.id, component.id);
  const name = getTreeNodeName(type, record);
  const isVisible = getTreeLayerVisibility(type, record, component);
  const isTopLevel = depth === 1;

  content.className = "tree-node-content";
  labelWrapper.className = "tree-node-label-wrap";
  node.classList.toggle("is-disabled", !isVisible);

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
      beginTreeNodeRename(type, record, component);
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

  visibilityButton.className = `layer-visibility-button${isVisible ? "" : " is-layer-hidden"}${isTopLevel ? " is-top-level" : " is-child-layer"}`;
  visibilityButton.type = "button";
  visibilityButton.draggable = false;
  visibilityButton.setAttribute("aria-label", `${isVisible ? "Hide" : "Show"} ${name}`);
  visibilityButton.setAttribute("aria-pressed", String(!isVisible));
  visibilityButton.append(createLayerVisibilityGraphic(isVisible, isTopLevel));
  visibilityButton.addEventListener("pointerdown", (event) => event.stopPropagation());
  visibilityButton.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    toggleTreeLayerVisibility(type, record, component);
  });

  content.append(iconGroup, labelWrapper, visibilityButton);
  return content;
}

function renderFrameTreeNode(record, depth, component) {
  const childLayers = getComponentLayerChildren(component, record.id);
  const isBranch = childLayers.length > 0;
  const isExpanded = getComponentExpandedFrameIds(component).has(record.id);
  const isActiveComponent = component.id === currentComponent?.id;
  const item = document.createElement("div");
  const node = document.createElement("div");
  const iconGroup = document.createElement("span");

  item.className = "dynamic-tree-item";
  node.className = "tree-node tree-node--dynamic";
  node.draggable = isActiveComponent;
  node.setAttribute("role", "treeitem");
  node.setAttribute("tabindex", "0");
  node.setAttribute("aria-level", String(depth));
  node.setAttribute("aria-selected", String(isActiveComponent && isLayerSelected("frame", record.id)));
  node.style.setProperty("--tree-indent", `${getTreeIndent(depth)}px`);
  if (isActiveComponent && isLayerSelected("frame", record.id)) node.classList.add("is-selected");
  if (isBranch) node.setAttribute("aria-expanded", String(isExpanded));

  node.addEventListener("click", (event) => selectComponentLayerTreeNode(component, "frame", record, event.ctrlKey));
  node.addEventListener("keydown", (event) => {
    if (event.target === node && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      selectComponentLayerTreeNode(component, "frame", record);
    }
  });
  if (isActiveComponent) {
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
  }

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
      setComponentFrameExpanded(component, record.id, !isExpanded);
      renderTree();
    });
    iconGroup.append(branchToggle);
  }

  iconGroup.append(createIconCell(createSquareIcon()));
  node.append(createTreeNodeContent(node, iconGroup, "frame", record, depth, component));
  item.append(node);

  if (isBranch && isExpanded) {
    childLayers.forEach((layer) => item.append(renderLayerTreeNode(layer, depth + 1, component)));
  }

  return item;
}

function renderTextTreeNode(record, depth, component) {
  const item = document.createElement("div");
  const node = document.createElement("div");
  const iconGroup = document.createElement("span");
  const isActiveComponent = component.id === currentComponent?.id;

  item.className = "dynamic-tree-item";
  node.className = "tree-node tree-node--dynamic";
  node.draggable = isActiveComponent;
  node.setAttribute("role", "treeitem");
  node.setAttribute("tabindex", "0");
  node.setAttribute("aria-level", String(depth));
  node.setAttribute("aria-selected", String(isActiveComponent && isLayerSelected("text", record.id)));
  node.style.setProperty("--tree-indent", `${getTreeIndent(depth)}px`);
  if (isActiveComponent && isLayerSelected("text", record.id)) node.classList.add("is-selected");

  node.addEventListener("click", (event) => selectComponentLayerTreeNode(component, "text", record, event.ctrlKey));
  node.addEventListener("keydown", (event) => {
    if (event.target === node && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      selectComponentLayerTreeNode(component, "text", record);
    }
  });
  if (isActiveComponent) {
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
  }

  iconGroup.className = "branch-icon-group";
  iconGroup.append(createIconCell(createLayerTypeIcon("text")));
  node.append(createTreeNodeContent(node, iconGroup, "text", record, depth, component));
  item.append(node);
  return item;
}

function renderVectorTreeNode(record, depth, component) {
  const item = document.createElement("div");
  const node = document.createElement("div");
  const iconGroup = document.createElement("span");
  const isActiveComponent = component.id === currentComponent?.id;

  item.className = "dynamic-tree-item";
  node.className = "tree-node tree-node--dynamic";
  node.draggable = isActiveComponent;
  node.setAttribute("role", "treeitem");
  node.setAttribute("tabindex", "0");
  node.setAttribute("aria-level", String(depth));
  node.setAttribute("aria-selected", String(isActiveComponent && isLayerSelected("vector", record.id)));
  node.style.setProperty("--tree-indent", `${getTreeIndent(depth)}px`);
  if (isActiveComponent && isLayerSelected("vector", record.id)) node.classList.add("is-selected");

  node.addEventListener("click", (event) => selectComponentLayerTreeNode(component, "vector", record, event.ctrlKey));
  node.addEventListener("keydown", (event) => {
    if (event.target === node && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      selectComponentLayerTreeNode(component, "vector", record);
    }
  });
  if (isActiveComponent) {
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
  }

  iconGroup.className = "branch-icon-group";
  iconGroup.append(createIconCell(createVectorLayerTreeIcon(record)));
  node.append(createTreeNodeContent(node, iconGroup, "vector", record, depth, component));
  item.append(node);
  return item;
}

function renderLayerTreeNode(layer, depth, component) {
  if (layer.type === "frame") return renderFrameTreeNode(layer.record, depth, component);
  if (layer.type === "text") return renderTextTreeNode(layer.record, depth, component);
  return renderVectorTreeNode(layer.record, depth, component);
}

function selectComponentTreeNode(componentId = currentComponent?.id) {
  if (componentId === undefined || componentId === null) return;
  if (currentComponent?.id !== componentId) {
    activateComponent(componentId, { render: false });
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
  const isExpanded = isBranch && (isActive ? isComponentExpanded : component.expanded !== false);
  const rootLayers = getComponentLayerChildren(component, null);
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
      if (isActive) {
        isComponentExpanded = !isComponentExpanded;
        component.expanded = isComponentExpanded;
        syncCurrentComponentExpansionState();
      } else {
        component.expanded = !isExpanded;
      }
      renderTree();
    });
    iconGroup.append(branchToggle);
  }
  iconGroup.append(createIconCell(createLayerTypeIcon("component")));

  node.append(createTreeNodeContent(node, iconGroup, "component", component, 1, component));
  item.append(node);
  if (isExpanded) {
    rootLayers.forEach((layer) => item.append(renderLayerTreeNode(layer, 2, component)));
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
