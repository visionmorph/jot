/* Component property Boolean, String, Action, and static value controls. */

function createComponentPropValueCell(prop) {
  const cell = createComponentPropCell();
  cell.classList.add("props-table-value-cell");
  cell.dataset.propValueCell = String(prop.id);
  cell.tabIndex = -1;
  return cell;
}

function createVariantBooleanDefaultControl(prop) {
  const instance = getVariantInstance() ?? getDefaultVariantInstance();
  const selectedInstanceIds = new Set(getSelectedVariantInstanceIds());
  const targetInstances = selectedInstanceIds.size > 0
    ? variantModel.getInstances().filter((candidate) => selectedInstanceIds.has(candidate.id))
    : instance ? [instance] : [];
  const currentValue = instance
    ? normalizeVariantPropValue(
      variantModel.getProps().find((variantProp) => variantProp.id === prop.variantPropId),
      instance.propValues[prop.variantPropId],
    )
    : Boolean(prop.defaultValue);
  const toggle = document.createElement("button");
  const track = document.createElement("span");
  const handle = document.createElement("span");
  const checkmark = document.createElement("span");
  const label = document.createElement("span");
  toggle.className = "toggle";
  toggle.type = "button";
  toggle.setAttribute("role", "switch");
  toggle.setAttribute("aria-checked", String(currentValue));
  toggle.setAttribute("aria-label", `${prop.name} value`);
  track.className = "toggle__track";
  track.setAttribute("aria-hidden", "true");
  handle.className = "toggle__handle";
  checkmark.className = "toggle__checkmark";
  label.className = "toggle__label";
  label.textContent = currentValue ? "True" : "False";
  handle.append(checkmark);
  track.append(handle);
  toggle.append(track, label);
  toggle.addEventListener("click", () => {
    if (toggle.dataset.transitioning === "true") return;
    const nextValue = !currentValue;
    const transitionDuration = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 120;
    toggle.dataset.transitioning = "true";
    toggle.setAttribute("aria-checked", String(nextValue));
    label.textContent = nextValue ? "True" : "False";
    recordHistory();
    if (targetInstances.length > 0) {
      const variantProp = variantModel.getProps().find((entry) => entry.id === prop.variantPropId);
      targetInstances.forEach((targetInstance) => {
        setVariantBooleanValue(targetInstance, variantProp, nextValue);
      });
      renderVariantInstances();
    } else {
      prop.defaultValue = nextValue;
      if (prop.property === "invalid") {
        const target = getFrameRecord(prop.targetFrameId);
        if (target) {
          target.element.dataset.invalid = String(nextValue);
          target.element.setAttribute("aria-invalid", String(nextValue));
        }
      }
      syncComponentPropVariantDefinition(prop, { render: false });
    }
    if (transitionDuration === 0) {
      renderComponentProps();
      return;
    }
    let didFinishTransition = false;
    const finishTransition = () => {
      if (didFinishTransition) return;
      didFinishTransition = true;
      renderComponentProps();
    };
    handle.addEventListener("transitionend", finishTransition, { once: true });
    window.setTimeout(finishTransition, transitionDuration + 60);
  });
  return toggle;
}

function createStringDefaultControl(prop) {
  const input = document.createElement("input");
  input.className = "prop-control";
  input.type = "text";
  input.value = String(prop.defaultValue ?? "");
  input.setAttribute("aria-label", `Default ${prop.name} value`);
  const commitValue = (renderPanel = false) => {
    const didChange = input.value !== String(prop.defaultValue ?? "");
    if (didChange) recordHistoryForGesture(input);
    const textTarget = prop.property === "textContent" ? getTextRecord(prop.targetTextId) : null;
    const inputTarget = prop.property === "placeholder" ? getFrameRecord(prop.targetFrameId) : null;
    if (textTarget) {
      syncTextRecordContent(textTarget, input.value);
      applyLayerSizing("text", textTarget);
      requestAnimationFrame(syncResizeOverlay);
      if (renderPanel) renderTree();
    } else if (inputTarget) {
      prop.defaultValue = input.value;
      inputTarget.element.dataset.placeholder = input.value;
    }
    if (didChange) {
      if (variantModel.getInstances().length > 0) scheduleVariantInstanceRender();
      redoHistory.length = 0;
    }
    if (renderPanel) renderComponentProps();
  };
  input.addEventListener("input", () => commitValue());
  input.addEventListener("blur", () => commitValue(true));
  bindHistoryGesture(input);
  return input;
}

function createActionDefaultControl() {
  const value = document.createElement("span");
  value.className = "prop-empty-value prop-empty-value--action";
  value.textContent = "—";
  return value;
}

function createStaticDefaultControl(prop) {
  const value = document.createElement("span");
  value.className = "tag";
  if (prop.type === "boolean") {
    value.textContent = Boolean(prop.defaultValue) ? "True" : "False";
    value.setAttribute("aria-label", `Default Boolean value: ${value.textContent}`);
  } else if (prop.type === "string") {
    const stringValue = String(prop.defaultValue);
    value.textContent = stringValue || '\"\"';
    value.setAttribute("aria-label", `Default string value: ${stringValue || "empty string"}`);
  } else {
    value.classList.add("prop-empty-value");
    value.textContent = "—";
    value.setAttribute("aria-label", "No default value");
  }
  return value;
}

function createComponentPropDefaultCell(prop) {
  const cell = createComponentPropValueCell(prop);
  if (isOptionComponentProp(prop)) {
    populateOptionComponentPropDefaultCell(cell, prop);
  } else if (prop.type === "boolean" && prop.variantPropId != null) {
    cell.append(createVariantBooleanDefaultControl(prop));
  } else if (prop.type === "string" && ["textContent", "placeholder"].includes(prop.property)) {
    cell.classList.add("props-table-value-cell--control");
    cell.append(createStringDefaultControl(prop));
  } else if (prop.type === "action" && prop.property === "onClick") {
    cell.setAttribute("aria-label", "Value supplied by component consumer");
    cell.append(createActionDefaultControl());
  } else {
    cell.append(createStaticDefaultControl(prop));
  }
  return cell;
}
