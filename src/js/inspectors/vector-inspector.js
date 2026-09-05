/* Vector inspector paint detection, color application, sizing, and control wiring. */

function isSolidSvgPaint(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized || normalized === "none" || normalized === "transparent" || normalized.includes("url(")) return false;
  const rgbaValues = normalized.match(/[\d.]+/g);
  return !(normalized.startsWith("rgba") && rgbaValues?.length >= 4 && Number(rgbaValues[3]) === 0);
}
function getVectorPaintElements(svg) {
  const paintableTags = new Set(["path", "rect", "circle", "ellipse", "line", "polyline", "polygon", "text", "tspan", "use"]);
  return Array.from(svg.querySelectorAll("*")).filter((element) => paintableTags.has(element.localName.toLowerCase()));
}

function getVectorRenderedColor(record) {
  const svg = record.element.querySelector("svg");
  if (!(svg instanceof SVGElement)) return "#000000";
  for (const element of getVectorPaintElements(svg)) {
    const styles = getComputedStyle(element);
    const paint = isSolidSvgPaint(styles.fill) ? styles.fill : isSolidSvgPaint(styles.stroke) ? styles.stroke : null;
    const color = paint ? cssColorToHex(paint) : null;
    if (color) return color;
  }
  return "#000000";
}

function getVectorRenderedOpacity(record) {
  const svg = record.element.querySelector("svg");
  if (!(svg instanceof SVGElement)) return 100;
  for (const element of getVectorPaintElements(svg)) {
    const styles = getComputedStyle(element);
    const paint = isSolidSvgPaint(styles.fill) ? styles.fill : isSolidSvgPaint(styles.stroke) ? styles.stroke : null;
    if (!paint) continue;
    const alpha = paint.match(/^rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\)$/i);
    return normalizeColorOpacity(alpha ? Number(alpha[1]) * 100 : 100);
  }
  return 100;
}

function getVectorPaintProperties(record) {
  const svg = record.element.querySelector("svg");
  if (!(svg instanceof SVGElement)) return [];
  const properties = new Set();
  getVectorPaintElements(svg).forEach((element) => {
    const styles = getComputedStyle(element);
    if (isSolidSvgPaint(styles.fill)) properties.add("fill");
    if (isSolidSvgPaint(styles.stroke)) properties.add("stroke");
  });
  return [...properties];
}

function applyVectorColor(record, color) {
  const canvasSvg = record.element.querySelector("svg");
  if (!(canvasSvg instanceof SVGElement)) return;
  const sourceDocument = new DOMParser().parseFromString(record.svgSource, "image/svg+xml");
  const sourceSvg = sourceDocument.documentElement;
  const canvasPaintElements = getVectorPaintElements(canvasSvg);
  const sourcePaintElements = getVectorPaintElements(sourceSvg);

  canvasPaintElements.forEach((canvasElement, index) => {
    const sourceElement = sourcePaintElements[index];
    if (!(sourceElement instanceof SVGElement)) return;
    const styles = getComputedStyle(canvasElement);
    if (isSolidSvgPaint(styles.fill)) {
      canvasElement.style.fill = color;
      sourceElement.style.fill = color;
    }
    if (isSolidSvgPaint(styles.stroke)) {
      canvasElement.style.stroke = color;
      sourceElement.style.stroke = color;
    }
  });

  record.svgSource = new XMLSerializer().serializeToString(sourceSvg);
  record.element.dataset.vectorColor = color;
}

function removeVectorColor(record) {
  const source = record.originalSvgSource || record.svgSource;
  const sourceDocument = new DOMParser().parseFromString(source, "image/svg+xml");
  const sourceSvg = sourceDocument.documentElement;
  getVectorPaintElements(sourceSvg).forEach((element) => {
    element.style.fill = "none";
    element.style.stroke = "none";
  });
  record.svgSource = new XMLSerializer().serializeToString(sourceSvg);
  record.element.replaceChildren(createCanvasSvg(record.svgSource));
  record.element.dataset.vectorColor = "";
}

