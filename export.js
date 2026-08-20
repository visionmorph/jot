/* React and Storybook source generation, SVG serialization, and export downloads. */

function toReactComponentName(value) {
  const name = value
    .trim()
    .replace(/[^a-zA-Z0-9]+(.)/g, (_, character) => character.toUpperCase())
    .replace(/^[a-z]/, (character) => character.toUpperCase())
    .replace(/[^a-zA-Z0-9_$]/g, "");
  if (!name) return "GeneratedComponent";
  return /^\d/.test(name) ? `Component${name}` : name;
}

function formatReactStyle(style, rawProperties = null) {
  const properties = Object.entries(style)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([property, value]) => `${property}: ${rawProperties?.has(property) ? value : JSON.stringify(value)}`);
  return `{ ${properties.join(", ")} }`;
}

function isZeroCssValue(value) {
  return /^-?0(?:\.0+)?(?:px|em|rem|%)?$/i.test(String(value).trim());
}

function getExportSizingStyle(type, record) {
  const element = record.element;
  const { parentId, parentDirection } = getLayerSizingContext(type, record);
  const isRoot = parentId === null;
  const widthMode = getLayerDimensionMode(element, "width", type === "text" ? "hug" : "fixed");
  const heightMode = getLayerDimensionMode(element, "height", type === "text" ? "hug" : "fixed");
  const mainDimension = parentDirection === "vertical" ? "height" : "width";
  const mainMode = mainDimension === "width" ? widthMode : heightMode;
  const crossMode = mainDimension === "width" ? heightMode : widthMode;
  const dimensionValue = (dimension, mode, fallback) => {
    if (mode === "fixed") return `${element.dataset[dimension] || fallback}px`;
    if (mode === "hug") {
      return dimension === "width" && type === "text" && isRoot ? "max-content" : undefined;
    }
    return isRoot ? "100%" : "auto";
  };
  return {
    width: dimensionValue("width", widthMode, type === "frame" ? "100" : type === "vector" ? "24" : "0"),
    height: dimensionValue("height", heightMode, type === "frame" ? "100" : type === "vector" ? "24" : "0"),
    flex: isRoot ? undefined : mainMode === "fill" ? "1 1 0" : "0 0 auto",
    alignSelf: !isRoot && crossMode === "fill" ? "stretch" : undefined,
    minWidth: !isRoot && mainDimension === "width" && widthMode === "fill" ? 0 : undefined,
    minHeight: !isRoot && mainDimension === "height" && heightMode === "fill" ? 0 : undefined,
  };
}

function toExportCssLength(value) {
  return value === 0 ? 0 : `${value}px`;
}

function getExportPaddingStyle(element) {
  const top = Number(element.dataset.paddingTop || "10");
  const right = Number(element.dataset.paddingRight || "10");
  const bottom = Number(element.dataset.paddingBottom || "10");
  const left = Number(element.dataset.paddingLeft || "10");
  const values = [top, right, bottom, left];
  if (values.every((value) => value === values[0])) {
    return { padding: toExportCssLength(values[0]) };
  }
  if (top === bottom && right === left) {
    return { padding: `${toExportCssLength(top)} ${toExportCssLength(right)}` };
  }
  if (right === left) {
    return { padding: `${toExportCssLength(top)} ${toExportCssLength(right)} ${toExportCssLength(bottom)}` };
  }
  return {
    paddingTop: toExportCssLength(top),
    paddingRight: toExportCssLength(right),
    paddingBottom: toExportCssLength(bottom),
    paddingLeft: toExportCssLength(left),
  };
}

function getExportTextAlignmentStyle(record) {
  const element = record.element;
  const alignment = normalizeFrameAlignment(element.dataset.alignment || "top-left");
  const [vertical, horizontal] = alignment === "center" ? ["center", "center"] : alignment.split("-");
  const heightMode = getLayerDimensionMode(element, "height", "hug");
  return {
    display: record.parentFrameId === null ? "inline-block" : undefined,
    alignContent: heightMode !== "hug" && vertical !== "top"
      ? (vertical === "center" ? "center" : "end")
      : undefined,
    textAlign: horizontal === "center" ? "center" : horizontal === "right" ? "right" : "left",
  };
}

