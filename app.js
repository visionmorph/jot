(function () {
  "use strict";

  const variants = ["primary", "secondary", "ghost"];
  const pseudoStates = ["default", "hover", "active", "focus", "disabled"];
  const icons = { plus: "+", arrow: "→", sparkle: "✦", check: "✓" };
  const sizes = {
    sm: { height: 32, padding: 12, font: 13, icon: 15 },
    md: { height: 40, padding: 16, font: 14, icon: 17 },
    lg: { height: 48, padding: 20, font: 15, icon: 19 },
  };

  const initialStyles = {
    primary: {
      default: { background: "#6c5ce7", foreground: "#ffffff", border: "#6c5ce7" },
      hover: { background: "#7a6bea", foreground: "#ffffff", border: "#7a6bea" },
      active: { background: "#5545c8", foreground: "#ffffff", border: "#5545c8" },
      focus: { background: "#6c5ce7", foreground: "#ffffff", border: "#6c5ce7" },
      disabled: { background: "#dedbf1", foreground: "#9690ae", border: "#dedbf1" },
    },
    secondary: {
      default: { background: "#ffffff", foreground: "#242128", border: "#d7d3dc" },
      hover: { background: "#f5f2f8", foreground: "#242128", border: "#c9c4d1" },
      active: { background: "#ebe7f0", foreground: "#242128", border: "#bbb5c5" },
      focus: { background: "#ffffff", foreground: "#242128", border: "#6c5ce7" },
      disabled: { background: "#f4f2f5", foreground: "#aaa5b0", border: "#e4e1e7" },
    },
    ghost: {
      default: { background: "#ffffff00", foreground: "#514b5b", border: "#ffffff00" },
      hover: { background: "#f0edf5", foreground: "#2e2935", border: "#f0edf5" },
      active: { background: "#e5e0ec", foreground: "#2e2935", border: "#e5e0ec" },
      focus: { background: "#ffffff00", foreground: "#514b5b", border: "#6c5ce7" },
      disabled: { background: "#ffffff00", foreground: "#aaa5b0", border: "#ffffff00" },
    },
  };

  const defaults = {
    variant: "primary",
    pseudoState: "default",
    size: "md",
    label: "Button label",
    icon: "sparkle",
    iconPosition: "start",
    disabled: false,
    fullWidth: false,
    fixture: "canvas",
    fixtureWidth: 520,
    radius: 10,
    gap: 8,
    styles: initialStyles,
  };

  let model = restoreModel();
  let selectedFile = "Button.stories.tsx";

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const titleCase = (value) => value.charAt(0).toUpperCase() + value.slice(1);
  const clone = (value) => JSON.parse(JSON.stringify(value));

  function restoreModel() {
    try {
      const saved = JSON.parse(localStorage.getItem("domform-static-v1") || "null");
      return saved ? { ...clone(defaults), ...saved, styles: saved.styles || clone(initialStyles) } : clone(defaults);
    } catch {
      return clone(defaults);
    }
  }

  function saveModel() {
    localStorage.setItem("domform-static-v1", JSON.stringify(model));
    const status = $("#save-status");
    status.textContent = "Saving…";
    window.clearTimeout(saveModel.timer);
    saveModel.timer = window.setTimeout(() => { status.textContent = "Draft saved locally"; }, 300);
  }

  function setActive(selector, attribute, value) {
    $$(selector).forEach((button) => button.classList.toggle("active", button.dataset[attribute] === value));
  }

  function setControlValues() {
    $("#prop-label").value = model.label;
    $("#prop-icon").value = model.icon;
    $("#prop-variant").value = model.variant;
    $("#prop-size").value = model.size;
    $("#prop-disabled").checked = model.disabled;
    $("#prop-full-width").checked = model.fullWidth;
    $("#prop-fixture").value = model.fixture;
    $("#prop-fixture-width").value = model.fixtureWidth;
    $("#fixture-width-output").textContent = `${model.fixtureWidth}px`;
    $("#radius").value = model.radius;
    $("#radius-output").textContent = `${model.radius}px`;
    $("#gap").value = model.gap;
    $("#gap-output").textContent = `${model.gap}px`;
  }

  function render() {
    const button = $("#designed-button");
    const styleSet = model.styles[model.variant];
    const stateStyle = styleSet[model.pseudoState];
    const size = sizes[model.size];
    const hasIcon = model.icon !== "none";
    const iconOnly = hasIcon && model.iconPosition === "only";
    const selectorState = model.pseudoState === "focus" ? "focus-visible" : model.pseudoState;

    button.style.setProperty("--button-bg", styleSet.default.background);
    button.style.setProperty("--button-fg", styleSet.default.foreground);
    button.style.setProperty("--button-border", styleSet.default.border);
    button.style.setProperty("--button-hover-bg", styleSet.hover.background);
    button.style.setProperty("--button-hover-fg", styleSet.hover.foreground);
    button.style.setProperty("--button-hover-border", styleSet.hover.border);
    button.style.setProperty("--button-active-bg", styleSet.active.background);
    button.style.setProperty("--button-active-fg", styleSet.active.foreground);
    button.style.setProperty("--button-active-border", styleSet.active.border);
    button.style.setProperty("--button-focus-bg", styleSet.focus.background);
    button.style.setProperty("--button-focus-fg", styleSet.focus.foreground);
    button.style.setProperty("--button-focus-border", styleSet.focus.border);
    button.style.setProperty("--button-disabled-bg", styleSet.disabled.background);
    button.style.setProperty("--button-disabled-fg", styleSet.disabled.foreground);
    button.style.setProperty("--button-disabled-border", styleSet.disabled.border);
    button.style.setProperty("--button-radius", `${model.radius}px`);
    button.style.setProperty("--button-gap", `${model.gap}px`);
    button.style.setProperty("--button-height", `${size.height}px`);
    button.style.setProperty("--button-padding", `${size.padding}px`);
    button.style.setProperty("--button-font", `${size.font}px`);
    button.style.setProperty("--button-icon", `${size.icon}px`);
    button.dataset.forcedState = model.pseudoState;
    button.dataset.variant = model.variant;
    button.disabled = model.disabled || model.pseudoState === "disabled";
    button.classList.toggle("isFullWidth", model.fullWidth);
    button.classList.toggle("iconOnly", iconOnly);
    button.setAttribute("aria-label", iconOnly ? model.label || "Button" : "");
    if (!iconOnly) button.removeAttribute("aria-label");

    const glyph = $("#button-glyph");
    const label = $("#button-label");
    glyph.hidden = !hasIcon;
    glyph.textContent = hasIcon ? icons[model.icon] : "";
    glyph.style.order = model.iconPosition === "end" ? "2" : "0";
    label.hidden = iconOnly;
    label.textContent = model.label || "Button label";
    label.style.order = "1";

    $("#layer-start").hidden = !hasIcon || model.iconPosition === "end";
    $("#layer-end").hidden = !hasIcon || model.iconPosition !== "end";
    $("#position-field").hidden = !hasIcon;
    $("#position-note").hidden = hasIcon;

    setActive("[data-variant]", "variant", model.variant);
    setActive("[data-state]", "state", model.pseudoState);
    setActive("[data-fixture]", "fixture", model.fixture);
    setActive("[data-position]", "position", model.iconPosition);

    const stage = $("#canvas-stage");
    stage.className = `canvasStage fixture-${model.fixture}${model.fixtureWidth < 360 ? " isNarrow" : ""}`;
    $("#fixture-title").textContent = model.fixture === "canvas" ? "Intrinsic canvas" : `${titleCase(model.fixture)} parent`;
    $("#fixture-width-label").textContent = model.fixtureWidth;
    $("#fixture-frame").style.width = `${model.fixtureWidth}px`;
    $("#fixture-sibling").hidden = model.fixture !== "flex";
    $("#grid-ghost").hidden = model.fixture !== "grid";

    $("#selection-name").textContent = `${titleCase(model.variant)} Button`;
    $("#selection-state").textContent = `${titleCase(model.pseudoState)} state`;
    $("#selector-pill").textContent = `:${selectorState}`;
    $("#color-background").value = stateStyle.background.slice(0, 7);
    $("#color-foreground").value = stateStyle.foreground.slice(0, 7);
    $("#color-border").value = stateStyle.border.slice(0, 7);
    $("#text-background").textContent = stateStyle.background;
    $("#text-foreground").textContent = stateStyle.foreground;
    $("#text-border").textContent = stateStyle.border;
    $("#css-selector").textContent = `.button--${model.variant}${model.pseudoState === "default" ? "" : `:${selectorState}`}`;
    $("#css-declaration").textContent = `{ background: ${stateStyle.background}; }`;

    $("#metric-height").textContent = `${size.height}px`;
    $("#metric-padding").textContent = `${size.padding}px`;
    $("#metric-font").textContent = `${size.font}px`;
    $("#metric-icon").textContent = `${size.icon}px`;
    $("#measure-height").textContent = size.height;
    $("#measure-width").textContent = model.fullWidth ? `${Math.max(0, model.fixtureWidth - 48)}` : "auto";
    $("#computed-width").textContent = model.fullWidth ? "100%" : "max-content";
    $("#computed-height").textContent = `${size.height}px`;
    $("#computed-state").textContent = `:${selectorState}`;
    $("#args-preview").textContent = createArgsPreview();

    setControlValues();
    saveModel();
  }

  function createArgsPreview() {
    return `args: {
  label: "${escapeText(model.label || "Button label")}",
  variant: "${model.variant}",
  size: "${model.size}",
  disabled: ${model.disabled},
  icon: "${model.icon}",${model.icon !== "none" ? `
  iconPosition: "${model.iconPosition}",` : ""}
  fullWidth: ${model.fullWidth}
}`;
  }

  function escapeText(value) {
    return String(value).replaceAll("\\", "\\\\").replaceAll('"', '\\"').replaceAll("`", "\\`");
  }

  function generateFiles() {
    const props = `export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md" | "lg";
  icon?: "none" | "plus" | "arrow" | "sparkle" | "check";
  iconPosition?: "start" | "end" | "only";
  fullWidth?: boolean;
};`;

    const component = `import type { ButtonHTMLAttributes } from "react";
import styles from "./Button.module.css";

${props.replace("React.ButtonHTMLAttributes", "ButtonHTMLAttributes")}

const icons = { plus: "+", arrow: "→", sparkle: "✦", check: "✓" } as const;

export function Button({ label, variant = "primary", size = "md", icon = "none",
  iconPosition = "start", fullWidth = false, type = "button", className = "", ...props }: ButtonProps) {
  const hasIcon = icon !== "none";
  const iconOnly = hasIcon && iconPosition === "only";
  return (
    <button type={type} className={[styles.button, styles[variant], styles[size],
      fullWidth && styles.fullWidth, iconOnly && styles.iconOnly, className].filter(Boolean).join(" ")} {...props}>
      {hasIcon && iconPosition !== "end" && <span className={styles.icon} aria-hidden="true">{icons[icon]}</span>}
      <span className={iconOnly ? styles.srOnly : styles.label}>{label}</span>
      {hasIcon && iconPosition === "end" && <span className={styles.icon} aria-hidden="true">{icons[icon]}</span>}
    </button>
  );
}`;

    const css = `.button {
  appearance: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: ${model.gap}px;
  border: 1px solid;
  border-radius: ${model.radius}px;
  font: 600 14px/1 system-ui, sans-serif;
  white-space: nowrap;
  cursor: pointer;
  transition: background-color 140ms ease, border-color 140ms ease, color 140ms ease, box-shadow 140ms ease;
}
.button:focus-visible { outline: 3px solid #9d8ff2; outline-offset: 2px; }
.button:disabled { cursor: not-allowed; }
.fullWidth { width: 100%; }
.iconOnly { aspect-ratio: 1; padding-inline: 0; }
.sm { min-height: 32px; padding: 0 12px; font-size: 13px; }
.md { min-height: 40px; padding: 0 16px; font-size: 14px; }
.lg { min-height: 48px; padding: 0 20px; font-size: 15px; }
.icon { display: inline-grid; place-items: center; font-size: 1.2em; line-height: 1; }
.srOnly { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0, 0, 0, 0); }

${variants.map((variant) => {
  const s = model.styles[variant];
  return `.${variant} { background: ${s.default.background}; color: ${s.default.foreground}; border-color: ${s.default.border}; }
.${variant}:hover:not(:disabled) { background: ${s.hover.background}; color: ${s.hover.foreground}; border-color: ${s.hover.border}; }
.${variant}:active:not(:disabled) { background: ${s.active.background}; color: ${s.active.foreground}; border-color: ${s.active.border}; }
.${variant}:disabled { background: ${s.disabled.background}; color: ${s.disabled.foreground}; border-color: ${s.disabled.border}; }`;
}).join("\n\n")}`;

    const stories = `import type { Meta, StoryObj } from "@storybook/react";
import { Button } from "./Button";

const meta = {
  title: "Components/Actions/Button",
  component: Button,
  tags: ["autodocs"],
  args: { label: "Button label", variant: "primary", size: "md", icon: "none", iconPosition: "start" },
  argTypes: {
    variant: { control: "inline-radio", options: ["primary", "secondary", "ghost"] },
    size: { control: "inline-radio", options: ["sm", "md", "lg"] },
    icon: { control: "select", options: ["none", "plus", "arrow", "sparkle", "check"] },
    iconPosition: { control: "inline-radio", options: ["start", "end", "only"], if: { arg: "icon", neq: "none" } },
    type: { control: "select", options: ["button", "submit", "reset"] },
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;
export const Playground: Story = {};
export const WithIcon: Story = { args: { icon: "sparkle", iconPosition: "start" } };
export const Disabled: Story = { args: { disabled: true } };
export const Hover: Story = { parameters: { pseudo: { hover: true } } };
export const Active: Story = { parameters: { pseudo: { active: true } } };
export const FocusVisible: Story = { parameters: { pseudo: { focusVisible: true } } };`;

    return {
      "Button.tsx": component,
      "Button.module.css": css,
      "Button.stories.tsx": stories,
      "index.ts": `export { Button } from "./Button";\nexport type { ButtonProps } from "./Button";`,
    };
  }

  function showFile(name) {
    selectedFile = name;
    const files = generateFiles();
    $("#preview-filename").textContent = name;
    $("#file-preview").textContent = files[name];
    $$('[data-modal-file]').forEach((button) => button.classList.toggle("active", button.dataset.modalFile === name));
  }

  function openModal(file = selectedFile) {
    $("#publish-modal").hidden = false;
    $("#publish-body").hidden = false;
    $("#publish-footer").hidden = false;
    $("#publish-success").hidden = true;
    showFile(file);
  }

  function closeModal() {
    $("#publish-modal").hidden = true;
  }

  function downloadSelected() {
    const content = generateFiles()[selectedFile];
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = selectedFile;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function bindEvents() {
    $("#variant-controls").addEventListener("click", (event) => {
      const control = event.target.closest("[data-variant]");
      if (control) { model.variant = control.dataset.variant; render(); }
    });
    $("#state-controls").addEventListener("click", (event) => {
      const control = event.target.closest("[data-state]");
      if (control) { model.pseudoState = control.dataset.state; render(); }
    });
    $(".toolGroup").addEventListener("click", (event) => {
      const control = event.target.closest("[data-fixture]");
      if (control) { model.fixture = control.dataset.fixture; render(); }
    });
    $("#position-field").addEventListener("click", (event) => {
      const control = event.target.closest("[data-position]");
      if (control) { event.preventDefault(); model.iconPosition = control.dataset.position; render(); }
    });
    $(".inspectorTabs").addEventListener("click", (event) => {
      const control = event.target.closest("[data-tab]");
      if (!control) return;
      $$('[data-tab]').forEach((tab) => { tab.classList.toggle("active", tab === control); tab.setAttribute("aria-selected", String(tab === control)); });
      $$('[data-panel]').forEach((panel) => { panel.hidden = panel.dataset.panel !== control.dataset.tab; });
    });

    $("#prop-label").addEventListener("input", (event) => { model.label = event.target.value; render(); });
    $("#prop-icon").addEventListener("change", (event) => { model.icon = event.target.value; render(); });
    $("#prop-variant").addEventListener("change", (event) => { model.variant = event.target.value; render(); });
    $("#prop-size").addEventListener("change", (event) => { model.size = event.target.value; render(); });
    $("#prop-disabled").addEventListener("change", (event) => { model.disabled = event.target.checked; render(); });
    $("#prop-full-width").addEventListener("change", (event) => { model.fullWidth = event.target.checked; render(); });
    $("#prop-fixture").addEventListener("change", (event) => { model.fixture = event.target.value; render(); });
    $("#prop-fixture-width").addEventListener("input", (event) => { model.fixtureWidth = Number(event.target.value); render(); });
    $("#radius").addEventListener("input", (event) => { model.radius = Number(event.target.value); render(); });
    $("#gap").addEventListener("input", (event) => { model.gap = Number(event.target.value); render(); });

    ["background", "foreground", "border"].forEach((property) => {
      $(`#color-${property}`).addEventListener("input", (event) => {
        model.styles[model.variant][model.pseudoState][property] = event.target.value;
        render();
      });
    });

    $("#reset-state").addEventListener("click", () => {
      model.styles[model.variant][model.pseudoState] = clone(initialStyles[model.variant][model.pseudoState]);
      render();
    });
    $("#reset-all").addEventListener("click", () => { model = clone(defaults); render(); });
    $("#stress-test").addEventListener("click", () => {
      model.fixture = "flex";
      model.fixtureWidth = model.fixtureWidth === 320 ? 520 : 320;
      model.label = model.fixtureWidth === 320 ? "Create production component" : "Button label";
      render();
    });

    $("#copy-args").addEventListener("click", async () => {
      await navigator.clipboard?.writeText(createArgsPreview());
      $("#copy-args").textContent = "Copied";
      window.setTimeout(() => { $("#copy-args").textContent = "Copy"; }, 1000);
    });
    $$("[data-file]").forEach((button) => button.addEventListener("click", () => openModal(button.dataset.file)));
    $$("[data-modal-file]").forEach((button) => button.addEventListener("click", () => showFile(button.dataset.modalFile)));
    $("#open-publish").addEventListener("click", () => openModal());
    $("#close-publish").addEventListener("click", closeModal);
    $("#cancel-publish").addEventListener("click", closeModal);
    $("#return-canvas").addEventListener("click", closeModal);
    $("#download-file").addEventListener("click", downloadSelected);
    $("#confirm-publish").addEventListener("click", () => {
      $("#publish-body").hidden = true;
      $("#publish-footer").hidden = true;
      $("#publish-success").hidden = false;
    });
    $("#publish-modal").addEventListener("mousedown", (event) => { if (event.target === event.currentTarget) closeModal(); });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeModal();
      if (/^[dhafx]$/i.test(event.key) && !/input|select|textarea/i.test(document.activeElement.tagName)) {
        const shortcuts = { d: "default", h: "hover", a: "active", f: "focus", x: "disabled" };
        model.pseudoState = shortcuts[event.key.toLowerCase()];
        render();
      }
    });
  }

  bindEvents();
  render();
  showFile(selectedFile);
})();
