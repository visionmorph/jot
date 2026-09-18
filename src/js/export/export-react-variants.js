/* React variant style tables and runtime selection helpers. */

function getExportLayerKey(layer) {
  return layer.record.isComponent ? "component:0" : `${layer.type}:${layer.record.id}`;
}

function collectExportLayers(layer) {
  if (!layer?.record) return [];
  if (layer.type !== "frame") return [layer];
  const children = layer.record.isComponent
    ? getLayerChildren(null)
    : getLayerChildren(layer.record.id);
  return [layer, ...children.flatMap((child) => collectExportLayers(child))];
}

function getExportLayerStyleState(layer, exportProps, exportContext) {
  const record = getVariantExportRecord(layer.type, layer.record, exportContext);
  const layerKey = getExportLayerKey(layer);
  const variantStyle = getVariantExportStyle(exportContext, layerKey);
  if (layer.type === "component-instance") {
    const wrapperStyle = parseSvgStyle(record.element.style.cssText);
    ["width", "height", "flex", "flexGrow", "flexShrink", "flexBasis", "alignSelf", "minWidth", "minHeight"]
      .forEach((property) => { delete wrapperStyle[property]; });
    return {
      style: {
        ...wrapperStyle,
        ...getExportComponentInstanceSizingStyle(record.element, record.element.parentElement),
        ...variantStyle,
      },
      rawProperties: null,
    };
  }
  if (layer.type === "vector") {
    return withVisibilityStyle(
      { ...getExportVectorStyle(record), ...variantStyle },
      findVisibilityProp(exportProps, "vector", record.id),
    );
  }
  if (layer.type === "text") {
    return withVisibilityStyle(
      { ...getExportTextStyle(record), ...variantStyle },
      findVisibilityProp(exportProps, "text", record.id),
    );
  }
  return withVisibilityStyle(
    expandExportPaddingStyle({ ...getExportFrameStyle(record), ...variantStyle }),
    findVisibilityProp(exportProps, "frame", record.id),
  );
}

function getExportStyleDelta(baseStyle, nextStyle) {
  const properties = new Set([...Object.keys(baseStyle), ...Object.keys(nextStyle)]);
  return Object.fromEntries([...properties].flatMap((property) => (
    baseStyle[property] === nextStyle[property] ? [] : [[property, nextStyle[property]]]
  )));
}

function formatReactStyleOverride(style, rawProperties = null) {
  const properties = Object.entries(style).map(([property, value]) => {
    const propertyName = property.startsWith("--") ? JSON.stringify(property) : property;
    const propertyValue = value === undefined
      ? "undefined"
      : rawProperties?.has(property) ? value : JSON.stringify(value);
    return `${propertyName}: ${propertyValue}`;
  });
  return `{ ${properties.join(", ")} }`;
}

function findExportAxisDeltaPair(exportVariants, axes, axis, value) {
  const otherAxes = axes.filter((candidate) => candidate.id !== axis.id);
  const candidates = exportVariants
    .filter(({ variant }) => getExportVariantAxisValue(variant, axis) === value)
    .map((entry, row) => ({
      entry,
      row,
      nonDefaultCount: otherAxes.filter((candidate) => (
        getExportVariantAxisValue(entry.variant, candidate) !== getExportVariantAxisDefaultValue(candidate)
      )).length,
    }))
    .sort((first, second) => first.nonDefaultCount - second.nonDefaultCount || first.row - second.row);

  for (const candidate of candidates) {
    const reference = exportVariants.find(({ variant }) => (
      getExportVariantAxisValue(variant, axis) === getExportVariantAxisDefaultValue(axis)
      && otherAxes.every((otherAxis) => (
        getExportVariantAxisValue(variant, otherAxis)
          === getExportVariantAxisValue(candidate.entry.variant, otherAxis)
      ))
    ));
    if (reference) return { reference, variant: candidate.entry };
  }
  return null;
}

function createNestedVariantLookup(entries, axes) {
  if (axes.length === 0) return entries[0]?.value;
  const lookup = {};
  entries.forEach(({ variant, value }) => {
    const values = axes.map((axis) => getExportVariantAxisValue(variant, axis));
    let branch = lookup;
    values.forEach((axisValue, index) => {
      const key = `$${String(axisValue)}`;
      if (index === values.length - 1) branch[key] = value;
      else branch = branch[key] ??= {};
    });
  });
  return lookup;
}

