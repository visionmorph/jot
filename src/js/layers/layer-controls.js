/* Layers sidebar expansion, selection, rename, visibility, and drag controls. */

let treeRenameState = null;
let lastTreeLabelPointer = { key: null, time: 0 };

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
  if ((type !== "frame" && type !== "text" && type !== "vector") || !Number.isInteger(id)) return null;
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

function getTreeNodeName(type, record) {
  if (type === "component") return record.name || "Component";
  if (type === "frame") return record.name || `Frame ${record.id}`;
  if (type === "text") return record.name || record.element.textContent || "Text";
  return record.name || `Vector ${record.id}`;
}

function isComponentTreeLayerSelected(component, type, id) {
  if (component.id !== currentComponent?.id) return false;
  if (selectedVariantInstanceId !== null) return selectedVariantLayerTargets.has(`${type}:${id}`);
  return isLayerSelected(type, id);
}

function syncLayerTreeSelectionStyles() {
  document.querySelectorAll(".tree-node[data-selection-component-id]").forEach((node) => {
    if (!(node instanceof HTMLElement)) return;
    const componentId = Number(node.dataset.selectionComponentId);
    const layerKey = node.dataset.selectionLayerKey || null;
    const isSelected = layerKey
      ? componentId === currentComponent?.id && (selectedVariantInstanceId !== null
        ? selectedVariantLayerTargets.has(layerKey) : selectedLayerKeys.has(layerKey))
      : selectedComponentId === componentId;
    node.classList.toggle("is-selected", isSelected);
    node.setAttribute("aria-selected", String(isSelected));
  });
}

function selectComponentLayerTreeNode(component, type, record, additive = false) {
  const isChangingComponent = component.id !== currentComponent?.id;
  if (isChangingComponent && !activateComponent(component.id, { render: false })) return;
  const activeRecord = type === "frame" ? getFrameRecord(record.id)
    : type === "text" ? getTextRecord(record.id) : getVectorRecord(record.id);
  if (!activeRecord) return;
  if (selectedVariantInstanceId !== null) {
    const target = `${type}:${activeRecord.id}`;
    const targets = additive ? getSelectedVariantLayerTargets() : [];
    const nextTargets = targets.includes(target)
      ? targets.filter((key) => key !== target) : [...targets, target];
    selectVariantInstancesLayerTargetsState(getSelectedVariantInstanceIds(), nextTargets, selectedVariantInstanceId);
    expandFramePath(type === "frame" ? activeRecord.parentId : activeRecord.parentFrameId);
    clearMasterSelectionForVariant();
    renderTree();
    return;
  }
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
  } else if (type === "text") {
    syncTextRecordContent(record, name);
    applyLayerSizing("text", record);
    if (variantModel.getInstances().length > 0) scheduleVariantInstanceRender();
    requestAnimationFrame(syncResizeOverlay);
    renderComponentProps();
  } else {
    record.name = name;
    record.element.setAttribute("aria-label", name);
  }
}

function beginTreeNodeRename(type, record, component) {
  treeRenameState = { key: getTreeNodeKey(type, record.id, component.id), originalName: getTreeNodeName(type, record) };
  selectTreeNodeForRename(type, record, component);
}

function getTreeLayerElement(type, record, component) {
  if (type === "component") return component.id === currentComponent?.id ? canvasRootStack : null;
  return record.element;
}

function getWorkspaceLayerEntry(component, type, recordId) {
  if (type === "component") return component.workspace?.componentFrame ?? null;
  const entries = type === "frame" ? component.workspace?.frames
    : type === "text" ? component.workspace?.texts : component.workspace?.vectors;
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

function toggleTreeLayerVisibility(type, record, component) {
  const nextVisibility = getTreeLayerVisibility(type, record, component) ? "hidden" : "visible";
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
