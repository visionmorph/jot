/* Render plain component data without activating it or changing editor state. */

const instancePresentationBaselines = new WeakMap();
function captureInstancePresentation(record) {
  const presentation = structuredClone(record.presentation ?? { style: {}, dataset: {} });
  const root = record.element?.firstElementChild;
  const baseline = instancePresentationBaselines.get(root);
  if (baseline) {
    new Set([...Object.keys(baseline.style), ...root.style]).forEach(key => {
      const value = root.style.getPropertyValue(key);
      if (value !== (baseline.style[key] ?? "")) presentation.style[key] = value;
    });
    Object.entries(root.dataset).forEach(([key, value]) => {
      if (value !== baseline.dataset[key] && !key.startsWith("identity")) presentation.dataset[key] = value;
    });
  }
  record.presentation = presentation;
  return presentation;
}

function getInstancePropVariant(record, resolved = getComponentInstanceStatus(record)) {
  if (resolved.status !== "ready") return null;
  const variant = structuredClone(resolved.variant ?? { id: -1, propValues: {}, overrides: [], parentVariantId: null });
  let hasVariantPropOverride = false;
  (resolved.definition.componentProps ?? []).forEach(prop => {
    if (prop.variantPropId == null || !Object.hasOwn(record.propValues ?? {}, prop.id)) return;
    variant.propValues[prop.variantPropId] = record.propValues[prop.id];
    hasVariantPropOverride = true;
  });
  if (!hasVariantPropOverride) return variant;
  const axes = (resolved.definition.variantProps ?? [])
    .filter(axis => axis.type === "enum" || axis.type === "boolean");
  const matchingVariant = (resolved.definition.variants ?? []).find(candidate => axes.every(axis => (
    normalizeVariantPropValue(axis, candidate.propValues?.[axis.id])
      === normalizeVariantPropValue(axis, variant.propValues?.[axis.id])
  )));
  if (matchingVariant) return structuredClone(matchingVariant);
  return variant;
}

function applyAuthoredAttributes(element, attributes = {}) {
  ["role", "aria-label", "aria-checked", "aria-invalid", "aria-disabled", "disabled"].forEach((name) => {
    if (attributes[name] == null) element.removeAttribute(name);
    else element.setAttribute(name, attributes[name]);
  });
}

function createWorkspaceLayerViews(snapshot, { interactive = false, context = null } = {}) {
  context ??= { ownerComponentId: snapshot.componentId ?? currentComponent.id, instancePath: [],
    ancestors: [snapshot.componentId ?? currentComponent.id], readDefinition: getComponentDefinition };
  const make = (type, entry) => {
    const element = document.createElement("div");
    const record = { ...structuredClone(entry), element };
    element.className = `canvas-${type}`;
    element.draggable = interactive;
    element.tabIndex = -1;
    restoreElementState(element, entry.dataset, entry.style);
    element.setAttribute(`data-${type}-id`, String(entry.id));
    applyAuthoredAttributes(element, entry.attributes);
    element.setAttribute("aria-label", entry.attributes?.["aria-label"]
      ?? entry.name ?? (type === "text" ? entry.textContent : null) ?? `${type} ${entry.id}`);
    element.setAttribute("aria-selected", "false");
    syncLayerVisibility(element);
    if (type === "text") {
      if (typeof entry.richTextHtml === "string") element.innerHTML = entry.richTextHtml;
      else element.textContent = entry.textContent ?? "";
      element.contentEditable = "false";
      element.spellcheck = false;
      element.classList.toggle("is-new-empty", entry.isNew && !element.textContent);
      if (interactive) bindCanvasTextInteractions(record);
    } else if (type === "vector") {
      element.append(createCanvasSvg(entry.svgSource));
      if (interactive) bindCanvasVectorInteractions(record);
    } else if (type === "component-instance") {
      element.draggable = false;
      renderComponentInstanceContent(record, context);
      if (interactive) bindComponentInstanceInteractions(element, record.id);
    } else if (interactive) bindCanvasFrameInteractions(record);
    return record;
  };
  return snapshot.layers.map((entry) => make(entry.type, entry));
}

