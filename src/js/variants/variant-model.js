/* Variant collections, property values, defaults, inheritance, and local overrides. */

// A variant is an authored configuration of a component. "Component instance"
// is reserved for a component placed inside another component.

/* Owns variant collection structure and ID allocation; contained records remain live editable objects. */
function createVariantModel() {
  let props = Object.freeze([]);
  let rules = Object.freeze([]);
  let variants = Object.freeze([]);
  let nextPropId = 1;
  let nextRuleId = 1;
  let nextVariantId = 1;

  return Object.freeze({
    getProps: () => props,
    getRules: () => rules,
    getVariants: () => variants,
    peekNextPropId: () => nextPropId,
    addProp(input) {
      const prop = { ...input, id: nextPropId++ };
      props = Object.freeze([...props, prop]);
      return prop;
    },
    addRule(input) {
      const rule = { ...input, target: toRuntimeLayerTarget(input.target, currentComponent.id), id: nextRuleId++ };
      rules = Object.freeze([...rules, rule]);
      return rule;
    },
    addVariant(input, { prepend = false } = {}) {
      const variant = { ...input, id: nextVariantId++, overrides: (input.overrides ?? []).map((override) => ({
        ...override, target: toRuntimeLayerTarget(override.target, input.componentId ?? currentComponent.id),
      })) };
      variants = Object.freeze(prepend ? [variant, ...variants] : [...variants, variant]);
      return variant;
    },
    replaceProps(nextProps) {
      props = Object.freeze([...nextProps]);
    },
    replaceRules(nextRules) {
      rules = Object.freeze([...nextRules]);
    },
    replaceVariants(nextVariants) {
      variants = Object.freeze([...nextVariants]);
    },
    capture() {
      return {
        variantProps: structuredClone(props),
        variantRules: rules.map((rule) => ({ ...structuredClone(rule), target: normalizeLayerIdentity(rule.target, currentComponent.id) })),
        variants: qualifyVariantLayerReferences(variants, currentComponent.id),
        nextVariantPropId: nextPropId,
        nextVariantRuleId: nextRuleId,
        nextVariantId: nextVariantId,
      };
    },
    restore(snapshot) {
      props = Object.freeze(structuredClone(snapshot.variantProps));
      rules = Object.freeze(snapshot.variantRules.map((rule) => ({
        ...structuredClone(rule), target: toRuntimeLayerTarget(rule.target, snapshot.componentId),
      })));
      variants = Object.freeze(snapshot.variants.map((variant) => ({
        ...structuredClone(variant), overrides: (variant.overrides ?? []).map((override) => ({
          ...structuredClone(override), target: toRuntimeLayerTarget(override.target, snapshot.componentId),
        })),
      })));
      nextPropId = snapshot.nextVariantPropId;
      nextRuleId = snapshot.nextVariantRuleId;
      nextVariantId = snapshot.nextVariantId;
    },
  });
}

const variantModel = createVariantModel();

const VARIANT_AXIS_MERGE_PRIORITY = Object.freeze({
  size: 100,
  appearance: 200,
  selection: 300,
  interaction: 400,
  availability: 500,
});

function getVariantAxisComponentProp(axis) {
  return componentProps.find((prop) => (
    prop.id === axis?.sourceComponentPropId || prop.variantPropId === axis?.id
  ));
}

function getVariantAxisSemanticProperty(axis) {
  const componentProp = getVariantAxisComponentProp(axis);
  return String(componentProp?.property ?? axis?.name ?? "").trim().toLowerCase();
}

function getVariantAxisMergePriority(axis) {
  const property = getVariantAxisSemanticProperty(axis);
  if (property === "custom") return VARIANT_AXIS_MERGE_PRIORITY.appearance;
  if (property === "size") return VARIANT_AXIS_MERGE_PRIORITY.size;
  if (["appearance", "kind", "variant", "tone"].includes(property)) {
    return VARIANT_AXIS_MERGE_PRIORITY.appearance;
  }
  if (["state", "focus"].includes(axis?.variantSubtype)
    || ["state", "interaction", "focus"].includes(property)) {
    return VARIANT_AXIS_MERGE_PRIORITY.interaction;
  }
  if (["disabled", "availability"].includes(property)) {
    return VARIANT_AXIS_MERGE_PRIORITY.availability;
  }
  return VARIANT_AXIS_MERGE_PRIORITY.selection;
}

