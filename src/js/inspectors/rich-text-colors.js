/* Character-range selection and inline color-run helpers for canvas text. */

let activeTextRangeSelection = null;
let textRangeInspectorFrame = null;
let isTextSelectionPointerGesture = false;
let hasPendingTextRangeInspectorSync = false;
const textColorPickerHighlightName = "text-color-picker-selection";

function createTextRangeFromOffsets(element, start, end) {
  if (!(element instanceof HTMLElement) || start < 0 || start >= end) return null;
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  let position = 0;
  let startPoint = null;
  let endPoint = null;
  let node = walker.nextNode();
  while (node) {
    const nodeEnd = position + node.data.length;
    if (!startPoint && start >= position && start <= nodeEnd) {
      startPoint = { node, offset: start - position };
    }
    if (end >= position && end <= nodeEnd) {
      endPoint = { node, offset: end - position };
      break;
    }
    position = nodeEnd;
    node = walker.nextNode();
  }
  if (!startPoint || !endPoint) return null;
  const range = document.createRange();
  range.setStart(startPoint.node, startPoint.offset);
  range.setEnd(endPoint.node, endPoint.offset);
  return range;
}

function showTextColorPickerRangeHighlight(rangeSelection) {
  if (!rangeSelection || !("highlights" in CSS) || typeof Highlight !== "function") return;
  const range = createTextRangeFromOffsets(
    rangeSelection.element,
    rangeSelection.start,
    rangeSelection.end,
  );
  if (!range) return;
  CSS.highlights.set(textColorPickerHighlightName, new Highlight(range));
}

function clearTextColorPickerRangeHighlight() {
  CSS.highlights?.delete(textColorPickerHighlightName);
}

function getTextOffsetWithinElement(element, node, offset) {
  try {
    const range = document.createRange();
    range.selectNodeContents(element);
    range.setEnd(node, offset);
    return range.toString().length;
  } catch {
    return null;
  }
}

function getActiveTextRangeSelection(record = getSelectedTextRecord()) {
  if (!record || !activeTextRangeSelection || activeTextRangeSelection.element !== record.element) return null;
  const length = record.element.textContent?.length ?? 0;
  if (!record.element.isConnected
    || activeTextRangeSelection.start < 0
    || activeTextRangeSelection.end > length
    || activeTextRangeSelection.start >= activeTextRangeSelection.end) return null;
  return activeTextRangeSelection;
}

function clearActiveTextRangeSelection() {
  if (!activeTextRangeSelection) return;
  activeTextRangeSelection = null;
  clearTextColorPickerRangeHighlight();
  scheduleTextRangeInspectorSync();
}

function scheduleTextRangeInspectorSync() {
  if (isTextSelectionPointerGesture) {
    hasPendingTextRangeInspectorSync = true;
    return;
  }
  if (textRangeInspectorFrame !== null || typeof updateInspector !== "function") return;
  textRangeInspectorFrame = requestAnimationFrame(() => {
    textRangeInspectorFrame = null;
    updateInspector();
  });
}

document.addEventListener("pointerdown", (event) => {
  if (event.button !== 0 || !(event.target instanceof Element)) return;
  const text = event.target.closest(".canvas-text[contenteditable='true']");
  if (text) isTextSelectionPointerGesture = true;
}, true);

function finishTextSelectionPointerGesture() {
  if (!isTextSelectionPointerGesture) return;
  isTextSelectionPointerGesture = false;
  if (!hasPendingTextRangeInspectorSync) return;
  hasPendingTextRangeInspectorSync = false;
  scheduleTextRangeInspectorSync();
}

document.addEventListener("pointerup", finishTextSelectionPointerGesture, true);
document.addEventListener("pointercancel", finishTextSelectionPointerGesture, true);

document.addEventListener("selectionchange", () => {
  const selection = window.getSelection();
  const record = getSelectedTextRecord();
  if (!selection || selection.rangeCount === 0 || !record) return;
  const { element } = record;
  const range = selection.getRangeAt(0);
  const startsInText = element.contains(range.startContainer);
  const endsInText = element.contains(range.endContainer);
  if (!startsInText || !endsInText) return;
  if (selection.isCollapsed) {
    if (activeTextRangeSelection?.element === element) {
      activeTextRangeSelection = null;
      scheduleTextRangeInspectorSync();
    }
    return;
  }
  const firstOffset = getTextOffsetWithinElement(element, range.startContainer, range.startOffset);
  const secondOffset = getTextOffsetWithinElement(element, range.endContainer, range.endOffset);
  if (firstOffset === null || secondOffset === null || firstOffset === secondOffset) return;
  activeTextRangeSelection = {
    element,
    textId: record.id,
    start: Math.min(firstOffset, secondOffset),
    end: Math.max(firstOffset, secondOffset),
    variantInstanceId: record.isVariantInstance ? selectedVariantInstanceId : null,
  };
  scheduleTextRangeInspectorSync();
});