function renderComponentDefinition(definition, context = null) {
  if (definition.schemaVersion !== COMPONENT_SCHEMA_VERSION) throw new TypeError("Unsupported component schema version.");
  const snapshot = normalizeWorkspaceSnapshot(definition);
  context ??= { ownerComponentId: snapshot.componentId, instancePath: [],
    ancestors: [snapshot.componentId], readDefinition: getComponentDefinition };
  const views = createWorkspaceLayerViews(snapshot, { context });
  const root = document.createElement("div");
  root.className = "canvas-root-stack";
  restoreElementState(root, snapshot.componentFrame.dataset, snapshot.componentFrame.style);
  setRenderedLayerScope(root, context.ownerComponentId, snapshot.componentId, context.instancePath);
  root.removeAttribute("data-canvas-root-stack");
  applyAuthoredAttributes(root, snapshot.componentFrame.attributes);
  syncLayerVisibility(root);
  const parents = new Map([[null, root], ...views.filter((record) => record.type === "frame").map((record) => [record.id, record.element])]);
  const children = [...views].sort((a, b) => a.order - b.order);
  children.forEach((record) => {
    parents.get(record.parentId).append(record.element);
  });
  if (snapshot.layers.length) for (const dimension of ["width", "height"]) {
    if (root.dataset[`${dimension}Mode`] === "hug") root.style[dimension] = "max-content";
  }
  return root;
}

function renderComponentInstanceContent(record, context) {
  const { element } = record;
  const resolved = getComponentInstanceStatus(record, context.readDefinition);
  const cyclic = context.ancestors.includes(record.sourceComponentId);
  const path = [...context.instancePath, record.id];
  element.replaceChildren();
  if (resolved.status !== "ready" || cyclic || path.length > 64) {
    const placeholder = document.createElement("div");
    placeholder.className = "component-instance-placeholder";
    const label = cyclic || path.length > 64 ? "Invalid component reference"
      : resolved.status === "missing-variant" ? "Missing variant" : "Missing component";
    placeholder.setAttribute("role", "img");
    placeholder.setAttribute("aria-label", label);
    placeholder.textContent = `⚠ ${label}`;
    placeholder.title = `Component ${record.sourceComponentId}${record.variantId == null ? "" : ` · Variant ${record.variantId}`}`;
    for (const dimension of ["width", "height"]) {
      const saved = record.dataset?.[dimension];
      if (Number(saved) > 0) placeholder.style[dimension] = `${Number(saved)}px`;
      else if (element.style[dimension]) placeholder.style[dimension] = "100%";
    }
    element.append(placeholder);
    return;
  }
  const root = renderComponentDefinition(resolved.definition, { ...context, instancePath: path,
    ancestors: [...context.ancestors, record.sourceComponentId] });
  const variant = getInstancePropVariant(record, resolved);
  if (variant) applyComponentVariant(root, resolved.definition, variant, { ...context, instancePath: path,
    ancestors: [...context.ancestors, record.sourceComponentId] });
  (resolved.definition.componentProps ?? []).filter(prop => prop.type === "string" && Object.hasOwn(record.propValues ?? {}, prop.id)).forEach(prop => {
    applyVariantOperation(root, { target: getComponentPropVariantTarget(prop), property: prop.property, value: record.propValues[prop.id] });
  });
  (record.layerOverrides ?? []).forEach(override => applyVariantOperation(root, {
    ...override, target: createPlacedLayerIdentity(context.ownerComponentId,
      [...path, ...(override.target.kind === "placed" ? override.target.instancePath : [])], getSourceLayerIdentity(override.target)),
  }));
  /* Instance labels override text from the source variant. */
  (record.labelOverrides ?? []).forEach(override => {
    const target = findLayerElementByIdentity(root, createPlacedLayerIdentity(context.ownerComponentId, path, override.target));
    if (target) {
      target.textContent = override.value;
      target.setAttribute("aria-label", override.value);
    }
  });
  syncVariantFlexbox(root);
  namespaceVariantCloneIds(root, `instance-${context.ownerComponentId}-${path.join("-")}`);
  root.classList.add("component-instance-content");
  Object.entries(record.presentation?.style ?? {}).forEach(([key, value]) => root.style.setProperty(key, value));
  Object.assign(root.dataset, record.presentation?.dataset ?? {});
  instancePresentationBaselines.set(root, { style: Object.fromEntries([...root.style].map(key => [key, root.style.getPropertyValue(key)])), dataset: { ...root.dataset } });
  root.querySelectorAll(".canvas-text").forEach(text => {
    if (text.closest("[data-identity-source]") === root) text.classList.add("instance-editable-label");
  });
  root.querySelectorAll("[contenteditable]").forEach(node => node.setAttribute("contenteditable", "false"));
  element.append(root);
  syncComponentInstanceSizing(element, element.parentElement);
}

