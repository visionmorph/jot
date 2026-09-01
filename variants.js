/* Component variant properties, delta resolution, canvas previews, and instance overrides. */

let variantRenderFrame = null;

let variantPointerDrag = null;

function getVariantPropValues(prop) {
  if (prop.type === "boolean") return [false, true];
  if (prop.type === "enum") return prop.options?.length ? prop.options : ["Default"];
  return [];
}

function getVariantPropDefaultValue(prop) {
  if (prop.type === "boolean") return prop.defaultValue === true || prop.defaultValue === "true";
  if (prop.type === "enum") return getVariantPropValues(prop)[0] ?? "Default";
  if (prop.type === "string") return String(prop.defaultValue ?? "");
  return null;
}

function normalizeVariantPropValue(prop, value) {
  if (prop.type === "boolean") {
    const hasValidValue = value === true || value === false || value === "true" || value === "false";
    const resolvedValue = hasValidValue ? value : getVariantPropDefaultValue(prop);
    return resolvedValue === true || resolvedValue === "true";
  }
  if (prop.type === "string") return String(value ?? "");
  if (prop.type === "action") return null;
  const values = getVariantPropValues(prop);
  return values.includes(value) ? value : getVariantPropDefaultValue(prop);
}

function ensureVariantCollections() {
  variantModel.getProps().forEach((prop) => {
    if (prop.type === "enum" && (!Array.isArray(prop.options) || prop.options.length === 0)) {
      prop.options = ["Default"];
    }
  });
  variantModel.getInstances().forEach((instance) => {
    if (!instance.propValues || typeof instance.propValues !== "object" || Array.isArray(instance.propValues)) {
      instance.propValues = {};
    }
    getLocalVariantOverrides(instance);
  });
  variantModel.getRules().forEach((rule) => {
    if (!rule.conditions || typeof rule.conditions !== "object" || Array.isArray(rule.conditions)) {
      rule.conditions = {};
    }
  });
}

function getVariantInstancePropValues(instance) {
  if (!instance) return null;
  if (!instance.propValues || typeof instance.propValues !== "object" || Array.isArray(instance.propValues)) {
    instance.propValues = {};
  }
  return instance.propValues;
}

function setVariantInstancePropValue(instance, variantPropId, value) {
  const propValues = getVariantInstancePropValues(instance);
  if (!propValues) return false;
  propValues[variantPropId] = value;
  return true;
}

function removeVariantPropValueFromAllInstances(variantPropId) {
  variantModel.getInstances().forEach((instance) => {
    const propValues = getVariantInstancePropValues(instance);
    if (propValues) delete propValues[variantPropId];
  });
}

function getVariantRuleConditions(rule) {
  if (!rule) return null;
  if (!rule.conditions || typeof rule.conditions !== "object" || Array.isArray(rule.conditions)) {
    rule.conditions = {};
  }
  return rule.conditions;
}

function pruneEmptyVariantRules() {
  variantModel.replaceRules(
    variantModel.getRules().filter((rule) => Object.keys(getVariantRuleConditions(rule)).length > 0),
  );
}

function clearVariantRuleConditionsForProp(variantPropId) {
  variantModel.getRules().forEach((rule) => {
    const conditions = getVariantRuleConditions(rule);
    delete conditions[variantPropId];
  });
  pruneEmptyVariantRules();
}

function removeInvalidVariantRuleConditions(variantPropId, validValues) {
  variantModel.getRules().forEach((rule) => {
    const conditions = getVariantRuleConditions(rule);
    if (Object.prototype.hasOwnProperty.call(conditions, variantPropId)
      && !validValues.includes(conditions[variantPropId])) delete conditions[variantPropId];
  });
  pruneEmptyVariantRules();
}

function removeVariantPropDefinition(variantPropId) {
  variantModel.replaceProps(variantModel.getProps().filter((prop) => prop.id !== variantPropId));
  removeVariantPropValueFromAllInstances(variantPropId);
  clearVariantRuleConditionsForProp(variantPropId);
}

function getLocalVariantOverrides(instance) {
  if (!instance) return null;
  if (!Array.isArray(instance.overrides)) instance.overrides = [];
  return instance.overrides;
}

function upsertLocalVariantOverride(instance, target, property, value) {
  const overrides = getLocalVariantOverrides(instance);
  if (!overrides) return { changed: false, override: null };
  const override = overrides.find((entry) => entry.target === target && entry.property === property);
  if (override?.value === value) return { changed: false, override };
  if (override) {
    override.value = value;
    return { changed: true, override };
  }
  const nextOverride = { target, property, value };
  overrides.push(nextOverride);
  return { changed: true, override: nextOverride };
}

