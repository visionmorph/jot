/* Determines canvas drop targets, insertion positions, and nesting decisions. */

function getVariantPreviewRoot(instanceId) {
  const preview = componentSet?.querySelector(
    `.variant-preview[data-variant-instance-id="${CSS.escape(String(instanceId))}"]`,
  );
  const root = preview?.querySelector(".canvas-root-stack");
  return root instanceof HTMLElement ? root : null;
}

function getCanvasLayerElement(layer, variantInstanceId = null) {
  if (variantInstanceId === null) return getLayerRecord(layer)?.element ?? null;
  const root = getVariantPreviewRoot(variantInstanceId);
  return root ? findVariantTarget(root, getLayerDescriptorKey(layer)) : null;
}

function getCanvasParentElement(parentFrameId, variantInstanceId = null) {
  if (variantInstanceId !== null) {
    const root = getVariantPreviewRoot(variantInstanceId);
    if (!root) return null;
    return parentFrameId === null ? root : findVariantTarget(root, `frame:${parentFrameId}`);
  }
  return parentFrameId === null ? canvasRootStack : getFrameRecord(parentFrameId)?.element ?? null;
}

function canMoveCanvasLayerToParent(layer, parentFrameId) {
  return layer.type !== "frame" || parentFrameId === null || canNestFrame(layer.id, parentFrameId);
}

function getCanvasInsertionIndex(parentFrameId, draggedLayers, clientX, clientY, variantInstanceId = null) {
  const parentElement = getCanvasParentElement(parentFrameId, variantInstanceId);
  if (!(parentElement instanceof HTMLElement)) return 0;
  const isVertical = parentElement.dataset.direction === "vertical";
  const pointerPosition = isVertical ? clientY : clientX;
  const siblings = getLayerChildren(parentFrameId).filter(
    (sibling) => !isCanvasDraggedLayer({ type: sibling.type, id: sibling.record.id }, draggedLayers),
  );

  const insertionIndex = siblings.findIndex((sibling) => {
    const element = getCanvasLayerElement(
      { type: sibling.type, id: sibling.record.id },
      variantInstanceId,
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

function getCanvasDropIntent(event, draggedLayersInput, variantInstanceId = null) {
  if (!(canvasRootStack instanceof HTMLElement)) return null;
  const draggedLayers = normalizeCanvasDraggedLayers(draggedLayersInput);
  if (draggedLayers.length === 0) return null;
  const hit = resolveCanvasHit(event.target);
  const expectedLayerKind = variantInstanceId === null ? "layer" : "variant-layer";
  const expectedRootKind = variantInstanceId === null ? "component-root" : "variant-root";
  const hitMatchesContext = hit.kind === expectedLayerKind
    && (variantInstanceId === null || hit.instanceId === variantInstanceId);
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
        variantInstanceId,
      );
      return {
        parentFrameId: targetLayer.id,
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
        parentFrameId: targetLayer.id,
        targetIndex,
        mode: "inside",
        targetElement,
        key: `${targetLayer.id}:${targetIndex}:inside`,
      };
    }

    const parentFrameId = getLayerParentId(targetLayer);
    if (!draggedLayers.every((layer) => canMoveCanvasLayerToParent(layer, parentFrameId))) return null;
    const parentElement = getCanvasParentElement(parentFrameId, variantInstanceId);
    const isVertical = parentElement?.dataset.direction === "vertical";
    const targetRatio = isVertical ? verticalRatio : horizontalRatio;
    const siblings = getLayerChildren(parentFrameId).filter(
      (sibling) => !isCanvasDraggedLayer({ type: sibling.type, id: sibling.record.id }, draggedLayers),
    );
    const targetIndex = siblings.findIndex(
      (sibling) => sibling.type === targetLayer.type && sibling.record.id === targetLayer.id,
    );
    if (targetIndex < 0) return null;
    const mode = targetRatio < 0.5 ? "before" : "after";
    const insertionIndex = targetIndex + (mode === "after" ? 1 : 0);
    return {
      parentFrameId,
      targetIndex: insertionIndex,
      mode,
      targetElement,
      key: `${parentFrameId ?? "root"}:${insertionIndex}:${mode}`,
    };
  }

  const parentElement = hit.kind === expectedRootKind
    && (variantInstanceId === null || hit.instanceId === variantInstanceId)
    ? hit.element
    : event.target instanceof Element
      ? event.target.closest(".canvas-frame, [data-canvas-root-stack]")
      : null;
  if (variantInstanceId !== null && !getVariantPreviewRoot(variantInstanceId)?.contains(parentElement)) return null;
  const parentFrameId = parentElement instanceof HTMLElement && parentElement.classList.contains("canvas-frame")
    ? Number(parentElement.dataset.frameId)
    : null;
  if (!draggedLayers.every((layer) => canMoveCanvasLayerToParent(layer, parentFrameId))) return null;
  const targetIndex = getCanvasInsertionIndex(
    parentFrameId,
    draggedLayers,
    event.clientX,
    event.clientY,
    variantInstanceId,
  );
  return {
    parentFrameId,
    targetIndex,
    mode: "inside",
    targetElement: getCanvasParentElement(parentFrameId, variantInstanceId),
    key: `${parentFrameId ?? "root"}:${targetIndex}:inside`,
  };
}
