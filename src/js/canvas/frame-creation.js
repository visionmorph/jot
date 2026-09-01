/* Canvas frame creation and frame interaction wiring. */

function createCanvasFrame(x, y, parentRecord = null, options = {}) {
  return runCanvasMutation(
    () => createCanvasFrameRecord(x, y, parentRecord, options),
    { history: options.recordHistory !== false },
  );
}

function createCanvasFrameRecord(x, y, parentRecord = null, options = {}) {
  if (!(canvas instanceof HTMLElement)) return;

  const frameId = nextFrameId;
  nextFrameId += 1;
  const frame = document.createElement("div");
  const record = {
    id: frameId,
    parentId: parentRecord?.isComponent ? null : parentRecord?.id ?? null,
    element: frame,
    order: nextLayerOrder,
    name: `Frame ${frameId}`,
  };
  nextLayerOrder += 1;

  frame.className = "canvas-frame";
  frame.draggable = true;
  frame.tabIndex = -1;
  frame.dataset.frameId = String(frameId);
  frame.setAttribute("aria-label", `Frame ${frameId}`);
  frame.setAttribute("aria-selected", "false");
  frame.dataset.paddingLeft = "10";
  frame.dataset.paddingTop = "10";
  frame.dataset.paddingRight = "10";
  frame.dataset.paddingBottom = "10";
  frame.dataset.width = "100";
  frame.dataset.height = "100";
  frame.dataset.widthMode = "fixed";
  frame.dataset.heightMode = "fixed";
  frame.dataset.radius = "0";
  frame.dataset.frameColor = "";
  frame.dataset.frameColorOpacity = "100";
  frame.dataset.direction = "horizontal";
  frame.dataset.alignment = "top-left";
  frame.dataset.gap = "10";
  frame.dataset.gapMode = "fixed";
  frame.dataset.outlineColor = "";
  frame.dataset.outlineColorOpacity = "100";
  frame.dataset.outlinePosition = "inside";
  frame.dataset.outlineWeight = "1";
  frame.dataset.htmlTag = "div";
  frame.dataset.layerVisibility = "visible";
  frame.style.width = "100px";
  frame.style.height = "100px";
  frame.style.backgroundColor = "";
  if (parentRecord) {
    frame.style.left = "";
    frame.style.top = "";
  } else {
    frame.style.left = `${x}px`;
    frame.style.top = `${y}px`;
  }

  frame.addEventListener("click", (event) => {
    event.stopPropagation();
    const hit = resolveCanvasHit(event.target);
    if (hit.kind !== "layer" || hit.element !== frame || !hit.direct) return;

    if (consumeSuppressedCanvasClick(event)) return;

    if (activeTool === "text") {
      const frameBounds = frame.getBoundingClientRect();
      createCanvasText(record, event.clientX - frameBounds.left, event.clientY - frameBounds.top);
      return;
    }

    if (activeTool === "frame") {
      createCanvasFrame(0, 0, record);
      expandedFrameIds.add(record.id);
      selectTool("select");
      return;
    }

    selectCanvasFrame(frame, event.shiftKey || event.ctrlKey || event.metaKey);
  });
  frame.addEventListener("dragstart", (event) => {
    event.stopPropagation();
    setLayerDragData(event, "frame", frameId);
    startCanvasDragSession({ type: "frame", id: frameId }, true);
  });

  frameRecords.push(record);
  if (parentRecord) {
    parentRecord.element.append(frame);
    if (!parentRecord.isComponent) expandedFrameIds.add(parentRecord.id);
  } else {
    if (canvasRootStack instanceof HTMLElement) canvasRootStack.append(frame);
    else canvas.insertBefore(frame, toolbar);
  }
  applyFrameAlignment(frame);
  applyFrameOutline(frame);
  queueCanvasMutationEffects({ sizing: true, tree: true });
  if (options.select !== false) selectCanvasFrame(frame);
  return record;
}