function unlinkComponentPropVariantDefinition(componentProp) {
  if (componentProp.variantPropId == null) return;
  const variantPropId = componentProp.variantPropId;
  removeVariantPropDefinition(variantPropId);
  delete componentProp.variantPropId;
  renderVariantSystem();
}

function isVariantBoundComponentProp(componentProp) {
  return componentProp?.type === "enum" || componentProp?.type === "boolean";
}

function syncComponentPropVariantDefinition(componentProp, { render = true } = {}) {
  if (!isVariantBoundComponentProp(componentProp)) {
    unlinkComponentPropVariantDefinition(componentProp);
    return;
  }
  const isBoolean = componentProp.type === "boolean";
  const booleanDefault = componentProp.defaultValue === true || componentProp.defaultValue === "true";
  const options = [...getComponentPropOptions(componentProp)];
  const defaultValue = isBoolean ? booleanDefault : options[0];
  let variantProp = variantModel.getProps().find((prop) => prop.id === componentProp.variantPropId);
  if (!variantProp) {
    variantProp = variantModel.addProp({
      name: componentProp.name,
      type: isBoolean ? "boolean" : "enum",
      ...(isBoolean ? {} : { options }),
      ...(componentProp.variantSubtype ? { variantSubtype: componentProp.variantSubtype } : {}),
      defaultValue,
      sourceComponentPropId: componentProp.id,
    });
    componentProp.variantPropId = variantProp.id;
  } else {
    variantProp.name = componentProp.name;
    variantProp.type = isBoolean ? "boolean" : "enum";
    if (componentProp.variantSubtype) variantProp.variantSubtype = componentProp.variantSubtype;
    else delete variantProp.variantSubtype;
    if (isBoolean) {
      delete variantProp.options;
      variantProp.defaultValue = booleanDefault;
    } else {
      variantProp.options = options;
      variantProp.defaultValue = options[0];
    }
  }
  componentProp.defaultValue = getVariantPropDefaultValue(variantProp);
  variantModel.getInstances().forEach((instance) => {
    const propValues = getVariantInstancePropValues(instance);
    const booleanValue = propValues[variantProp.id];
    const hasValidBooleanValue = booleanValue === true || booleanValue === false
      || booleanValue === "true" || booleanValue === "false";
    if (isBoolean && !hasValidBooleanValue) {
      setVariantInstancePropValue(instance, variantProp.id, getVariantPropDefaultValue(variantProp));
    }
    if (!isBoolean && !options.includes(propValues[variantProp.id])) {
      setVariantInstancePropValue(instance, variantProp.id, getVariantPropDefaultValue(variantProp));
    }
  });
  if (!isBoolean) removeInvalidVariantRuleConditions(variantProp.id, options);
  if (render) renderVariantSystem();
}

function getVariantInstance(instanceId = selectedVariantInstanceId) {
  return variantModel.getInstances().find((instance) => instance.id === instanceId) ?? null;
}

function getAuthoredDefaultVariantInstance() {
  if (variantModel.getInstances().length === 0) return null;
  const axes = variantModel.getProps().filter((prop) => prop.type === "enum" || prop.type === "boolean");
  if (axes.length === 0) return variantModel.getInstances()[0];
  return variantModel.getInstances().find((instance) => axes.every((prop) => (
    normalizeVariantPropValue(prop, instance.propValues?.[prop.id]) === getVariantPropDefaultValue(prop)
  ))) ?? null;
}

function getDefaultVariantInstance() {
  return getAuthoredDefaultVariantInstance() ?? variantModel.getInstances()[0] ?? null;
}

function setInferredVariantBooleanDefault(prop, value) {
  if (prop?.type !== "boolean") return;
  const nextDefault = Boolean(value);
  prop.defaultValue = nextDefault;
  const sourceComponentProp = componentProps.find((componentProp) => (
    componentProp.variantPropId === prop.id
    || (prop.sourceComponentPropId != null && componentProp.id === prop.sourceComponentPropId)
  ));
  if (sourceComponentProp) sourceComponentProp.defaultValue = nextDefault;
}

function setVariantBooleanValue(instance, prop, value) {
  if (!instance || prop?.type !== "boolean") return;
  const wasDefaultInstance = instance === getDefaultVariantInstance();
  const nextValue = Boolean(value);
  setVariantInstancePropValue(instance, prop.id, nextValue);
  if (wasDefaultInstance) setInferredVariantBooleanDefault(prop, nextValue);
}

