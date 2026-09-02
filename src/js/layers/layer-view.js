/* Layers sidebar node construction, icons, and rendering. */

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

function componentHasChildLayers(component) {
  // Avoid building+sorting the full child list (what getComponentLayerChildren
  // does) just to answer a yes/no question. The active-component path still
  // defers to the external getLayerChildren helper since its cost/behavior
  // isn't something to second-guess here.
  if (component.id === currentComponent?.id) return getLayerChildren(null).length > 0;
  const workspace = component.workspace;
  if (!workspace) return false;
  return (workspace.frames ?? []).some((entry) => entry.parentId === null)
    || (workspace.texts ?? []).some((entry) => entry.parentFrameId === null)
    || (workspace.vectors ?? []).some((entry) => entry.parentFrameId === null);
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
  if (type === "component") return createSvgAssetIcon("diamond-group");
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
  // type is always one of "component" | "frame" | "text" | "vector" at every
  // call site, and each case above returns early, so this is unreachable.
  // Kept only as a defensive fallback in case a new type is introduced
  // without updating this function.
  return createSvgAssetIcon("diamond-group");
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
    input.className = "text-input text-input--semibold";
    input.dataset.treeRenameInput = "";
    input.dataset.selectOnFocus = "";
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
    // This pointerdown check already covers double-click detection (via
    // event.detail === 2 for mouse, and the timing fallback for touch/pen),
    // so a separate native "dblclick" listener isn't needed — it was
    // causing startRename/beginTreeNodeRename to fire twice per double-click.
    labelWrapper.addEventListener("pointerdown", (event) => {
      const now = performance.now();
      const isDoubleClick = event.detail === 2
        || (lastTreeLabelPointer.key === key && now - lastTreeLabelPointer.time <= 500);
      lastTreeLabelPointer = { key, time: now };
      if (isDoubleClick) startRename(event);
    });
    labelWrapper.append(label);
  }

  visibilityButton.className = `icon-button icon-button--size-24 icon-button--rounded${isVisible ? "" : " is-layer-hidden"}${disabledState === "top-level" ? " is-top-level" : disabledState === "child" ? " is-child-layer" : ""}`;
  visibilityButton.dataset.iconButton = "layer-visibility";
  visibilityButton.type = "button";
  visibilityButton.draggable = false;
  visibilityButton.setAttribute("aria-label", `${isVisible ? "Hide" : "Show"} ${name}`);
  visibilityButton.title = `${isVisible ? "Hide" : "Show"} ${name}`;
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
  const isSelected = isComponentTreeLayerSelected(component, "frame", record.id);
  const item = document.createElement("div");
  const node = document.createElement("div");
  const iconGroup = document.createElement("span");

  item.className = "dynamic-tree-item";
  node.className = "tree-node tree-node--dynamic";
  node.draggable = isActiveComponent;
  node.setAttribute("role", "treeitem");
  node.setAttribute("tabindex", "0");
  node.setAttribute("aria-level", String(depth));
  node.setAttribute("aria-selected", String(isSelected));
  node.dataset.selectionComponentId = String(component.id);
  node.dataset.selectionLayerKey = getLayerKey("frame", record.id);
  node.style.setProperty("--tree-indent", `${getTreeIndent(depth)}px`);
  if (isSelected) node.classList.add("is-selected");
  if (isBranch) node.setAttribute("aria-expanded", String(isExpanded));

  attachLayerSelectionHandlers(node, "frame", component, record);
  if (isActiveComponent) attachLayerDragHandlers(node, "frame", record, true);

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
  const isSelected = isComponentTreeLayerSelected(component, "text", record.id);

  item.className = "dynamic-tree-item";
  node.className = "tree-node tree-node--dynamic";
  node.draggable = isActiveComponent;
  node.setAttribute("role", "treeitem");
  node.setAttribute("tabindex", "0");
  node.setAttribute("aria-level", String(depth));
  node.setAttribute("aria-selected", String(isSelected));
  node.dataset.selectionComponentId = String(component.id);
  node.dataset.selectionLayerKey = getLayerKey("text", record.id);
  node.style.setProperty("--tree-indent", `${getTreeIndent(depth)}px`);
  if (isSelected) node.classList.add("is-selected");

  attachLayerSelectionHandlers(node, "text", component, record);
  if (isActiveComponent) attachLayerDragHandlers(node, "text", record, false);

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
  const isSelected = isComponentTreeLayerSelected(component, "vector", record.id);

  item.className = "dynamic-tree-item";
  node.className = "tree-node tree-node--dynamic";
  node.draggable = isActiveComponent;
  node.setAttribute("role", "treeitem");
  node.setAttribute("tabindex", "0");
  node.setAttribute("aria-level", String(depth));
  node.setAttribute("aria-selected", String(isSelected));
  node.dataset.selectionComponentId = String(component.id);
  node.dataset.selectionLayerKey = getLayerKey("vector", record.id);
  node.style.setProperty("--tree-indent", `${getTreeIndent(depth)}px`);
  if (isSelected) node.classList.add("is-selected");

  attachLayerSelectionHandlers(node, "vector", component, record);
  if (isActiveComponent) attachLayerDragHandlers(node, "vector", record, false);

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
    if (!activateComponent(componentId, { render: false })) return;
  }
  if (!selectComponentState(componentId)) {
    return;
  }
  clearElementSelection();
  syncElementSelectionStyles();
  renderTree();
  requestAnimationFrame(() => {
    syncElementSelectionStyles();
    syncResizeOverlay();
  });
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
  node.dataset.selectionComponentId = String(component.id);
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
  renderVariantSystem();
  updateInspector();
  renderComponentProps();
}

addComponentButton?.addEventListener("click", () => {
  const component = addComponent();
  if (component) beginTreeNodeRename("component", component, component);
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
