/* Recursive React markup generation for authored layers. */

function renderExportLayer(
  layer,
  depth,
  exportProps,
  exportContext = null,
  exportClasses = null,
  toggleBindings = [],
  styleReference = null,
  variantAxes = [],
  exportMetadata = null,
  semanticAttributes = null,
  markupOverrides = null,
  contentOverrides = null,
  semanticStyles = null,
) {
  if (layer.type === "component-instance") {
    return renderExportInstance(layer, depth, exportContext, exportClasses, exportMetadata);
  }
  const indent = "  ".repeat(depth);
  const record = getVariantExportRecord(layer.type, layer.record, exportContext);
  const layerKey = record.isComponent ? "component:0" : `${layer.type}:${record.id}`;
  if (markupOverrides?.has(layerKey)) return markupOverrides.get(layerKey);
  const className = exportClasses
    ? getExportLayerClassName(exportClasses.cssClassName, layerKey, exportClasses.rootScopeClass)
    : "";
  if (layer.type === "vector") {
    const variantStyle = getVariantExportStyle(exportContext, layerKey);
    const dynamicStyleExpression = getExportVariantStyleExpression(styleReference, layerKey);
    return renderExportVector(
      record,
      depth,
      exportProps,
      variantStyle,
      className,
      exportMetadata
        ? mergeReactStyleExpressions(
          dynamicStyleExpression || formatReactStyle({ ...getExportVectorStyle(record), ...variantStyle }),
          `instanceOverrides.styles?.[${JSON.stringify(layerKey)}]`,
        )
        : dynamicStyleExpression,
    );
  }
  if (layer.type === "text") {
    const stringProp = exportProps.find((prop) => prop.targetTextId === record.id && prop.property === "textContent");
    const content = renderExportTextContent(record.element, stringProp);
    const renderedContent = exportMetadata
      ? `{instanceOverrides.labels?.[${JSON.stringify(layerKey)}] !== undefined ? instanceOverrides.labels[${JSON.stringify(layerKey)}] : ${stringProp ? stringProp.exportName : `<>${content}</>`}}`
      : content;
    const resolvedRenderedContent = contentOverrides?.get(layerKey) ?? renderedContent;
    const textVisibilityProp = findVisibilityProp(exportProps, "text", record.id);
    const variantStyle = getVariantExportStyle(exportContext, layerKey);
    const { style: textStyleObject, rawProperties: textRawProperties } = withVisibilityStyle({ ...getExportTextStyle(record), ...variantStyle }, textVisibilityProp);
    const textStyle = styleReference
      ? getExportVariantStyleExpression(styleReference, layerKey)
      : formatReactStyle(textStyleObject, textRawProperties);
    const styleAttribute = ` style={${exportMetadata
      ? mergeReactStyleExpressions(textStyle, `instanceOverrides.styles?.[${JSON.stringify(layerKey)}]`)
      : textStyle}}`;
    return `${indent}<span${className ? ` className=${JSON.stringify(className)}` : ""}${styleAttribute}>${resolvedRenderedContent}</span>`;
  }

  const children = record.isComponent
    ? getLayerChildren(null)
    : getLayerChildren(record.id);
  const frameVisibilityProp = findVisibilityProp(exportProps, "frame", record.id);
  const variantStyle = getVariantExportStyle(exportContext, layerKey);
  const mergedFrameStyle = { ...getExportFrameStyle(record), ...variantStyle };
  const stableFrameStyle = exportContext ? expandExportPaddingStyle(mergedFrameStyle) : mergedFrameStyle;
  const { style: frameStyleObject, rawProperties: frameRawProperties } = withVisibilityStyle(stableFrameStyle, frameVisibilityProp);
  const style = formatReactStyle(frameStyleObject, frameRawProperties);
  const htmlTag = normalizeFrameHtmlTag(record.element.dataset.htmlTag || "div");
  const disabledProp = exportProps.find((prop) => prop.targetFrameId === record.id && prop.property === "disabled");
  const selectedProp = exportProps.find((prop) => prop.targetFrameId === record.id && prop.property === "selected");
  const selectedAxis = variantAxes.find((axis) => {
    const componentProp = getVariantAxisComponentProp(axis);
    return componentProp?.targetFrameId === record.id && componentProp.property === "selected";
  });
  const disabledAxis = variantAxes.find((axis) => {
    const componentProp = getVariantAxisComponentProp(axis);
    return componentProp?.targetFrameId === record.id && componentProp.property === "disabled";
  });
  const onClickProp = exportProps.find((prop) => prop.targetFrameId === record.id && prop.property === "onClick");
  const toggleBinding = toggleBindings.find((binding) => binding.targetFrameId === record.id);
  const placeholderProp = exportProps.find((prop) => (
    prop.targetFrameId === record.id && prop.property === "placeholder"
  ));
  const ariaLabelProp = exportProps.find((prop) => (
    prop.targetFrameId === record.id && prop.property === "ariaLabel"
  ));
  const hrefProp = exportProps.find((prop) => (
    prop.targetFrameId === record.id && prop.property === "href"
  ));
  const invalidProp = exportProps.find((prop) => (
    prop.targetFrameId === record.id && prop.property === "invalid"
  ));
  const invalidAxis = variantAxes.find((axis) => {
    const componentProp = getVariantAxisComponentProp(axis);
    return componentProp?.targetFrameId === record.id && componentProp.property === "invalid";
  });
  const disabledExportName = disabledProp?.exportName ?? disabledAxis?.exportName;
  const selectedExportName = selectedProp?.exportName ?? selectedAxis?.exportName;
  const invalidExportName = invalidProp?.exportName ?? invalidAxis?.exportName;
  const isVariantDisabled = record.element.hasAttribute("disabled");
  const isVariantInvalid = record.element.dataset.invalid === "true";
  const baseStyleExpression = styleReference
    ? getExportVariantStyleExpression(styleReference, layerKey)
    : style;
  const cursorExpression = htmlTag === "button" || htmlTag === "a"
    ? disabledExportName
      ? `${disabledExportName} ? "not-allowed" : "pointer"`
      : JSON.stringify(isVariantDisabled ? "not-allowed" : "pointer")
    : "";
  const baseStyleEntries = getReactStyleEntries(baseStyleExpression);
  const semanticStyleExpression = semanticStyles?.get(layerKey);
  const composedStyleEntries = [
    baseStyleEntries,
    cursorExpression ? `cursor: ${cursorExpression}` : "",
    exportMetadata ? `...instanceOverrides.styles?.[${JSON.stringify(layerKey)}]` : "",
    record.isComponent ? "...style" : "",
    semanticStyleExpression ? `...(${semanticStyleExpression})` : "",
  ].filter(Boolean);
  const needsComposedStyle = Boolean(cursorExpression) || Boolean(exportMetadata) || record.isComponent || Boolean(semanticStyleExpression);
  const styleAttribute = needsComposedStyle
    ? ` style={{ ${composedStyleEntries.join(", ")} }}`
    : ` style={${baseStyleExpression}}`;
  const classAttribute = record.isComponent
    ? exportClasses?.rootScopeExpression
      ? ` className={[${exportClasses.rootScopeExpression}, className].filter(Boolean).join(" ")}`
      : className
        ? ` className={[${JSON.stringify(className)}, className].filter(Boolean).join(" ")}`
        : " className={className}"
    : className ? ` className=${JSON.stringify(className)}` : "";
  const rootAttributes = record.isComponent ? " {...rest} ref={ref}" : "";
  let attributes = "";
  const ariaLabelAttribute = ariaLabelProp
    ? ` aria-label={${ariaLabelProp.resolvedAriaLabelExportName}}`
    : "";
  if (htmlTag === "button") {
    const clickHandler = toggleBinding
        ? onClickProp
          ? `(event) => { ${onClickProp.exportName}?.(event); ${toggleBinding.handlerExportName}(); }`
          : toggleBinding.handlerExportName
        : onClickProp ? onClickProp.exportName : "";
    const clickAttribute = isVariantDisabled || !clickHandler
      ? ""
      : disabledExportName
        ? ` onClick={${disabledExportName} ? undefined : ${clickHandler}}`
        : ` onClick={${clickHandler}}`;
    const toggleAttributes = toggleBinding
      ? ` role="switch" aria-checked={${toggleBinding.exportName}}`
      : "";
    const selectedAttributes = selectedExportName
      ? ` role="tab" aria-selected={${selectedExportName}}`
      : record.element.getAttribute("role") === "tab"
        ? ` role="tab" aria-selected=${JSON.stringify(record.element.getAttribute("aria-selected") ?? "false")}`
        : "";
    const isTab = Boolean(selectedAttributes);
    const disabledAttribute = disabledExportName
      ? ` disabled={${disabledExportName}}`
      : isVariantDisabled ? " disabled" : "";
    const ariaDisabledAttribute = isTab
      ? disabledExportName
        ? ` aria-disabled={${disabledExportName} || undefined}`
        : isVariantDisabled ? ' aria-disabled="true"' : ""
      : "";
    attributes = ` type="button"${toggleAttributes}${selectedAttributes}${ariaLabelAttribute}${disabledAttribute}${ariaDisabledAttribute}${clickAttribute}`;
  } else if (htmlTag === "input") {
    const disabledAttribute = disabledExportName
      ? ` disabled={${disabledExportName}}`
      : isVariantDisabled ? " disabled" : "";
    const placeholderAttribute = placeholderProp
      ? ` placeholder={${placeholderProp.exportName}}`
      : record.element.dataset.placeholder
        ? ` placeholder=${JSON.stringify(record.element.dataset.placeholder)}`
        : "";
    const invalidAttribute = invalidExportName
      ? ` aria-invalid={${invalidExportName}}`
      : isVariantInvalid ? ' aria-invalid="true"' : "";
    attributes = `${disabledAttribute}${placeholderAttribute}${ariaLabelAttribute}${invalidAttribute}`;
  } else if (htmlTag === "a") {
    const hrefValue = hrefProp
      ? hrefProp.exportName
      : record.element.dataset.href
        ? JSON.stringify(record.element.dataset.href)
        : record.isComponent ? "rest.href" : "";
    const hrefAttribute = disabledExportName
      ? ` href={${disabledExportName} ? undefined : ${hrefValue || "undefined"}}`
      : isVariantDisabled
        ? record.isComponent ? " href={undefined}" : ""
        : hrefValue ? ` href={${hrefValue}}` : "";
    const disabledAttributes = disabledExportName
      ? ` role={${disabledExportName} ? "link" : undefined} aria-disabled={${disabledExportName} || undefined} onClick={${disabledExportName} ? (event) => { event.preventDefault(); event.stopPropagation(); } : ${record.isComponent ? "rest.onClick" : "undefined"}}`
      : isVariantDisabled
        ? ' role="link" aria-disabled="true" onClick={(event) => { event.preventDefault(); event.stopPropagation(); }}'
        : "";
    attributes = `${hrefAttribute}${ariaLabelAttribute}${disabledAttributes}`;
  }
  const authoredRole = normalizeFrameAriaRole(record.element.getAttribute("role"));
  if (authoredRole && !attributes.includes(" role=")) attributes = ` role=${JSON.stringify(authoredRole)}${attributes}`;
  attributes += semanticAttributes?.get(layerKey) ?? "";
  if (htmlTag === "input" || children.length === 0) {
    return `${indent}<${htmlTag}${rootAttributes}${classAttribute}${attributes}${styleAttribute} />`;
  }
  const childMarkup = children.map((child) => renderExportLayer(
    child,
    depth + 1,
    exportProps,
    exportContext,
    exportClasses,
    toggleBindings,
    styleReference,
    variantAxes,
    exportMetadata,
    semanticAttributes,
    markupOverrides,
    contentOverrides,
    semanticStyles,
  )).join("\n");
  const resolvedChildMarkup = contentOverrides?.get(layerKey) ?? childMarkup;
  return `${indent}<${htmlTag}${rootAttributes}${classAttribute}${attributes}${styleAttribute}>\n${resolvedChildMarkup}\n${indent}</${htmlTag}>`;
}

function createForwardRefParameterSource(parameters) {
  return `{ ${[...parameters, "className", "style", "...rest"].join(", ")} }`;
}

function getExportInstanceParameters(exportMetadata) {
  if (!exportMetadata || !currentComponent?.frameRecord) return [];
  return ["instanceOverrides = {}"];
}

function createInstanceOverrideMergeSource(hasComponentInstances) {
  if (!hasComponentInstances) return "";
  return `const mergeInstanceOverrides = (base = {}, override = {}) => {\n  const styleKeys = new Set([...Object.keys(base.styles ?? {}), ...Object.keys(override.styles ?? {})]);\n  const childKeys = new Set([...Object.keys(base.children ?? {}), ...Object.keys(override.children ?? {})]);\n  return {\n    labels: { ...base.labels, ...override.labels },\n    styles: Object.fromEntries([...styleKeys].map((key) => [key, { ...base.styles?.[key], ...override.styles?.[key] }])),\n    children: Object.fromEntries([...childKeys].map((key) => [key, mergeInstanceOverrides(base.children?.[key], override.children?.[key])])),\n  };\n};\n`;
}
