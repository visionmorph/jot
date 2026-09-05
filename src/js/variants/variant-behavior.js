/* Variant target lookup, rule matching, behavior calculation, and application. */

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
  if (property === "richTextHtml") {
    target.innerHTML = String(value ?? "");
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