function normalizeDefaultVariantInstance() {
  ensureVariantCollections();
  variantModel.getProps().forEach((prop) => {
    if (prop.type === "enum") prop.defaultValue = getVariantPropDefaultValue(prop);
    else if (prop.type === "boolean") prop.defaultValue = getVariantPropDefaultValue(prop);
  });
  variantModel.getInstances().forEach((instance) => {
    delete instance.isDefault;
    const propValues = getVariantInstancePropValues(instance);
    variantModel.getProps().filter((prop) => prop.type !== "action").forEach((prop) => {
      setVariantInstancePropValue(instance, prop.id, normalizeVariantPropValue(prop, propValues[prop.id]));
    });
    if (instance.parentVariantId == null
      || instance.parentVariantId === instance.id
      || !getVariantInstance(instance.parentVariantId)) {
      instance.parentVariantId = null;
    }
  });
  variantModel.getInstances().forEach((instance) => {
    const visited = new Set([instance.id]);
    let parent = instance.parentVariantId == null ? null : getVariantInstance(instance.parentVariantId);
    while (parent) {
      if (visited.has(parent.id)) {
        instance.parentVariantId = null;
        break;
      }
      visited.add(parent.id);
      parent = getVariantInstance(parent.parentVariantId);
    }
  });
  return getDefaultVariantInstance();
}

function isSoleAuthoredDefaultVariantInstance(instance) {
  const authoredDefault = getAuthoredDefaultVariantInstance();
  if (!instance || instance !== authoredDefault) return false;
  const axes = variantModel.getProps().filter((prop) => prop.type === "enum" || prop.type === "boolean");
  const matchingInstances = axes.length === 0
    ? variantModel.getInstances()
    : variantModel.getInstances().filter((candidate) => axes.every((prop) => (
      normalizeVariantPropValue(prop, candidate.propValues?.[prop.id]) === getVariantPropDefaultValue(prop)
    )));
  return matchingInstances.length === 1;
}

function canRemoveVariantInstance(instance) {
  return Boolean(instance) && variantModel.getInstances().length > 1 && !isSoleAuthoredDefaultVariantInstance(instance);
}

function getVariantInheritanceChain(instance) {
  const chain = [];
  const visited = new Set();
  let current = instance;
  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    chain.unshift(current);
    current = current.parentVariantId == null ? null : getVariantInstance(current.parentVariantId);
  }
  return chain;
}

function getCascadedVariantOverrides(instance, { includeSelf = true } = {}) {
  const chain = getVariantInheritanceChain(instance);
  if (!includeSelf) chain.pop();
  return chain.flatMap((entry) => entry.overrides ?? []);
}

function getEffectiveVariantOverride(instance, target, property, { includeSelf = true } = {}) {
  const overrides = getCascadedVariantOverrides(instance, { includeSelf });
  for (let index = overrides.length - 1; index >= 0; index -= 1) {
    const override = overrides[index];
    if (override.target === target && override.property === property) return override;
  }
  return null;
}

function getSelectedVariantStyleOverride(property, fallback = "") {
  const instance = getVariantInstance();
  const override = instance ? getEffectiveVariantOverride(instance, "component:0", property) : null;
  return override ? String(override.value ?? "") : fallback;
}

function getSelectedVariantTargetStyleOverride(property, fallback = "") {
  const instance = getVariantInstance();
  const target = selectedVariantLayerTarget || "component:0";
  const override = instance ? getEffectiveVariantOverride(instance, target, property) : null;
  return override ? String(override.value ?? "") : fallback;
}

function setSelectedVariantStyleOverride(property, value, { render = true, record = true } = {}) {
  const instance = getVariantInstance();
  if (!instance) return false;
  const nextValue = String(value ?? "");
  const existingOverride = (instance.overrides ?? [])
    .find((entry) => entry.target === "component:0" && entry.property === property);
  if (existingOverride?.value === nextValue) return true;
  if (record) recordHistory();
  upsertLocalVariantOverride(instance, "component:0", property, nextValue);
  if (render) renderVariantInstances();
  else syncVariantLayerStylePreviews("component:0", property);
  return true;
}

function setVariantTextOverride(instance, textId, value, { render = true } = {}) {
  const target = `text:${textId}`;
  const { changed } = upsertLocalVariantOverride(instance, target, "textContent", value);
  if (!changed) return;
  if (render) renderVariantInstances();
}

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

function setSelectedVariantLayerOverride(property, value, { render = false } = {}) {
  const instance = getVariantInstance();
  if (!instance || !selectedVariantLayerTarget) return false;
  const nextValue = String(value ?? "");
  const { changed } = upsertLocalVariantOverride(
    instance,
    selectedVariantLayerTarget,
    property,
    nextValue,
  );
  if (!changed) return true;
  if (render) renderVariantInstances();
  else syncVariantLayerStylePreviews(selectedVariantLayerTarget, property);
  return true;
}