function getExportFrameStyle(record) {
  const element = record.element;
  const isRoot = record.parentId === null;
  const isAutoGap = element.dataset.gapMode === "auto";
  const direction = element.dataset.direction || "horizontal";
  const widthMode = getLayerDimensionMode(element, "width", "fixed");
  const heightMode = getLayerDimensionMode(element, "height", "fixed");
  const isButton = normalizeFrameHtmlTag(element.dataset.htmlTag || "div") === "button";
  const hasExplicitDimensions = widthMode !== "hug" || heightMode !== "hug";
  const gap = element.dataset.gap || "10";
  const radius = element.dataset.radius || "0";
  const alignment = getFrameAlignmentValues(element);
  const outlineBoxShadow = getFrameOutlineBoxShadow(element);
  return {
    display: isRoot && widthMode === "hug" ? "inline-flex" : "flex",
    flexDirection: direction === "vertical" ? "column" : undefined,
    alignItems: alignment.alignItems,
    ...getExportSizingStyle("frame", record),
    ...getExportPaddingStyle(element),
    gap: isAutoGap || isZeroCssValue(`${gap}px`) ? undefined : `${gap}px`,
    justifyContent: isAutoGap || alignment.justifyContent !== "flex-start"
      ? (isAutoGap ? "space-between" : alignment.justifyContent)
      : undefined,
    border: isButton ? 0 : undefined,
    borderRadius: isZeroCssValue(`${radius}px`) ? undefined : `${radius}px`,
    backgroundColor: element.dataset.frameColor || (isButton ? "transparent" : undefined),
    boxShadow: outlineBoxShadow || undefined,
    boxSizing: hasExplicitDimensions ? "border-box" : undefined,
  };
}

function getExportTextStyle(record) {
  const element = record.element;
  const lineHeight = element.dataset.lineHeight || "Auto";
  const letterSpacing = element.style.letterSpacing || "0em";
  const widthMode = getLayerDimensionMode(element, "width", "hug");
  return {
    ...getExportSizingStyle("text", record),
    color: element.dataset.textColor || "#ffffff",
    fontFamily: element.style.fontFamily || '"Inter", sans-serif',
    fontSize: `${element.dataset.fontSize || "14"}px`,
    fontWeight: Number(element.dataset.fontWeight || DEFAULT_FONT_WEIGHT),
    lineHeight: lineHeight.toLowerCase() === "auto" ? undefined : `${lineHeight}px`,
    letterSpacing: isZeroCssValue(letterSpacing) ? undefined : letterSpacing,
    whiteSpace: "pre-wrap",
    overflowWrap: widthMode === "hug" ? undefined : "anywhere",
    ...getExportTextAlignmentStyle(record),
  };
}

function getExportVectorStyle(record) {
  return getExportSizingStyle("vector", record);
}

function toReactSvgAttributeName(name) {
  const lowerName = name.toLowerCase();
  const exactNames = {
    class: "className",
    tabindex: "tabIndex",
    viewbox: "viewBox",
    preserveaspectratio: "preserveAspectRatio",
    gradientunits: "gradientUnits",
    gradienttransform: "gradientTransform",
    markerwidth: "markerWidth",
    markerheight: "markerHeight",
    refx: "refX",
    refy: "refY",
    textlength: "textLength",
    lengthadjust: "lengthAdjust",
    patternunits: "patternUnits",
    patterncontentunits: "patternContentUnits",
    patterntransform: "patternTransform",
    "xlink:href": "xlinkHref",
    "xml:space": "xmlSpace",
    "xmlns:xlink": "xmlnsXlink",
  };
  if (exactNames[lowerName]) return exactNames[lowerName];
  if (lowerName.startsWith("data-") || lowerName.startsWith("aria-")) return lowerName;
  return name.replace(/[-:]([a-z])/g, (_, character) => character.toUpperCase());
}

function parseSvgStyle(styleValue) {
  return styleValue.split(";").reduce((style, declaration) => {
    const separatorIndex = declaration.indexOf(":");
    if (separatorIndex < 0) return style;
    const property = declaration.slice(0, separatorIndex).trim();
    const value = declaration.slice(separatorIndex + 1).trim();
    if (!property || !value || property.startsWith("--")) return style;
    const reactProperty = property.replace(/-([a-z])/g, (_, character) => character.toUpperCase());
    style[reactProperty] = value;
    return style;
  }, {});
}

