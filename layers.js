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

function createSvgAssetIcon(name, className = "layer-type-icon") {
  const icon = document.createElement("span");
  icon.className = `${className} svg-icon svg-icon--${name}`;
  icon.setAttribute("aria-hidden", "true");
  return icon;
}

function createFrameLayerIcon(record) {
  const direction = record?.element?.dataset?.direction === "vertical" ? "vertical" : "horizontal";
  const alignment = normalizeFrameAlignment(record?.element?.dataset?.alignment || "top-left");
  const [vertical, horizontal] = alignment === "center" ? ["center", "center"] : alignment.split("-");
  return createSvgAssetIcon(`align-${direction}-${direction === "vertical" ? vertical : horizontal}`);
}

function createSquareIcon(record) {
  return createFrameLayerIcon(record);
}

function createLayerTypeIcon(type, record = null) {
  if (type === "component") return createSvgAssetIcon("diamond-filled");
  if (type === "frame") return createFrameLayerIcon(record);
  if (type === "text") return createSvgAssetIcon("letter-t");
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

  const paths = ["M5 4H27V6H5V4Z", "M15 6H17V28H15V6Z"];
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

function createLayerVisibilityGraphic(isVisible, disabledState = null) {
  if (disabledState === "child") {
    const dot = document.createElement("span");
    dot.className = "layer-visibility-dot";
    dot.setAttribute("aria-hidden", "true");
    return dot;
  }
  return createSvgAssetIcon(isVisible ? "view" : "view-off", "layer-visibility-icon");
}

function createVectorLayerTreeIcon(record) {
  const source = record.originalSvgSource || record.svgSource;
  if (!source) return createLayerTypeIcon("vector");

  const svg = createCanvasSvg(source);
  svg.classList.add("layer-type-icon", "vector-layer-preview-icon");
  svg.setAttribute("aria-hidden", "true");
  svg.querySelectorAll("path, rect, circle, ellipse, line, polyline, polygon, use").forEach((shape) => {
    if (shape.closest("defs, clipPath, mask, pattern, symbol")) return;
    if (isExplicitlyTransparentSvgShape(shape)) {
      shape.remove();
      return;
    }
    shape.style.setProperty("fill", "currentColor", "important");
    shape.style.setProperty("stroke", "none", "important");
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

function createTreeNodeContent(node, iconGroup, type, record, depth, component, hasHiddenAncestor = false) {
  const content = document.createElement("div");
  const labelWrapper = document.createElement("div");
  const visibilityButton = document.createElement("button");
  const key = getTreeNodeKey(type, record.id, component.id);
  const name = getTreeNodeName(type, record);
  const isVisible = getTreeLayerVisibility(type, record, component);
  const disabledState = hasHiddenAncestor ? "child" : isVisible ? null : "top-level";

  content.className = "tree-node-content";
  labelWrapper.className = "tree-node-label-wrap";
  node.classList.toggle("is-disabled", Boolean(disabledState));
  node.classList.toggle("is-disabled-top-level", disabledState === "top-level");
  node.classList.toggle("is-disabled-child", disabledState === "child");

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

  visibilityButton.className = `layer-visibility-button${isVisible ? "" : " is-layer-hidden"}${disabledState === "top-level" ? " is-top-level" : disabledState === "child" ? " is-child-layer" : ""}`;
  visibilityButton.type = "button";
  visibilityButton.draggable = false;
  visibilityButton.setAttribute("aria-label", `${isVisible ? "Hide" : "Show"} ${name}`);
  visibilityButton.setAttribute("aria-pressed", String(!isVisible));
  visibilityButton.append(createLayerVisibilityGraphic(isVisible, disabledState));
  visibilityButton.addEventListener("pointerdown", (event) => event.stopPropagation());
  visibilityButton.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    toggleTreeLayerVisibility(type, record, component);
  });

  content.append(iconGroup, labelWrapper, visibilityButton);
  return content;
}

function renderFrameTreeNode(record, depth, component, hasHiddenAncestor = false) {
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

  iconGroup.append(createIconCell(createSquareIcon(record)));
  node.append(createTreeNodeContent(node, iconGroup, "frame", record, depth, component, hasHiddenAncestor));
  item.append(node);

  if (isBranch && isExpanded) {
    const hidesChildren = hasHiddenAncestor || !getTreeLayerVisibility("frame", record, component);
    childLayers.forEach((layer) => item.append(renderLayerTreeNode(layer, depth + 1, component, hidesChildren)));
  }

  return item;
}

function renderTextTreeNode(record, depth, component, hasHiddenAncestor = false) {
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
  node.append(createTreeNodeContent(node, iconGroup, "text", record, depth, component, hasHiddenAncestor));
  item.append(node);
  return item;
}

function renderVectorTreeNode(record, depth, component, hasHiddenAncestor = false) {
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
  node.append(createTreeNodeContent(node, iconGroup, "vector", record, depth, component, hasHiddenAncestor));
  item.append(node);
  return item;
}

function renderLayerTreeNode(layer, depth, component, hasHiddenAncestor = false) {
  if (layer.type === "frame") return renderFrameTreeNode(layer.record, depth, component, hasHiddenAncestor);
  if (layer.type === "text") return renderTextTreeNode(layer.record, depth, component, hasHiddenAncestor);
  return renderVectorTreeNode(layer.record, depth, component, hasHiddenAncestor);
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
    const componentIsHidden = !getTreeLayerVisibility("component", component, component);
    rootLayers.forEach((layer) => item.append(renderLayerTreeNode(layer, 2, component, componentIsHidden)));
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
