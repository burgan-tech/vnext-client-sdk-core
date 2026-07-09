# @burgan-tech/pseudo-ui

A **Server-Driven UI (SDUI)** rendering engine for TypeScript. Define your UI once with JSON — render it natively on any platform.

The SDK pairs a **JSON Schema** data contract with a **View JSON** component tree to produce fully interactive forms, summaries, and multi-step workflows without shipping new client code.

## Features

- **30+ Material Design 3 components** — TextField, Dropdown, DatePicker, TabView, Dialog, Stepper, Carousel, and more
- **Delegate-driven architecture** — the SDK never makes HTTP calls; your app provides data via a simple interface
- **Expression engine** — `$form`, `$instance`, `$param`, `$ui`, `$lov`, `$lookup`, `$schema`, `$item`, `$context` namespaces for dynamic value resolution
- **Conditional engine** — `showIf` / `hideIf` / `enableIf` / `disableIf` with `allOf`, `anyOf`, `not` compound rules and 13 operators
- **Validation engine** — JSON Schema validation (`pattern`, `format`, `minLength`, `min/max`) plus async custom validation via delegate
- **LOV & Lookup** — List-of-Values dropdowns with cascade filtering and real-time data enrichment
- **Nested components** — reusable sub-components with isolated contexts, input contracts (`x-binding`), and two-way data flow
- **`$ui` state** — transient UI state (dialog visibility, active tab) that never pollutes form data
- **Accessibility** — `aria-required`, `aria-invalid`, `aria-label` on all inputs; `role="alert"` on errors
- **Error boundaries** — `Component` and `ForEach` nodes are wrapped to prevent child crashes from taking down the app
- **Multi-language** — all labels, errors, and enum values support `{ "en": "...", "tr": "...", "ar": "..." }`
- **View & ViewModel vocabularies** — included JSON Schema definitions for tooling and IDE auto-complete

## Installation

```bash
npm install @burgan-tech/pseudo-ui
```

### Peer dependencies

The Vue adapter requires these in your project:

```bash
npm install vue@^3.5 primevue@^4.5 @primeuix/themes@^2 primeicons@^7
```

The Angular adapter (`@burgan-tech/pseudo-ui/angular`, Angular Material) requires:

```bash
npm install @angular/core@^19 @angular/common@^19 @angular/forms@^19 @angular/platform-browser@^19 \
  @angular/material@^19 @angular/cdk@^19 @angular/animations@^19 rxjs@^7.8
```

Use `provideAnimationsAsync()` and `provideNativeDateAdapter()` (or another `DateAdapter`) in your application config when using date pickers.

## Quick Start

Two steps: first a minimal form, then we enrich it with a nested component and a dropdown. Each step is self-contained.

---

### Step 1: Minimal form

Name, surname, birth date, and a Submit button. No dropdowns, no nested components — just schema, view, and a minimal delegate.

**Schema:**
```json
{
  "$schema": "https://amorphie.io/meta/view-model-vocabulary",
  "$id": "urn:amorphie:res:schema:demo:quick-start",
  "type": "object",
  "required": ["name", "surname"],
  "properties": {
    "name": { "type": "string", "minLength": 1, "x-labels": { "en": "First Name", "tr": "Ad" } },
    "surname": { "type": "string", "minLength": 1, "x-labels": { "en": "Surname", "tr": "Soyad" } },
    "birthDate": { "type": "string", "format": "date", "x-labels": { "en": "Date of Birth", "tr": "Doğum Tarihi" } }
  }
}
```

**View:**
```json
{
  "$schema": "https://amorphie.io/meta/view-vocabulary/1.0",
  "dataSchema": "urn:amorphie:res:schema:demo:quick-start",
  "view": {
    "type": "Column",
    "gap": "md",
    "children": [
      { "type": "TextField", "bind": "name" },
      { "type": "TextField", "bind": "surname" },
      { "type": "DatePicker", "bind": "birthDate" },
      { "type": "Button", "label": { "en": "Submit", "tr": "Gönder" }, "variant": "filled", "action": "submit" }
    ]
  }
}
```

**Delegate + render:** `requestData` and `loadComponent` are never called here, so we stub them to throw. Only `onAction` matters.

```vue
<script setup lang="ts">
import { provideDelegate } from '@burgan-tech/pseudo-ui/vue'
import { PseudoView } from '@burgan-tech/pseudo-ui/vue'
import '@burgan-tech/pseudo-ui/vue/style.css'

import type { PseudoViewDelegate, DataSchema, ViewDefinition } from '@burgan-tech/pseudo-ui'

const schema: DataSchema = {
  $schema: 'https://amorphie.io/meta/view-model-vocabulary',
  $id: 'urn:amorphie:res:schema:demo:quick-start',
  type: 'object',
  required: ['name', 'surname'],
  properties: {
    name: { type: 'string', minLength: 1, 'x-labels': { en: 'First Name', tr: 'Ad' } },
    surname: { type: 'string', minLength: 1, 'x-labels': { en: 'Surname', tr: 'Soyad' } },
    birthDate: { type: 'string', format: 'date', 'x-labels': { en: 'Date of Birth', tr: 'Doğum Tarihi' } },
  },
}

const view: ViewDefinition = {
  $schema: 'https://amorphie.io/meta/view-vocabulary/1.0',
  dataSchema: 'urn:amorphie:res:schema:demo:quick-start',
  view: {
    type: 'Column',
    gap: 'md',
    children: [
      { type: 'TextField', bind: 'name' },
      { type: 'TextField', bind: 'surname' },
      { type: 'DatePicker', bind: 'birthDate' },
      { type: 'Button', label: { en: 'Submit', tr: 'Gönder' }, variant: 'filled', action: 'submit' },
    ],
  },
}

const delegate: PseudoViewDelegate = {
  async requestData() { throw new Error('No LOV in this example — add a dropdown to trigger this') },
  async loadComponent() { throw new Error('No nested components — add type: "Component" to trigger this') },
  async onAction(action, formData) {
    if (action === 'submit') console.log('Form submitted:', formData)
  },
}
</script>

<template>
  <PseudoView :schema="schema" :view="view" lang="en" :delegate="delegate" />
</template>
```