function getVectorInspectorValues(record) {
  const bounds = record.element.getBoundingClientRect();
  const instance = record.isVariantInstance
    ? getVariantInstance(record.variantInstanceId ?? selectedVariantInstanceId)
    : null;
  const target = `vector:${record.id}`;
  const getDimension = (dimension) => {
    const override = instance ? getEffectiveVariantOverride(instance, target, dimension) : null;
    const value = override?.value ?? record.element.dataset[dimension] ?? bounds[dimension];
    const number = Number.parseFloat(value);
    return String(Number.isFinite(number) ? number : Math.round(bounds[dimension]));
  };
  const hasStoredColor = Object.prototype.hasOwnProperty.call(record.element.dataset, "vectorColor");
  const color = hasStoredColor ? record.element.dataset.vectorColor : getVectorRenderedColor(record);
  if (!hasStoredColor) record.element.dataset.vectorColor = color;
  return {
    width: getDimension("width"),
    height: getDimension("height"),
    color,
    opacity: getVectorRenderedOpacity(record),
  };
}

function getSharedVectorInspectorValue(values, property) {
  const value = values[0]?.[property] ?? "";
  return {
    value,
    mixed: values.some((candidate) => candidate[property] !== value),
  };
}

function syncInspectorToSelectedVector() {
  const record = getSelectedVectorRecord();
  const records = getSelectedVectorRecords();
  if (!record || records.length === 0) return;
  const values = records.map(getVectorInspectorValues);
  const primaryValues = getVectorInspectorValues(record);
  const heading = vectorInspector?.querySelector("#vector-heading");
  if (heading instanceof HTMLElement) heading.textContent = records.length > 1 ? "Vectors" : "Vector";
  vectorSizeInputs.forEach((input) => {
    if (!(input instanceof HTMLInputElement)) return;
    const dimension = input.dataset.vectorSize;
    if (dimension !== "width" && dimension !== "height") return;
    const state = getSharedVectorInspectorValue(values, dimension);
    input.value = state.mixed ? "" : state.value;
    input.placeholder = state.mixed ? "Mixed" : "";
  });
  if (vectorColorPicker instanceof HTMLInputElement) {
    syncCustomColorControl(vectorColorPicker, primaryValues.color, primaryValues.opacity);
  }
}
vectorSizeInputs.forEach((input) => {
  if (!(input instanceof HTMLInputElement)) return;
  input.addEventListener("input", () => {
    const records = getSelectedVectorRecords();
    const dimension = input.dataset.vectorSize;
    const value = Number(input.value);
    if (records.length === 0 || (dimension !== "width" && dimension !== "height") || !Number.isFinite(value)) return;
    const fixedValue = Math.max(MIN_INTERACTIVE_LAYER_SIZE, value);
    if (records[0].isVariantInstance) {
      const edits = records.map((record) => {
        const instance = getVariantInstance(record.variantInstanceId ?? selectedVariantInstanceId);
        const target = `vector:${record.id}`;
        const current = instance ? getEffectiveVariantOverride(instance, target, dimension) : null;
        return { record, instance, target, changed: String(current?.value ?? "") !== `${fixedValue}px` };
      });
      if (edits.some(({ changed }) => changed)) recordHistoryForGesture(input);
      edits.forEach(({ record, instance, target }) => {
        record.element.dataset[`${dimension}Mode`] = "fixed";
        record.element.dataset[dimension] = String(fixedValue);
        record.element.style[dimension] = `${fixedValue}px`;
        if (instance) upsertLocalVariantOverride(instance, target, dimension, `${fixedValue}px`);
        syncVariantLayerStylePreviews(target, dimension, record.element);
      });
      requestAnimationFrame(syncResizeOverlay);
      return;
    }
    if (records.some((record) => Number(record.element.dataset[dimension] || "24") !== fixedValue)) {
      recordHistoryForGesture(input);
    }
    records.forEach((record) => {
      record.element.dataset[`${dimension}Mode`] = "fixed";
      record.element.dataset[dimension] = String(fixedValue);
      applyLayerSizing("vector", record);
    });
    if (variantModel.getInstances().length > 0) scheduleVariantInstanceRender();
    requestAnimationFrame(syncResizeOverlay);
  });
  input.addEventListener("blur", syncInspectorToSelectedVector);
  bindHistoryGesture(input);
});
