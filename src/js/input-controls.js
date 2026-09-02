/* Shared text-input focus, numeric scrubbing, and dropdown controls. */

document.addEventListener("focusin", (event) => {
  const input = event.target;
  if (input instanceof HTMLInputElement && input.matches(".text-input[data-select-on-focus], .dropdown__input[data-select-on-focus]")) input.select();
});

document.querySelectorAll("[data-text-input-prefix]").forEach((prefix) => {
  if (!(prefix instanceof HTMLElement)) return;
  const shell = prefix.closest(".text-input-shell, .size-mode-combobox");
  const input = shell?.querySelector("input.text-input, input.dropdown__input");
  if (!(input instanceof HTMLInputElement)) return;
  let drag = null;
  const finishDrag = (event, shouldFocus) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const didDrag = drag.didDrag;
    drag = null;
    prefix.classList.remove("is-dragging");
    shell?.classList.remove("is-scrubbing");
    if (prefix.hasPointerCapture(event.pointerId)) prefix.releasePointerCapture(event.pointerId);
    endHistoryGesture(input);
    if (!didDrag && shouldFocus) input.focus();
    event.preventDefault();
  };
  prefix.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    const startValues = input.value.split(",").map((part) => Number(part.trim()));
    if (startValues.length < 1 || startValues.length > 2 || startValues.some((value) => !Number.isFinite(value))) return;
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    document.querySelectorAll(".text-input-shell.is-scrubbing, .size-mode-combobox.is-scrubbing").forEach((activeShell) => {
      if (activeShell !== shell) activeShell.classList.remove("is-scrubbing");
    });
    drag = { pointerId: event.pointerId, startX: event.clientX, startValues, didDrag: false };
    beginHistoryGesture(input);
    shell?.classList.add("is-scrubbing");
    prefix.setPointerCapture(event.pointerId);
    event.preventDefault();
  });
  prefix.addEventListener("pointermove", (event) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const dragUnits = Math.trunc(event.clientX - drag.startX);
    if (!drag.didDrag && Math.abs(dragUnits) < 2) return;
    drag.didDrag = true;
    prefix.classList.add("is-dragging");
    const multiplier = event.shiftKey ? 10 : 1;
    const minimumValue = input.min || input.dataset.min;
    const maximumValue = input.max || input.dataset.max;
    const minimum = minimumValue == null || minimumValue === "" ? -Infinity : Number(minimumValue);
    const maximum = maximumValue == null || maximumValue === "" ? Infinity : Number(maximumValue);
    const nextValues = drag.startValues.map((startValue) => Math.min(maximum, Math.max(minimum, startValue + dragUnits * multiplier)));
    const nextValue = nextValues.join(", ");
    if (input.value === nextValue) return;
    input.value = nextValue;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    event.preventDefault();
  });
  prefix.addEventListener("pointerup", (event) => finishDrag(event, true));
  prefix.addEventListener("pointercancel", (event) => finishDrag(event, false));
  prefix.addEventListener("lostpointercapture", (event) => finishDrag(event, false));
  prefix.addEventListener("click", (event) => event.preventDefault());
});

function getDropdownValue(input) {
  return input instanceof HTMLInputElement ? input.dataset.value ?? input.value : "";
}

function setDropdownValue(input, value) {
  if (!(input instanceof HTMLInputElement)) return;
  const dropdown = input.closest("[data-dropdown]");
  const options = Array.from(dropdown?.querySelectorAll(".dropdown__option") ?? []);
  const selectedOption = options.find((option) => option.getAttribute("data-dropdown-value") === String(value));
  input.dataset.value = String(value);
  input.value = selectedOption?.textContent?.trim() || String(value);
  options.forEach((option) => option.setAttribute("aria-selected", String(option === selectedOption)));
}

function setDropdownOpen(dropdown, isOpen) {
  if (!(dropdown instanceof HTMLElement)) return;
  const input = dropdown.querySelector(".dropdown__input");
  const toggle = dropdown.querySelector("[data-dropdown-toggle]");
  const menu = dropdown.querySelector("[data-dropdown-menu]");
  if (!(input instanceof HTMLInputElement) || !(menu instanceof HTMLElement)) return;
  if (isOpen) document.querySelectorAll("[data-dropdown].is-open").forEach((other) => {
    if (other !== dropdown) setDropdownOpen(other, false);
  });
  menu.hidden = !isOpen;
  dropdown.classList.toggle("is-open", isOpen);
  input.setAttribute("aria-expanded", String(isOpen));
  toggle?.setAttribute("aria-expanded", String(isOpen));
  if (isOpen) {
    input.focus();
    if (input.hasAttribute("data-select-on-focus")) input.select();
  }
}

document.querySelectorAll("[data-dropdown]").forEach((dropdown) => {
  if (!(dropdown instanceof HTMLElement)) return;
  const input = dropdown.querySelector(".dropdown__input");
  const toggle = dropdown.querySelector("[data-dropdown-toggle]");
  const menu = dropdown.querySelector("[data-dropdown-menu]");
  if (!(input instanceof HTMLInputElement) || !(menu instanceof HTMLElement)) return;
  toggle?.addEventListener("click", () => setDropdownOpen(dropdown, menu.hidden));
  input.addEventListener("click", () => { if (input.readOnly) setDropdownOpen(dropdown, menu.hidden); });
  input.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown") { event.preventDefault(); setDropdownOpen(dropdown, true); }
    else if (event.key === "Escape") { event.preventDefault(); setDropdownOpen(dropdown, false); }
    else if (event.key === "Enter" && input.readOnly) { event.preventDefault(); setDropdownOpen(dropdown, menu.hidden); }
  });
  menu.addEventListener("pointerdown", (event) => event.preventDefault());
  menu.addEventListener("click", (event) => {
    const option = event.target instanceof Element ? event.target.closest(".dropdown__option") : null;
    if (!(option instanceof HTMLButtonElement)) return;
    const value = option.getAttribute("data-dropdown-value") ?? option.textContent?.trim() ?? "";
    setDropdownValue(input, value);
    input.dispatchEvent(new Event("change", { bubbles: true }));
    setDropdownOpen(dropdown, false);
    input.focus();
    if (input.hasAttribute("data-select-on-focus")) input.select();
  });
});

document.addEventListener("pointerdown", (event) => {
  if (!(event.target instanceof Node)) return;
  document.querySelectorAll("[data-dropdown].is-open").forEach((dropdown) => {
    if (dropdown instanceof HTMLElement && !dropdown.contains(event.target)) setDropdownOpen(dropdown, false);
  });
});