---

### Step 2: Add a continent dropdown (nested component + LOV)

We extend the form with a **continent** field. The dropdown lives in a nested sub-component and gets its options via `requestData` — so you see both `loadComponent` (nested UI) and `requestData` (LOV data) in action. All data is inline.

**Add to main schema:**
```json
"continent": { "type": "string", "x-labels": { "en": "Continent you live in", "tr": "Yaşadığınız kıta" } }
```

**Add to main view** (between DatePicker and Button):
```json
{
  "type": "Component",
  "ref": "continent-selector",
  "bind": { "continent": "$form.continent" }
}
```

**Sub-component schema** (continent-selector — has `x-lov`, so the SDK calls `requestData("get-continents")`):
```json
{
  "$schema": "https://amorphie.io/meta/view-model-vocabulary",
  "$id": "urn:amorphie:res:schema:demo:continent-selector",
  "type": "object",
  "required": ["continent"],
  "properties": {
    "continent": {
      "type": "string",
      "x-labels": { "en": "Continent you live in", "tr": "Yaşadığınız kıta" },
      "x-lov": {
        "source": "get-continents",
        "valueField": "$.response.data.code",
        "displayField": "$.response.data.name"
      }
    }
  }
}
```

**Sub-component view:**
```json
{
  "$schema": "https://amorphie.io/meta/view-vocabulary/1.0",
  "dataSchema": "urn:amorphie:res:schema:demo:continent-selector",
  "view": { "type": "Dropdown", "bind": "continent" }
}
```

**Full delegate** (replace the stubs with real implementations):

```vue
<script setup lang="ts">
import { provideDelegate } from '@burgan-tech/pseudo-ui/vue'
import { PseudoView } from '@burgan-tech/pseudo-ui/vue'
import '@burgan-tech/pseudo-ui/vue/style.css'

import type { PseudoViewDelegate, DataSchema, ViewDefinition } from '@burgan-tech/pseudo-ui'

const CONTINENTS = [
  { code: 'eu', name: 'Europe' },
  { code: 'as', name: 'Asia' },
  { code: 'na', name: 'North America' },
  { code: 'sa', name: 'South America' },
  { code: 'af', name: 'Africa' },
  { code: 'oc', name: 'Oceania' },
  { code: 'an', name: 'Antarctica' },
]

const mainSchema: DataSchema = {
  $schema: 'https://amorphie.io/meta/view-model-vocabulary',
  $id: 'urn:amorphie:res:schema:demo:quick-start',
  type: 'object',
  required: ['name', 'surname'],
  properties: {
    name: { type: 'string', minLength: 1, 'x-labels': { en: 'First Name', tr: 'Ad' } },
    surname: { type: 'string', minLength: 1, 'x-labels': { en: 'Surname', tr: 'Soyad' } },
    birthDate: { type: 'string', format: 'date', 'x-labels': { en: 'Date of Birth', tr: 'Doğum Tarihi' } },
    continent: { type: 'string', 'x-labels': { en: 'Continent you live in', tr: 'Yaşadığınız kıta' } },
  },
}

const continentSchema: DataSchema = {
  $schema: 'https://amorphie.io/meta/view-model-vocabulary',
  $id: 'urn:amorphie:res:schema:demo:continent-selector',
  type: 'object',
  required: ['continent'],
  properties: {
    continent: {
      type: 'string',
      'x-labels': { en: 'Continent you live in', tr: 'Yaşadığınız kıta' },
      'x-lov': { source: 'get-continents', valueField: '$.response.data.code', displayField: '$.response.data.name' },
    },
  },
}

const mainView: ViewDefinition = {
  $schema: 'https://amorphie.io/meta/view-vocabulary/1.0',
  dataSchema: 'urn:amorphie:res:schema:demo:quick-start',
  view: {
    type: 'Column',
    gap: 'md',
    children: [
      { type: 'TextField', bind: 'name' },
      { type: 'TextField', bind: 'surname' },
      { type: 'DatePicker', bind: 'birthDate' },
      { type: 'Component', ref: 'continent-selector', bind: { continent: '$form.continent' } },
      { type: 'Button', label: { en: 'Submit', tr: 'Gönder' }, variant: 'filled', action: 'submit' },
    ],
  },
}

const delegate: PseudoViewDelegate = {
  async requestData(ref, params) {
    if (ref === 'get-continents') return { response: { data: CONTINENTS } }
    throw new Error(`Unknown data source: ${ref}`)
  },
  async loadComponent(ref) {
    if (ref === 'continent-selector') {
      return {
        schema: continentSchema,
        view: { $schema: 'https://amorphie.io/meta/view-vocabulary/1.0', dataSchema: 'urn:amorphie:res:schema:demo:continent-selector', view: { type: 'Dropdown', bind: 'continent' } },
      }
    }
    throw new Error(`Unknown component: ${ref}`)
  },
  async onAction(action, formData) {
    if (action === 'submit') console.log('Form submitted:', formData)
  },
}
</script>

<template>
  <PseudoView :schema="mainSchema" :view="mainView" lang="en" :delegate="delegate" />
</template>
```