function getCurrentTextRunData(source, rangeSelection = null) {
  const element = source instanceof HTMLElement ? source : source?.element;
  if (!(element instanceof HTMLElement)) {
    return { element: null, html: "", textContent: "", hasRuns: false, segments: [] };
  }
  const textContent = element.textContent ?? "";
  const bounds = rangeSelection ?? { start: 0, end: textContent.length };
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  const segments = [];
  let position = 0;
  let node = walker.nextNode();
  while (node) {
    const length = node.data.length;
    const start = position;
    const end = start + length;
    const overlapStart = Math.max(start, bounds.start);
    const overlapEnd = Math.min(end, bounds.end);
    if (overlapStart < overlapEnd) {
      const parent = node.parentElement || record.element;
      const value = getResolvedColorValue(getComputedStyle(parent).color, 100);
      if (value) segments.push({
        node,
        start: overlapStart,
        end: overlapEnd,
        localStart: overlapStart - start,
        localEnd: overlapEnd - start,
        ...value,
      });
    }
    position = end;
    node = walker.nextNode();
  }
  return {
    element,
    html: element.innerHTML,
    textContent,
    hasRuns: Boolean(element.querySelector("[data-rich-text-color]")),
    segments,
  };
}

function getTextRangeSegments(record, rangeSelection = getActiveTextRangeSelection(record)) {
  if (!record || !rangeSelection) return [];
  return getCurrentTextRunData(record, rangeSelection).segments;
}

function getUniformTextRunColor(source) {
  const runData = getCurrentTextRunData(source);
  if (!runData.hasRuns || runData.segments.length === 0) return null;
  const values = new Map(runData.segments.map((segment) => [segment.key, segment]));
  if (values.size !== 1) return null;
  const value = values.values().next().value;
  return { color: value.color, opacity: value.opacity, key: value.key };
}

function getActiveTextRangeColorValues(record = getSelectedTextRecord()) {
  return getTextRangeSegments(record).map(({ color, opacity, key }) => ({ color, opacity, key }));
}

function wrapTextNodeColorRange(node, start, end, color, opacity) {
  if (!(node instanceof Text) || start < 0 || end > node.data.length || start >= end) return;
  let selectedNode = node;
  if (end < selectedNode.data.length) selectedNode.splitText(end);
  if (start > 0) selectedNode = selectedNode.splitText(start);
  const renderedColor = getColorWithOpacity(color, opacity);
  const parent = selectedNode.parentElement;
  if (parent?.matches("span[data-rich-text-color]") && parent.childNodes.length === 1) {
    parent.dataset.richTextColor = color;
    parent.dataset.richTextColorOpacity = String(opacity);
    parent.style.color = renderedColor;
    return;
  }
  const span = document.createElement("span");
  span.dataset.richTextColor = color;
  span.dataset.richTextColorOpacity = String(opacity);
  span.style.color = renderedColor;
  selectedNode.replaceWith(span);
  span.append(selectedNode);
}

function applyTextColorToOffsets(element, start, end, color, opacity) {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  const matches = [];
  let position = 0;
  let node = walker.nextNode();
  while (node) {
    const nodeEnd = position + node.data.length;
    const overlapStart = Math.max(position, start);
    const overlapEnd = Math.min(nodeEnd, end);
    if (overlapStart < overlapEnd) matches.push({
      node,
      localStart: overlapStart - position,
      localEnd: overlapEnd - position,
    });
    position = nodeEnd;
    node = walker.nextNode();
  }
  matches.reverse().forEach((match) => {
    wrapTextNodeColorRange(match.node, match.localStart, match.localEnd, color, opacity);
  });
  element.normalize();
}

function persistTextRangeColor(record, options = {}) {
  syncTextRecordContent(record, record.element.textContent ?? "", { writeElement: false });
  const runData = getCurrentTextRunData(record);
  const uniformRunColor = getUniformTextRunColor(record);
  if (uniformRunColor) {
    record.element.dataset.textColor = uniformRunColor.color;
    record.element.dataset.textColorOpacity = String(uniformRunColor.opacity);
    record.element.style.color = getColorWithOpacity(uniformRunColor.color, uniformRunColor.opacity);
  }
  if (record.isVariantInstance) {
    const instance = getVariantInstance(record.variantInstanceId ?? selectedVariantInstanceId);
    if (instance) {
      const target = `text:${record.id}`;
      upsertVariantOverrideForEditedInstances(
        instance,
        target,
        "richTextHtml",
        runData.html,
        options.getEditedVariantInstanceIds?.("richTextHtml"),
      );
      syncVariantLayerStylePreviews(target, "richTextHtml", record.element);
      if (uniformRunColor) {
        const renderedColor = getColorWithOpacity(uniformRunColor.color, uniformRunColor.opacity);
        upsertVariantOverrideForEditedInstances(
          instance,
          target,
          "color",
          renderedColor,
          options.getEditedVariantInstanceIds?.("color"),
        );
        syncVariantLayerStylePreviews(target, "color", record.element);
      }
    }
    return;
  }
  if (variantModel.getInstances().length > 0) scheduleVariantInstanceRender();
}

function applyTextRangeColor(record, rangeSelection, color, opacity) {
  if (!record || !rangeSelection) return;
  applyTextColorToOffsets(record.element, rangeSelection.start, rangeSelection.end, color, opacity);
  persistTextRangeColor(record);
}