function setSelectedVariantFrameStyleOverride(property, value, options = {}) {
  if (selectedVariantLayerTarget?.startsWith("frame:")) {
    if (options.record !== false) recordHistory();
    return setSelectedVariantLayerOverride(property, value, {
      ...options,
      render: options.render !== false,
    });
  }
  return setSelectedVariantStyleOverride(property, value, options);
}

function getVariantTargetType(target) {
  return String(target || "component:0").split(":")[0];
}

function findVariantTarget(root, target) {
  if (!(root instanceof HTMLElement)) return null;
  const [type, rawId] = String(target || "component:0").split(":");
  if (type === "component") return root;
  const selector = type === "frame"
    ? `[data-frame-id="${CSS.escape(rawId)}"]`
    : type === "text"
      ? `[data-text-id="${CSS.escape(rawId)}"]`
      : `[data-vector-id="${CSS.escape(rawId)}"]`;
  return root.querySelector(selector);
}

function variantBoolean(value) {
  if (typeof value === "boolean") return value;
  return !["false", "0", "off", "hidden", "none", ""].includes(String(value).trim().toLowerCase());
}

function applyVariantOperation(root, operation) {
  const target = findVariantTarget(root, operation.target);
  if (!(target instanceof HTMLElement)) return;
  const property = operation.property;
  const value = operation.value;

  if (property === "textContent") {
    target.textContent = String(value ?? "");
    return;
  }
  if (property === "visibility") {
    target.style.visibility = variantBoolean(value) ? "visible" : "hidden";
    return;
  }
  if (property === "disabled") {
    const isDisabled = variantBoolean(value);
    if ("disabled" in target) target.disabled = isDisabled;
    target.toggleAttribute("disabled", isDisabled);
    target.setAttribute("aria-disabled", String(isDisabled));
    return;
  }
  if ((property === "fill" || property === "stroke") && target.classList.contains("canvas-vector")) {
    const paintTargets = target.querySelectorAll("path, rect, circle, ellipse, line, polyline, polygon, text, tspan, use");
    paintTargets.forEach((element) => element.style.setProperty(property, String(value)));
    const color = typeof cssColorToHex === "function" ? cssColorToHex(String(value)) : null;
    if (color) target.dataset.vectorColor = color;
    else if (String(value).trim().toLowerCase() === "none") target.dataset.vectorColor = "";
    const alpha = String(value).match(/^rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\)$/i);
    target.dataset.vectorColorOpacity = String(normalizeColorOpacity(alpha ? Number(alpha[1]) * 100 : 100));
    return;
  }
  if (["outlineColor", "outlineColorOpacity", "outlineWeight", "outlinePosition"].includes(property)) {
    target.dataset[property] = String(value ?? "");
    applyFrameOutline(target);
    return;
  }
  if (property === "backgroundColor") {
    target.style.backgroundColor = String(value ?? "");
    const color = typeof cssColorToHex === "function" ? cssColorToHex(String(value)) : null;
    if (color) target.dataset.frameColor = color;
    const alpha = String(value).match(/^rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\)$/i);
    target.dataset.frameColorOpacity = String(normalizeColorOpacity(alpha ? Number(alpha[1]) * 100 : 100));
    return;
  }
  target.style[property] = String(value ?? "");
}

function variantRuleMatches(rule, instance) {
  const entries = Object.entries(rule.conditions ?? {});
  if (entries.length === 0) return false;
  return entries.every(([propId, expected]) => {
    const prop = variantModel.getProps().find((entry) => String(entry.id) === String(propId));
    if (!prop) return false;
    return normalizeVariantPropValue(prop, instance.propValues?.[prop.id]) === normalizeVariantPropValue(prop, expected);
  });
}

function getComponentPropVariantTarget(componentProp) {
  if (componentProp.targetFrameId != null) {
    return componentProp.targetFrameId === currentComponent?.frameRecord?.id
      ? "component:0"
      : `frame:${componentProp.targetFrameId}`;
  }
  if (componentProp.targetTextId != null) return `text:${componentProp.targetTextId}`;
  if (componentProp.targetVectorId != null) return `vector:${componentProp.targetVectorId}`;
  return "component:0";
}

function getBooleanComponentPropOperations(instance) {
  return componentProps
    .filter((prop) => (
      prop.type === "boolean"
      && ["visibility", "disabled"].includes(prop.property)
      && prop.variantPropId != null
    ))
    .map((prop) => {
      const variantProp = variantModel.getProps().find((entry) => entry.id === prop.variantPropId);
      return variantProp
        ? {
            target: getComponentPropVariantTarget(prop),
            property: prop.property,
            value: normalizeVariantPropValue(variantProp, instance.propValues?.[variantProp.id]),
          }
        : null;
    })
    .filter(Boolean);
}

