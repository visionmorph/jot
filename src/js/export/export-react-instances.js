/* React component-instance prop and override generation. */

function getExportInstanceSettings(record, exportContext) {
  if (!exportContext) return record;
  return resolveInstanceSettings(record, exportContext.operations ?? [], currentComponent.id);
}

function getExportInstanceProps(record, exportMetadata) {
  const source = getComponentInstanceStatus(record);
  const metadata = exportMetadata?.get(record.sourceComponentId);
  if (source.status !== "ready" || !metadata) {
    throw new Error(`Cannot export component instance ${record.id}: ${source.status === "ready" ? "missing export metadata" : source.status}.`);
  }
  const selectedVariant = getInstancePropVariant(record, source);
  const props = {};
  metadata.axes.forEach(axis => {
    props[axis.exportName] = normalizeVariantPropValue(axis, selectedVariant?.propValues?.[axis.id]);
  });
  metadata.props.filter(prop => prop.type !== "action").forEach(prop => {
    if (!Object.hasOwn(record.propValues ?? {}, prop.id)) return;
    props[prop.exportName] = record.propValues[prop.id];
  });
  const labels = Object.fromEntries((record.labelOverrides ?? []).map(override =>
    [`text:${getSourceLayerIdentity(override.target).id}`, override.value]));
  const instanceOverrides = {};
  if (Object.keys(labels).length) instanceOverrides.labels = labels;
  const styles = {};
  const childOverrides = {};
  (record.layerOverrides ?? []).forEach(override => {
    const identity = normalizeLayerIdentity(override.target);
    const source = getSourceLayerIdentity(identity);
    const key = `${source.type}:${source.id}`;
    const property = override.property === "visibility" ? "visibility" : toReactStyleProperty(override.property);
    let destination = identity.kind === "placed" ? childOverrides : styles;
    if (identity.kind === "placed") {
      identity.instancePath.forEach((id, index) => {
        const entry = destination[id] ??= { styles: {}, children: {} };
        destination = index === identity.instancePath.length - 1 ? entry.styles : entry.children;
      });
    }
    (destination[key] ??= {})[property] = override.property === "visibility"
      ? (variantBoolean(override.value) ? "visible" : "hidden") : override.value;
  });
  if (Object.keys(styles).length) instanceOverrides.styles = styles;
  if (Object.keys(childOverrides).length) instanceOverrides.children = childOverrides;
  if (Object.keys(instanceOverrides).length) props.instanceOverrides = instanceOverrides;
  return props;
}

function renderExportInstance(layer, depth, exportContext, exportClasses, exportMetadata) {
  const record = getExportInstanceSettings(layer.record, exportContext);
  const props = getExportInstanceProps(record, exportMetadata);
  const metadata = exportMetadata.get(record.sourceComponentId);
  const indent = "  ".repeat(depth);
  const attributes = exportContext
    ? ` {...instanceSettings[${record.id}]} instanceOverrides={mergeInstanceOverrides(instanceSettings[${record.id}]?.instanceOverrides, instanceOverrides.children?.[${record.id}])}`
    : Object.entries(props).filter(([name]) => name !== "instanceOverrides")
      .map(([name, value]) => ` ${name}={${JSON.stringify(value)}}`).join("")
      + ` instanceOverrides={mergeInstanceOverrides(${JSON.stringify(props.instanceOverrides ?? {})}, instanceOverrides.children?.[${record.id}])}`;
  const wrapper = getVariantExportRecord("component-instance", layer.record, exportContext);
  const wrapperStyle = parseSvgStyle(wrapper.element.style.cssText);
  if (wrapper.element.dataset.layerVisibility === "hidden") wrapperStyle.display = "none";
  const styleExpression = exportContext
    ? `variantStyles[${JSON.stringify(`component-instance:${record.id}`)}]`
    : formatReactStyle(wrapperStyle);
  const className = exportClasses
    ? getExportLayerClassName(exportClasses.cssClassName, `component-instance:${record.id}`) : "";
  return `${indent}<div${className ? ` className=${JSON.stringify(className)}` : ""} style={${styleExpression}}>\n${indent}  <${metadata.name}${attributes} />\n${indent}</div>`;
}

function createExportInstanceSettingsSource(exportVariants, axes, exportMetadata) {
  const instances = layerRecords.filter(record => record.type === "component-instance");
  if (!instances.length) return { staticSource: "", runtimeSource: "" };
  const settingsByEntry = exportVariants.map(({ variant }) => {
    const operations = resolveVariantOperations(variant);
    const records = Object.fromEntries(instances.map(record => [record.id,
      getExportInstanceProps(resolveInstanceSettings(record, operations, currentComponent.id), exportMetadata)]));
    return { variant, value: records };
  });
  const settings = createNestedVariantLookup(settingsByEntry, axes);
  const fallbackValues = axes.map((axis) => getExportVariantAxisValue(exportVariants[0]?.variant, axis));
  return {
    staticSource: `const instanceSettingsByVariant = ${JSON.stringify(settings)};\n`,
    runtimeSource: `  const instanceSettings = getVariantValue(instanceSettingsByVariant, ${JSON.stringify(axes.map((axis) => axis.exportName))}, styleValues) ?? ${createNestedVariantAccess("instanceSettingsByVariant", fallbackValues)};\n`,
  };
}
