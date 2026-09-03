/* SVG sanitization, importing, vector creation, and vector interaction wiring. */

function parseSvgLength(value) {
  const match = String(value || "").trim().match(/^(\d+(?:\.\d+)?)(?:px)?$/i);
  return match ? Number(match[1]) : null;
}

function hasUnsafeSvgCss(cssText) {
  if (/@import|expression\s*\(|(?:javascript|vbscript|data\s*:\s*text\/html)\s*:/i.test(cssText)) return true;
  const urlReferences = [...cssText.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/gi)];
  return urlReferences.some((match) => !match[1].trim().startsWith("#"));
}

function getSvgPresentationValue(element, property) {
  let current = element;
  while (current instanceof SVGElement) {
    const inlineValue = current.style.getPropertyValue(property).trim();
    if (inlineValue) return inlineValue;
    const attributeValue = current.getAttribute(property);
    if (attributeValue !== null && attributeValue.trim()) return attributeValue.trim();
    current = current.parentElement;
  }
  return property === "fill" ? "black" : property === "stroke" ? "none" : "1";
}

function getSvgClassPresentationValue(element, property) {
  const svg = element?.ownerSVGElement;
  if (!(svg instanceof SVGElement) || !element.classList.length) return "";
  const propertyPattern = new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([^;!}]+)`, "i");
  for (const className of element.classList) {
    const escapedClassName = className.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const rulePattern = new RegExp(`\\.${escapedClassName}\\s*\\{([^}]*)\\}`, "gi");
    for (const match of svg.querySelectorAll("style")) {
      for (const rule of match.textContent?.matchAll(rulePattern) || []) {
        const declaration = rule[1].match(propertyPattern);
        if (declaration) return declaration[1].trim();
      }
    }
  }
  return "";
}

function getEffectiveSvgPresentationValue(element, property) {
  const inlineValue = element.style.getPropertyValue(property).trim();
  if (inlineValue) return inlineValue;
  return getSvgClassPresentationValue(element, property) || getSvgPresentationValue(element, property);
}

function isTransparentSvgPaint(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "none" || normalized === "transparent") return true;
  if (/^#[\da-f]{8}$/i.test(normalized)) return normalized.slice(7) === "00";
  const colorChannels = normalized.match(/[\d.]+/g);
  return /^(?:rgba|hsla)\(/.test(normalized) && colorChannels?.length >= 4 && Number(colorChannels[3]) === 0;
}

function isExplicitlyTransparentSvgShape(element) {
  if (!(element instanceof SVGElement)) return false;
  if (Number(getEffectiveSvgPresentationValue(element, "opacity")) === 0) return true;
  const fill = getEffectiveSvgPresentationValue(element, "fill");
  const stroke = getEffectiveSvgPresentationValue(element, "stroke");
  const fillOpacity = Number(getEffectiveSvgPresentationValue(element, "fill-opacity"));
  const strokeOpacity = Number(getEffectiveSvgPresentationValue(element, "stroke-opacity"));
  const fillIsTransparent = isTransparentSvgPaint(fill) || fillOpacity === 0;
  const strokeIsTransparent = isTransparentSvgPaint(stroke) || strokeOpacity === 0;
  return fillIsTransparent && strokeIsTransparent;
}

function sanitizeSvgText(svgText) {
  const parsed = new DOMParser().parseFromString(svgText, "image/svg+xml");
  if (parsed.querySelector("parsererror")) throw new Error("The selected file is not valid SVG.");
  const root = parsed.documentElement;
  if (root.localName.toLowerCase() !== "svg") throw new Error("The selected file does not contain an SVG root.");

  root.querySelectorAll("script, foreignObject, iframe, object, embed, image, animate, animateMotion, animateTransform, set")
    .forEach((element) => element.remove());

  root.querySelectorAll("style").forEach((styleElement) => {
    if (hasUnsafeSvgCss(styleElement.textContent || "")) styleElement.remove();
  });

  [root, ...root.querySelectorAll("*")].forEach((element) => {
    Array.from(element.attributes).forEach((attribute) => {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.trim();
      const isEventHandler = name.startsWith("on");
      const isExternalReference = (name === "href" || name === "xlink:href") && !value.startsWith("#");
      const hasUnsafeProtocol = /(?:javascript|vbscript|data\s*:\s*text\/html)\s*:/i.test(value);
      const urlReferences = [...value.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/gi)];
      const hasExternalUrl = urlReferences.some((match) => !match[1].trim().startsWith("#"));
      const hasUnsafeStyle = name === "style" && /expression\s*\(/i.test(value);
      if (isEventHandler || isExternalReference || hasUnsafeProtocol || hasExternalUrl || hasUnsafeStyle) {
        element.removeAttribute(attribute.name);
      }
    });
  });

  root.querySelectorAll("path, rect, circle, ellipse, line, polyline, polygon, use").forEach((shape) => {
    if (isExplicitlyTransparentSvgShape(shape)) shape.remove();
  });

  const viewBox = (root.getAttribute("viewBox") || "")
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  const viewBoxWidth = viewBox.length === 4 && Number.isFinite(viewBox[2]) && viewBox[2] > 0 ? viewBox[2] : null;
  const viewBoxHeight = viewBox.length === 4 && Number.isFinite(viewBox[3]) && viewBox[3] > 0 ? viewBox[3] : null;
  const width = parseSvgLength(root.getAttribute("width")) || viewBoxWidth || 24;
  const height = parseSvgLength(root.getAttribute("height")) || viewBoxHeight || 24;
  root.removeAttribute("width");
  root.removeAttribute("height");
  if (!root.hasAttribute("viewBox")) root.setAttribute("viewBox", `0 0 ${width} ${height}`);
  if (!root.hasAttribute("xmlns")) root.setAttribute("xmlns", "http://www.w3.org/2000/svg");

  return {
    source: new XMLSerializer().serializeToString(root),
    width,
    height,
  };
}

function createCanvasSvg(svgSource) {
  const parsed = new DOMParser().parseFromString(svgSource, "image/svg+xml");
  const svg = document.importNode(parsed.documentElement, true);
  svg.setAttribute("width", "100%");
  svg.setAttribute("height", "100%");
  svg.setAttribute("preserveAspectRatio", svg.getAttribute("preserveAspectRatio") || "xMidYMid meet");
  svg.style.display = "block";
  svg.style.width = "100%";
  svg.style.height = "100%";
  return svg;
}

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

function getDroppedSvgFile(dataTransfer) {
  return Array.from(dataTransfer?.files ?? []).find((file) => (
    file.type === "image/svg+xml" || /\.svg$/i.test(file.name)
  )) ?? null;
}

function hasFileTransfer(dataTransfer) {
  return Array.from(dataTransfer?.types ?? []).includes("Files")
    || (dataTransfer?.files?.length ?? 0) > 0;
}

async function importSvgFile(file, clientX = null, clientY = null) {
  if (!(file instanceof File) || !(canvas instanceof HTMLElement)) return false;
  try {
    const sanitized = sanitizeSvgText(await file.text());
    const canvasBounds = canvas.getBoundingClientRect();
    const x = Number.isFinite(clientX)
      ? Math.max(0, Math.round(clientX - canvasBounds.left))
      : Math.max(0, Math.round((canvasBounds.width - sanitized.width) / 2));
    const y = Number.isFinite(clientY)
      ? Math.max(0, Math.round(clientY - canvasBounds.top))
      : Math.max(0, Math.round((canvasBounds.height - sanitized.height) / 2));
    const name = file.name.replace(/\.svg$/i, "").trim() || `Vector ${nextVectorId}`;
    createCanvasVector({ ...sanitized, name }, x, y);
    selectTool("select");
    return true;
  } catch (error) {
    window.alert(error instanceof Error ? error.message : "Unable to import the selected SVG.");
    return false;
  }
}

canvas?.addEventListener("dragover", (event) => {
  if (!hasFileTransfer(event.dataTransfer)) return;
  event.preventDefault();
  event.stopPropagation();
  event.dataTransfer.dropEffect = "copy";
}, true);

canvas?.addEventListener("drop", (event) => {
  const file = getDroppedSvgFile(event.dataTransfer);
  if (!file) return;
  event.preventDefault();
  event.stopPropagation();
  importSvgFile(file, event.clientX, event.clientY);
}, true);