function resolveVariantOperations(instance) {
  const matchingRules = variantModel.getRules()
    .map((rule, row) => ({ rule, row, specificity: Object.keys(rule.conditions ?? {}).length }))
    .filter(({ rule }) => variantRuleMatches(rule, instance));
  const individuals = matchingRules.filter(({ specificity }) => specificity === 1);
  const compounds = matchingRules
    .filter(({ specificity }) => specificity > 1)
    .sort((first, second) => first.specificity - second.specificity || first.row - second.row);
  return [
    ...individuals.map(({ rule }) => rule),
    ...compounds.map(({ rule }) => rule),
    ...getBooleanComponentPropOperations(instance),
    ...getCascadedVariantOverrides(instance),
  ];
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

function resolveVariantCanvasSelectionTarget(eventTarget) {
  const hit = resolveCanvasHit(eventTarget);
  if (hit.kind !== "variant-root" && hit.kind !== "variant-layer") return null;
  const instanceId = hit.instanceId;
  if (!Number.isFinite(instanceId) || !getVariantInstance(instanceId)) return null;

  if (hit.kind === "variant-layer") {
    return {
      kind: "variant-layer",
      instanceId,
      target: `${hit.layer.type}:${hit.layer.id}`,
      element: hit.element,
    };
  }

  return {
    kind: "variant-root",
    instanceId,
    target: null,
    element: hit.element,
  };
}

canvas?.addEventListener("pointerdown", (event) => {
  if (event.button !== 0 || activeTool !== "select") return;
  const target = resolveVariantCanvasSelectionTarget(event.target);
  if (!target || target.element?.isContentEditable) return;
  // Variant child selection and dragging are handled by the shared canvas
  // layer gesture. This branch owns only whole-variant selection.
  if (target.kind === "variant-layer") return;
  if (isVariantInstanceSelected(target.instanceId)
    && getSelectedVariantInstanceIds().length > 1) {
    clearMasterSelectionForVariant();
    return;
  }
  selectVariantInstance(target.instanceId, {
    render: false,
    layerTarget: target.target,
  });
  if (target.kind === "variant-root") renderComponentProps();
});

function selectNewSharedLayerInVariant(instanceId, target, { editText = false } = {}) {
  selectVariantState(instanceId, target);
  clearMasterSelectionForVariant();
  selectTool("select");
  renderTree();
  if (!editText) return;
  setTimeout(() => {
    requestAnimationFrame(() => {
      const preview = componentSet?.querySelector(`.variant-preview[data-variant-instance-id="${CSS.escape(String(instanceId))}"]`);
      const text = preview ? findVariantTarget(preview.querySelector(".canvas-root-stack"), target) : null;
      if (text instanceof HTMLElement) text.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, button: 0 }));
    });
  }, 0);
}