function getReducedVariantAxes(entries, axes) {
  let reducedAxes = [...axes];
  axes.forEach((axis) => {
    const candidateAxes = reducedAxes.filter((candidate) => candidate.id !== axis.id);
    const valuesByCombination = new Map();
    const hasConflict = entries.some((entry) => {
      const key = JSON.stringify(candidateAxes.map((candidate) => (
        getExportVariantAxisValue(entry.variant, candidate)
      )));
      const serializedValue = serializeJavaScriptValue(entry.value);
      if (!valuesByCombination.has(key)) {
        valuesByCombination.set(key, serializedValue);
        return false;
      }
      return valuesByCombination.get(key) !== serializedValue;
    });
    if (!hasConflict) reducedAxes = candidateAxes;
  });
  return reducedAxes;
}

function createNestedVariantAccess(tableName, values) {
  return values.reduce((expression, value) => `${expression}[${JSON.stringify(`$${String(value)}`)}]`, tableName);
}

function createExportVariantStyleSource(rootLayer, exportProps, exportVariants, axes, baseEntry = exportVariants[0]) {
  const layers = collectExportLayers(rootLayer);
  const baseContext = createVariantExportContext(baseEntry?.variant);
  const baseByLayerKey = new Map(layers.map((layer) => [
    getExportLayerKey(layer),
    getExportLayerStyleState(layer, exportProps, baseContext),
  ]));
  const variantLayerKeys = new Set();
  const axisStyleDeltas = {};
  const axisRows = axes.flatMap((axis) => {
    const valueRows = getVariantPropValues(axis).flatMap((value) => {
      if (value === getExportVariantAxisDefaultValue(axis)) return [];
      const pair = findExportAxisDeltaPair(exportVariants, axes, axis, value);
      if (!pair) return [];
      const referenceContext = createVariantExportContext(pair.reference.variant);
      const context = createVariantExportContext(pair.variant.variant);
      const layerRows = layers.flatMap((layer) => {
        const layerKey = getExportLayerKey(layer);
        const referenceState = getExportLayerStyleState(layer, exportProps, referenceContext);
        const nextState = getExportLayerStyleState(layer, exportProps, context);
        const delta = getExportStyleDelta(referenceState.style, nextState.style);
        if (Object.keys(delta).length === 0) return [];
        variantLayerKeys.add(layerKey);
        (((axisStyleDeltas[axis.exportName] ??= {})[String(value)] ??= {})[layerKey]) = delta;
        return [`        ${JSON.stringify(layerKey)}: ${formatReactStyleOverride(delta, nextState.rawProperties)},`];
      });
      if (layerRows.length === 0) return [];
      return [`      ${JSON.stringify(String(value))}: {\n${layerRows.join("\n")}\n      },`];
    });
    if (valueRows.length === 0) return [];
    return [`    ${JSON.stringify(axis.exportName)}: {\n${valueRows.join("\n")}\n    },`];
  });
  const retainedBaseStyles = [...baseByLayerKey].filter(([layerKey, state]) => (
    Object.keys(state.style).length > 0 || variantLayerKeys.has(layerKey)
  ));
  const combinationEntries = exportVariants.map(({ variant }) => {
    const context = createVariantExportContext(variant);
    const values = Object.fromEntries(axes.map((axis) => [
      axis.exportName,
      getExportVariantAxisValue(variant, axis),
    ]));
    const corrections = Object.fromEntries(layers.flatMap((layer) => {
      const layerKey = getExportLayerKey(layer);
      const baseState = baseByLayerKey.get(layerKey);
      const resolvedStyle = Object.assign(
        {},
        baseState.style,
        ...axes.map((axis) => (
          axisStyleDeltas[axis.exportName]?.[String(values[axis.exportName])]?.[layerKey]
        )),
      );
      const actualState = getExportLayerStyleState(layer, exportProps, context);
      const correction = getExportStyleDelta(resolvedStyle, actualState.style);
      return Object.keys(correction).length
        ? [[layerKey, { style: correction, rawProperties: actualState.rawProperties }]]
        : [];
    }));
    return { variant, value: corrections };
  });
  const baseRows = retainedBaseStyles.map(([layerKey, state]) => (
    `    ${JSON.stringify(layerKey)}: ${formatReactStyle(state.style, state.rawProperties)},`
  )).join("\n");
  const deltaAxes = axes.filter((axis) => Object.hasOwn(axisStyleDeltas, axis.exportName));
  const order = deltaAxes.map((axis) => JSON.stringify(axis.exportName)).join(", ");
  const combinationRows = combinationEntries.flatMap(({ variant, value }) => {
    const layerRows = Object.entries(value).map(([layerKey, correction]) => (
      `    ${JSON.stringify(layerKey)}: ${formatReactStyleOverride(correction.style, correction.rawProperties)},`
    ));
    if (layerRows.length === 0) return [];
    const key = JSON.stringify(axes.map((axis) => getExportVariantAxisValue(variant, axis)));
    return [`  ${JSON.stringify(key)}: {\n${layerRows.join("\n")}\n  },`];
  });
  const hasCombinationCorrections = combinationRows.length > 0;
  const hasVariantStyleDeltas = axisRows.length > 0;
  const hasDynamicStyles = hasVariantStyleDeltas || hasCombinationCorrections;
  if (!hasDynamicStyles) {
    return {
      staticSource: `const baseStyles = {\n${baseRows}\n};\n`,
      hasCombinationCorrections: false,
      hasDynamicStyles: false,
      simpleRuntimeSource: "",
    };
  }
  const useSimpleFastPath = deltaAxes.length > 0
    && deltaAxes.length <= 2
    && (axes.every((axis) => axis.type === "boolean") || !hasCombinationCorrections);
  if (useSimpleFastPath) {
    const simpleDeltaSource = hasVariantStyleDeltas
      ? `const simpleVariantStyles = {\n${axisRows.join("\n")}\n};\n`
      : "";
    const simpleCombinationEntries = combinationEntries.flatMap(({ variant, value }) => {
      if (Object.keys(value).length === 0) return [];
      const values = axes.map((axis) => getExportVariantAxisValue(variant, axis));
      const key = axes.map((axis, index) => {
        const axisName = index === 0
          ? axis.exportName
          : axis.exportName[0].toUpperCase() + axis.exportName.slice(1);
        return `${axisName}${values[index] ? "True" : "False"}`;
      }).join("");
      return [{ key, values, corrections: value }];
    });
    const simpleCombinationRows = simpleCombinationEntries.map(({ key, corrections }) => {
      const layerRows = Object.entries(corrections).map(([layerKey, correction]) => (
        `    ${JSON.stringify(layerKey)}: ${formatReactStyleOverride(correction.style, correction.rawProperties)},`
      ));
      return `  ${JSON.stringify(key)}: {\n${layerRows.join("\n")}\n  },`;
    });
    const simpleCombinationSource = simpleCombinationRows.length
      ? `const simpleVariantCombinationStyles = {\n${simpleCombinationRows.join("\n")}\n};\n`
      : "";
    const layerRuntimeRows = retainedBaseStyles.map(([layerKey]) => {
      const deltaSpreads = deltaAxes.map((axis) => {
        if (axis.type !== "boolean") {
          return `      ...simpleVariantStyles.${axis.exportName}[String(${axis.exportName})]?.[${JSON.stringify(layerKey)}],`;
        }
        const value = getVariantPropValues(axis).find((candidate) => (
          candidate !== getExportVariantAxisDefaultValue(axis)
        ));
        const condition = value ? axis.exportName : `!${axis.exportName}`;
        return `      ...(${condition} ? simpleVariantStyles.${axis.exportName}[${JSON.stringify(String(value))}]?.[${JSON.stringify(layerKey)}] : undefined),`;
      });
      const correctionSpreads = simpleCombinationEntries
        .filter(({ corrections }) => Object.hasOwn(corrections, layerKey))
        .map(({ key, values }) => {
          const condition = axes.map((axis, index) => (
            values[index] ? axis.exportName : `!${axis.exportName}`
          )).join(" && ");
          return `      ...(${condition} ? simpleVariantCombinationStyles[${JSON.stringify(key)}][${JSON.stringify(layerKey)}] : undefined),`;
        });
      return `    ${JSON.stringify(layerKey)}: {\n      ...baseStyles[${JSON.stringify(layerKey)}],\n${[...deltaSpreads, ...correctionSpreads].join("\n")}\n    },`;
    });
    return {
      staticSource: `const baseStyles = {\n${baseRows}\n};\n${simpleDeltaSource}${simpleCombinationSource}`,
      hasCombinationCorrections: false,
      hasDynamicStyles: true,
      simpleRuntimeSource: `  const variantStyles = {\n${layerRuntimeRows.join("\n")}\n  };\n`,
    };
  }
  const deltaSource = hasVariantStyleDeltas
    ? `const variantStyleDeltas = {\n${axisRows.join("\n")}\n};\nconst variantStyleAxisOrder = [${order}];\n`
    : "";
  const deltaArguments = hasVariantStyleDeltas
    ? ",\n  ...variantStyleAxisOrder.map((axis) => variantStyleDeltas[axis]?.[String(values[axis])]?.[layerKey])"
    : "";
  const combinationSource = hasCombinationCorrections
    ? `const variantStyleCombinationCorrections = {\n${combinationRows.join("\n")}\n};\n`
    : "";
  const combinationArgument = hasCombinationCorrections
    ? ",\n  variantStyleCombinationCorrections[combinationKey]?.[layerKey]"
    : "";
  return {
    staticSource: `const baseStyles = {\n${baseRows}\n};\n${deltaSource}${combinationSource}const getVariantStyle = (layerKey, values${hasCombinationCorrections ? ", combinationKey" : ""}) => Object.assign(\n  {},\n  baseStyles[layerKey]${deltaArguments}${combinationArgument},\n);\n`,
    hasCombinationCorrections,
    hasDynamicStyles: true,
    simpleRuntimeSource: "",
  };
}