function serializeSvgElementToJsx(element, depth, rootStyle = null, rawProperties = null) {
  const indent = "  ".repeat(depth);
  const attributes = [];
  let inlineStyle = {};

  Array.from(element.attributes).forEach((attribute) => {
    if (attribute.name.toLowerCase() === "style") {
      inlineStyle = parseSvgStyle(attribute.value);
      return;
    }
    attributes.push(` ${toReactSvgAttributeName(attribute.name)}=${JSON.stringify(attribute.value)}`);
  });
  const combinedStyle = rootStyle ? { ...inlineStyle, ...rootStyle } : inlineStyle;
  if (Object.keys(combinedStyle).length > 0) attributes.push(` style={${formatReactStyle(combinedStyle, rawProperties)}}`);

  const children = Array.from(element.childNodes).flatMap((node) => {
    if (node.nodeType === Node.ELEMENT_NODE) {
      return [serializeSvgElementToJsx(node, depth + 1)];
    }
    if ((node.nodeType === Node.TEXT_NODE || node.nodeType === Node.CDATA_SECTION_NODE)
      && (node.textContent || "").trim().length > 0) {
      return [`${"  ".repeat(depth + 1)}{${JSON.stringify(node.textContent)}}`];
    }
    return [];
  });
  const tagName = element.tagName;
  if (children.length === 0) return `${indent}<${tagName}${attributes.join("")} />`;
  return `${indent}<${tagName}${attributes.join("")}>\n${children.join("\n")}\n${indent}</${tagName}>`;
}

function findVisibilityProp(exportProps, type, id) {
  return exportProps.find((prop) => prop.type === "boolean" && prop.property === "visibility" && (
    (type === "frame" && prop.targetFrameId === id)
    || (type === "text" && prop.targetTextId === id)
    || (type === "vector" && prop.targetVectorId === id)
  ));
}

function withVisibilityStyle(styleObject, visibilityProp) {
  if (!visibilityProp) return { style: styleObject, rawProperties: null };
  const originalDisplay = styleObject.display;
  const trueBranch = originalDisplay === undefined ? "undefined" : JSON.stringify(originalDisplay);
  return {
    style: { ...styleObject, display: `${visibilityProp.exportName} ? ${trueBranch} : "none"` },
    rawProperties: new Set(["display"]),
  };
}

function renderExportVector(record, depth, exportProps) {
  const parsed = new DOMParser().parseFromString(record.svgSource, "image/svg+xml");
  const visibilityProp = findVisibilityProp(exportProps, "vector", record.id);
  const { style, rawProperties } = withVisibilityStyle(getExportVectorStyle(record), visibilityProp);
  return serializeSvgElementToJsx(parsed.documentElement, depth, style, rawProperties);
}

function getExportComponentProps() {
  const usedNames = new Set();
  return componentProps.flatMap((prop, index) => {
    const targetFrame = getFrameRecord(prop.targetFrameId);
    const targetText = getTextRecord(prop.targetTextId);
    const targetVector = getVectorRecord(prop.targetVectorId);
    const hasCompatibleButtonTarget = Boolean(
      targetFrame
      && targetFrame.parentId === null
      && normalizeFrameHtmlTag(targetFrame.element.dataset.htmlTag || "div") === "button",
    );
    const isValid = prop.type === "boolean"
      ? prop.property === "disabled"
        ? hasCompatibleButtonTarget
        : prop.property === "visibility" && Boolean(targetFrame || targetText || targetVector)
      : prop.type === "string"
        ? prop.property === "textContent" && Boolean(targetText)
        : prop.property === "onClick" && hasCompatibleButtonTarget;
    if (!isValid) return [];

    let exportName = prop.name.trim().replace(/[^a-zA-Z0-9_$]/g, "");
    if (!/^[a-zA-Z_$]/.test(exportName)) exportName = `prop${index + 1}`;
    const baseName = exportName || `prop${index + 1}`;
    let suffix = 2;
    while (usedNames.has(exportName)) {
      exportName = `${baseName}${suffix}`;
      suffix += 1;
    }
    usedNames.add(exportName);
    return [{ ...prop, exportName }];
  });
}

