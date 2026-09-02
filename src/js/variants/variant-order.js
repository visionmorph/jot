/* Variant preview ordering through pointer and keyboard interactions. */

let variantPointerDrag = null;
let variantOverlayRestoreTimer = null;

function clearVariantReorderIndicators() {
  componentSet?.querySelectorAll(".variant-preview").forEach((preview) => {
    preview.classList.remove("is-variant-dragging", "is-variant-drop-before", "is-variant-drop-after");
    delete preview.dataset.variantDropPosition;
  });
}

function getVariantPointerDrop(previewIds, clientX, clientY) {
  const target = document.elementFromPoint(clientX, clientY)?.closest(".variant-preview");
  if (!(target instanceof HTMLElement) || !componentSet?.contains(target)) return null;
  const targetId = Number(target.dataset.variantInstanceId);
  if (!Number.isFinite(targetId) || previewIds.includes(targetId)) return null;
  const targetInstance = getVariantInstance(targetId);
  if (!targetInstance) return null;
  const bounds = target.getBoundingClientRect();
  const after = clientX >= bounds.left + bounds.width / 2;
  const targetIndex = variantModel.getInstances().indexOf(targetInstance);
  const boundaryIndex = targetIndex + (after ? 1 : 0);
  const selectedBeforeBoundary = variantModel.getInstances()
    .slice(0, boundaryIndex)
    .filter((candidate) => previewIds.includes(candidate.id))
    .length;
  return {
    preview: target,
    position: after ? "after" : "before",
    destinationIndex: boundaryIndex - selectedBeforeBoundary,
  };
}

function updateVariantPointerDrag(event) {
  if (!variantPointerDrag || event.pointerId !== variantPointerDrag.pointerId) return false;
  const distance = Math.hypot(
    event.clientX - variantPointerDrag.startX,
    event.clientY - variantPointerDrag.startY,
  );
  if (!variantPointerDrag.hasStarted && distance < CANVAS_DRAG_THRESHOLD) return false;
  if (!variantPointerDrag.hasStarted) {
    variantPointerDrag.hasStarted = true;
    if (variantOverlayRestoreTimer !== null) {
      clearTimeout(variantOverlayRestoreTimer);
      variantOverlayRestoreTimer = null;
    }
    variantActionOverlay?.classList.add("is-variant-reordering");
    if (canvas instanceof HTMLElement && !canvas.hasPointerCapture(event.pointerId)) {
      canvas.setPointerCapture(event.pointerId);
    }
    componentSet?.querySelectorAll(".variant-preview").forEach((preview) => {
      preview.classList.toggle(
        "is-variant-dragging",
        variantPointerDrag.instanceIds.includes(Number(preview.dataset.variantInstanceId)),
      );
    });
  }
  event.preventDefault();
  event.stopPropagation();
  componentSet?.querySelectorAll(".variant-preview").forEach((preview) => {
    preview.classList.remove("is-variant-drop-before", "is-variant-drop-after");
    delete preview.dataset.variantDropPosition;
  });
  variantPointerDrag.drop = getVariantPointerDrop(
    variantPointerDrag.instanceIds,
    event.clientX,
    event.clientY,
  );
  if (variantPointerDrag.drop) {
    variantPointerDrag.drop.preview.dataset.variantDropPosition = variantPointerDrag.drop.position;
    variantPointerDrag.drop.preview.classList.add(`is-variant-drop-${variantPointerDrag.drop.position}`);
  }
  return true;
}

