/* Stable addresses for source layers and occurrences inside placed components. */

const LAYER_IDENTITY_PREFIX = "layer@1:";
const IDENTITY_LAYER_TYPES = Object.freeze(["component", "frame", "text", "vector", "component-instance"]);

function requireIdentityId(value, label, allowZero = false) {
  if (!Number.isSafeInteger(value) || value < (allowZero ? 0 : 1)) {
    throw new TypeError(`Invalid ${label}.`);
  }
  return value;
}

function createSourceLayerIdentity(componentId, type, id) {
  requireIdentityId(componentId, "component ID");
  if (!IDENTITY_LAYER_TYPES.includes(type)) throw new TypeError("Invalid layer type.");
  requireIdentityId(id, "layer ID", type === "component");
  if (type === "component" && id !== 0) throw new TypeError("Component roots use layer ID 0.");
  return Object.freeze({ kind: "source", componentId, type, id });
}

function createPlacedLayerIdentity(ownerComponentId, instancePath, source) {
  requireIdentityId(ownerComponentId, "owner component ID");
  if (!Array.isArray(instancePath)) throw new TypeError("Instance path must be an array.");
  const path = instancePath.map((id) => requireIdentityId(id, "component instance ID"));
  const normalizedSource = normalizeLayerIdentity(source);
  if (normalizedSource.kind !== "source") throw new TypeError("Placed layers require a source identity.");
  if (path.length === 0 && normalizedSource.componentId !== ownerComponentId) {
    throw new TypeError("An empty instance path must address its owner component.");
  }
  return Object.freeze({ kind: "placed", ownerComponentId, instancePath: Object.freeze(path), source: normalizedSource });
}

function normalizeLayerIdentity(value, legacyComponentId = null) {
  if (typeof value === "string") {
    if (value.startsWith(LAYER_IDENTITY_PREFIX)) {
      return normalizeLayerIdentity(JSON.parse(value.slice(LAYER_IDENTITY_PREFIX.length)));
    }
    if (value === "component") value = "component:0";
    const match = /^(component|frame|text|vector|component-instance):(0|[1-9]\d*)$/.exec(value);
    if (!match || legacyComponentId == null) throw new TypeError("A local layer key requires an explicit component ID.");
    return createSourceLayerIdentity(legacyComponentId, match[1], Number(match[2]));
  }
  if (value?.kind === "source") return createSourceLayerIdentity(value.componentId, value.type, value.id);
  if (value?.kind === "placed") return createPlacedLayerIdentity(value.ownerComponentId, value.instancePath, value.source);
  throw new TypeError("Invalid layer identity.");
}

function getLayerIdentityKey(value, legacyComponentId = null) {
  return LAYER_IDENTITY_PREFIX + JSON.stringify(normalizeLayerIdentity(value, legacyComponentId));
}

function sameLayerIdentity(first, second, legacyComponentId = null) {
  return getLayerIdentityKey(first, legacyComponentId) === getLayerIdentityKey(second, legacyComponentId);
}

function getSourceLayerIdentity(value, legacyComponentId = null) {
  const identity = normalizeLayerIdentity(value, legacyComponentId);
  return identity.kind === "source" ? identity : identity.source;
}

function sameLayerSource(first, second, legacyComponentId = null) {
  return sameLayerIdentity(getSourceLayerIdentity(first, legacyComponentId), getSourceLayerIdentity(second, legacyComponentId));
}

function toLocalLayerKey(value, componentId) {
  try {
    const identity = normalizeLayerIdentity(value, componentId);
    if (identity.kind === "placed" && (identity.ownerComponentId !== componentId || identity.instancePath.length > 0)) return null;
    const source = getSourceLayerIdentity(identity);
    return source.componentId === componentId ? `${source.type}:${source.id}` : null;
  } catch { return null; }
}

function toRuntimeLayerTarget(value, componentId) {
  return toLocalLayerKey(value, componentId) ?? getLayerIdentityKey(value, componentId);
}

// The injected reader lets dependency/path checks run against plain fixture data
// before component-instance nodes are supported by the authoring UI.
function resolveLayerIdentity(value, readDefinition = getComponentDefinition) {
  let identity;
  try { identity = normalizeLayerIdentity(value); } catch { return null; }
  const source = getSourceLayerIdentity(identity);
  const ownerId = identity.kind === "placed" ? identity.ownerComponentId : source.componentId;
  let definition = readDefinition(ownerId);
  if (!definition || definition.componentId !== ownerId) return null;
  const visited = new Set([ownerId]);
  for (const instanceId of identity.kind === "placed" ? identity.instancePath : []) {
    const instance = definition.layers?.find((node) => node.type === "component-instance" && node.id === instanceId);
    if (!instance || visited.has(instance.sourceComponentId)) return null;
    definition = readDefinition(instance.sourceComponentId);
    if (!definition || definition.componentId !== instance.sourceComponentId) return null;
    visited.add(definition.componentId);
  }
  if (definition.componentId !== source.componentId) return null;
  const node = source.type === "component" ? definition.componentFrame
    : definition.layers?.find((entry) => entry.type === source.type && entry.id === source.id);
  return node ? { identity, source, definition, node } : null;
}