function handleVariantStructureToolClick(instance, parentTarget, event) {
  if (activeTool !== "text" && activeTool !== "frame") return false;
  const parentRecord = parentTarget === "component:0"
    ? currentComponent?.frameRecord
    : parentTarget.startsWith("frame:")
      ? getFrameRecord(Number(parentTarget.split(":")[1]))
      : null;
  if (!parentRecord) return false;
  event.preventDefault();
  event.stopPropagation();
  if (activeTool === "frame") {
    const record = createCanvasFrame(0, 0, parentRecord, { select: false });
    if (record) selectNewSharedLayerInVariant(instance.id, `frame:${record.id}`);
    return true;
  }
  const record = createCanvasText(parentRecord, 0, 0, {
    beginEditing: false,
    isNew: false,
    textContent: "Text",
    useDefaultName: true,
  });
  if (!record) return true;
  selectNewSharedLayerInVariant(instance.id, `text:${record.id}`, { editText: true });
  return true;
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

function clearVariantReorderIndicators() {
  componentSet?.querySelectorAll(".variant-preview").forEach((preview) => {
    preview.classList.remove("is-variant-dragging", "is-variant-drop-before", "is-variant-drop-after");
    delete preview.dataset.variantDropPosition;
  });
}

function getVariantPointerDrop(previewIds, clientX, clientY) {
  const target = document.elementFromPoint(clientX, clientY)?.closest(".variant-preview");
  if (!(target instanceof HTMLElement) || !componentSet?.contains(target)) return null;
  const targetId = Number(target.dataset.variantInstanceId);
  if (!Number.isFinite(targetId) || previewIds.includes(targetId)) return null;
  const targetInstance = getVariantInstance(targetId);
  if (!targetInstance) return null;
  const bounds = target.getBoundingClientRect();
  const after = clientX >= bounds.left + bounds.width / 2;
  const targetIndex = variantModel.getInstances().indexOf(targetInstance);
  const boundaryIndex = targetIndex + (after ? 1 : 0);
  const selectedBeforeBoundary = variantModel.getInstances()
    .slice(0, boundaryIndex)
    .filter((candidate) => previewIds.includes(candidate.id))
    .length;
  return {
    preview: target,
    position: after ? "after" : "before",
    destinationIndex: boundaryIndex - selectedBeforeBoundary,
  };
}

function updateVariantPointerDrag(event) {
  if (!variantPointerDrag || event.pointerId !== variantPointerDrag.pointerId) return false;
  const distance = Math.hypot(
    event.clientX - variantPointerDrag.startX,
    event.clientY - variantPointerDrag.startY,
  );
  if (!variantPointerDrag.hasStarted && distance < CANVAS_DRAG_THRESHOLD) return false;
  if (!variantPointerDrag.hasStarted) {
    variantPointerDrag.hasStarted = true;
    if (canvas instanceof HTMLElement && !canvas.hasPointerCapture(event.pointerId)) {
      canvas.setPointerCapture(event.pointerId);
    }
    componentSet?.querySelectorAll(".variant-preview").forEach((preview) => {
      preview.classList.toggle(
        "is-variant-dragging",
        variantPointerDrag.instanceIds.includes(Number(preview.dataset.variantInstanceId)),
      );
    });
  }
  event.preventDefault();
  event.stopPropagation();
  componentSet?.querySelectorAll(".variant-preview").forEach((preview) => {
    preview.classList.remove("is-variant-drop-before", "is-variant-drop-after");
    delete preview.dataset.variantDropPosition;
  });
  variantPointerDrag.drop = getVariantPointerDrop(
    variantPointerDrag.instanceIds,
    event.clientX,
    event.clientY,
  );
  if (variantPointerDrag.drop) {
    variantPointerDrag.drop.preview.dataset.variantDropPosition = variantPointerDrag.drop.position;
    variantPointerDrag.drop.preview.classList.add(`is-variant-drop-${variantPointerDrag.drop.position}`);
  }
  return true;
}

function finishVariantPointerDrag(event, shouldCommit) {
  if (!variantPointerDrag || event.pointerId !== variantPointerDrag.pointerId) return;
  const pointerDrag = variantPointerDrag;
  if (pointerDrag.hasStarted) updateVariantPointerDrag(event);
  const drop = shouldCommit ? pointerDrag.drop : null;
  variantPointerDrag = null;
  if (canvas?.hasPointerCapture(event.pointerId)) {
    canvas.releasePointerCapture(event.pointerId);
  }
  clearVariantReorderIndicators();
  if (!pointerDrag.hasStarted) {
    if (shouldCommit && pointerDrag.selectOnClick) {
      selectVariantInstance(pointerDrag.instanceId, {
        render: false,
        layerTarget: pointerDrag.clickLayerTarget,
      });
    }
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  suppressCanvasClickForGesture(event);
  if (drop) reorderVariantInstances(pointerDrag.instanceIds, drop.destinationIndex, pointerDrag.instanceId);
}

function bindVariantReorderPointer(preview, instance) {
  preview.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || activeTool !== "select") return;
    if (event.target instanceof HTMLElement && event.target.isContentEditable) return;
    const selectedIds = getSelectedVariantInstanceIds();
    const instanceIds = selectedIds.includes(instance.id) ? selectedIds : [instance.id];
    const clickTarget = resolveVariantCanvasSelectionTarget(event.target);
    if (clickTarget?.kind === "variant-layer") return;
    if (!selectedIds.includes(instance.id)) selectVariantInstance(instance.id, { render: false });
    variantPointerDrag = {
      pointerId: event.pointerId,
      instanceId: instance.id,
      instanceIds: variantModel.getInstances()
        .filter((candidate) => instanceIds.includes(candidate.id))
        .map((candidate) => candidate.id),
      startX: event.clientX,
      startY: event.clientY,
      selectOnClick: selectedIds.length > 1 && selectedIds.includes(instance.id),
      clickLayerTarget: clickTarget?.instanceId === instance.id ? clickTarget.target : null,
      hasStarted: false,
      drop: null,
    };
  });
}

canvas?.addEventListener("pointermove", updateVariantPointerDrag, true);
canvas?.addEventListener("pointerup", (event) => finishVariantPointerDrag(event, true), true);
canvas?.addEventListener("pointercancel", (event) => finishVariantPointerDrag(event, false), true);
canvas?.addEventListener("lostpointercapture", (event) => {
  if (variantPointerDrag?.pointerId === event.pointerId) finishVariantPointerDrag(event, false);
}, true);

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
      const beginEditing = (event) => {
        if (activeTool !== "select") return;
        event.preventDefault();
        event.stopPropagation();
        selectVariantState(instance.id, target);
        beginHistoryGesture(text);
        text.classList.add("is-selected");
        text.setAttribute("aria-selected", "true");
        text.contentEditable = "true";
        text.focus();
        const range = document.createRange();
        range.selectNodeContents(text);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
      };
      text.addEventListener("dblclick", beginEditing);
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