function finishVariantPointerDrag(event, shouldCommit) {
  if (!variantPointerDrag || event.pointerId !== variantPointerDrag.pointerId) return;
  const pointerDrag = variantPointerDrag;
  if (pointerDrag.hasStarted) updateVariantPointerDrag(event);
  const drop = shouldCommit ? pointerDrag.drop : null;
  variantPointerDrag = null;
  if (canvas?.hasPointerCapture(event.pointerId)) {
    canvas.releasePointerCapture(event.pointerId);
  }
  clearVariantReorderIndicators();
  if (!pointerDrag.hasStarted) {
    if (shouldCommit && pointerDrag.selectOnClick) {
      selectVariantInstance(pointerDrag.instanceId, {
        render: false,
        layerTarget: pointerDrag.clickLayerTarget,
      });
    }
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  suppressCanvasClickForGesture(event);
  const didReorder = drop
    ? reorderVariantInstances(pointerDrag.instanceIds, drop.destinationIndex, pointerDrag.instanceId)
    : false;
  const restoreVariantActionOverlay = () => {
    variantOverlayRestoreTimer = null;
    variantActionOverlay?.classList.remove("is-variant-reordering");
    syncResizeOverlay();
  };
  if (didReorder) {
    variantOverlayRestoreTimer = setTimeout(restoreVariantActionOverlay, CANVAS_REFLOW_DURATION);
  } else {
    requestAnimationFrame(restoreVariantActionOverlay);
  }
}

function bindVariantReorderPointer(preview, instance) {
  preview.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || activeTool !== "select") return;
    if (event.target instanceof HTMLElement && event.target.isContentEditable) return;
    const selectedIds = getSelectedVariantInstanceIds();
    const instanceIds = selectedIds.includes(instance.id) ? selectedIds : [instance.id];
    const clickTarget = resolveVariantCanvasSelectionTarget(event.target);
    if (clickTarget?.kind === "variant-layer") return;
    if (!selectedIds.includes(instance.id)) selectVariantInstance(instance.id, { render: false });
    variantPointerDrag = {
      pointerId: event.pointerId,
      instanceId: instance.id,
      instanceIds: variantModel.getInstances()
        .filter((candidate) => instanceIds.includes(candidate.id))
        .map((candidate) => candidate.id),
      startX: event.clientX,
      startY: event.clientY,
      selectOnClick: selectedIds.length > 1 && selectedIds.includes(instance.id),
      clickLayerTarget: clickTarget?.instanceId === instance.id ? clickTarget.target : null,
      hasStarted: false,
      drop: null,
    };
  });
}

canvas?.addEventListener("pointermove", updateVariantPointerDrag, true);
canvas?.addEventListener("pointerup", (event) => finishVariantPointerDrag(event, true), true);
canvas?.addEventListener("pointercancel", (event) => finishVariantPointerDrag(event, false), true);
canvas?.addEventListener("lostpointercapture", (event) => {
  if (variantPointerDrag?.pointerId === event.pointerId) finishVariantPointerDrag(event, false);
}, true);

function reorderVariantInstances(instanceIds, destinationIndex, focusInstanceId = instanceIds[0]) {
  const selectedIdSet = new Set(instanceIds);
  const movingInstances = variantModel.getInstances().filter((instance) => selectedIdSet.has(instance.id));
  if (movingInstances.length === 0) return false;
  const remainingInstances = variantModel.getInstances().filter((instance) => !selectedIdSet.has(instance.id));
  const nextIndex = Math.max(0, Math.min(remainingInstances.length, destinationIndex));
  const nextInstances = [...remainingInstances];
  nextInstances.splice(nextIndex, 0, ...movingInstances);
  if (nextInstances.every((instance, index) => instance === variantModel.getInstances()[index])) return false;
  const previousPositions = captureCanvasItemPositions(
    Array.from(componentSet?.querySelectorAll(".variant-preview") ?? []),
    (preview) => preview.dataset.variantInstanceId,
  );
  recordHistory();
  variantModel.replaceInstances(nextInstances);
  renderTree();
  requestAnimationFrame(() => {
    animateCanvasItemReflow(
      previousPositions,
      Array.from(componentSet?.querySelectorAll(".variant-preview") ?? []),
      { getKey: (preview) => preview.dataset.variantInstanceId },
    );
    const preview = componentSet?.querySelector(`.variant-preview[data-variant-instance-id="${CSS.escape(String(focusInstanceId))}"]`);
    if (preview instanceof HTMLElement) preview.focus();
  });
  return true;
}

function reorderVariantInstance(instanceId, destinationIndex) {
  const sourceIndex = variantModel.getInstances().findIndex((instance) => instance.id === instanceId);
  if (sourceIndex < 0) return false;
  const selectedIds = getSelectedVariantInstanceIds();
  if (selectedIds.length > 1 && selectedIds.includes(instanceId)) {
    const direction = Math.sign(destinationIndex - sourceIndex);
    if (direction === 0) return false;
    const firstSelectedIndex = variantModel.getInstances().findIndex((instance) => selectedIds.includes(instance.id));
    const currentInsertionIndex = variantModel.getInstances()
      .slice(0, firstSelectedIndex)
      .filter((instance) => !selectedIds.includes(instance.id))
      .length;
    return reorderVariantInstances(selectedIds, currentInsertionIndex + direction, instanceId);
  }
  return reorderVariantInstances([instanceId], destinationIndex, instanceId);
}
