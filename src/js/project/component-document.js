/* Plain component definitions and the boundary between documents and editor views. */

const COMPONENT_SCHEMA_VERSION = 4;
const COMPONENT_DOCUMENT_FIELDS = [
  "componentId", "componentName", "componentFrame", "layers",
  "nextFrameId", "nextTextId", "nextVectorId", "nextComponentInstanceId", "nextLayerOrder", "componentProps",
  "nextComponentPropId", "variantProps", "variantRules", "variants", "variantModelVersion",
  "nextVariantPropId", "nextVariantRuleId", "nextVariantId",
];

function getComponentDefinition(componentId) {
  const component = components.find((entry) => entry.id === componentId);
  if (!component) return null;
  // Reading a definition never activates a component or reads its canvas.
  const definition = { schemaVersion: COMPONENT_SCHEMA_VERSION };
  COMPONENT_DOCUMENT_FIELDS.forEach((key) => {
    if (component.workspace[key] !== undefined) definition[key] = component.workspace[key];
  });
  definition.componentName = component.name;
  return structuredClone(definition);
}

function getComponentDefinitionLayer(definition, type, id) {
  if (type === "component") return definition.componentFrame;
  return findLayerNode(definition.layers, { type, id });
}

function getComponentDefinitionChildren(definition, parentId = null) {
  return getLayerNodeChildren(definition.layers, parentId).map((record) => ({ type: record.type, record }));
}

function updateComponentDefinition(componentId, definition) {
  const component = components.find((entry) => entry.id === componentId);
  if (!component) return false;
  if (definition.componentId !== componentId) throw new TypeError("Component identity cannot be changed.");
  if (definition.schemaVersion !== COMPONENT_SCHEMA_VERSION) throw new TypeError("Unsupported component schema version.");
  const next = normalizeWorkspaceSnapshot({ ...component.workspace, ...structuredClone(definition) });
  validateComponentDependencies(next);
  // Prepare the complete view before changing either document or history.
  createWorkspaceLayerViews(next);
  if (component === currentComponent) {
    recordHistory();
    restoreWorkspaceState(next);
    saveCurrentComponentWorkspace();
  } else {
    const previousName = component.name;
    component.undoHistory.push(structuredClone(component.workspace));
    if (component.undoHistory.length > HISTORY_LIMIT) component.undoHistory.shift();
    component.redoHistory = [];
    component.workspace = next;
    component.name = next.componentName;
    component.frameRecord.name = next.componentName;
    if (previousName !== component.name) renameComponentInstances(component.id, component.name);
    renderLayerTree();
  }
  scheduleComponentInstanceRefresh();
  return true;
}

// Instance names follow a source rename without creating separate owner edits.
// Update saved owner history too, so undoing an unrelated owner edit cannot
// resurrect an obsolete source name. Undoing the source rename calls this again.
function renameComponentInstances(sourceComponentId, name) {
  const renameSnapshot = snapshot => {
    (snapshot?.layers ?? []).forEach(node => {
      if (node.type !== "component-instance" || node.sourceComponentId !== sourceComponentId) return;
      node.name = name;
      node.attributes = { ...node.attributes, "aria-label": name };
    });
    if (snapshot?.kind === "component-deletion") {
      renameSnapshot(snapshot.component.workspace);
      (snapshot.component.undoHistory ?? []).forEach(renameSnapshot);
      (snapshot.component.redoHistory ?? []).forEach(renameSnapshot);
    }
  };
  components.forEach(component => {
    renameSnapshot(component.workspace);
    component.undoHistory.forEach(renameSnapshot);
    component.redoHistory.forEach(renameSnapshot);
  });
  undoHistory.forEach(renameSnapshot);
  redoHistory.forEach(renameSnapshot);
  layerRecords.filter(record => record.type === "component-instance" && record.sourceComponentId === sourceComponentId)
    .forEach(record => { record.name = name; record.element.setAttribute("aria-label", name); });
  scheduleVariantRender();
  scheduleComponentInstanceRefresh();
}