Step 1 gives you the basics. Step 2 shows how to add a nested component and LOV — `requestData` serves dropdown options, `loadComponent` serves the sub-component.

---

### Initial data (optional)

You can pass initial values when the view first renders:

| Prop | Purpose |
|---|---|
| `formData` | Pre-fill editable fields (e.g. user draft, edit mode). Fields are bound to `$form` and can be changed by the user. |
| `instanceData` | Backend/persisted data (e.g. read-only display, lookup filters). Used by `$instance` expressions and summary views. |

```vue
<PseudoView
  :schema="schema"
  :view="view"
  :form-data="{ name: 'Jane', surname: 'Doe', birthDate: '1990-05-15' }"
  :instance-data="{ status: 'active', createdAt: '2024-01-01' }"
  lang="en"
  :delegate="delegate"
/>
```

`formData` is for user-editable data. `instanceData` is for backend state that drives display and lookups — both are optional and merged when the view mounts.

---

### Lookups (enrichment)

When a schema property has `x-lookup`, the SDK fetches enrichment data via `requestData`. You must **activate** the lookup by listing it in the view's `lookups` array — otherwise it won't run.

**Schema** (defines the lookup):
```json
{
  "branchDetail": {
    "type": "object",
    "x-lookup": {
      "source": "get-branch-details",
      "resultField": "$.response.data",
      "filter": [{ "param": "branchCode", "value": "$param.selectedBranchCode", "required": true }]
    }
  }
}
```

**View** (activates it):
```json
{
  "$schema": "https://amorphie.io/meta/view-vocabulary/1.0",
  "dataSchema": "urn:amorphie:res:schema:shared:branch-info",
  "lookups": ["branchDetail"],
  "view": { ... }
}
```

Then use `$lookup.branchDetail.address`, `$lookup.branchDetail.phone`, etc. in Text or other components. The SDK calls `requestData(source, filterParams)` when the view mounts; the delegate returns the enrichment payload.

## Action Model

The SDK treats action verbs as **opaque dispatch identifiers** with three reserved exceptions. Anything else — `'transition'`, `'navigate'`, `'urn:tenant:wf:next'`, custom verbs — flows through to `delegate.onAction(verb, formData, command?)` for the host to interpret.

### Reserved verbs (3, exported as `STANDARD_ACTIONS`)

| Verb | SDK behaviour | `defaultValidate` | Reaches host? |
|---|---|:---:|:---:|
| `submit` | Runs `validateAllFields()`; blocks dispatch on any error | ✅ | ✅ if valid |
| `select` | Sets `formData[bind]` or `uiState[bind]` from `value` (literal or `$...` expression) | – | ❌ |
| `reset` | Clears `formData` + `errors` | – | ✅ (`'reset'` event) |

### `validate` flag — make any dispatch behave like submit

Workflow transitions, save-draft buttons, custom commands often need either "validate first" or "skip validation" — independent of the verb. The `ActionDescriptor.validate` field gives view authors that switch:

```ts
interface ActionDescriptor {
  action: string                // verb (reserved or domain dispatch)
  command?: string              // opaque to SDK (typically URN)
  bind?: string                 // 'select' only
  value?: unknown               // 'select' only
  validate?: boolean            // override default validation behaviour
}
```

Effective rule: `validate ?? (verb === 'submit')`.

| View JSON | What the SDK does |
|---|---|
| `"submit"` | validate ✅ → dispatch on success |
| `{ action: "submit", validate: false }` | dispatch without validating (save-draft) |
| `{ action: "dispatch", command: "urn:wf:back" }` | dispatch immediately (no validation) |
| `{ action: "dispatch", command: "urn:wf:next", validate: true }` | validate ✅ → dispatch like submit |
| `{ action: "urn:amorphie:wf:transition:review", validate: true }` | same — URN can sit directly on `action` |
| `"reset"` | clear form + errors, then notify host |
| `{ action: "select", bind: "$ui.dialogOpen", value: true }` | inline UI state set (host never called) |

### Domain dispatches — where the host vocabulary lives

`'transition'`, `'navigate'`, `'open'`, `'cancel'` and friends are **not** reserved by the SDK. They are conventions the host owns. URN-encoded commands are preferred for resolvability:

```json
{ "type": "Button", "label": "Continue", "action": "dispatch",
  "command": "urn:amorphie:wf:account-opening:transition:next",
  "validate": true }
```

The host's `onAction` switch resolves the URN via its own dispatch table — workflow engine, navigation router, integration call, etc. The SDK never assumes any of these systems exist.

### Component → action capability

Builders / designers gate the action picker via `componentMeta.actionCapability`:

```ts
Button:     { field: 'action', reservedActions: ['submit','reset'], acceptsDispatch: true,  acceptsValidateFlag: true  }
IconButton: { field: 'action', reservedActions: ['submit','reset'], acceptsDispatch: true,  acceptsValidateFlag: true  }
FAB:        { field: 'action', reservedActions: ['submit'],         acceptsDispatch: true,  acceptsValidateFlag: true  }
Card:       { field: 'action', reservedActions: ['select'],         acceptsDispatch: true,  acceptsValidateFlag: false,
              preferredField: 'action', aliasFields: ['onTap'] }
ListTile:   { field: 'onTap',  reservedActions: ['select'],         acceptsDispatch: true,  acceptsValidateFlag: false }
Snackbar:   { field: 'action',                                      acceptsDispatch: true,  acceptsValidateFlag: false }
```

`reservedActions` lists which SDK verbs make sense on that node. `acceptsDispatch` says "this node can carry an opaque URN/custom dispatch". `acceptsValidateFlag` controls whether the builder UI exposes the "Validate form before dispatch" checkbox. `aliasFields` documents legacy prop names that still work — `Card` accepts both `action` (preferred) and `onTap` (deprecated alias; `action` wins when both are set).

### Per-item action capability (NavigationDrawer, Menu)

Some nodes carry **arrays of tappable items**, each with its own action. The SDK exposes a separate `itemActionCapability` on the parent meta:

```ts
NavigationDrawer: { itemActionCapability: { itemsField: 'items', field: 'action',
                                            reservedActions: ['select'], acceptsDispatch: true,
                                            acceptsValidateFlag: false } }
Menu:             { itemActionCapability: { itemsField: 'items', field: 'action',
                                            reservedActions: ['select'], acceptsDispatch: true,
                                            acceptsValidateFlag: false } }
```

```json
{ "type": "NavigationDrawer",
  "items": [
    { "label": "Accounts", "icon": "account_balance",
      "action": { "action": "navigate", "command": "urn:forge:nav:/accounts" } },
    { "divider": true },
    { "header": "Settings" },
    { "label": "Profile",  "icon": "person",
      "action": { "action": "navigate", "command": "urn:forge:nav:/profile" } }
  ]
}
```

Each item's action flows through the same `handleAction → delegate.onAction` path as top-level actions.

### Host onAction template

```ts
const delegate: PseudoViewDelegate = {
  // ...requestData, loadComponent, onLog
  async onAction(verb, formData, command) {
    // Reserved verbs SDK passes through to you (when validation passed or not required):
    if (verb === 'submit') { /* SDK already validated */ return persist(formData) }
    if (verb === 'reset')  { /* SDK already cleared local state */ return resetRemote() }

    // Domain dispatch — resolve through your URN registry
    if (command?.startsWith('urn:amorphie:wf:')) return workflowDispatcher.dispatch(command, formData)
    if (command?.startsWith('urn:host:nav:'))    return router.navigate(command)

    // Free-form custom verbs the SDK doesn't reserve
    if (verb === 'cancel') return closeDialog()

    console.warn('Unhandled action', verb, command)
  },
}
```

## Shadow DOM (React)

When the React adapter is mounted inside a Shadow DOM (e.g. for host-application style isolation), global CSS in `document.head` cannot reach the shadow tree. Pass a `renderRoot` prop and the SDK will:

1. Adopt its component CSS into the shadow root via `adoptedStyleSheets`.
2. Default PrimeReact's `appendTo` to the shadow host so overlays (Dropdown, Dialog, Toast) render in the same style scope as their triggers.

PrimeReact theme and PrimeIcons CSS remain the consumer's responsibility — adopt them with the exported `adoptStylesIntoRoot` helper.

```tsx
import { PseudoView, adoptStylesIntoRoot } from '@burgan-tech/pseudo-ui/react'
import primeTheme from 'primereact/resources/themes/mdc-light-indigo/theme.css?raw'
import primeBase from 'primereact/resources/primereact.min.css?raw'
import primeIcons from 'primeicons/primeicons.css?raw'

// hostElement is the shadow host; shadowRoot = hostElement.shadowRoot!
adoptStylesIntoRoot(shadowRoot, [primeTheme, primeBase, primeIcons])

<PseudoView
  schema={schema}
  view={view}
  delegate={delegate}
  renderRoot={shadowRoot}
/>
```

`primeReactConfig.appendTo` overrides the default if you need overlays elsewhere. Material Icons `@font-face` registered on the document remains accessible inside shadow roots — no extra step needed.

## Designer Mode (React)

The React adapter ships an opt-in **designer mode** that turns the rendered tree into an interactive canvas for builders (Forge ViewDesigner is the primary consumer). When `<PseudoView designer />` is on, every rendered node is wrapped with a thin interaction layer that:

- exposes a JSON Pointer **path** via `data-pseudo-path` (e.g. `/view/children/0/actions/1`)
- fires `delegate.onNodeSelect(path, node)` on click and `onNodeHover` on enter/leave
- shows a delete (×) button on the selected node → `delegate.onNodeDelete(path)`
- accepts **HTML5 native drag-drop**:
  - existing nodes set `dataTransfer.setData('application/x-pseudo-ui-path', path)` and resolve to `delegate.onNodeMove(fromPath, toParentPath, key, index)`
  - palette items set `dataTransfer.setData('application/x-pseudo-ui-palette', type)` and resolve to `delegate.onNodeDropFromPalette(targetParentPath, key, index, type)`
- highlights drop position with `--drop-before`, `--drop-after`, or `--drop-inside` modifier classes computed from cursor Y inside the hovered node

Selection is **controlled** — the host owns `selectedNodePath`. Delete/move/drop are signals; the host mutates the view tree and re-passes it.

### Tree mutation utilities

The SDK exports immutable JSON-Pointer-based helpers — use these instead of hand-rolling tree mutation:

```ts
import {
  getNodeAtPath, setNodeAtPath, removeNodeAtPath,
  insertNodeAtPath, moveNode, canDropInto,
} from '@burgan-tech/pseudo-ui'
```

### End-to-end example

```tsx
import { PseudoView } from '@burgan-tech/pseudo-ui/react'
import { removeNodeAtPath, moveNode, insertNodeAtPath, getComponentMeta } from '@burgan-tech/pseudo-ui'

const [view, setView] = useState(initialView)
const [selectedPath, setSelectedPath] = useState<string>()

const delegate = {
  // ...requestData, loadComponent, onAction, onLog
  onNodeSelect:           p => setSelectedPath(p),
  onNodeDelete:           p => { setView(removeNodeAtPath(view, p)); setSelectedPath(undefined) },
  onNodeMove:             (from, toParent, key, idx) => setView(moveNode(view, from, toParent, key, idx)),
  onNodeDropFromPalette:  (toParent, key, idx, type) => {
    const node = { type, ...(getComponentMeta(type)?.defaultProps ?? {}) }
    setView(insertNodeAtPath(view, toParent, key, idx, node))
  },
}

<PseudoView
  schema={schema}
  view={view}
  delegate={delegate}
  designer
  selectedNodePath={selectedPath}
/>
```

### Edit canvas vs. preview pane

`designer` accepts three values so a host can render an interactive canvas and a clean preview from the same view tree:

| Value             | Render bypass | Canvas chrome | Drag-drop / select |
|-------------------|:-------------:|:-------------:|:------------------:|
| `false` / `'off'` |       –       |       –       |         –          |
| `'preview'`       |       ✓       |       –       |         –          |
| `true` / `'edit'` |       ✓       |       ✓       |         ✓          |

`'preview'` keeps `x-conditional` visibility bypass and empty-ForEach placeholders active so the WYSIWYG matches the canvas, but renders **without** any handles, outlines or `data-pseudo-path` attributes.

```tsx
<div className="split">
  <PseudoView view={view} designer="edit"    {...editorProps} />
  <PseudoView view={view} designer="preview" {...rendererProps} />
</div>
```

### Styling the canvas chrome

Two layers of customisation, no fork needed:

**1. CSS custom properties** (defined on `:root`, override anywhere in the cascade):

```
--pseudo-designer-accent          /* outline + drop-indicator colour */
--pseudo-designer-hover-outline   /* full shorthand for the hover outline */
--pseudo-designer-selected-outline
--pseudo-designer-drop-indicator
--pseudo-designer-drop-inside-bg
--pseudo-designer-delete-bg
--pseudo-designer-delete-color
--pseudo-designer-delete-size
```

```css
:root {
  --pseudo-designer-accent: #ff6b35;
  --pseudo-designer-delete-bg: #1a73e8;
}
```

**2. `designerClassNames` prop** — fully replaces class names when token tweaks aren't enough:

```tsx
<PseudoView
  designer
  designerClassNames={{
    node: 'my-node',                // replaces .pseudo-designer-node
    selected: 'my-node--selected',
    dropBefore: 'my-drop-top',
    dropAfter:  'my-drop-bottom',
    dropInside: 'my-drop-into',
    deleteButton: 'my-delete-btn',
  }}
/>
```

The `samples/react-pseudo-ui` JSON Editor page has a "Designer Mode" toggle and "Preview Pane" toggle wiring all of the above end-to-end — see it as the reference implementation.

## Shadow DOM (Vue)

The Vue adapter follows the same model: pass a `renderRoot` prop and the SDK will adopt its component CSS into that shadow root and route PrimeVue overlays (`Dialog`, `Drawer`, `Select`, `DatePicker`) to the shadow host via their `appendTo` prop. PrimeVue theme is your responsibility.

```vue
<script setup lang="ts">
import { ref, onMounted, useTemplateRef } from 'vue'
import { PseudoView, adoptStylesIntoRoot } from '@burgan-tech/pseudo-ui/vue'
// PrimeVue Aura preset built with @primeuix/themes:
// import Aura from '@primeuix/themes/aura'  → see PrimeVue docs

const hostRef = useTemplateRef<HTMLDivElement>('host')
const shadow = ref<ShadowRoot>()

onMounted(() => {
  shadow.value = hostRef.value!.attachShadow({ mode: 'open' })
  // Adopt the PrimeVue theme into the same shadow root.
  // (PrimeVue 4 theme CSS may use :root — normalize to :host with a regex
  // transform when adopting, see Forge integration spec.)
})
</script>

<template>
  <div ref="host"></div>
  <Teleport v-if="shadow" :to="shadow">
    <PseudoView
      :schema="schema"
      :view="view"
      :delegate="delegate"
      :render-root="shadow"
    />
  </Teleport>
</template>
```

> The `useOverlayTarget()` composable is exported so custom DynamicRenderer extensions can forward the same `appendTo` to additional PrimeVue overlay components.

## Designer Mode (Vue & Angular)

The Vue and Angular adapters ship the **same designer mode** as React, with identical semantics, the same `data-pseudo-path` JSON Pointers, the same delegate callbacks (`onNodeSelect`, `onNodeHover`, `onNodeDelete`, `onNodeMove`, `onNodeDropFromPalette`), the same drag-drop `dataTransfer` keys (`application/x-pseudo-ui-path`, `application/x-pseudo-ui-palette`), and the same three modes (`'off'` / `'preview'` / `'edit'`). Tree mutation uses the same exported utilities (`removeNodeAtPath`, `moveNode`, `insertNodeAtPath`, …). See the **Designer Mode (React)** section above for the full behaviour, mode table and styling tokens — only the prop-passing syntax differs per framework.