function getComponentInstanceSizingStyle(element, parentElement = element?.parentElement) {
  const content = element?.firstElementChild;
  if (!(content instanceof HTMLElement)) return {};
  const widthMode = getLayerDimensionMode(content, "width", "fixed");
  const heightMode = getLayerDimensionMode(content, "height", "fixed");
  const parentDirection = parentElement instanceof HTMLElement
    && (parentElement.style.flexDirection === "column" || parentElement.dataset.direction === "vertical")
    ? "vertical" : "horizontal";
  const mainMode = parentDirection === "vertical" ? heightMode : widthMode;
  const crossMode = parentDirection === "vertical" ? widthMode : heightMode;
  return {
    width: widthMode === "fill" ? "auto" : undefined,
    height: heightMode === "fill" ? "auto" : undefined,
    flex: mainMode === "fill" ? "1 1 0" : "0 0 auto",
    alignSelf: crossMode === "fill" ? "stretch" : "",
    minWidth: parentDirection === "horizontal" && widthMode === "fill" ? "0" : "",
    minHeight: parentDirection === "vertical" && heightMode === "fill" ? "0" : "",
  };
}

function syncComponentInstanceSizing(element, parentElement = element?.parentElement) {
  if (!(element instanceof HTMLElement)) return;
  const style = getComponentInstanceSizingStyle(element, parentElement);
  ["width", "height"].forEach((property) => {
    const marker = `instanceSizing${property[0].toUpperCase()}${property.slice(1)}`;
    if (style[property] !== undefined) {
      element.style[property] = style[property];
      element.dataset[marker] = "true";
    } else if (element.dataset[marker] === "true") {
      element.style[property] = "";
      delete element.dataset[marker];
    }
  });
  ["flex", "alignSelf", "minWidth", "minHeight"].forEach((property) => {
    element.style[property] = style[property] ?? "";
  });
}

function getExportComponentInstanceSizingStyle(element, parentElement = element?.parentElement) {
  const content = element?.firstElementChild;
  if (!(content instanceof HTMLElement) || content.classList.contains("component-instance-placeholder")) return {};
  const widthMode = getLayerDimensionMode(content, "width", "fixed");
  const heightMode = getLayerDimensionMode(content, "height", "fixed");
  const vertical = parentElement instanceof HTMLElement
    && (parentElement.style.flexDirection === "column" || parentElement.dataset.direction === "vertical");
  const mainMode = vertical ? heightMode : widthMode;
  const crossMode = vertical ? widthMode : heightMode;
  if (widthMode !== "fill" && heightMode !== "fill") return {};
  return {
    width: widthMode === "fill" ? (vertical ? "100%" : "auto") : undefined,
    height: heightMode === "fill" ? (vertical ? "auto" : "100%") : undefined,
    flex: mainMode === "fill" ? "1 1 0" : undefined,
    alignSelf: crossMode === "fill" ? "stretch" : undefined,
    minWidth: !vertical && widthMode === "fill" ? 0 : undefined,
    minHeight: vertical && heightMode === "fill" ? 0 : undefined,
  };
}