// Missing references are retained for recovery (including undo of source deletion).
// Resolution never substitutes a different component or variant.
function getComponentInstanceStatus(instance, readDefinition = getComponentDefinition) {
  const source = readDefinition(instance.sourceComponentId);
  if (!source) return { status: "missing-component", definition: null, variant: null };
  const variant = instance.variantId == null ? getDefinitionDefaultVariant(source)
    : source.variants?.find((entry) => entry.id === instance.variantId);
  if (instance.variantId != null && !variant) return { status: "missing-variant", definition: source, variant: null };
  return { status: "ready", definition: source, variant };
}

function getDefinitionDefaultVariant(definition) {
  const variants = definition?.variants ?? [];
  const axes = (definition?.variantProps ?? []).filter(prop => prop.type === "enum" || prop.type === "boolean");
  return variants.find(variant => axes.every(prop =>
    normalizeVariantPropValue(prop, variant.propValues?.[prop.id]) === getVariantPropDefaultValue(prop))) ?? variants[0] ?? null;
}

function validateComponentDependencies(candidate, readDefinition = getComponentDefinition) {
  const visited = new Set();
  const active = new Set();
  const visit = (id) => {
    if (active.has(id)) throw new TypeError("Circular component nesting is not allowed.");
    if (visited.has(id)) return;
    const definition = id === candidate.componentId ? candidate : readDefinition(id);
    if (!definition) return;
    active.add(id);
    (definition.layers ?? []).filter((node) => node.type === "component-instance")
      .forEach((node) => visit(node.sourceComponentId));
    active.delete(id);
    visited.add(id);
  };
  visit(candidate.componentId);
}

function addComponentInstance(componentId, sourceComponentId, { variantId = null, parentId = null, name } = {}) {
  const definition = getComponentDefinition(componentId);
  if (!definition) return null;
  requireIdentityId(sourceComponentId, "source component ID");
  if (variantId !== null) requireIdentityId(variantId, "variant ID");
  const instance = {
    type: "component-instance", id: definition.nextComponentInstanceId ?? 1,
    sourceComponentId, variantId, parentId, order: definition.nextLayerOrder,
    name: name ?? "Component instance", dataset: {}, style: null, attributes: {},
  };
  if (getComponentInstanceStatus(instance).status !== "ready") throw new TypeError("Component instance source or variant does not exist.");
  definition.layers.push(instance);
  definition.nextComponentInstanceId = instance.id + 1;
  definition.nextLayerOrder += 1;
  updateComponentDefinition(componentId, definition);
  return structuredClone(instance);
}

function normalizeInstanceLabelOverrides(overrides = [], sourceComponentId) {
  if (!Array.isArray(overrides)) throw new TypeError("Instance label overrides must be an array.");
  const keys = new Set();
  return overrides.map(override => {
    const target = normalizeLayerIdentity(override?.target);
    const key = getLayerIdentityKey(target);
    if (target.kind !== "source" || target.componentId !== sourceComponentId || target.type !== "text"
      || typeof override.value !== "string" || keys.has(key)) throw new TypeError("Invalid instance text-label override.");
    keys.add(key);
    return { target, value: override.value };
  });
}

const INSTANCE_LAYER_PROPERTIES = Object.freeze(["backgroundColor", "color", "opacity", "borderRadius", "width", "height",
  "fontFamily", "fontSize", "fontWeight", "lineHeight", "letterSpacing", "display", "alignContent", "textAlign", "visibility"]);