function getOrderedVariantAxes(axes = variantModel.getProps()) {
  return axes
    .map((axis, index) => ({ axis, index }))
    .sort((first, second) => (
      getVariantAxisMergePriority(first.axis) - getVariantAxisMergePriority(second.axis)
      || first.index - second.index
    ))
    .map(({ axis }) => axis);
}

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
  variantModel.getVariants().forEach((variant) => {
    if (!variant.propValues || typeof variant.propValues !== "object" || Array.isArray(variant.propValues)) {
      variant.propValues = {};
    }
    getLocalVariantOverrides(variant);
  });
  variantModel.getRules().forEach((rule) => {
    if (!rule.conditions || typeof rule.conditions !== "object" || Array.isArray(rule.conditions)) {
      rule.conditions = {};
    }
  });
}

function getVariantAssignedPropValues(variant) {
  if (!variant) return null;
  if (!variant.propValues || typeof variant.propValues !== "object" || Array.isArray(variant.propValues)) {
    variant.propValues = {};
  }
  return variant.propValues;
}

function setVariantPropValue(variant, variantPropId, value) {
  const propValues = getVariantAssignedPropValues(variant);
  if (!propValues) return false;
  propValues[variantPropId] = value;
  return true;
}

function removeVariantPropValueFromAllVariants(variantPropId) {
  variantModel.getVariants().forEach((variant) => {
    const propValues = getVariantAssignedPropValues(variant);
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
  removeVariantPropValueFromAllVariants(variantPropId);
  clearVariantRuleConditionsForProp(variantPropId);
}

function getLocalVariantOverrides(variant) {
  if (!variant) return null;
  if (!Array.isArray(variant.overrides)) variant.overrides = [];
  return variant.overrides;
}

function upsertLocalVariantOverride(variant, target, property, value) {
  target = toRuntimeLayerTarget(target, variant?.componentId ?? currentComponent.id);
  const overrides = getLocalVariantOverrides(variant);
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

function getLocalVariantOverride(variant, target, property) {
  target = toRuntimeLayerTarget(target, variant?.componentId ?? currentComponent.id);
  return (variant?.overrides ?? []).find((override) => (
    override.target === target && override.property === property
  )) ?? null;
}

function shouldWriteVariantOverrideForEditedVariants(variant, target, property, editedVariantIds) {
  if (!variant || getLocalVariantOverride(variant, target, property)) return Boolean(variant);
  const editedIds = editedVariantIds instanceof Set
    ? editedVariantIds
    : new Set(editedVariantIds ?? []);
  if (editedIds.size < 2) return true;
  const visited = new Set([variant.id]);
  let parent = variant.parentVariantId == null ? null : getVariant(variant.parentVariantId);
  while (parent && !visited.has(parent.id)) {
    if (editedIds.has(parent.id)) return false;
    visited.add(parent.id);
    parent = parent.parentVariantId == null ? null : getVariant(parent.parentVariantId);
  }
  return true;
}

function upsertVariantOverrideForEditedVariants(
  variant,
  target,
  property,
  value,
  editedVariantIds,
) {
  if (!shouldWriteVariantOverrideForEditedVariants(
    variant,
    target,
    property,
    editedVariantIds,
  )) {
    return { changed: false, override: null, inherited: true };
  }
  return { ...upsertLocalVariantOverride(variant, target, property, value), inherited: false };
}

function getVariant(variantId = selectedVariantId) {
  return variantModel.getVariants().find((variant) => variant.id === variantId) ?? null;
}

function getAuthoredDefaultVariant() {
  if (variantModel.getVariants().length === 0) return null;
  const axes = variantModel.getProps().filter((prop) => prop.type === "enum" || prop.type === "boolean");
  if (axes.length === 0) return variantModel.getVariants()[0];
  return variantModel.getVariants().find((variant) => axes.every((prop) => (
    normalizeVariantPropValue(prop, variant.propValues?.[prop.id]) === getVariantPropDefaultValue(prop)
  ))) ?? null;
}

function getDefaultVariant() {
  return getAuthoredDefaultVariant() ?? variantModel.getVariants()[0] ?? null;
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

function setVariantBooleanValue(variant, prop, value) {
  if (!variant || prop?.type !== "boolean") return;
  const wasDefaultVariant = variant === getDefaultVariant();
  const nextValue = Boolean(value);
  setVariantPropValue(variant, prop.id, nextValue);
  if (wasDefaultVariant) setInferredVariantBooleanDefault(prop, nextValue);
}

function normalizeDefaultVariant() {
  ensureVariantCollections();
  variantModel.getProps().forEach((prop) => {
    if (prop.type === "enum") prop.defaultValue = getVariantPropDefaultValue(prop);
    else if (prop.type === "boolean") prop.defaultValue = getVariantPropDefaultValue(prop);
  });
  variantModel.getVariants().forEach((variant) => {
    delete variant.isDefault;
    const propValues = getVariantAssignedPropValues(variant);
    variantModel.getProps().filter((prop) => prop.type !== "action").forEach((prop) => {
      setVariantPropValue(variant, prop.id, normalizeVariantPropValue(prop, propValues[prop.id]));
    });
    if (variant.parentVariantId == null
      || variant.parentVariantId === variant.id
      || !getVariant(variant.parentVariantId)) {
      variant.parentVariantId = null;
    }
  });
  variantModel.getVariants().forEach((variant) => {
    const visited = new Set([variant.id]);
    let parent = variant.parentVariantId == null ? null : getVariant(variant.parentVariantId);
    while (parent) {
      if (visited.has(parent.id)) {
        variant.parentVariantId = null;
        break;
      }
      visited.add(parent.id);
      parent = getVariant(parent.parentVariantId);
    }
  });
  return getDefaultVariant();
}

function isSoleAuthoredDefaultVariant(variant) {
  const authoredDefault = getAuthoredDefaultVariant();
  if (!variant || variant !== authoredDefault) return false;
  const axes = variantModel.getProps().filter((prop) => prop.type === "enum" || prop.type === "boolean");
  const matchingVariants = axes.length === 0
    ? variantModel.getVariants()
    : variantModel.getVariants().filter((candidate) => axes.every((prop) => (
      normalizeVariantPropValue(prop, candidate.propValues?.[prop.id]) === getVariantPropDefaultValue(prop)
    )));
  return matchingVariants.length === 1;
}

function canRemoveVariant(variant) {
  return Boolean(variant) && variantModel.getVariants().length > 1 && !isSoleAuthoredDefaultVariant(variant);
}

function getVariantInheritanceChain(variant, readVariant = getVariant) {
  const chain = [];
  const visited = new Set();
  let current = variant;
  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    chain.unshift(current);
    current = current.parentVariantId == null ? null : readVariant(current.parentVariantId);
  }
  return chain;
}

function getCascadedVariantOverrides(variant, { includeSelf = true } = {}) {
  const chain = getVariantInheritanceChain(variant);
  if (!includeSelf) chain.pop();
  return chain.flatMap((entry) => entry.overrides ?? []);
}

function getEffectiveVariantOverride(variant, target, property, { includeSelf = true } = {}) {
  target = toRuntimeLayerTarget(target, variant?.componentId ?? currentComponent.id);
  const overrides = getCascadedVariantOverrides(variant, { includeSelf });
  for (let index = overrides.length - 1; index >= 0; index -= 1) {
    const override = overrides[index];
    if (override.target === target && override.property === property) return override;
  }
  return null;
}
