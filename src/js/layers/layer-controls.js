/* Layers sidebar expansion, selection, rename, visibility, and drag controls. */

let treeRenameState = null;
let lastTreeLabelPointer = { key: null, time: 0 };

function expandFramePath(parentId) {
  isComponentExpanded = true;
  if (currentComponent) currentComponent.expanded = true;
  const visitedFrameIds = new Set();
  let frameId = parentId;
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
  if (currentComponent.workspace) currentComponent.workspace.expandedFrameIds = [...expandedFrameIds];
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

function setLayerDragData(event, layerType, layerId) {
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", `${layerType}:${layerId}`);
}

function getLayerDragData(event) {
  const [type, rawId] = event.dataTransfer.getData("text/plain").split(":");
  const id = Number(rawId);
  if (!LAYER_TYPES.includes(type) || !Number.isInteger(id)) return null;
  return { type, id };
}

function attachLayerDragHandlers(node, type, record, allowInside) {
  node.addEventListener("dragstart", (event) => {
    event.stopPropagation();
    setLayerDragData(event, type, record.id);
  });
  node.addEventListener("dragend", clearTreeDropIndicators);
  node.addEventListener("dragover", (event) => {
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "move";
    showTreeDropIndicator(node, getTreeDropPosition(event, allowInside));
  });
  node.addEventListener("drop", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const draggedLayer = getLayerDragData(event);
    const position = getTreeDropPosition(event, allowInside);
    clearTreeDropIndicators();
    if (draggedLayer) moveLayerRelative(draggedLayer, { type, id: record.id }, position);
  });
}

function attachLayerSelectionHandlers(node, type, component, record) {
  node.addEventListener("click", (event) => {
    selectComponentLayerTreeNode(component, type, record, isAdditiveSelectClick(event));
  });
  node.addEventListener("keydown", (event) => {
    if (event.target === node && (event.key === "Enter" || event.key === " ")) {
      if (event.key === "Enter" && isComponentTreeLayerSelected(component, type, record.id)) return;
      event.preventDefault();
      selectComponentLayerTreeNode(component, type, record);
    }
  });
}

function isAdditiveSelectClick(event) {
  return event.shiftKey || event.ctrlKey || event.metaKey;
}

function getTreeNodeKey(type, id, componentId = currentComponent?.id) {
  return `${componentId ?? "none"}:${type}:${id}`;
}

function getTextTreeLabel(value, textId) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text || `Text ${textId}`;
}

function getTreeNodeName(type, record, component = currentComponent) {
  if (type === "component") return record.name || "Component";
  if (type === "component-instance") return record.name || `Component instance ${record.id}`;
  if (type === "frame") return record.name || `Frame ${record.id}`;
  if (type === "text") {
    const baseContent = record.element?.textContent ?? record.textContent ?? "";
    const context = component ? getTreeVariantSelectionContext(component) : { mode: "base" };
    const content = context.mode === "variant" && context.variant
      ? resolveVariantTextValue(context.variant, `text:${record.id}`, record.element).textContent
      : baseContent;
    return getTextTreeLabel(content, record.id);
  }
  return record.name || `Vector ${record.id}`;
}

function isComponentTreeLayerSelected(component, type, id) {
  if (component.id !== currentComponent?.id) return false;
  if (type === "component-instance"
    && selectedNestedInstanceLayer?.ownerId === component.id
    && selectedNestedInstanceLayer.instanceId === id) return false;
  if (selectedVariantId !== null) return selectedVariantLayerTargets.has(`${type}:${id}`);
  return isLayerSelected(type, id);
}

function selectComponentLayerTreeNode(component, type, record, additive = false) {
  if (type === "component-instance") selectedNestedInstanceLayer = null;
  const isChangingComponent = component.id !== currentComponent?.id;
  if (isChangingComponent && !activateComponent(component.id, { render: false })) return;
  const activeRecord = getLayerRecord({ type, id: record.id });
  if (!activeRecord) return;
  if (selectedVariantId !== null) {
    const target = `${type}:${activeRecord.id}`;
    const targets = additive ? getSelectedVariantLayerTargets() : [];
    const nextTargets = targets.includes(target)
      ? targets.filter((key) => key !== target) : [...targets, target];
    selectVariantsLayerTargetsState(getSelectedVariantIds(), nextTargets, selectedVariantId);
    expandFramePath(activeRecord.parentId);
    clearMasterSelectionForVariant();
    renderTree();
    return;
  }
  if (type === "component-instance") selectComponentInstance(activeRecord.id, isChangingComponent ? false : additive);
  else if (type === "frame") selectCanvasFrame(activeRecord.element, isChangingComponent ? false : additive);
  else if (type === "text") selectCanvasText(activeRecord.element, isChangingComponent ? false : additive);
  else selectCanvasVector(activeRecord.element, isChangingComponent ? false : additive);
}