function createLayerIdentitySelection(values, primary = null) {
  const byKey = new Map(values.map((value) => {
    const identity = normalizeLayerIdentity(value);
    return [getLayerIdentityKey(identity), identity];
  }));
  const identities = [...byKey.values()];
  const primaryIdentity = primary == null ? identities.at(-1) ?? null
    : byKey.get(getLayerIdentityKey(primary)) ?? identities.at(-1) ?? null;
  return { identities, primaryIdentity };
}

function mapSelectionLayerReferences(selection, mapReference) {
  if (!selection) return selection;
  const next = { ...selection };
  for (const key of ["keys", "targets"]) {
    if (Array.isArray(next[key])) next[key] = next[key].map(mapReference);
  }
  for (const key of ["primaryKey", "target", "anchorTarget"]) {
    if (next[key] != null) next[key] = mapReference(next[key]);
  }
  if (next.targetsByVariant) next.targetsByVariant = Object.fromEntries(
    Object.entries(next.targetsByVariant).map(([id, values]) => [id, values.map(mapReference)]),
  );
  return next;
}

function qualifySelectionLayerReferences(selection, componentId) {
  return mapSelectionLayerReferences(selection, (value) => {
    const identity = normalizeLayerIdentity(value, componentId);
    return identity.kind === "placed" ? identity : createPlacedLayerIdentity(componentId, [], identity);
  });
}

function qualifyVariantLayerReferences(variants, componentId) {
  return variants.map((variant) => ({ ...structuredClone(variant), overrides: (variant.overrides ?? []).map((override) => ({
    ...structuredClone(override), target: normalizeLayerIdentity(override.target, componentId),
  })) }));
}

function getSelectedLayerIdentities() {
  const componentId = selectionState.componentId;
  if (componentId == null) return [];
  const targets = selectionState.kind === "layers" ? getSelectedLayerKeys() : getSelectedVariantLayerTargets();
  return createLayerIdentitySelection(targets.map((target) => createPlacedLayerIdentity(
    componentId, [], normalizeLayerIdentity(target, componentId),
  ))).identities;
}

function setRenderedLayerScope(root, ownerComponentId, sourceComponentId = ownerComponentId, instancePath = []) {
  const identity = createPlacedLayerIdentity(ownerComponentId, instancePath,
    createSourceLayerIdentity(sourceComponentId, "component", 0));
  root.dataset.identityOwner = String(identity.ownerComponentId);
  root.dataset.identitySource = String(identity.source.componentId);
  root.dataset.identityPath = JSON.stringify(identity.instancePath);
}

function getAuthoredLayerDataset(element) {
  return Object.fromEntries(Object.entries(element.dataset).filter(([key]) => !["identityOwner", "identitySource", "identityPath"].includes(key)));
}

function getRenderedLayerScope(root) {
  if (!root?.hasAttribute("data-identity-source")) return null;
  try {
    return createPlacedLayerIdentity(Number(root.dataset.identityOwner), JSON.parse(root.dataset.identityPath),
      createSourceLayerIdentity(Number(root.dataset.identitySource), "component", 0));
  } catch { return null; }
}

function findLayerElementByIdentity(root, value) {
  if (!(root instanceof HTMLElement)) return null;
  const rootScope = getRenderedLayerScope(root);
  if (root.hasAttribute("data-identity-source") && !rootScope) return null;
  let identity;
  try { identity = normalizeLayerIdentity(value, rootScope?.source.componentId ?? currentComponent?.id); }
  catch { return null; }
  const source = getSourceLayerIdentity(identity);
  let scope = root;
  if (identity.kind === "placed") {
    const scopes = [root, ...root.querySelectorAll("[data-identity-source]")].filter((candidate) => {
      const candidateScope = getRenderedLayerScope(candidate);
      return candidateScope && candidateScope.ownerComponentId === identity.ownerComponentId
        && candidateScope.source.componentId === source.componentId
        && JSON.stringify(candidateScope.instancePath) === JSON.stringify(identity.instancePath);
    });
    // Ambiguous roots (e.g. two variant previews) require a narrower render root.
    if (scopes.length !== 1) return null;
    [scope] = scopes;
  } else if (source.componentId !== (rootScope?.source.componentId ?? currentComponent?.id)) return null;
  if (source.type === "component") return scope;
  const selector = `[data-${source.type}-id="${source.id}"]`;
  const matches = [...scope.querySelectorAll(selector)].filter((element) => {
    const nearestScope = element.closest("[data-identity-source]");
    return nearestScope ? nearestScope === scope : !rootScope && scope.contains(element);
  });
  return matches.length === 1 ? matches[0] : null;
}