function createVariantValueHelperSource(...sources) {
  if (!sources.some((source) => source.includes("getVariantValue("))) return "";
  return `const getVariantValue = (table, axes, values) => {\n  let branch = table;\n  for (const axis of axes) branch = branch?.["$" + String(values[axis])];\n  return branch;\n};\n`;
}

function getExportVariantAxisRuntimeToken(axis) {
  const componentProp = getVariantAxisComponentProp(axis);
  const property = componentProp?.property ?? String(axis.name ?? "").trim().toLowerCase();
  if (axis.type !== "boolean") {
    return `(String(${axis.exportName}).trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "default")`;
  }
  if (property === "checked") return `${axis.exportName} ? "on" : "off"`;
  if (property === "disabled") return `${axis.exportName} ? "disabled" : "enabled"`;
  if (property === "invalid") return `${axis.exportName} ? "invalid" : "valid"`;
  if (property === "visibility") return `${axis.exportName} ? "visible" : "hidden"`;
  const name = toVariantNameToken(axis.name || "option");
  return `${axis.exportName} ? ${JSON.stringify(name)} : ${JSON.stringify(`not-${name}`)}`;
}

function createExportVariantRuntimeSource(cssClassName, axes, {
  includeDefaultScope = false,
  includeCombinationCorrections = false,
  includeDynamicStyles = true,
  includeStyleValues = false,
  simpleRuntimeSource = "",
} = {}) {
  const values = axes.map((axis) => axis.exportName).join(", ");
  const needsStyleValues = includeStyleValues || (includeDynamicStyles && !simpleRuntimeSource);
  const styleValuesSource = needsStyleValues
    ? `  const styleValues = { ${values} };\n`
    : "";
  const combinationKeySource = includeCombinationCorrections
    ? "  const variantStyleCombinationKey = JSON.stringify(variantStyleAxisOrder.map((axis) => styleValues[axis]));\n"
    : "";
  const combinationKeyArgument = includeCombinationCorrections ? ", variantStyleCombinationKey" : "";
  const variantStylesSource = simpleRuntimeSource || (includeDynamicStyles
    ? `${combinationKeySource}  const variantStyles = Object.fromEntries(\n    Object.keys(baseStyles).map((styleLayerKey) => [styleLayerKey, getVariantStyle(styleLayerKey, styleValues${combinationKeyArgument})]),\n  );\n`
    : "  const variantStyles = baseStyles;\n");
  if (axes.length === 0) {
    const className = includeDefaultScope ? `${cssClassName} ${cssClassName}--default` : cssClassName;
    return `${styleValuesSource}${variantStylesSource}  const variantClassName = ${JSON.stringify(className)};\n`;
  }
  const nameAxes = [...axes]
    .sort((first, second) => getVariantAxisNamePriority(first) - getVariantAxisNamePriority(second));
  const tokens = nameAxes.map(getExportVariantAxisRuntimeToken).join(", ");
  return `${styleValuesSource}${variantStylesSource}  const variantClassName = [\n    ${JSON.stringify(cssClassName)},\n    ${JSON.stringify(`${cssClassName}--`)} + [${tokens}].join("-"),\n  ].join(" ");\n`;
}

function getExportVariantStyleExpression(styleReference, layerKey) {
  if (!styleReference) return "";
  if (styleReference.styles) return `${styleReference.styles}[${JSON.stringify(layerKey)}]`;
  return `getVariantStyle(${JSON.stringify(layerKey)}, ${styleReference.values})`;
}