**Vue:**

```vue
<script setup lang="ts">
import { PseudoView } from '@burgan-tech/pseudo-ui/vue'
import { removeNodeAtPath, moveNode, insertNodeAtPath, getComponentMeta } from '@burgan-tech/pseudo-ui'

const view = ref(initialView)
const selectedPath = ref<string>()
const designerDelegate = {
  // ...requestData, loadComponent, onAction, onLog
  onNodeSelect: (p) => { selectedPath.value = p },
  onNodeDelete: (p) => { view.value = removeNodeAtPath(view.value, p); selectedPath.value = undefined },
  onNodeMove: (from, toParent, key, idx) => { view.value = moveNode(view.value, from, toParent, key, idx) },
  onNodeDropFromPalette: (toParent, key, idx, type) => {
    const node = { type, ...(getComponentMeta(type)?.defaultProps ?? {}) }
    view.value = insertNodeAtPath(view.value, toParent, key, idx, node)
  },
}
</script>

<template>
  <PseudoView
    :schema="schema"
    :view="view"
    :delegate="designerDelegate"
    designer="edit"
    :selected-node-path="selectedPath"
  />
</template>
```

**Angular:**

```html
<pseudo-view
  [schema]="schema()!"
  [view]="view()!"
  [delegate]="designerDelegate"
  [designer]="'edit'"
  [selectedNodePath]="selectedPath()"
/>
```

```ts
// In the component: mutate the view signal from the same delegate callbacks.
readonly designerDelegate: PseudoViewDelegate = {
  // ...requestData, loadComponent, onAction, onLog
  onNodeSelect: (p) => this.selectedPath.set(p),
  onNodeDelete: (p) => { this.view.set(removeNodeAtPath(this.view()!, p)); this.selectedPath.set(undefined) },
  onNodeMove: (from, toParent, key, idx) => this.view.set(moveNode(this.view()!, from, toParent, key, idx)),
  onNodeDropFromPalette: (toParent, key, idx, type) =>
    this.view.set(insertNodeAtPath(this.view()!, toParent, key, idx, { type, ...(getComponentMeta(type)?.defaultProps ?? {}) })),
}
```

Both adapters accept `designerClassNames` for class-name overrides and read the same `--pseudo-designer-*` CSS custom properties (shipped in `@burgan-tech/pseudo-ui/vue/style.css` and `@burgan-tech/pseudo-ui/angular/style.css`). The `samples/vue-pseudo-ui` and `samples/angular-pseudo-ui` JSON Editor pages have the same "Designer Mode" + "Preview Pane" toggles wired end-to-end.

> Angular caveat: in `'edit'` mode the canvas wraps each node in a positioned `<div>` to host the chrome. CDK Overlay portals (Select, DatePicker) remain non-shadow-aware as noted below.

## Theming (Angular)

The Angular adapter uses Angular Material 19 (Material Design 3) and is **not** shadow-DOM aware in this release. Theming is driven by the standard Material `--mat-sys-*` system tokens:

```scss
:root {
  /* Tenant brand */
  --mat-sys-primary: #FF6B35;
  --mat-sys-on-primary: #ffffff;
  --mat-sys-primary-container: #ffd5c0;

  /* Surface */
  --mat-sys-surface: #fafafa;
  --mat-sys-on-surface: rgba(0, 0, 0, 0.87);
  --mat-sys-surface-container-lowest: #ffffff;
  --mat-sys-outline-variant: #e5e7eb;

  /* Status */
  --mat-sys-error: #d32f2f;
  --mat-sys-on-error: #ffffff;
}
```

For dark mode, switch the Material prebuilt theme CSS (e.g. `@angular/material/prebuilt-themes/azure-blue.css` → `azure-blue-dark.css`) at app bootstrap or compose your own theme with `mat.theme()` SCSS mixin.

### Component styles

The adapter ships a small stylesheet (`pseudo-ui-angular.css`) that defines the structural helper classes used by the renderer: icon sizes, card interaction states, tab panel layout, and the validation-error snackbar panel class.  Include it in your Angular application's global styles:

```json
// angular.json — styles array
"styles": [
  "node_modules/@burgan-tech/pseudo-ui/angular/style.css",
  "src/styles.scss"
]
```

or via SCSS import:

```scss
// styles.scss
@import '@burgan-tech/pseudo-ui/angular/style.css';
```

The stylesheet intentionally omits Angular Material theming CSS — that remains the consumer's responsibility (prebuilt theme or `mat.theme()` SCSS mixin).

### Shadow DOM

`adoptStylesIntoRoot` is exported from `@burgan-tech/pseudo-ui/angular` for consumers who host Angular inside a Shadow DOM (e.g. via `@angular/elements` with `ViewEncapsulation.ShadowDom`). Full CDK Overlay containment is tracked for a future release.

> CDK Overlay portals (Select, DatePicker, Dialog) are not shadow-aware in this release; they portal to `document.body` and may appear outside the shadow tree if the host element is inside one.

## Package Exports

