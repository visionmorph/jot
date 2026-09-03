/* Variant preview cloning, labeling, live synchronization, and rendering. */

let variantRenderFrame = null;

function syncVariantTextPreviewContent(textId, editingElement = null) {
  const target = `text:${textId}`;
  const fallbackValue = getTextRecord(textId)?.element.textContent ?? "";
  componentSet?.querySelectorAll(".variant-preview").forEach((preview) => {
    const instance = getVariantInstance(Number(preview.dataset.variantInstanceId));
    const root = preview.querySelector(".canvas-root-stack");
    const text = root ? findVariantTarget(root, target) : null;
    if (!instance || !(text instanceof HTMLElement) || text === editingElement) return;
    const textOperation = resolveVariantOperations(instance)
      .filter((operation) => operation.target === target && operation.property === "textContent")
      .pop();
    text.textContent = String(textOperation?.value ?? fallbackValue);
  });
}

function syncVariantLayerStylePreviews(target, property, editingElement = null) {
  componentSet?.querySelectorAll(".variant-preview").forEach((preview) => {
    const instance = getVariantInstance(Number(preview.dataset.variantInstanceId));
    const root = preview.querySelector(".canvas-root-stack");
    const element = root ? findVariantTarget(root, target) : null;
    if (!instance || !(element instanceof HTMLElement) || element === editingElement) return;
    const operation = resolveVariantOperations(instance)
      .filter((entry) => entry.target === target && entry.property === property)
      .pop();
    if (operation) applyVariantOperation(root, operation);
  });
  requestAnimationFrame(syncResizeOverlay);
}

function getVariantInstanceLabel(instance) {
  const values = variantModel.getProps()
    .filter((prop) => prop.type !== "action")
    .map((prop) => `${prop.name}=${String(normalizeVariantPropValue(prop, instance.propValues?.[prop.id]))}`);
  return values.length ? `${instance.name} · ${values.join(", ")}` : instance.name;
}

function getVariantPropSchemaTitle(instance) {
  const values = variantModel.getProps()
    .filter((prop) => prop.type !== "action")
    .map((prop) => `${prop.name}=${String(normalizeVariantPropValue(prop, instance.propValues?.[prop.id]))}`);
  return values.join(", ") || instance.name;
}

function getBaseVariantLabel() {
  const values = variantModel.getProps()
    .filter((prop) => prop.type !== "action")
    .map((prop) => `${prop.name}=${String(getVariantPropDefaultValue(prop))}`);
  return values.join(", ") || currentComponent?.name || "Component";
}

function setVariantLabelTooltip(label, fullLabel) {
  const isTruncated = label.scrollHeight > label.clientHeight || label.scrollWidth > label.clientWidth;
  label.title = isTruncated ? fullLabel : "";
}

function syncVariantFlexbox(root) {
  if (!(root instanceof HTMLElement)) return;
  [root, ...root.querySelectorAll(".canvas-frame")].forEach((container) => {
    if (!(container instanceof HTMLElement)) return;
    container.style.display = "flex";
    if (!container.style.flexDirection && container.dataset.direction) {
      container.style.flexDirection = container.dataset.direction === "vertical" ? "column" : "row";
    }
    Array.from(container.children).forEach((child) => {
      if (!(child instanceof HTMLElement) || !child.matches(".canvas-frame, .canvas-text, .canvas-vector")) return;
      child.style.position = "relative";
      child.style.left = "";
      child.style.top = "";
    });
  });
}