function clearMasterSelectionForVariant() {
  clearElementSelection();
}

function selectVariantInstance(instanceId, options = {}) {
  if (!getVariantInstance(instanceId)) return false;
  const hasLayerTargets = Object.prototype.hasOwnProperty.call(options, "layerTargets");
  const hasLayerTarget = Object.prototype.hasOwnProperty.call(options, "layerTarget");
  const nextTargets = hasLayerTargets
    ? options.layerTargets
    : hasLayerTarget
      ? options.layerTarget === null ? [] : [options.layerTarget]
      : selectedVariantInstanceId === instanceId && options.preserveLayerSelection === true
        ? getSelectedVariantLayerTargets()
        : [];
  const nextTarget = hasLayerTargets
    ? options.anchorTarget ?? nextTargets[nextTargets.length - 1] ?? null
    : hasLayerTarget
    ? options.layerTarget
    : selectedVariantInstanceId === instanceId && options.preserveLayerSelection === true
      ? selectedVariantLayerTarget
      : null;
  if (nextTargets.length > 0) {
    selectVariantLayerTargetsState(instanceId, nextTargets, nextTarget);
  } else {
    selectVariantState(instanceId, null);
  }
  clearMasterSelectionForVariant();
  if (options.render !== false) renderTree();
  else {
    document.querySelectorAll(".variant-preview").forEach((preview) => {
      const isSelectedInstance = Number(preview.dataset.variantInstanceId) === instanceId;
      preview.classList.toggle("is-selected", isSelectedInstance);
      preview.setAttribute("aria-selected", String(isSelectedInstance));
      const root = preview.querySelector(".canvas-root-stack");
      if (root instanceof HTMLElement) {
        const isSelectedRoot = isSelectedInstance && selectedVariantLayerTarget === null;
        root.classList.toggle("is-selected", isSelectedRoot);
        root.setAttribute("aria-selected", String(isSelectedRoot));
      }
      preview.querySelectorAll(".canvas-frame, .canvas-text, .canvas-vector").forEach((layerElement) => {
        const type = layerElement.classList.contains("canvas-frame")
          ? "frame"
          : layerElement.classList.contains("canvas-text") ? "text" : "vector";
        const id = Number(layerElement.dataset[`${type}Id`]);
        const isSelectedLayer = isSelectedInstance
          && Number.isFinite(id)
          && selectedVariantLayerTargets.has(`${type}:${id}`);
        layerElement.classList.toggle("is-selected", isSelectedLayer);
        layerElement.setAttribute("aria-selected", String(isSelectedLayer));
      });
    });
    syncLayerTreeSelectionStyles();
    updateInspector();
    syncResizeOverlay();
  }
  requestAnimationFrame(syncResizeOverlay);
  return true;
}

function reorderVariantInstances(instanceIds, destinationIndex, focusInstanceId = instanceIds[0]) {
  const selectedIdSet = new Set(instanceIds);
  const movingInstances = variantModel.getInstances().filter((instance) => selectedIdSet.has(instance.id));
  if (movingInstances.length === 0) return false;
  const remainingInstances = variantModel.getInstances().filter((instance) => !selectedIdSet.has(instance.id));
  const nextIndex = Math.max(0, Math.min(remainingInstances.length, destinationIndex));
  const nextInstances = [...remainingInstances];
  nextInstances.splice(nextIndex, 0, ...movingInstances);
  if (nextInstances.every((instance, index) => instance === variantModel.getInstances()[index])) return false;
  const previousPositions = captureCanvasItemPositions(
    Array.from(componentSet?.querySelectorAll(".variant-preview") ?? []),
    (preview) => preview.dataset.variantInstanceId,
  );
  recordHistory();
  variantModel.replaceInstances(nextInstances);
  renderTree();
  requestAnimationFrame(() => {
    animateCanvasItemReflow(
      previousPositions,
      Array.from(componentSet?.querySelectorAll(".variant-preview") ?? []),
      { getKey: (preview) => preview.dataset.variantInstanceId },
    );
    const preview = componentSet?.querySelector(`.variant-preview[data-variant-instance-id="${CSS.escape(String(focusInstanceId))}"]`);
    if (preview instanceof HTMLElement) preview.focus();
  });
  return true;
}