| Import path | Content |
|---|---|
| `@burgan-tech/pseudo-ui` | Core engine: types, expression resolver, schema resolver, conditional engine, builder utilities (`componentMeta`, `enumerateBindPaths`) |
| `@burgan-tech/pseudo-ui/vue` | Vue 3 adapter (PrimeVue 4): `PseudoView`, `DynamicRenderer`, `provideDelegate`, `adoptStylesIntoRoot`, `pseudoUiVueCss`, `useOverlayTarget` |
| `@burgan-tech/pseudo-ui/angular` | Angular 19 adapter (standalone, Angular Material): `PseudoViewComponent`, `DynamicRendererComponent`, `FORM_CONTEXT`, `PSEUDO_DELEGATE`, `adoptStylesIntoRoot` |
| `@burgan-tech/pseudo-ui/react` | React 18+ adapter (PrimeReact 10): `PseudoView`, `DynamicRenderer`, `createFormContext`, `FormCtx`, `DelegateCtx`, `adoptStylesIntoRoot`, `pseudoUiReactCss` |
| `@burgan-tech/pseudo-ui/vue/style.css` | Vue adapter component styles (Material Design 3 tokens) |
| `@burgan-tech/pseudo-ui/vue/style.js` | Vue adapter component CSS as a JS string (for `adoptedStyleSheets`) |
| `@burgan-tech/pseudo-ui/react/style.css` | React adapter component styles |
| `@burgan-tech/pseudo-ui/react/style.js` | React adapter component CSS as a JS string (for `adoptedStyleSheets`) |
| `@burgan-tech/pseudo-ui/angular/style.css` | Angular adapter component helper classes (icon sizes, card states, snackbar) |
| `@burgan-tech/pseudo-ui/vocabularies/view-vocabulary.json` | View meta-schema (UI component tree definition) |
| `@burgan-tech/pseudo-ui/vocabularies/view-model-vocabulary.json` | ViewModel meta-schema (JSON Schema x- extensions) |

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                   Your Application                   │
│                                                      │
│  ┌──────────────┐   implements   ┌────────────────┐ │
│  │   App.vue    │ ──────────────▶│  Delegate      │ │
│  │              │                │  - requestData │ │
│  │  <PseudoView │                │  - loadComponent│ │
│  │   :schema    │                │  - onAction    │ │
│  │   :view      │                │  - onLog       │ │
│  │   lang="en"/>│                └────────────────┘ │
│  └──────┬───────┘                        ▲          │
│         │ provides                       │          │
├─────────┼────────────────────────────────┼──────────┤
│  SDK    │                                │          │
│         ▼                                │          │
│  ┌─────────────────┐  ┌──────────────┐   │          │
│  │ DynamicRenderer  │  │ Expression   │   │          │
│  │ (recursive)      │  │ Resolver     │   │          │
│  │                  │  ├──────────────┤   │          │
│  │ 30+ MD3 widgets  │  │ Conditional  │   │          │
│  │ via PrimeVue 4   │  │ Engine       │   │          │
│  │                  │  ├──────────────┤   │          │
│  │ ErrorBoundary    │  │ Schema       │   │          │
│  │ for Component &  │  │ Resolver     │◀──┘          │
│  │ ForEach          │  │ (validation) │              │
│  └─────────────────┘  └──────────────┘              │
└─────────────────────────────────────────────────────┘
```

## Data Model (MVVM)

| Layer | File | Purpose |
|---|---|---|
| **ViewModel** | `schema.json` | Data contract — field types, validation, LOV sources, conditionals, multi-lang labels |
| **View** | `view.json` | UI component tree — layout, binding, actions, transient UI state |
| **Model** | Backend | Persisted data, served via delegate's `requestData` |

## Delegate Interface

```typescript
interface PseudoViewDelegate {
  /** Fetch data from backend (LOV items, lookup enrichment). ref = source (required); params = resolved filter from x-lookup (optional when no filter). */
  requestData(ref: string, params?: Record<string, string>): Promise<unknown>

  /** Load a nested component's schema + view by reference */
  loadComponent(ref: string): Promise<{ schema: DataSchema; view: ViewDefinition }>

  /** Handle user actions (submit, cancel, back, custom commands) */
  onAction(action: string, formData: Record<string, unknown>, command?: string): Promise<void>

  /** Optional: custom async validation after built-in checks pass */
  onValidationRequest?(field: string, value: unknown, formData: Record<string, unknown>): Promise<string | null>

