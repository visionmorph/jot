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
  const targetId = Number(target.dataset.variantId);
  if (!Number.isFinite(targetId) || previewIds.includes(targetId)) return null;
  const targetVariant = getVariant(targetId);
  if (!targetVariant) return null;
  const bounds = target.getBoundingClientRect();
  const after = clientX >= bounds.left + bounds.width / 2;
  const targetIndex = variantModel.getVariants().indexOf(targetVariant);
  const boundaryIndex = targetIndex + (after ? 1 : 0);
  const selectedBeforeBoundary = variantModel.getVariants()
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
        variantPointerDrag.variantIds.includes(Number(preview.dataset.variantId)),
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
    variantPointerDrag.variantIds,
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
      selectVariant(pointerDrag.variantId, {
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
    ? reorderVariants(pointerDrag.variantIds, drop.destinationIndex, pointerDrag.variantId)
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

function bindVariantReorderPointer(preview, variant) {
  preview.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || activeTool !== "select") return;
    if (event.target instanceof HTMLElement && event.target.isContentEditable) return;
    const selectedIds = getSelectedVariantIds();
    const additive = event.shiftKey || event.ctrlKey || event.metaKey;
    const variantIds = selectedIds.includes(variant.id) ? selectedIds : [variant.id];
    const clickTarget = resolveVariantCanvasSelectionTarget(event.target);
    if (event.ctrlKey && clickTarget?.kind === "variant-root") return;
    if (clickTarget?.kind === "variant-layer") return;
    if (!additive && !selectedIds.includes(variant.id)) selectVariant(variant.id, { render: false });
    variantPointerDrag = {
      pointerId: event.pointerId,
      variantId: variant.id,
      variantIds: variantModel.getVariants()
        .filter((candidate) => variantIds.includes(candidate.id))
        .map((candidate) => candidate.id),
      startX: event.clientX,
      startY: event.clientY,
      selectOnClick: !additive && selectedIds.length > 1 && selectedIds.includes(variant.id),
      clickLayerTarget: clickTarget?.variantId === variant.id ? clickTarget.target : null,
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

function rebaseProvisionalVariants(previousBase, nextBase, variants) {
  if (variantModel.getProps().length > 0 || !previousBase || !nextBase || previousBase === nextBase) return;
  const effectiveOverrides = new Map();
  getCascadedVariantOverrides(nextBase).forEach((override) => {
    effectiveOverrides.set(`${override.target}\u0000${override.property}`, structuredClone(override));
  });
  nextBase.overrides = Array.from(effectiveOverrides.values());
  nextBase.parentVariantId = null;
  variants.forEach((variant) => {
    if (variant !== nextBase) variant.parentVariantId = nextBase.id;
  });
}

function reorderVariants(variantIds, destinationIndex, focusVariantId = variantIds[0]) {
  const previousBase = getAuthoredDefaultVariant();
  const selectedIdSet = new Set(variantIds);
  const movingVariants = variantModel.getVariants().filter((variant) => selectedIdSet.has(variant.id));
  if (movingVariants.length === 0) return false;
  const remainingVariants = variantModel.getVariants().filter((variant) => !selectedIdSet.has(variant.id));
  const nextIndex = Math.max(0, Math.min(remainingVariants.length, destinationIndex));
  const nextVariants = [...remainingVariants];
  nextVariants.splice(nextIndex, 0, ...movingVariants);
  if (nextVariants.every((variant, index) => variant === variantModel.getVariants()[index])) return false;
  const previousPositions = captureCanvasItemPositions(
    Array.from(componentSet?.querySelectorAll(".variant-preview") ?? []),
    (preview) => preview.dataset.variantId,
  );
  recordHistory();
  variantModel.replaceVariants(nextVariants);
  rebaseProvisionalVariants(previousBase, nextVariants[0], nextVariants);
  renderTree();
  requestAnimationFrame(() => {
    animateCanvasItemReflow(
      previousPositions,
      Array.from(componentSet?.querySelectorAll(".variant-preview") ?? []),
      { getKey: (preview) => preview.dataset.variantId },
    );
    const preview = componentSet?.querySelector(`.variant-preview[data-variant-id="${CSS.escape(String(focusVariantId))}"]`);
    if (preview instanceof HTMLElement) preview.focus();
  });
  return true;
}

function reorderVariant(variantId, destinationIndex) {
  const sourceIndex = variantModel.getVariants().findIndex((variant) => variant.id === variantId);
  if (sourceIndex < 0) return false;
  const selectedIds = getSelectedVariantIds();
  if (selectedIds.length > 1 && selectedIds.includes(variantId)) {
    const direction = Math.sign(destinationIndex - sourceIndex);
    if (direction === 0) return false;
    const firstSelectedIndex = variantModel.getVariants().findIndex((variant) => selectedIds.includes(variant.id));
    const currentInsertionIndex = variantModel.getVariants()
      .slice(0, firstSelectedIndex)
      .filter((variant) => !selectedIds.includes(variant.id))
      .length;
    return reorderVariants(selectedIds, currentInsertionIndex + direction, variantId);
  }
  return reorderVariants([variantId], destinationIndex, variantId);
}

function reorderSelectedVariants(step = 0, edge = null) {
  const variants = variantModel.getVariants();
  const selectedIds = getSelectedVariantIds();
  if (selectedIds.length === 0) return false;
  const destinationIndex = getCollectionReorderIndex(
    variants,
    selectedIds,
    step,
    edge,
    (variant) => variant.id,
  );
  if (destinationIndex === null) return false;
  return reorderVariants(selectedIds, destinationIndex, selectedVariantId ?? selectedIds[0]);
}
