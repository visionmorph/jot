/* Shared inspector helpers and inspector panel coordination. */

function normalizeFrameAlignment(value) {
  const alignments = [
    "top-left", "top-center", "top-right",
    "center-left", "center", "center-right",
    "bottom-left", "bottom-center", "bottom-right",
  ];
  return alignments.includes(value) ? value : "top-left";
}

function cssColorToHex(value) {
  const normalized = String(value || "").trim();
  const hexMatch = normalized.match(/^#([\da-f]{3}|[\da-f]{6})$/i);
  if (hexMatch) {
    const hex = hexMatch[1];
    return `#${hex.length === 3 ? [...hex].map((character) => character.repeat(2)).join("") : hex}`.toLowerCase();
  }
  const colorValues = normalized.match(/[\d.]+/g);
  if (!colorValues || colorValues.length < 3) return null;
  const [red, green, blue] = colorValues.slice(0, 3).map((channel) => Math.max(0, Math.min(255, Math.round(Number(channel)))));
  return `#${[red, green, blue].map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

function updateInspector() {
  const nestedSelection = getSelectedNestedInstanceLayer();
  document.querySelectorAll(".is-instance-child-selected").forEach(element => element.classList.remove("is-instance-child-selected"));
  if (nestedSelection) {
    nestedSelection.element.classList.add("is-instance-child-selected");
    componentInstanceInspector.hidden = true;
    const type = nestedSelection.target.type;
    const isText = type === "text";
    const isFrame = type === "frame";
    const isVector = type === "vector";
    const isComponentInstance = type === "component-instance";
    pageInspector.hidden = true;
    frameInspector.hidden = !isFrame && !isComponentInstance;
    textInspector.hidden = !isText;
    vectorInspector.hidden = !isVector;
    frameInspector.inert = isFrame || isComponentInstance;
    vectorInspector.inert = isVector;
    frameInspector.classList.toggle("is-instance-inspector", isComponentInstance);
    if (isComponentInstance) syncNestedComponentInstanceHeading(nestedSelection);
    if (isText) syncInspectorToSelectedText();
    if (isFrame) syncInspectorToSelectedFrame();
    if (isVector) syncInspectorToSelectedVector();
    if (isComponentInstance && getSelectedFrameRecord()) syncInspectorToSelectedFrame();
    syncSelectionColorControls(false, false, false);
    requestAnimationFrame(syncResizeOverlay);
    return;
  }
  frameInspector.inert = false;
  vectorInspector.inert = false;
  const instanceSelected = syncComponentInstanceInspector();
  frameInspector.classList.toggle("is-instance-inspector", instanceSelected);
  if (instanceSelected) {
    [pageInspector, textInspector, vectorInspector].forEach(panel => { if (panel) panel.hidden = true; });
    frameInspector.hidden = false;
    syncInspectorToSelectedFrame();
    syncSelectionColorControls(false, false, false);
    requestAnimationFrame(syncResizeOverlay);
    return;
  }
  const isVariantSelected = selectedVariantId !== null;
  const variantTargetType = isVariantSelected ? getVariantTargetType(selectedVariantLayerTarget) : null;
  const isVariantTextSelected = variantTargetType === "text";
  const isVariantFrameSelected = variantTargetType === "frame";
  const isVariantVectorSelected = variantTargetType === "vector";
  const isComponentSelected = selectedComponentId === currentComponent?.id
    || (isVariantSelected && selectedVariantLayerTarget === null);
  const isTextSelected = isVariantTextSelected || (!isComponentSelected && selectedCanvasText !== null);
  const isFrameSelected = isComponentSelected || isVariantFrameSelected || selectedCanvasFrame !== null;
  const isVectorSelected = isVariantVectorSelected || (!isComponentSelected && selectedCanvasVector !== null);
  if (pageInspector instanceof HTMLElement) pageInspector.hidden = isTextSelected || isFrameSelected || isVectorSelected;
  if (frameInspector instanceof HTMLElement) frameInspector.hidden = !isFrameSelected;
  if (textInspector instanceof HTMLElement) textInspector.hidden = !isTextSelected;
  if (vectorInspector instanceof HTMLElement) vectorInspector.hidden = !isVectorSelected;
  if (isTextSelected) syncInspectorToSelectedText();
  if (isFrameSelected) syncInspectorToSelectedFrame();
  if (isVectorSelected) syncInspectorToSelectedVector();
  syncSelectionColorControls(isFrameSelected, isTextSelected, isVectorSelected);
  if (!isVariantSelected && !isTextSelected && !isFrameSelected && !isVectorSelected && colorPicker instanceof HTMLInputElement) {
    syncCustomColorControl(colorPicker, canvasColorValue, canvasColorOpacity);
  }
  requestAnimationFrame(syncResizeOverlay);
}
