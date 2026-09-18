/* Variant preview cloning, labeling, live synchronization, and rendering. */

let variantRenderFrame = null;

function syncVariantTextPreviewContent(textId, editingElement = null) {
  const target = `text:${textId}`;
  const sourceElement = getTextRecord(textId)?.element;
  componentSet?.querySelectorAll(".variant-preview").forEach((preview) => {
    const variant = getVariant(Number(preview.dataset.variantId));
    const root = preview.querySelector(".canvas-root-stack");
    const text = root ? findVariantTarget(root, target) : null;
    if (!variant || !(text instanceof HTMLElement) || text === editingElement) return;
    const resolved = resolveVariantTextValue(variant, target, sourceElement);
    if (resolved.kind === "html") text.innerHTML = resolved.value;
    else text.textContent = resolved.value;
  });
}

function syncVariantLayerStylePreviews(target, property, editingElement = null) {
  componentSet?.querySelectorAll(".variant-preview").forEach((preview) => {
    const variant = getVariant(Number(preview.dataset.variantId));
    const root = preview.querySelector(".canvas-root-stack");
    const element = root ? findVariantTarget(root, target) : null;
    if (!variant || !(element instanceof HTMLElement) || element === editingElement) return;
    const operation = resolveVariantOperations(variant)
      .filter((entry) => entry.target === target && entry.property === property)
      .pop();
    if (operation) {
      applyVariantOperation(root, operation);
      if (property === "width" || property === "height" || property === "flexDirection") syncVariantFlexbox(root);
    }
  });
  requestAnimationFrame(syncResizeOverlay);
}

function getVariantCompactLabel(variant) {
  if (variantModel.getVariants().length === 1) return currentComponent?.name || "Component";
  const values = variantModel.getProps()
    .filter((prop) => prop.type !== "action")
    .filter((prop) => (
      normalizeVariantPropValue(prop, variant.propValues?.[prop.id]) !== getVariantPropDefaultValue(prop)
    ))
    .map((prop) => {
      const normalizedValue = normalizeVariantPropValue(prop, variant.propValues?.[prop.id]);
      const sourceProp = componentProps.find((componentProp) => (
        componentProp.id === prop.sourceComponentPropId
        || componentProp.variantPropId === prop.id
      )) ?? prop;
      const displayValue = prop.type === "boolean"
        ? getBooleanComponentPropValueLabel(sourceProp, normalizedValue)
        : String(normalizedValue);
      return displayValue.trim().toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
    })
    .filter(Boolean);
  if (values.length) return values.join("-");
  const baseVariant = getAuthoredDefaultVariant();
  if (variant === baseVariant) return "Base component";
  const position = variantModel.getVariants()
    .filter((candidate) => candidate !== baseVariant)
    .indexOf(variant);
  return `Variant ${Math.max(0, position) + 1}`;
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
      if (!(child instanceof HTMLElement) || !child.matches(".canvas-frame, .canvas-text, .canvas-vector, .canvas-component-instance")) return;
      child.style.position = "relative";
      child.style.left = "";
      child.style.top = "";
      if (child.classList.contains("canvas-component-instance")) {
        syncComponentInstanceSizing(child, container);
        return;
      }
      const fallbackMode = child.classList.contains("canvas-text") ? "hug" : "fixed";
      const widthMode = getLayerDimensionMode(child, "width", fallbackMode);
      const heightMode = getLayerDimensionMode(child, "height", fallbackMode);
      const vertical = container.style.flexDirection === "column" || container.dataset.direction === "vertical";
      const mainMode = vertical ? heightMode : widthMode;
      const crossMode = vertical ? widthMode : heightMode;
      child.style.flex = mainMode === "fill" ? "1 1 0" : "0 0 auto";
      child.style.alignSelf = crossMode === "fill" ? "stretch" : "";
      child.style.minWidth = !vertical && widthMode === "fill" ? "0" : "";
      child.style.minHeight = vertical && heightMode === "fill" ? "0" : "";
    });
  });
}