  /** Optional: capture SDK logs (debug, info, warn, error) */
  onLog?(level: LogLevel, message: string, error?: unknown, context?: Record<string, unknown>): void
}
```

## Supported Components

### Layout
`Column` · `Row` · `Stack` · `Grid` · `Expanded` · `SizedBox` · `Divider` · `Spacer`

### Input
`TextField` · `TextArea` · `NumberField` · `Dropdown` · `Checkbox` · `RadioGroup` · `DatePicker` · `TimePicker` · `Switch` · `Slider` · `SegmentedButton` · `SearchField` · `AutoComplete`

### Display
`Text` · `Image` · `Chip` · `ListTile` · `Avatar` · `RichText` · `LoadingIndicator`

### Surface & Overlay
`Card` · `Dialog` · `BottomSheet` · `SideSheet` · `Snackbar` · `Tooltip`

### Navigation
`TabView` · `AppBar` · `NavigationBar` · `NavigationDrawer`

### Container
`ExpansionPanel` · `Stepper`

### Action
`Button` · `IconButton` · `FAB` · `Menu` · `Toolbar` · `Carousel`

### Control
`ForEach` · `Component` (nested)

## Expression Namespaces

| Namespace | Source | Example |
|---|---|---|
| `$form.field` | User input data | `$form.firstName` |
| `$instance.field` | Backend persisted data | `$instance.status` |
| `$param.field` | Parent-bound data (nested components) | `$param.cityCode` |
| `$ui.key` | Transient UI state (not submitted) | `$ui.showDialog` |
| `$schema.field.label` | Schema label for current language | `$schema.city.label` |
| `$lov.field` | LOV items array | `$lov.city` |
| `$lov.field.display` | Localized display name for current value | `$lov.city.display` |
| `$lookup.prop.field` | Enrichment data | `$lookup.branch.address` |
| `$item.field` | ForEach iteration item | `$item.name` |
| `$context.lang` | Runtime context | `$context.lang` |

## Conditional Operators

`equals` · `notEquals` · `in` · `notIn` · `greaterThan` · `lessThan` · `greaterThanOrEquals` · `lessThanOrEquals` · `contains` · `startsWith` · `endsWith` · `isEmpty` · `isNotEmpty`

Compound rules: `allOf` (AND), `anyOf` (OR), `not` (negate) — recursive nesting supported.

## Validation Formats

Built-in `format` validators: `email` · `uri` / `url` · `date` · `date-time` · `time` · `phone` / `tel` · `iban`

## Designer Mode

When wiring this SDK into a view.json editor or preview pane, set the
`designer` prop on `PseudoView` so structural placeholders show up even
when no real data is bound:

```vue
<PseudoView :schema="schema" :view="view" :delegate="delegate" :designer="true" />
```

```tsx
<PseudoView schema={schema} view={view} delegate={delegate} designer />
```

```html
<pseudo-view [schema]="schema" [view]="view" [delegate]="delegate" [designer]="true" />
```

What changes when `designer === true`:

- **`ForEach`** with an empty `source` renders its `template` once with
  an empty `$item` — designers see the iteration shape instead of a
  blank region.
- **`x-conditional` visibility** (`showIf` / `hideIf`) is bypassed —
  hidden fields render so editors can see and select them. Enabled
  state is **preserved**, so `disableIf` / `enableIf` still produce
  disabled styling.
- **Validation rules are unaffected.** A submit that triggers
  `validateAllFields` still uses the original visibility rules —
  errors do not surface for fields that the live runtime would hide.

The flag bridges to the engine via `FormContext.designerMode`. Direct
context consumers can also flip it with `createFormContext(schema, lang,
{ designerMode: true })`.

## Builder & Tooling APIs

Two engine-level utilities make it easy to build view.json editors, autocomplete UIs,
or static analyzers without re-implementing the SDK's structural knowledge:

### `componentMeta`

Programmatic catalog of every node type. Use it instead of hard-coding a parallel
list in your tooling — the catalog is sync-tested against `view-vocabulary.json`,
so adding a new component anywhere in the SDK surfaces here automatically.

```typescript
import { componentMeta, getComponentMeta, listComponentTypes } from '@burgan-tech/pseudo-ui'

listComponentTypes()
// → ['Column', 'Row', ..., 'Button', 'TextField', ..., 'ForEach', 'Component']

getComponentMeta('TabView')
// → {
//     type: 'TabView',
//     category: 'container',
//     acceptsChildren: true,
//     childContainerKey: 'tabs',
//     childContainerShape: 'wrapped',   // 'flat' = ComponentNode[], 'wrapped' = TabDefinition[] etc.
//     defaultProps: { tabs: [{ title: 'Tab 1', content: [] }] },
//     description: 'Tabbed container...',
//   }
```

Fields: `type`, `category`, `acceptsChildren`, `childContainerKey`,
`childContainerShape`, `defaultProps`, `bindable`, `description`.

### `enumerateBindPaths`

Walks a `dataSchema` and returns every reachable bind path with its metadata —
useful for autocomplete UIs, bind validators, and documentation generators.

```typescript
import { enumerateBindPaths } from '@burgan-tech/pseudo-ui'

enumerateBindPaths(schema, { prefix: '$form', includeObjects: false, maxDepth: 5 })
// → [
//     { path: '$form.firstName', type: 'string', label: { tr: 'Ad', en: 'First name' }, required: true, depth: 0 },
//     { path: '$form.city',       type: 'string', hasLov: true, depth: 0 },
//     { path: '$form.branchDetail.address', type: 'string', depth: 1 },
//   ]
```

Each entry carries `type`, `format`, `label` (multi-lang), `hasLov`, `hasLookup`,
`required` (top-level only — `allOf` conditional required is intentionally not
resolved here; it needs runtime context), and `depth`.

## Vocabularies

The package includes JSON Schema vocabulary definitions for IDE auto-complete and tooling:

```typescript
// Import as JSON modules
import viewVocab from '@burgan-tech/pseudo-ui/vocabularies/view-vocabulary.json'
import viewModelVocab from '@burgan-tech/pseudo-ui/vocabularies/view-model-vocabulary.json'
```

- **View Vocabulary** — defines all valid component types, properties, and their constraints
- **ViewModel Vocabulary** — defines all `x-*` extensions (`x-labels`, `x-lov`, `x-conditional`, etc.)

## Cross-Platform

This package provides the **TypeScript/Vue** implementation. A **Dart/Flutter** package is planned and will render the same JSON schemas and views using Material 3 widgets. Both will share the same vocabulary definitions, ensuring consistent behavior across platforms.

## License

MIT
