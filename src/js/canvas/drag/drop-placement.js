/* Determines canvas drop targets, insertion positions, and nesting decisions. */

function getVariantPreviewRoot(variantId) {
  const preview = componentSet?.querySelector(
    `.variant-preview[data-variant-id="${CSS.escape(String(variantId))}"]`,
  );
  const root = preview?.querySelector(".canvas-root-stack");
  return root instanceof HTMLElement ? root : null;
}

function getCanvasLayerElement(layer, variantId = null) {
  if (variantId === null) return getLayerRecord(layer)?.element ?? null;
  const root = getVariantPreviewRoot(variantId);
  return root ? findVariantTarget(root, getLayerDescriptorKey(layer)) : null;
}

function getCanvasParentElement(parentId, variantId = null) {
  if (variantId !== null) {
    const root = getVariantPreviewRoot(variantId);
    if (!root) return null;
    return parentId === null ? root : findVariantTarget(root, `frame:${parentId}`);
  }
  return parentId === null ? canvasRootStack : getFrameRecord(parentId)?.element ?? null;
}

function canMoveCanvasLayerToParent(layer, parentId) {
  return layer.type !== "frame" || parentId === null || canNestFrame(layer.id, parentId);
}

function getCanvasInsertionIndex(parentId, draggedLayers, clientX, clientY, variantId = null) {
  const parentElement = getCanvasParentElement(parentId, variantId);
  if (!(parentElement instanceof HTMLElement)) return 0;
  const isVertical = parentElement.dataset.direction === "vertical";
  const pointerPosition = isVertical ? clientY : clientX;
  const siblings = getLayerChildren(parentId).filter(
    (sibling) => !isCanvasDraggedLayer({ type: sibling.type, id: sibling.record.id }, draggedLayers),
  );

  const insertionIndex = siblings.findIndex((sibling) => {
    const element = getCanvasLayerElement(
      { type: sibling.type, id: sibling.record.id },
      variantId,
    );
    if (!(element instanceof HTMLElement)) return false;
    const bounds = element.getBoundingClientRect();
    const midpoint = isVertical
      ? bounds.top + bounds.height / 2
      : bounds.left + bounds.width / 2;
    return pointerPosition < midpoint;
  });
  return insertionIndex < 0 ? siblings.length : insertionIndex;
}

function getCanvasDropIntent(event, draggedLayersInput, variantId = null) {
  if (!(canvasRootStack instanceof HTMLElement)) return null;
  const draggedLayers = normalizeCanvasDraggedLayers(draggedLayersInput);
  if (draggedLayers.length === 0) return null;
  const hit = resolveCanvasHit(event.target);
  const expectedLayerKind = variantId === null ? "layer" : "variant-layer";
  const expectedRootKind = variantId === null ? "component-root" : "variant-root";
  const hitMatchesContext = hit.kind === expectedLayerKind
    && (variantId === null || hit.variantId === variantId);
  const targetElement = hitMatchesContext ? hit.element : null;
  const targetLayer = hitMatchesContext ? hit.layer : null;

  if (targetLayer && isCanvasDraggedLayer(targetLayer, draggedLayers)) return null;

  if (targetElement && targetLayer) {
    const targetBounds = targetElement.getBoundingClientRect();
    const horizontalRatio = targetBounds.width > 0 ? (event.clientX - targetBounds.left) / targetBounds.width : 0.5;
    const verticalRatio = targetBounds.height > 0 ? (event.clientY - targetBounds.top) / targetBounds.height : 0.5;
    const isCurrentParent = targetLayer.type === "frame"
      && draggedLayers.every((layer) => getLayerParentId(layer) === targetLayer.id);
    if (isCurrentParent) {
      const targetIndex = getCanvasInsertionIndex(
        targetLayer.id,
        draggedLayers,
        event.clientX,
        event.clientY,
        variantId,
      );
      return {
        parentId: targetLayer.id,
        targetIndex,
        mode: "within",
        targetElement: null,
        key: `${targetLayer.id}:${targetIndex}:within`,
      };
    }
    const canNestInside = targetLayer.type === "frame"
      && draggedLayers.every((layer) => layer.type !== "frame")
      && horizontalRatio >= 0.25
      && horizontalRatio <= 0.75
      && verticalRatio >= 0.25
      && verticalRatio <= 0.75
      && draggedLayers.every((layer) => canMoveCanvasLayerToParent(layer, targetLayer.id));

    if (canNestInside) {
      const targetIndex = getLayerChildren(targetLayer.id).filter(
        (sibling) => !isCanvasDraggedLayer({ type: sibling.type, id: sibling.record.id }, draggedLayers),
      ).length;
      return {
        parentId: targetLayer.id,
        targetIndex,
        mode: "inside",
        targetElement,
        key: `${targetLayer.id}:${targetIndex}:inside`,
      };
    }

    const parentId = getLayerParentId(targetLayer);
    if (!draggedLayers.every((layer) => canMoveCanvasLayerToParent(layer, parentId))) return null;
    const parentElement = getCanvasParentElement(parentId, variantId);
    const isVertical = parentElement?.dataset.direction === "vertical";
    const targetRatio = isVertical ? verticalRatio : horizontalRatio;
    const siblings = getLayerChildren(parentId).filter(
      (sibling) => !isCanvasDraggedLayer({ type: sibling.type, id: sibling.record.id }, draggedLayers),
    );
    const targetIndex = siblings.findIndex(
      (sibling) => sibling.type === targetLayer.type && sibling.record.id === targetLayer.id,
    );
    if (targetIndex < 0) return null;
    const mode = targetRatio < 0.5 ? "before" : "after";
    const insertionIndex = targetIndex + (mode === "after" ? 1 : 0);
    return {
      parentId,
      targetIndex: insertionIndex,
      mode,
      targetElement,
      key: `${parentId ?? "root"}:${insertionIndex}:${mode}`,
    };
  }

  const parentElement = hit.kind === expectedRootKind
    && (variantId === null || hit.variantId === variantId)
    ? hit.element
    : event.target instanceof Element
      ? event.target.closest(".canvas-frame, [data-canvas-root-stack]")
      : null;
  if (variantId !== null && !getVariantPreviewRoot(variantId)?.contains(parentElement)) return null;
  const parentId = parentElement instanceof HTMLElement && parentElement.classList.contains("canvas-frame")
    ? Number(parentElement.dataset.frameId)
    : null;
  if (!draggedLayers.every((layer) => canMoveCanvasLayerToParent(layer, parentId))) return null;
  const targetIndex = getCanvasInsertionIndex(
    parentId,
    draggedLayers,
    event.clientX,
    event.clientY,
    variantId,
  );
  return {
    parentId,
    targetIndex,
    mode: "inside",
    targetElement: getCanvasParentElement(parentId, variantId),
    key: `${parentId ?? "root"}:${targetIndex}:inside`,
  };
}