function namespaceVariantCloneIds(clone, variantId) {
  const idMap = new Map();
  const identifiedElements = [
    ...(clone.matches("[id]") ? [clone] : []),
    ...clone.querySelectorAll("[id]"),
  ];
  identifiedElements.forEach((element) => {
    const previousId = element.id;
    const nextId = `variant-${variantId}-${previousId}`;
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

function prepareVariantClone(clone, variantId) {
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
  namespaceVariantCloneIds(clone, variantId);
}

function renderBaseComponentLabel() {
  if (!(canvasRootStack instanceof HTMLElement)) return;
  const label = canvasRootStack.querySelector("[data-component-preview-label]");
  if (!(label instanceof HTMLElement)) return;
  const nextLabel = currentComponent?.name || "Component";
  if (label.textContent !== nextLabel) label.textContent = nextLabel;
  setVariantLabelTooltip(label, label.textContent);
  label.onpointerdown = (event) => {
    if (event.button !== 0 || activeTool !== "select" || !currentComponent) return;
    event.stopPropagation();
    selectComponentTreeNode(currentComponent.id);
  };
}

function renderVariants() {
  if (instanceTextEditing) return;
  if (!(componentSet instanceof HTMLElement) || !(canvasRootStack instanceof HTMLElement)) return;
  const hasVariants = variantModel.getVariants().length > 0;
  componentSet.classList.toggle("has-variants", hasVariants);
  canvasRootStack.setAttribute("aria-hidden", String(hasVariants));
  if (!hasVariants) renderBaseComponentLabel();
  componentSet.querySelectorAll(":scope > .variant-preview").forEach((preview) => preview.remove());

  variantModel.getVariants().forEach((variant) => {
    const preview = document.createElement("div");
    const label = document.createElement("span");
    const content = document.createElement("div");
    const clone = canvasRootStack.cloneNode(true);
    preview.className = "variant-preview";
    preview.draggable = false;
    const isSelectedVariant = isVariantSelected(variant.id);
    preview.classList.toggle("is-selected", isSelectedVariant);
    preview.dataset.variantId = String(variant.id);
    preview.setAttribute("role", "group");
    preview.setAttribute("tabindex", "0");
    const compactLabel = getVariantCompactLabel(variant);
    preview.setAttribute("aria-label", compactLabel);
    preview.setAttribute("aria-selected", String(isSelectedVariant));
    label.className = "variant-preview-label is-reorder-handle";
    label.draggable = false;
    label.textContent = compactLabel;
    content.className = "variant-preview-content";
    prepareVariantClone(clone, variant.id);
    applyComponentVariant(clone, { ...getComponentDefinition(currentComponent.id), layers: captureWorkspaceState().layers,
      variantProps: variantModel.getProps(), variantRules: variantModel.getRules(), variants: variantModel.getVariants(), componentProps }, variant,
      { ownerComponentId: currentComponent.id, instancePath: [], ancestors: [currentComponent.id], readDefinition: getComponentDefinition });
    clone.querySelectorAll(".canvas-component-instance").forEach(element => {
      if (element.closest("[data-identity-source]") === clone) namespaceVariantCloneIds(element, variant.id);
    });
    syncVariantFlexbox(clone);
    const isSelectedRoot = isVariantRootSelected(variant.id);
    clone.classList.toggle("is-selected", isSelectedRoot);
    clone.setAttribute("aria-selected", String(isSelectedRoot));
    clone.addEventListener("click", (event) => {
      const hit = resolveCanvasHit(event.target);
      if (hit.kind === "variant-root" && hit.variantId === variant.id && hit.direct) {
        handleVariantStructureToolClick(variant, "component:0", event);
      }
    });
    clone.querySelectorAll(".canvas-frame, .canvas-text, .canvas-vector").forEach((layerElement) => {
      if (layerElement.closest("[data-identity-source]") !== clone) return;
      const type = layerElement.classList.contains("canvas-frame")
        ? "frame"
        : layerElement.classList.contains("canvas-text") ? "text" : "vector";
      const id = Number(layerElement.dataset[`${type}Id`]);
      if (!Number.isFinite(id)) return;
      const target = `${type}:${id}`;
      const isSelectedLayer = isVariantLayerTargetSelected(variant.id, target);
      layerElement.classList.toggle("is-selected", isSelectedLayer);
      layerElement.setAttribute("aria-selected", String(isSelectedLayer));
      layerElement.tabIndex = 0;
      if (type === "frame") {
        layerElement.addEventListener("click", (event) => {
          const hit = resolveCanvasHit(event.target);
          if (hit.kind === "variant-layer" && hit.element === layerElement && hit.direct) {
            handleVariantStructureToolClick(variant, target, event);
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
        selectVariantState(variant.id, target);
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
        selectVariant(variant.id, { render: false, layerTarget: target });
        beginEditing(event);
      });
      text.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && !event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey
          && !text.isContentEditable && getSelectedVariantIds().length <= 1
          && getSelectedVariantLayerTargets().length <= 1) beginEditing(event);
      });
      text.addEventListener("input", () => {
        recordHistoryForGesture(text);
        const runData = getCurrentTextRunData(text);
        const sourceRecord = getTextRecord(textId);
        if (sourceRecord?.isNew) {
          componentSet?.querySelectorAll(".variant-preview").forEach((preview) => {
            const root = preview.querySelector(".canvas-root-stack");
            const siblingText = root ? findVariantTarget(root, target) : null;
            if (!(siblingText instanceof HTMLElement) || siblingText === text) return;
            if (runData.hasRuns) siblingText.innerHTML = runData.html;
            else siblingText.textContent = runData.textContent;
          });
        } else if (runData.hasRuns) {
          setVariantTextOverride(variant, textId, runData.html, { render: false, format: "html" });
        } else {
          setVariantTextOverride(variant, textId, text.textContent ?? "", { render: false });
        }
        if (!sourceRecord?.isNew) syncVariantTextPreviewContent(textId, text);
        renderLayerTree();
      });
      text.addEventListener("blur", () => {
        endHistoryGesture(text);
        const sourceRecord = getTextRecord(textId);
        if (sourceRecord?.isNew && (text.textContent ?? "").length === 0) {
          const deletedTarget = `text:${textId}`;
          variantModel.getVariants().forEach((variant) => {
            variant.overrides = (variant.overrides ?? [])
              .filter((override) => override.target !== deletedTarget);
          });
          variantModel.replaceRules(
            variantModel.getRules().filter((rule) => rule.target !== deletedTarget),
          );
          selectVariantState(variant.id);
          removeCanvasText(sourceRecord.element);
          scheduleVariantRender();
          return;
        }
        if (sourceRecord?.isNew) {
          const runData = getCurrentTextRunData(text);
          if (runData.hasRuns) sourceRecord.element.innerHTML = runData.html;
          else sourceRecord.element.textContent = runData.textContent;
          syncTextRecordContent(sourceRecord, runData.textContent, { writeElement: false });
          sourceRecord.isNew = false;
          sourceRecord.element.classList.remove("is-new-empty");
        }
        text.contentEditable = "false";
        scheduleVariantRender();
      });
    });
    content.append(clone);
    clone.querySelectorAll(".canvas-component-instance").forEach(element => {
      if (element.closest("[data-identity-source]") !== clone) return;
      const id = Number(element.dataset.componentInstanceId);
      const selected = isVariantLayerTargetSelected(variant.id, `component-instance:${id}`);
      element.classList.toggle("is-selected", selected);
      element.setAttribute("aria-selected", String(selected));
      bindComponentInstanceInteractions(element, id, variant.id);
    });
    preview.append(label, content);
    bindVariantReorderPointer(preview, variant);
    preview.addEventListener("keydown", (event) => {
      if (event.target !== preview) return;
      if (selectedVariantId === variant.id && selectedVariantLayerTargets.size > 0) return;
      const move = event.key === "ArrowLeft" || event.key === "ArrowUp"
        ? -1
        : event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : 0;
      if (move !== 0) {
        event.preventDefault();
        reorderVariant(variant.id, variantModel.getVariants().indexOf(variant) + move);
        return;
      }
      if (event.key !== " ") return;
      event.preventDefault();
      selectVariant(variant.id);
    });
    componentSet.append(preview);
    setVariantLabelTooltip(label, compactLabel);
  });
  requestAnimationFrame(syncResizeOverlay);
}

function scheduleVariantRender() {
  if (variantRenderFrame !== null) return;
  variantRenderFrame = requestAnimationFrame(() => {
    variantRenderFrame = null;
    renderVariants();
  });
}

if (canvasRootStack instanceof HTMLElement) {
  const variantSchemaObserver = new MutationObserver(() => scheduleVariantRender());
  variantSchemaObserver.observe(canvasRootStack, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ["style", "data-layer-visibility", "data-frame-color", "data-text-color", "data-vector-color"],
  });
}
