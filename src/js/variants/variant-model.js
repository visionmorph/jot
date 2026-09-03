/* Variant collections, property values, defaults, inheritance, and local overrides. */

/* Owns variant collection structure and ID allocation; contained records remain live editable objects. */
function createVariantModel() {
  let props = Object.freeze([]);
  let rules = Object.freeze([]);
  let instances = Object.freeze([]);
  let nextPropId = 1;
  let nextRuleId = 1;
  let nextInstanceId = 1;

  return Object.freeze({
    getProps: () => props,
    getRules: () => rules,
    getInstances: () => instances,
    peekNextPropId: () => nextPropId,
    addProp(input) {
      const prop = { ...input, id: nextPropId++ };
      props = Object.freeze([...props, prop]);
      return prop;
    },
    addRule(input) {
      const rule = { ...input, id: nextRuleId++ };
      rules = Object.freeze([...rules, rule]);
      return rule;
    },
    addInstance(input, { prepend = false } = {}) {
      const instance = { ...input, id: nextInstanceId++ };
      instances = Object.freeze(prepend ? [instance, ...instances] : [...instances, instance]);
      return instance;
    },
    replaceProps(nextProps) {
      props = Object.freeze([...nextProps]);
    },
    replaceRules(nextRules) {
      rules = Object.freeze([...nextRules]);
    },
    replaceInstances(nextInstances) {
      instances = Object.freeze([...nextInstances]);
    },
    capture() {
      return {
        variantProps: structuredClone(props),
        variantRules: structuredClone(rules),
        variantInstances: structuredClone(instances),
        nextVariantPropId: nextPropId,
        nextVariantRuleId: nextRuleId,
        nextVariantInstanceId: nextInstanceId,
      };
    },
    restore(snapshot) {
      props = Object.freeze(structuredClone(snapshot.variantProps));
      rules = Object.freeze(structuredClone(snapshot.variantRules));
      instances = Object.freeze(structuredClone(snapshot.variantInstances));
      nextPropId = snapshot.nextVariantPropId;
      nextRuleId = snapshot.nextVariantRuleId;
      nextInstanceId = snapshot.nextVariantInstanceId;
    },
  });
}

const variantModel = createVariantModel();

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
