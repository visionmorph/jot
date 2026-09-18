# Component documents

Component definitions are plain, versioned data. `getComponentDefinition(id)`
returns an independent copy without activating that component or reading the DOM.
It includes stable layer IDs, hierarchy/order, styles and datasets, text/rich text,
SVG sources, semantic attributes, component properties, and variants. Selection,
expanded branches, tools, and history belong to the editor workspace instead.

`getComponentDefinitionChildren(definition, parentId)` and
`getComponentDefinitionLayer(definition, type, id)` read that data directly.
Layer IDs remain local to each component and layer type; callers must retain the
component ID when addressing layers across definitions.

Schema version 4 stores one `layers` collection. Every node has `type`, `id`,
`parentId`, and `order`, plus its type-specific content. `parentId: null` means
the component root; other parent IDs refer to frames. Numeric IDs are unchanged
and remain scoped by type, so frame 1 and text 1 are distinct nodes. Frames are
the only authored containers currently; component instances are reference leaves.
Version 1 and older `frames`/`texts`/`vectors` arrays and `parentFrameId` fields
are migrated on workspace restoration. New snapshots write only `layers`.

Qualified identities distinguish a source layer from a rendered placement.
`createSourceLayerIdentity(componentId, type, id)` addresses authored data;
`createPlacedLayerIdentity(ownerComponentId, instancePath, source)` addresses one
placement using stable instance IDs, never names or sibling positions. An empty
path addresses the owner's own layer. `getLayerIdentityKey` and
`sameLayerIdentity` provide serialization and comparison; `sameLayerSource`
compares the underlying source across placements.

Version 3 snapshots qualify selection references, rule targets, and variant
override targets. Legacy local keys are migrated using their component context.
Existing live controls still use local keys through `toLocalLayerKey` and
`toRuntimeLayerTarget`; foreign and nested targets cannot silently become local
selections. `getSelectedLayerIdentities` exposes qualified active selections.
`createLayerIdentitySelection` supports deduplicating future placed selections.

Rendered roots carry derived identity scope metadata, excluded from saved data.
`findLayerElementByIdentity` resolves within an exact scope without crossing a
nested component boundary implicitly. `resolveLayerIdentity` resolves plain data
through an injected definition reader. Its nested-instance support is tested with
fixtures and production records. Each rendered variant root supplies its own lookup scope.

`component-instance` nodes store `sourceComponentId` and `variantId` (`null` resolves
to the source's default variant, or its base definition if it has no variants),
with a per-owner `nextComponentInstanceId` counter.
`addComponentInstance(ownerId, sourceId, options)` validates a new reference and
records one undo step; `updateComponentDefinition` can edit its variant or other
fields. Shared move, subtree duplication and deletion operations preserve these
references; duplicated placed overrides remap the first instance path segment.
Instances do not copy source layers and cannot own authored children.
Renaming a source component updates all referencing instance names and accessible
labels, including inactive owner documents. Owner history retains the current
source name; undoing or redoing the source rename propagates that name again.

Dependency validation rejects direct and indirect cycles before updates or
restoration. New instances require an existing component and variant. Imported
or previously valid missing references are retained, and
`getComponentInstanceStatus` reports `missing-component` or `missing-variant`
without substituting content. Undoing source deletion can recover the reference.
Schema 1–3 snapshots migrate with an instance counter. Instances render source
definitions recursively into separate scoped DOM roots, applying the chosen
variant's rules, Boolean properties and inherited overrides from that definition
without activating it. Source changes refresh active dependent instances and
variant previews; derived content never becomes authored owner layers.
Missing references render an amber dashed placeholder, preserving explicitly
saved instance dimensions when available. Cyclic or excessive-depth references
are guarded during rendering. SVG IDs are namespaced per placement.
The Insert Component button above Export opens a keyboard-accessible picker.
It inserts into the selected frame, or the active component root, and excludes
sources that would create dependency cycles. Canvas and tree selection treat an
instance as one layer; drag/reorder, duplication, deletion and history use the
shared commands. The instance inspector lists only authored source variants;
Base component is available only when none exist. New UI insertions choose the
authored default variant. Batch changes support instances sharing one source. Editing
the base component changes inherited defaults. Editing selected parent variants
stores `instanceVariantId` and `instanceLabel:<textId>` overrides targeting the
instance's qualified source identity, without modifying the base layer record.
Only selected variant/instance pairs are edited; normal explicit variant
inheritance still applies. Reset removes the local override, restoring inherited
parent/base settings. Instance settings are resolved before source rendering,
including when the parent component is itself instanced elsewhere.
Internal source layers remain read-only and are excluded from local
selection, bulk paint editing and text-edit bindings. Per-instance content
overrides beyond plain-text labels remain future work.

The instance inspector exposes source-authored text layers as text-label fields
(using a matching String text property's name when available). Fields commit on
Enter or blur, support same-source multi-selection, and reset to inheritance.
Each instance stores optional `labelOverrides: [{ target, value }]`, keyed by
qualified source text identity, never by its label/name. Missing arrays normalize
to empty for existing schema-4 documents. Empty strings are explicit overrides;
reset removes the entry. Overrides apply after source-variant text and replace
rich text with literal plain text without interpreting HTML. Reset restores the
original rich text. Source updates, duplication and undo/redo retain overrides;
deleted text targets retain recoverable entries that can be reset in the inspector.
This does not expose text inside nested instances for drill-down editing.

Source-authored labels can also be edited directly on the canvas: double-click
with Select, or single-click with the Text tool. Enter, Escape, or blur commits
one plain-text override history step; Shift+Enter allows a line break. Previews
are not rebuilt while a label is being edited. The captured instance and parent
variant scope determine the override destination, never the source component.
Other nested layers remain read-only.

The editor owns one `layerRecords` collection. `frameRecords`, `textRecords`, and
`vectorRecords` are filtered views for existing inspectors, not writable stores.
Tree traversal, selection lookup, moves, duplication and deletion use shared
node APIs. `deleteLayers` also cleans property bindings and variant overrides
in one history step; `duplicateLayerRecord` dispatches presentation-specific
copying while sharing traversal and target remapping.

`updateComponentDefinition(id, definition)` validates a replacement and adds one
history entry. Inactive definitions can be changed without switching the active
canvas. Updating an active definition rebuilds its view. Use the definition's
dataset and style together: datasets retain authored sizing modes and inspector
values, while style retains their rendered CSS representation.

`renderComponentDefinition(definition)` creates a detached base-component DOM tree
without modifying document data, selection, active component, or history. Each
call creates fresh elements. This is an editor rendering API, not React export
or nested-instance support; variant resolution still uses the existing editor.

Workspace capture, undo/redo, component deletion history, and switching use plain
snapshots. Restoration validates IDs/parents before replacing any live elements,
then creates new elements and binds editor interactions. DOM references live only
in runtime view records, never in captured layer data. Legacy snapshots containing
`record` objects and old variant names are accepted at normalization boundaries.

Existing inspector and canvas controls still edit the DOM. `commitCanvasComponentData`
is the compatibility adapter: canvas mutation completion, tree rendering, and DOM
mutation/event callbacks commit those edits to plain workspace data. Programmatic
DOM edits must finish their event/microtask or explicitly commit before reading a
definition. New document operations should use `updateComponentDefinition`.
This boundary allows gradual migration of existing controls to direct model
commands while retaining native DOM layout, measurements, and contenteditable.