function namespaceVariantCloneIds(clone, instanceId) {
  const idMap = new Map();
  const identifiedElements = [
    ...(clone.matches("[id]") ? [clone] : []),
    ...clone.querySelectorAll("[id]"),
  ];
  identifiedElements.forEach((element) => {
    const previousId = element.id;
    const nextId = `variant-${instanceId}-${previousId}`;
    idMap.set(previousId, nextId);
    element.id = nextId;
  });
  if (idMap.size === 0) return;

  const tokenReferenceAttributes = new Set([
    "aria-controls",
    "aria-describedby",
    "aria-details",
    "aria-errormessage",
    "aria-flowto",
    "aria-labelledby",
    "aria-owns",
    "headers",
  ]);
  const elements = [clone, ...clone.querySelectorAll("*")];
  elements.forEach((element) => {
    Array.from(element.attributes).forEach((attribute) => {
      let nextValue = attribute.value;
      nextValue = nextValue.replace(
        /url\(\s*(["']?)#([^\s)"']+)\1\s*\)/g,
        (reference, quote, referencedId) => {
          const replacement = idMap.get(referencedId);
          return replacement ? `url(${quote}#${replacement}${quote})` : reference;
        },
      );
      if (["href", "xlink:href"].includes(attribute.name) && nextValue.startsWith("#")) {
        const replacement = idMap.get(nextValue.slice(1));
        if (replacement) nextValue = `#${replacement}`;
      } else if (["for", "list"].includes(attribute.name)) {
        nextValue = idMap.get(nextValue) ?? nextValue;
      } else if (tokenReferenceAttributes.has(attribute.name)) {
        nextValue = nextValue
          .split(/\s+/)
          .map((token) => idMap.get(token) ?? token)
          .join(" ");
      }
      if (nextValue !== attribute.value) element.setAttribute(attribute.name, nextValue);
    });
  });
}

function prepareVariantClone(clone, instanceId) {
  clone.removeAttribute("data-canvas-root-stack");
  clone.removeAttribute("aria-hidden");
  clone.removeAttribute("hidden");
  clone.style.removeProperty("display");
  clone.querySelectorAll(".component-preview-label").forEach((label) => label.remove());
  clone.classList.remove("is-selected", "is-canvas-drop-inside", "is-canvas-dragging");
  clone.setAttribute("aria-selected", "false");
  clone.querySelectorAll(".is-selected, .is-canvas-drop-inside, .is-canvas-dragging").forEach((element) => {
    element.classList.remove("is-selected", "is-canvas-drop-inside", "is-canvas-dragging");
    element.setAttribute("aria-selected", "false");
  });
  clone.querySelectorAll("[contenteditable]").forEach((element) => element.setAttribute("contenteditable", "false"));
  clone.querySelectorAll("[draggable]").forEach((element) => element.setAttribute("draggable", "false"));
  namespaceVariantCloneIds(clone, instanceId);
}

function renderBaseComponentLabel() {
  if (!(canvasRootStack instanceof HTMLElement)) return;
  const label = canvasRootStack.querySelector("[data-component-preview-label]");
  if (!(label instanceof HTMLElement)) return;
  const nextLabel = getBaseVariantLabel();
  if (label.textContent !== nextLabel) label.textContent = nextLabel;
  setVariantLabelTooltip(label, label.textContent);
  label.onpointerdown = (event) => {
    if (event.button !== 0 || activeTool !== "select" || !currentComponent) return;
    event.stopPropagation();
    selectComponentTreeNode(currentComponent.id);
  };
}

function renderVariantInstances() {
  if (!(componentSet instanceof HTMLElement) || !(canvasRootStack instanceof HTMLElement)) return;
  const hasVariants = variantModel.getInstances().length > 0;
  componentSet.classList.toggle("has-variants", hasVariants);
  canvasRootStack.setAttribute("aria-hidden", String(hasVariants));
  if (!hasVariants) renderBaseComponentLabel();
  componentSet.querySelectorAll(":scope > .variant-preview").forEach((preview) => preview.remove());

  variantModel.getInstances().forEach((instance) => {
    const preview = document.createElement("div");
    const label = document.createElement("span");
    const content = document.createElement("div");
    const clone = canvasRootStack.cloneNode(true);
    preview.className = "variant-preview";
    preview.draggable = false;
    const isSelectedInstance = isVariantInstanceSelected(instance.id);
    preview.classList.toggle("is-selected", isSelectedInstance);
    preview.dataset.variantInstanceId = String(instance.id);
    preview.setAttribute("role", "group");
    preview.setAttribute("tabindex", "0");
    preview.setAttribute("aria-label", getVariantInstanceLabel(instance));
    preview.setAttribute("aria-selected", String(isSelectedInstance));
    label.className = "variant-preview-label is-reorder-handle";
    label.draggable = false;
    const schemaTitle = getVariantPropSchemaTitle(instance);
    const isAuthoredDefault = instance === getAuthoredDefaultVariantInstance();
    label.textContent = isAuthoredDefault ? `${schemaTitle} · Default` : schemaTitle;
    content.className = "variant-preview-content";
    prepareVariantClone(clone, instance.id);
    resolveVariantOperations(instance).forEach((operation) => applyVariantOperation(clone, operation));
    syncVariantFlexbox(clone);
    const isSelectedRoot = isSelectedInstance && selectedVariantLayerTarget === null;
    clone.classList.toggle("is-selected", isSelectedRoot);
    clone.setAttribute("aria-selected", String(isSelectedRoot));
    clone.addEventListener("click", (event) => {
      const hit = resolveCanvasHit(event.target);
      if (hit.kind === "variant-root" && hit.instanceId === instance.id && hit.direct) {
        handleVariantStructureToolClick(instance, "component:0", event);
      }
    });
    clone.querySelectorAll(".canvas-frame, .canvas-text, .canvas-vector").forEach((layerElement) => {
      const type = layerElement.classList.contains("canvas-frame")
        ? "frame"
        : layerElement.classList.contains("canvas-text") ? "text" : "vector";
      const id = Number(layerElement.dataset[`${type}Id`]);
      if (!Number.isFinite(id)) return;
      const target = `${type}:${id}`;
      const isSelectedLayer = isVariantLayerTargetSelected(instance.id, target);
      layerElement.classList.toggle("is-selected", isSelectedLayer);
      layerElement.setAttribute("aria-selected", String(isSelectedLayer));
      layerElement.tabIndex = 0;
      if (type === "frame") {
        layerElement.addEventListener("click", (event) => {
          const hit = resolveCanvasHit(event.target);
          if (hit.kind === "variant-layer" && hit.element === layerElement && hit.direct) {
            handleVariantStructureToolClick(instance, target, event);
          }
        });
      }
      if (type !== "text") return;
      const text = layerElement;
      const textId = id;
      const beginEditing = (event, { selectContents = true } = {}) => {
        if (activeTool !== "select") return;
        event.preventDefault();
        event.stopPropagation();
        selectVariantState(instance.id, target);
        beginHistoryGesture(text);
        text.classList.add("is-selected");
        text.setAttribute("aria-selected", "true");
        focusTextEditor(text, { selectContents });
      };
      text.addEventListener("dblclick", beginEditing);
      text.addEventListener("canvas-text-create", (event) => {
        beginEditing(event, { selectContents: false });
      });
      text.addEventListener("click", (event) => {
        if (activeTool !== "text") return;
        selectTool("select");
        selectVariantInstance(instance.id, { render: false, layerTarget: target });
        beginEditing(event);
      });
      text.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && !text.isContentEditable) beginEditing(event);
      });
      text.addEventListener("input", () => {
        recordHistoryForGesture(text);
        setVariantTextOverride(instance, textId, text.textContent ?? "", { render: false });
        syncVariantTextPreviewContent(textId, text);
      });
      text.addEventListener("blur", () => {
        endHistoryGesture(text);
        text.contentEditable = "false";
        scheduleVariantInstanceRender();
      });
    });
    content.append(clone);
    preview.append(label, content);
    bindVariantReorderPointer(preview, instance);
    preview.addEventListener("keydown", (event) => {
      if (event.target !== preview) return;
      if (selectedVariantInstanceId === instance.id && selectedVariantLayerTargets.size > 0) return;
      const move = event.key === "ArrowLeft" || event.key === "ArrowUp"
        ? -1
        : event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : 0;
      if (move !== 0) {
        event.preventDefault();
        reorderVariantInstance(instance.id, variantModel.getInstances().indexOf(instance) + move);
        return;
      }
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      selectVariantInstance(instance.id);
    });
    componentSet.append(preview);
    setVariantLabelTooltip(label, label.textContent);
  });
  requestAnimationFrame(syncResizeOverlay);
}

function scheduleVariantInstanceRender() {
  if (variantRenderFrame !== null) return;
  variantRenderFrame = requestAnimationFrame(() => {
    variantRenderFrame = null;
    renderVariantInstances();
  });
}

if (canvasRootStack instanceof HTMLElement) {
  const variantSchemaObserver = new MutationObserver(() => scheduleVariantInstanceRender());
  variantSchemaObserver.observe(canvasRootStack, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ["style", "data-layer-visibility", "data-frame-color", "data-text-color", "data-vector-color"],
  });
}