function renderExportLayer(layer, depth, exportProps) {
  const indent = "  ".repeat(depth);
  if (layer.type === "vector") return renderExportVector(layer.record, depth, exportProps);
  if (layer.type === "text") {
    const value = layer.record.element.textContent || "";
    const stringProp = exportProps.find((prop) => prop.targetTextId === layer.record.id && prop.property === "textContent");
    const content = stringProp ? stringProp.exportName : JSON.stringify(value);
    const textVisibilityProp = findVisibilityProp(exportProps, "text", layer.record.id);
    const { style: textStyleObject, rawProperties: textRawProperties } = withVisibilityStyle(getExportTextStyle(layer.record), textVisibilityProp);
    return `${indent}<span style={${formatReactStyle(textStyleObject, textRawProperties)}}>{${content}}</span>`;
  }

  const children = getLayerChildren(layer.record.id);
  const frameVisibilityProp = findVisibilityProp(exportProps, "frame", layer.record.id);
  const { style: frameStyleObject, rawProperties: frameRawProperties } = withVisibilityStyle(getExportFrameStyle(layer.record), frameVisibilityProp);
  const style = formatReactStyle(frameStyleObject, frameRawProperties);
  const htmlTag = normalizeFrameHtmlTag(layer.record.element.dataset.htmlTag || "div");
  const disabledProp = exportProps.find((prop) => prop.targetFrameId === layer.record.id && prop.property === "disabled");
  const onClickProp = exportProps.find((prop) => prop.targetFrameId === layer.record.id && prop.property === "onClick");
  const attributes = htmlTag === "button"
    ? ` type="button"${disabledProp ? ` disabled={${disabledProp.exportName}}` : ""}${onClickProp ? ` onClick={${onClickProp.exportName}}` : ""}`
    : "";
  if (children.length === 0) return `${indent}<${htmlTag}${attributes} style={${style}} />`;
  const childMarkup = children.map((child) => renderExportLayer(child, depth + 1, exportProps)).join("\n");
  return `${indent}<${htmlTag}${attributes} style={${style}}>\n${childMarkup}\n${indent}</${htmlTag}>`;
}

function createReactComponentSource(componentName) {
  const rootLayers = getLayerChildren(null);
  const exportProps = getExportComponentProps();
  const componentMarkup = rootLayers.length === 0
    ? "    <></>"
    : rootLayers.length === 1
      ? renderExportLayer(rootLayers[0], 2, exportProps)
      : `    <>\n${rootLayers.map((layer) => renderExportLayer(layer, 3, exportProps)).join("\n")}\n    </>`;
  const parameters = exportProps.length > 0
    ? `{ ${exportProps.map((prop) => prop.type === "action"
      ? prop.exportName
      : `${prop.exportName} = ${JSON.stringify(prop.defaultValue)}`).join(", ")} }`
    : "";

  return `import React from "react";\n\nexport default function ${componentName}(${parameters}) {\n  return (\n${componentMarkup}\n  );\n}\n`;
}

function createStorySource(componentName) {
  const exportProps = getExportComponentProps();
  const actionProps = exportProps.filter((prop) => prop.type === "action");
  const actionImport = actionProps.length > 0 ? `import { action } from "storybook/actions";\n` : "";
  const actionDeclarations = actionProps.length > 0
    ? `${actionProps.map((prop) => `const ${prop.exportName}Action = action("${prop.property === "onClick" ? "clicked" : prop.exportName}");`).join("\n")}\n\n`
    : "";
  const storyRender = actionProps.length > 0
    ? `\n  render: (args) => (\n    <${componentName}\n      {...args}\n${actionProps.map((prop) => `      ${prop.exportName}={() => ${prop.exportName}Action()}`).join("\n")}\n    />\n  ),`
    : "";
  const argTypes = exportProps.length > 0
    ? `\n  argTypes: {\n${exportProps.map((prop) => prop.type === "action"
      ? `    ${prop.exportName}: { control: false },`
      : `    ${prop.exportName}: { control: "${prop.type === "string" ? "text" : "boolean"}" },`).join("\n")}\n  },`
    : "";
  const propsWithDefaults = exportProps.filter((prop) => prop.type !== "action");
  const defaultArgs = propsWithDefaults.length > 0
    ? `{\n  args: {\n${propsWithDefaults.map((prop) => `    ${prop.exportName}: ${JSON.stringify(prop.defaultValue)},`).join("\n")}\n  },\n}`
    : "{}";
  return `${actionImport}import ${componentName} from "./${componentName}";\n\n${actionDeclarations}const meta = {\n  title: "Components/${componentName}",\n  component: ${componentName},${argTypes}${storyRender}\n};\n\nexport default meta;\n\nexport const Default = ${defaultArgs};\n`;
}

function downloadExportFile(fileName, source) {
  const blob = new Blob([source], { type: "text/javascript;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function exportAllComponents() {
  const componentItems = Array.from(document.querySelectorAll(".contained-list-item"));
  componentItems.forEach((item) => {
    const componentName = toReactComponentName(item.textContent || "Generated Component");
    downloadExportFile(`${componentName}.jsx`, createReactComponentSource(componentName));
    downloadExportFile(`${componentName}.stories.jsx`, createStorySource(componentName));
  });
}

exportComponentsButton?.addEventListener("click", exportAllComponents);
