/* Canvas vector creation and vector interaction wiring. */

function createCanvasVector(svgDefinition, x, y, parentRecord = null, options = {}) {
  return runCanvasMutation(
    () => createCanvasVectorRecord(svgDefinition, x, y, parentRecord, options),
    { history: options.recordHistory !== false },
  );
}

function createCanvasVectorRecord(svgDefinition, x, y, parentRecord = null, options = {}) {
  if (!(canvas instanceof HTMLElement)) return;

  const vectorId = nextVectorId;
  nextVectorId += 1;
  const vector = document.createElement("div");
  const width = Math.max(MIN_INTERACTIVE_LAYER_SIZE, Number(svgDefinition.width) || 24);
  const height = Math.max(MIN_INTERACTIVE_LAYER_SIZE, Number(svgDefinition.height) || 24);
  const record = {
    id: vectorId,
    parentFrameId: parentRecord?.isComponent ? null : parentRecord?.id ?? null,
    element: vector,
    order: nextLayerOrder,
    name: svgDefinition.name || `Vector ${vectorId}`,
    svgSource: svgDefinition.source,
    originalSvgSource: svgDefinition.source,
  };
  nextLayerOrder += 1;

  vector.className = "canvas-vector";
  vector.draggable = true;
  vector.tabIndex = -1;
  vector.dataset.vectorId = String(vectorId);
  vector.dataset.width = String(width);
  vector.dataset.height = String(height);
  vector.dataset.widthMode = "fixed";
  vector.dataset.heightMode = "fixed";
  vector.dataset.layerVisibility = "visible";
  vector.setAttribute("aria-label", record.name);
  vector.setAttribute("aria-selected", "false");
  vector.append(createCanvasSvg(record.svgSource));

  if (parentRecord) {
    parentRecord.element.append(vector);
    if (!parentRecord.isComponent) expandedFrameIds.add(parentRecord.id);
  } else {
    canvasRootStack?.append(vector);
  }

  vector.addEventListener("click", (event) => {
    event.stopPropagation();
    const hit = resolveCanvasHit(event.target);
    if (hit.kind !== "layer" || hit.element !== vector) return;
    if (consumeSuppressedCanvasClick(event)) return;
    selectCanvasVector(vector, event.shiftKey || event.ctrlKey || event.metaKey);
  });
  vector.addEventListener("dragstart", (event) => {
    event.stopPropagation();
    setLayerDragData(event, "vector", vectorId);
    startCanvasDragSession({ type: "vector", id: vectorId }, true);
  });

  vectorRecords.push(record);
  vector.dataset.vectorColor = getVectorRenderedColor(record);
  vector.dataset.vectorColorOpacity = "100";
  queueCanvasMutationEffects({ sizing: true, tree: true });
  if (options.select !== false) selectCanvasVector(vector);
  return record;
}