function selectTreeNodeForRename(type, record, component) {
  if (type === "component") selectComponentTreeNode(record.id);
  else selectComponentLayerTreeNode(component, type, record);
}

function applyTreeNodeName(type, record, name, component) {
  if (type !== "component") {
    record = getLayerRecord({ type, id: record.id });
    if (!record) return;
  }
  if (type === "component") {
    const previousName = record.name;
    record.name = name;
    record.frameRecord.name = name;
    record.frameRecord.element.setAttribute("aria-label", name);
    if (previousName !== name) renameComponentInstances(record.id, name);
  } else if (type === "text") {
    const context = getTreeVariantSelectionContext(component);
    if (context.mode === "multiple") return;
    if (context.mode === "variant" && context.variant) {
      setVariantTextOverride(context.variant, record.id, name, { render: false });
    } else {
      syncTextRecordContent(record, name);
      applyLayerSizing("text", record);
      if (variantModel.getVariants().length > 0) scheduleVariantRender();
      renderComponentProps();
    }
    requestAnimationFrame(syncResizeOverlay);
  } else {
    record.name = name;
    record.element.setAttribute("aria-label", name);
  }
}

function beginTreeNodeRename(type, record, component) {
  treeRenameState = {
    key: getTreeNodeKey(type, record.id, component.id),
    originalName: getTreeNodeName(type, record, component),
  };
  selectTreeNodeForRename(type, record, component);
}

function getTreeLayerElement(type, record, component) {
  if (type === "component") return component.id === currentComponent?.id ? canvasRootStack : null;
  return record.element;
}

function getWorkspaceLayerEntry(component, type, recordId) {
  if (type === "component") return component.workspace?.componentFrame ?? null;
  return getComponentDefinitionLayer(component.workspace, type, recordId);
}

function getTreeLayerVariantTarget(type, record) {
  return type === "component" ? "component:0" : `${type}:${record.id}`;
}

function getTreeVariantSelectionContext(component) {
  if (component.id !== currentComponent?.id) return { mode: "base", variant: null };
  const selectedVariantIds = getSelectedVariantIds();
  if (selectedVariantIds.length === 0) return { mode: "base", variant: null };
  if (selectedVariantIds.length === 1) {
    return { mode: "variant", variant: getVariant(selectedVariantIds[0]) };
  }
  return { mode: "multiple", variant: null };
}

function getVariantTreeLayerVisibility(variant, type, record, baseVisibility) {
  const target = getTreeLayerVariantTarget(type, record);
  return resolveVariantOperations(variant).reduce((visibility, operation) => (
    operation.target === target && operation.property === "visibility"
      ? variantBoolean(operation.value)
      : visibility
  ), baseVisibility);
}

function getTreeLayerVisibility(type, record, component) {
  if (component.id !== currentComponent?.id) {
    return getWorkspaceLayerEntry(component, type, record.id)?.dataset?.layerVisibility !== "hidden";
  }
  const baseVisibility = isLayerVisible(getTreeLayerElement(type, record, component));
  const context = getTreeVariantSelectionContext(component);
  if (context.mode !== "variant" || !context.variant) return baseVisibility;
  return getVariantTreeLayerVisibility(context.variant, type, record, baseVisibility);
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

function toggleTreeLayerVisibility(type, record, component) {
  const context = getTreeVariantSelectionContext(component);
  if (context.mode === "multiple") return;
  const nextVisibility = getTreeLayerVisibility(type, record, component) ? "hidden" : "visible";
  if (component.id !== currentComponent?.id) {
    const workspaceEntry = getWorkspaceLayerEntry(component, type, record.id);
    if (!workspaceEntry) return;
    workspaceEntry.dataset = { ...workspaceEntry.dataset, layerVisibility: nextVisibility };
    if (record.element instanceof HTMLElement) {
      record.element.dataset.layerVisibility = nextVisibility;
      syncLayerVisibility(record.element);
    }
  } else if (context.mode === "variant" && context.variant) {
    recordHistory();
    upsertLocalVariantOverride(
      context.variant,
      getTreeLayerVariantTarget(type, record),
      "visibility",
      nextVisibility === "visible",
    );
    scheduleVariantRender();
    requestAnimationFrame(syncResizeOverlay);
  } else {
    const element = getTreeLayerElement(type, record, component);
    if (!(element instanceof HTMLElement)) return;
    recordHistory();
    element.dataset.layerVisibility = nextVisibility;
    syncLayerVisibility(element);
    if (typeof syncBooleanComponentPropDefaultsForTarget === "function") {
      const targetType = type === "component" ? "frame" : type;
      const targetId = type === "component" ? component.frameRecord?.id : record.id;
      if (targetId != null) syncBooleanComponentPropDefaultsForTarget(targetType, targetId);
    }
    requestAnimationFrame(syncResizeOverlay);
  }
  renderTree();
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