function isInstanceSettingProperty(property) {
  return property === "instanceVariantId" || /^instance(?:Label|Prop):[1-9]\d*$/.test(property);
}

function resolveInstanceSettings(record, operations, componentId) {
  const result = { ...record, labelOverrides: structuredClone(record.labelOverrides ?? []), propValues: { ...record.propValues } };
  operations.forEach(operation => {
    if (toLocalLayerKey(operation.target, componentId) !== `component-instance:${record.id}`) return;
    if (operation.property === "instanceVariantId") result.variantId = operation.value;
    if (/^instanceProp:[1-9]\d*$/.test(operation.property)) result.propValues[operation.property.split(":")[1]] = operation.value;
    if (/^instanceLabel:[1-9]\d*$/.test(operation.property)) {
      const target = createSourceLayerIdentity(record.sourceComponentId, "text", Number(operation.property.split(":")[1]));
      result.labelOverrides = result.labelOverrides.filter(entry => !sameLayerIdentity(entry.target, target));
      result.labelOverrides.push({ target, value: operation.value });
    }
  });
  return result;
}

function applyComponentVariant(root, definition, variant, context) {
  const operations = resolveVariantOperations(variant, definition);
  definition.layers.filter(record => record.type === "component-instance").forEach(record => {
    const element = findLayerElementByIdentity(root, createPlacedLayerIdentity(context.ownerComponentId, context.instancePath,
      createSourceLayerIdentity(definition.componentId, "component-instance", record.id)));
    if (element) renderComponentInstanceContent({ ...resolveInstanceSettings(record, operations, definition.componentId), element }, context);
  });
  operations.filter(operation => !isInstanceSettingProperty(operation.property)).forEach(operation => {
    const identity = normalizeLayerIdentity(operation.target, definition.componentId);
    const source = getSourceLayerIdentity(identity);
    if (identity.kind === "source" && source.componentId !== definition.componentId) return;
    if (identity.kind === "placed" && identity.ownerComponentId !== definition.componentId) return;
    applyVariantOperation(root, { ...operation, target: createPlacedLayerIdentity(context.ownerComponentId,
      [...context.instancePath, ...(identity.kind === "placed" ? identity.instancePath : [])], source) });
  });
}

let componentInstanceRefreshFrame = null;
const componentInstanceRenderSignatures = new WeakMap();
function scheduleComponentInstanceRefresh() {
  if (componentInstanceRefreshFrame !== null) return;
  componentInstanceRefreshFrame = requestAnimationFrame(() => {
    componentInstanceRefreshFrame = null;
    if (instanceTextEditing) return;
    let changed = false;
    const definitions = new Map();
    const readDefinition = id => {
      if (!definitions.has(id)) definitions.set(id, getComponentDefinition(id));
      return definitions.get(id);
    };
    const dependencySignature = (id, visited = new Set()) => {
      if (visited.has(id)) return id;
      visited.add(id);
      const definition = readDefinition(id);
      return [definition, ...(definition?.layers ?? []).filter(node => node.type === "component-instance")
        .map(node => dependencySignature(node.sourceComponentId, visited))];
    };
    layerRecords.filter(record => record.type === "component-instance").forEach(record => {
      const signature = JSON.stringify([record.sourceComponentId, record.variantId, record.labelOverrides, record.propValues, record.presentation, record.layerOverrides, dependencySignature(record.sourceComponentId)]);
      if (componentInstanceRenderSignatures.get(record.element) === signature) return;
      renderComponentInstanceContent(record, { ownerComponentId: currentComponent.id, instancePath: [],
        ancestors: [currentComponent.id], readDefinition });
      componentInstanceRenderSignatures.set(record.element, signature);
      changed = true;
    });
    if (changed) {
      scheduleVariantRender();
      renderLayerTree();
      if (getSelectedComponentInstances().length && !componentInstanceInspector.contains(document.activeElement)) updateInspector();
    }
  });
}
