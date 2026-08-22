/* Application initialization, global shortcuts, and startup rendering. */

document.addEventListener("keydown", (event) => {
  const shortcutTarget = event.target;
  const isContentEditing = shortcutTarget instanceof HTMLElement && shortcutTarget.isContentEditable;
  const isFormEditing =
    shortcutTarget instanceof HTMLInputElement ||
    shortcutTarget instanceof HTMLTextAreaElement ||
    shortcutTarget instanceof HTMLSelectElement ||
    (shortcutTarget instanceof HTMLElement && Boolean(shortcutTarget.closest(".props-panel")));
  const isCommandShortcut = event.ctrlKey || event.metaKey;

  if (isCommandShortcut && event.key.toLowerCase() === "z" && !isContentEditing) {
    event.preventDefault();
    if (event.shiftKey) redoWorkspaceChange();
    else undoWorkspaceChange();
    return;
  }

  if (isCommandShortcut && event.key.toLowerCase() === "d" && !isContentEditing && !isFormEditing) {
    event.preventDefault();
    duplicateSelectedLayer();
    return;
  }

  if (event.key === "Escape") {
    const activeText = document.activeElement instanceof HTMLElement && document.activeElement.classList.contains("canvas-text")
      ? document.activeElement
      : null;
    selectTool("select");
    if (activeText) {
      if ((activeText.textContent ?? "").length > 0) selectCanvasText(activeText);
      activeText.blur();
    } else if (selectedCanvasText) {
      clearLayerSelection();
    }
    return;
  }

  const isTyping =
    shortcutTarget instanceof HTMLInputElement ||
    shortcutTarget instanceof HTMLTextAreaElement ||
    shortcutTarget instanceof HTMLSelectElement ||
    (shortcutTarget instanceof HTMLElement && (shortcutTarget.isContentEditable || Boolean(shortcutTarget.closest(".props-panel"))));
  const lowerKey = event.key.toLowerCase();

  if (!isTyping && event.shiftKey && !isCommandShortcut && !event.altKey && lowerKey === "a") {
    event.preventDefault();
    wrapSelectedLayersInFrame();
    return;
  }

  if (!isTyping && event.key === "Tab" && !isCommandShortcut && !event.altKey) {
    if (getPrimaryLayerDescriptor()) {
      event.preventDefault();
      selectSiblingLayer(event.shiftKey ? -1 : 1);
      return;
    }
  }

  if (!isTyping && event.key === "Enter" && !isCommandShortcut && !event.altKey) {
    const didSelect = event.shiftKey ? selectHierarchyParent() : selectHierarchyChild();
    if (didSelect) event.preventDefault();
    return;
  }

  if (!isTyping && event.key === "\\" && !isCommandShortcut && !event.altKey) {
    if (selectHierarchyParent()) event.preventDefault();
    return;
  }

  if (!isTyping && /^[0-9]$/.test(event.key) && !isCommandShortcut && !event.shiftKey && !event.altKey) {
    if (selectedComponentId !== null || selectedLayerKeys.size > 0) {
      event.preventDefault();
      setSelectedLayersOpacity(event.key === "0" ? 100 : Number(event.key) * 10);
      return;
    }
  }

  if (!isTyping && (event.key === "]" || event.key === "[") && !event.altKey) {
    const hasLayerSelection = Boolean(getPrimaryLayerDescriptor() && selectedComponentId === null);
    if (hasLayerSelection) {
      event.preventDefault();
      if (isCommandShortcut) reorderPrimaryLayer(event.key === "]" ? 1 : -1);
      else if (!event.shiftKey) reorderPrimaryLayer(0, event.key === "]" ? "front" : "back");
      return;
    }
  }

  if (!isTyping && ["ArrowLeft", "ArrowUp", "ArrowRight", "ArrowDown"].includes(event.key)
    && !isCommandShortcut && !event.shiftKey && !event.altKey) {
    const layer = getPrimaryLayerDescriptor();
    if (layer && layer.type !== "component") {
      event.preventDefault();
      const step = event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1;
      reorderPrimaryLayer(step);
    }
    return;
  }

  const toolShortcut = {
    v: "select",
    t: "text",
    f: "frame",
    a: "frame",
  }[lowerKey];

  if (!isTyping && toolShortcut && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey) {
    event.preventDefault();
    selectTool(toolShortcut);
    return;
  }

  if (event.key !== "Delete" && event.key !== "Backspace") return;

  const target = event.target;
  if (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && (target.isContentEditable || Boolean(target.closest(".props-panel"))))
  ) return;

  if (selectedComponentId !== null) {
    event.preventDefault();
    deleteSelectedComponent();
    return;
  }

  if (selectedLayerKeys.size === 0) return;

  event.preventDefault();
  recordHistory();
  const frameIdsToDelete = new Set();
  const textIdsToDelete = new Set();
  const vectorIdsToDelete = new Set();
  selectedLayerKeys.forEach((key) => {
    const [type, rawId] = key.split(":");
    const id = Number(rawId);
    if (type === "frame") {
      collectFrameAndDescendantIds(id).forEach((frameId) => frameIdsToDelete.add(frameId));
    } else if (type === "text") textIdsToDelete.add(id);
    else if (type === "vector") vectorIdsToDelete.add(id);
  });
  textRecords.forEach((record) => {
    if (record.parentFrameId !== null && frameIdsToDelete.has(record.parentFrameId)) {
      textIdsToDelete.add(record.id);
    }
  });
  vectorRecords.forEach((record) => {
    if (record.parentFrameId !== null && frameIdsToDelete.has(record.parentFrameId)) {
      vectorIdsToDelete.add(record.id);
    }
  });

  frameRecords.forEach((record) => {
    if (frameIdsToDelete.has(record.id)) record.element.remove();
  });
  textRecords.forEach((record) => {
    if (textIdsToDelete.has(record.id)) record.element.remove();
  });
  vectorRecords.forEach((record) => {
    if (vectorIdsToDelete.has(record.id)) record.element.remove();
  });
  frameRecords = frameRecords.filter((record) => !frameIdsToDelete.has(record.id));
  textRecords = textRecords.filter((record) => !textIdsToDelete.has(record.id));
  vectorRecords = vectorRecords.filter((record) => !vectorIdsToDelete.has(record.id));
  frameIdsToDelete.forEach((frameId) => expandedFrameIds.delete(frameId));
  selectedLayerKeys.clear();
  selectedCanvasFrame = null;
  selectedCanvasText = null;
  selectedCanvasVector = null;
  syncElementSelectionStyles();
  renderTree();
});

initializeComponents();

loadGoogleFont(DEFAULT_FONT_FAMILY, DEFAULT_FONT_WEIGHT);

loadGoogleFont(DEFAULT_FONT_FAMILY, 600);

loadGoogleFont("JetBrains Mono", 400);

loadFontCatalog();

renderTree();