function reorderVariantInstance(instanceId, destinationIndex) {
  const sourceIndex = variantModel.getInstances().findIndex((instance) => instance.id === instanceId);
  if (sourceIndex < 0) return false;
  const selectedIds = getSelectedVariantInstanceIds();
  if (selectedIds.length > 1 && selectedIds.includes(instanceId)) {
    const direction = Math.sign(destinationIndex - sourceIndex);
    if (direction === 0) return false;
    const firstSelectedIndex = variantModel.getInstances().findIndex((instance) => selectedIds.includes(instance.id));
    const currentInsertionIndex = variantModel.getInstances()
      .slice(0, firstSelectedIndex)
      .filter((instance) => !selectedIds.includes(instance.id))
      .length;
    return reorderVariantInstances(selectedIds, currentInsertionIndex + direction, instanceId);
  }
  return reorderVariantInstances([instanceId], destinationIndex, instanceId);
}

function addVariantInstance({ render = true } = {}) {
  if (!currentComponent) return null;
  recordHistory();
  if (variantModel.getInstances().length === 0) {
    variantModel.addInstance({
      name: "Variant 1",
      componentId: currentComponent.id,
      parentVariantId: null,
      propValues: Object.fromEntries(variantModel.getProps()
        .filter((prop) => prop.type !== "action")
        .map((prop) => [prop.id, getVariantPropDefaultValue(prop)])),
      overrides: [],
    });
  }
  const sourceInstance = getVariantInstance() ?? getDefaultVariantInstance();
  const index = variantModel.getInstances().length;
  const instance = variantModel.addInstance({
    name: `Variant ${index + 1}`,
    componentId: currentComponent.id,
    parentVariantId: sourceInstance?.id ?? null,
    propValues: sourceInstance
      ? structuredClone(sourceInstance.propValues ?? {})
      : Object.fromEntries(variantModel.getProps()
        .filter((prop) => prop.type !== "action")
        .map((prop) => [prop.id, getVariantPropDefaultValue(prop)])),
    overrides: [],
  });
  selectVariantState(instance.id, null);
  clearMasterSelectionForVariant();
  if (render) renderTree();
  return instance;
}

function requestAddVariant(event = null) {
  event?.preventDefault();
  event?.stopPropagation();
  const instance = addVariantInstance({ render: false });
  if (!instance) return false;

  // Render the document and all dependent panels once from the completed state.
  renderTree();
  selectVariantInstance(instance.id, { render: false, preserveLayerSelection: true });
  let preview = componentSet?.querySelector(
    `.variant-preview[data-variant-instance-id="${CSS.escape(String(instance.id))}"]`,
  );
  if (preview instanceof HTMLElement) void preview.getBoundingClientRect();
  syncResizeOverlay();
  if (preview instanceof HTMLElement) preview.focus({ preventScroll: true });

  // Commit again on the next paint even when the preview node already exists.
  // A DOM-count check cannot detect a preview that was created but not laid out.
  requestAnimationFrame(() => {
    if (!getVariantInstance(instance.id)) return;
    renderVariantInstances();
    selectVariantInstance(instance.id, { render: false, preserveLayerSelection: true });
    preview = componentSet?.querySelector(
      `.variant-preview[data-variant-instance-id="${CSS.escape(String(instance.id))}"]`,
    );
    if (preview instanceof HTMLElement) preview.focus({ preventScroll: true });
    syncResizeOverlay();
  });
  return true;
}

function removeVariantInstance(instanceId) {
  const index = variantModel.getInstances().findIndex((instance) => instance.id === instanceId);
  if (index < 0) return false;
  const instance = variantModel.getInstances()[index];
  if (!canRemoveVariantInstance(instance)) return false;
  recordHistory();
  const removedInstance = instance;
  variantModel.getInstances().forEach((instance) => {
    if (instance.parentVariantId !== removedInstance.id) return;
    const localKeys = new Set((instance.overrides ?? []).map((override) => `${override.target}\u0000${override.property}`));
    const inheritedFromRemoved = (removedInstance.overrides ?? [])
      .filter((override) => !localKeys.has(`${override.target}\u0000${override.property}`))
      .map((override) => structuredClone(override));
    instance.overrides = [...inheritedFromRemoved, ...(instance.overrides ?? [])];
    instance.parentVariantId = removedInstance.parentVariantId ?? null;
  });
  variantModel.replaceInstances(
    variantModel.getInstances().filter((candidate) => candidate.id !== instanceId),
  );
  normalizeDefaultVariantInstance();
  const nextInstanceId = variantModel.getInstances()[Math.min(index, variantModel.getInstances().length - 1)]?.id ?? null;
  if (nextInstanceId == null) selectComponentState(currentComponent?.id);
  else selectVariantState(nextInstanceId, null);
  renderTree();
  return true;
}

function renderVariantSystem() {
  renderVariantInstances();
}

addVariantButton?.addEventListener("click", requestAddVariant);

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