function normalizeInstanceLayerOverrides(overrides = [], sourceComponentId) {
  if (!Array.isArray(overrides)) throw new TypeError("Instance layer overrides must be an array.");
  const seen = new Set();
  return overrides.map(override => {
    const target = normalizeLayerIdentity(override?.target);
    const key = `${getLayerIdentityKey(target)}:${override.property}`;
    const source = getSourceLayerIdentity(target);
    if ((target.kind === "source" && source.componentId !== sourceComponentId)
      || (target.kind === "placed" && (target.ownerComponentId !== sourceComponentId || target.instancePath.length === 0))
      || !["frame", "text", "vector", "component-instance"].includes(source.type)
      || !INSTANCE_LAYER_PROPERTIES.includes(override.property)
      || (source.type === "component-instance" && override.property !== "visibility")
      || (override.property === "backgroundColor" && source.type !== "frame")
      || (override.property === "color" && source.type !== "text")
      || (override.property === "borderRadius" && source.type !== "frame")
      || (["width", "height"].includes(override.property) && !["frame", "text"].includes(source.type))
      || (["fontFamily", "fontSize", "fontWeight", "lineHeight", "letterSpacing", "display", "alignContent", "textAlign"].includes(override.property) && source.type !== "text")
      || typeof override.value !== "string" || seen.has(key)) throw new TypeError("Invalid instance layer override.");
    seen.add(key);
    return { target, property: override.property, value: override.value };
  });
}

function getInstanceLabelValue(instance, target, readDefinition = getComponentDefinition) {
  const override = (instance.labelOverrides ?? []).find(entry => sameLayerIdentity(entry.target, target));
  if (override) return override.value;
  const { status, definition, variant } = getComponentInstanceStatus(instance, readDefinition);
  if (status !== "ready") return null;
  const layer = getComponentDefinitionLayer(definition, target.type, target.id);
  if (!layer || target.componentId !== definition.componentId) return null;
  let value = layer.textContent ?? "";
  if (variant) resolveVariantOperations(variant, definition).forEach(operation => {
    const local = toLocalLayerKey(operation.target, definition.componentId);
    if (local !== `text:${target.id}`) return;
    if (operation.property === "textContent") value = String(operation.value ?? "");
    if (operation.property === "richTextHtml") value = getTextContentFromHtml(operation.value);
  });
  return value;
}

// Null resets inheritance; an empty string is an explicit blank label.
function setComponentInstanceLabel(componentId, instanceIds, target, value) {
  const definition = getComponentDefinition(componentId);
  if (!definition || !instanceIds.length) return false;
  target = normalizeLayerIdentity(target);
  if (target.kind !== "source" || target.type !== "text" || (value !== null && typeof value !== "string")) {
    throw new TypeError("Text labels require a source text identity and a string value.");
  }
  const instances = [...new Set(instanceIds)].map(id => getComponentDefinitionLayer(definition, "component-instance", id));
  if (instances.some(instance => !instance || instance.sourceComponentId !== target.componentId)) throw new TypeError("Instance label source mismatch.");
  if (value !== null && instances.some(instance => {
    const resolved = getComponentInstanceStatus(instance);
    return resolved.status !== "ready" || !getComponentDefinitionLayer(resolved.definition, "text", target.id);
  })) throw new TypeError("The source text layer or variant is missing.");
  let changed = false;
  instances.forEach(instance => {
    const previous = instance.labelOverrides ?? [];
    const existing = previous.find(entry => sameLayerIdentity(entry.target, target));
    if ((value === null && !existing) || (existing && existing.value === value)) return;
    instance.labelOverrides = previous.filter(entry => !sameLayerIdentity(entry.target, target));
    if (value !== null) instance.labelOverrides.push({ target, value });
    changed = true;
  });
  return changed ? updateComponentDefinition(componentId, definition) : false;
}

// Existing DOM controls commit through this adapter. The document retains no
// elements; a definition can be read or rendered after its editor view is gone.
function commitCanvasComponentData() {
  if (!currentComponent || isRestoringHistory || canvasMutationDepth > 0) return;
  if (currentComponent.workspace.componentName !== currentComponent.name) renameComponentInstances(currentComponent.id, currentComponent.name);
  currentComponent.workspace = captureWorkspaceState();
  scheduleComponentInstanceRefresh();
}

function observeCanvasComponentData() {
  const observer = new MutationObserver(() => commitCanvasComponentData());
  observer.observe(canvasRootStack, {
    subtree: true, attributes: true, childList: true, characterData: true,
  });
  // Property/variant changes can be data-only. Commit after event handlers run.
  ["input", "change", "click", "pointerup", "keyup", "focusout"].forEach((name) => {
    document.addEventListener(name, () => queueMicrotask(commitCanvasComponentData), true);
  });
}
