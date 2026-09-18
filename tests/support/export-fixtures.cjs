const { test, expect } = require("playwright/test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { openApp } = require("../support/open-app.cjs");

async function exportBehavioralTabs(page) {
  return page.evaluate(() => {
    const tabsId = currentComponent.id;
    const tabItemId = addComponent().id;
    currentComponent.frameRecord.element.dataset.htmlTag = "button";
    createCanvasText(currentComponent.frameRecord, 0, 0,
      { textContent: "Tab", beginEditing: false, isNew: false });
    addComponentProp("boolean");
    setBooleanPropProperty(componentProps.at(-1), "selected");
    addComponentProp("boolean");
    setBooleanPropProperty(componentProps.at(-1), "disabled");
    commitCanvasComponentData();

    activateComponent(tabsId);
    addComponentInstance(tabsId, tabItemId);
    addComponentInstance(tabsId, tabItemId);
    const firstPanel = createCanvasFrame(0, 0, currentComponent.frameRecord, { select: false });
    const secondPanel = createCanvasFrame(0, 0, currentComponent.frameRecord, { select: false });
    firstPanel.element.setAttribute("role", "tabpanel");
    secondPanel.element.setAttribute("role", "tabpanel");
    createCanvasText(firstPanel, 0, 0,
      { textContent: "First panel", beginEditing: false, isNew: false });
    createCanvasText(secondPanel, 0, 0,
      { textContent: "Second panel", beginEditing: false, isNew: false });
    commitCanvasComponentData();
    currentComponent.frameRecord.element.setAttribute("role", "tablist");
    addComponentProp("boolean");
    setBooleanPropProperty(componentProps.at(-1), "disabled");
    commitCanvasComponentData();

    const files = {};
    const original = downloadExportFile;
    downloadExportFile = (name, content) => { files[name] = content; };
    try { exportAllComponents(); } finally { downloadExportFile = original; }
    return files;
  });
}

async function mountGeneratedTabs(page, files) {
  const fixtureDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "jot-tabs-export-"));
  try {
    Object.entries(files)
      .filter(([name]) => name.endsWith(".jsx") || name.endsWith(".css"))
      .forEach(([name, source]) => fs.writeFileSync(path.join(fixtureDirectory, name), source));
    fs.writeFileSync(path.join(fixtureDirectory, "entry.jsx"), `
      import React from "react";
      import { createRoot } from "react-dom/client";
      import Tabs from "./Component1.jsx";

      class ExportErrorBoundary extends React.Component {
        constructor(props) { super(props); this.state = { error: null }; }
        static getDerivedStateFromError(error) { return { error }; }
        render() {
          return this.state.error
            ? <div data-export-error>{this.state.error.message}</div>
            : this.props.children;
        }
      }

      const root = createRoot(document.getElementById("root"));
      window.exportedTabChanges = [];
      window.renderExportedTabs = (props = {}, preserveState = false) => {
        window.exportedTabChanges = [];
        root.render(
          <ExportErrorBoundary key={preserveState ? "stable" : JSON.stringify(props)}>
            <Tabs {...props} onValueChange={(value) => window.exportedTabChanges.push(value)} />
          </ExportErrorBoundary>,
        );
      };
    `);

    const { build } = await import("vite");
    const result = await build({
      configFile: false,
      root: fixtureDirectory,
      logLevel: "silent",
      resolve: {
        alias: [
          { find: /^react$/, replacement: require.resolve("react") },
          { find: /^react\/jsx-runtime$/, replacement: require.resolve("react/jsx-runtime") },
          { find: /^react-dom\/client$/, replacement: require.resolve("react-dom/client") },
        ],
      },
      build: {
        write: false,
        rollupOptions: {
          input: path.join(fixtureDirectory, "entry.jsx"),
          output: { format: "iife", inlineDynamicImports: true, name: "JotTabsBehavior" },
        },
      },
    });
    const outputs = Array.isArray(result) ? result.flatMap(entry => entry.output) : result.output;
    const script = outputs.find(output => output.type === "chunk" && output.isEntry)?.code;
    const stylesheet = outputs
      .filter(output => output.type === "asset" && output.fileName.endsWith(".css"))
      .map(output => String(output.source)).join("\n");
    await page.setContent('<div id="root"></div>');
    if (stylesheet) await page.addStyleTag({ content: stylesheet });
    await page.addScriptTag({ content: script });
  } finally {
    fs.rmSync(fixtureDirectory, { recursive: true, force: true });
  }
}


module.exports = { exportBehavioralTabs, mountGeneratedTabs };
