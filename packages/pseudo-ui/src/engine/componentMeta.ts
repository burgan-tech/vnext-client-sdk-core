export type ComponentCategory =
  | 'layout'
  | 'container'
  | 'input'
  | 'display'
  | 'action'
  | 'navigation'
  | 'controlFlow'

export interface ComponentMeta {
  type: string
  category: ComponentCategory
  acceptsChildren: boolean
  childContainerKey?: string
  childContainerShape?: 'flat' | 'wrapped'
  defaultProps?: Record<string, unknown>
  bindable?: boolean
  description?: string

  /** Action capabilities — used by view designers to gate the action picker. */
  actionCapability?: {
    /** Which prop on the node carries the action (`'action'`, `'onTap'`, ...). */
    field: string
    /**
     * SDK-reserved action verbs allowed on this node. Empty/omitted = none.
     * Builders should always also offer host-domain dispatches if
     * `acceptsDispatch` is true.
     */
    reservedActions?: ('submit' | 'select' | 'reset')[]
    /** Can this node carry an opaque domain dispatch (e.g. URN command)? */
    acceptsDispatch?: boolean
    /**
     * Does it make sense to expose the `validate` flag on the descriptor
     * for this node? Builders show a "Validate form before dispatch"
     * checkbox when true. Usually true for primary action buttons,
     * false for navigation tiles where pre-validation is rarely desired.
     */
    acceptsValidateFlag?: boolean
    /** Field name the SDK preferred to read (when multiple aliases exist). */
    preferredField?: string
    /** Alternate field names accepted for backward compatibility. */
    aliasFields?: string[]
  }

  /**
   * Action capability for **per-item action** containers (NavigationDrawer
   * items, Menu items, etc.). Item-level actions live inside arrays
   * (`items[].action`) and are wired separately from the node's own action.
   */
  itemActionCapability?: {
    /** Path on the parent node that contains the items array. */
    itemsField: string
    /** Action field on each item (always 'action' in current vocabulary). */
    field: string
    reservedActions?: ('submit' | 'select' | 'reset')[]
    acceptsDispatch?: boolean
    acceptsValidateFlag?: boolean
  }
}

const layoutChildren = (defaults: Record<string, unknown> = {}): Pick<ComponentMeta, 'acceptsChildren' | 'childContainerKey' | 'childContainerShape' | 'defaultProps'> => ({
  acceptsChildren: true,
  childContainerKey: 'children',
  childContainerShape: 'flat',
  defaultProps: { children: [], ...defaults },
})

export const componentMeta: Record<string, ComponentMeta> = {
  // ---- LAYOUT ----
  Column: { type: 'Column', category: 'layout', ...layoutChildren({ spacing: 'md' }), description: 'Vertical stack of components.' },
  Row: { type: 'Row', category: 'layout', ...layoutChildren({ spacing: 'md' }), description: 'Horizontal stack of components.' },
  Wrap: { type: 'Wrap', category: 'layout', ...layoutChildren({ spacing: 'md' }), description: 'Components that wrap to new line when overflowing.' },
  Stack: { type: 'Stack', category: 'layout', ...layoutChildren(), description: 'Overlapping z-axis stack of components.' },
  Grid: { type: 'Grid', category: 'layout', ...layoutChildren({ columns: 2, spacing: 'md' }), description: 'Grid layout with fixed column count.' },
  Expanded: { type: 'Expanded', category: 'layout', ...layoutChildren({ flex: 1 }), description: 'Fills available space inside Row/Column.' },
  Center: { type: 'Center', category: 'layout', ...layoutChildren(), description: 'Centers children both axes.' },
  ScrollView: { type: 'ScrollView', category: 'layout', ...layoutChildren(), description: 'Scrollable container for overflowing content.' },
  Spacer: { type: 'Spacer', category: 'layout', acceptsChildren: false, defaultProps: { size: 'md' }, description: 'Empty space between siblings.' },

  // ---- CONTAINER / SURFACE ----
  Card: {
    type: 'Card', category: 'container', ...layoutChildren({ variant: 'elevated' }),
    description: 'Surface container with elevation/border.',
    actionCapability: {
      field: 'action',
      preferredField: 'action',
      aliasFields: ['onTap'],
      reservedActions: ['select'],
      acceptsDispatch: true,
      acceptsValidateFlag: false,
    },
  },
  Divider: { type: 'Divider', category: 'container', acceptsChildren: false, description: 'Horizontal or vertical separator line.' },
  ExpansionPanel: {
    type: 'ExpansionPanel',
    category: 'container',
    acceptsChildren: true,
    childContainerKey: 'children',
    childContainerShape: 'flat',
    defaultProps: { title: 'Panel', children: [] },
    description: 'Collapsible panel with header + body.',
  },
  Stepper: {
    type: 'Stepper',
    category: 'container',
    acceptsChildren: true,
    childContainerKey: 'steps',
    childContainerShape: 'wrapped',
    defaultProps: { steps: [{ title: 'Step 1', content: [] }] },
    description: 'Multi-step linear flow. Each step wraps its own content array.',
  },
  TabView: {
    type: 'TabView',
    category: 'container',
    acceptsChildren: true,
    childContainerKey: 'tabs',
    childContainerShape: 'wrapped',
    defaultProps: { tabs: [{ title: 'Tab 1', content: [] }] },
    description: 'Tabbed container. Each tab wraps its own content array.',
  },
  Dialog: {
    type: 'Dialog',
    category: 'container',
    acceptsChildren: true,
    childContainerKey: 'children',
    childContainerShape: 'flat',
    defaultProps: { title: 'Dialog', visible: '$ui.dialogOpen', children: [] },
    description: 'Modal dialog overlay. Visibility bound to $ui state.',
  },
  BottomSheet: {
    type: 'BottomSheet',
    category: 'container',
    acceptsChildren: true,
    childContainerKey: 'children',
    childContainerShape: 'flat',
    defaultProps: { visible: '$ui.bottomSheetOpen', children: [] },
    description: 'Sheet sliding up from bottom edge.',
  },
  SideSheet: {
    type: 'SideSheet',
    category: 'container',
    acceptsChildren: true,
    childContainerKey: 'children',
    childContainerShape: 'flat',
    defaultProps: { visible: '$ui.sideSheetOpen', children: [] },
    description: 'Sheet sliding in from side edge.',
  },
  Tooltip: {
    type: 'Tooltip',
    category: 'container',
    acceptsChildren: true,
    childContainerKey: 'children',
    childContainerShape: 'flat',
    defaultProps: { content: 'Tooltip text', position: 'top', children: [] },
    description: 'Wraps a child and shows a tooltip on hover.',
  },

  // ---- INPUT ----
  TextField: { type: 'TextField', category: 'input', acceptsChildren: false, bindable: true, defaultProps: { bind: '', variant: 'outlined' }, description: 'Single-line text input.' },
  TextArea: { type: 'TextArea', category: 'input', acceptsChildren: false, bindable: true, defaultProps: { bind: '', rows: 3, variant: 'outlined' }, description: 'Multi-line text input.' },
  NumberField: { type: 'NumberField', category: 'input', acceptsChildren: false, bindable: true, defaultProps: { bind: '', variant: 'outlined' }, description: 'Numeric input.' },
  Dropdown: { type: 'Dropdown', category: 'input', acceptsChildren: false, bindable: true, defaultProps: { bind: '', variant: 'outlined' }, description: 'Single-select dropdown. LOV resolved from schema x-lov.' },
  Checkbox: { type: 'Checkbox', category: 'input', acceptsChildren: false, bindable: true, defaultProps: { bind: '' }, description: 'Boolean checkbox.' },
  Switch: { type: 'Switch', category: 'input', acceptsChildren: false, bindable: true, defaultProps: { bind: '' }, description: 'Boolean toggle switch.' },
  RadioGroup: { type: 'RadioGroup', category: 'input', acceptsChildren: false, bindable: true, defaultProps: { bind: '' }, description: 'Single-select radio group. Options from schema enum or x-lov.' },
  DatePicker: { type: 'DatePicker', category: 'input', acceptsChildren: false, bindable: true, defaultProps: { bind: '', variant: 'outlined' }, description: 'Calendar date picker.' },
  TimePicker: { type: 'TimePicker', category: 'input', acceptsChildren: false, bindable: true, defaultProps: { bind: '', variant: 'outlined' }, description: 'Time-of-day picker.' },
  Slider: { type: 'Slider', category: 'input', acceptsChildren: false, bindable: true, defaultProps: { bind: '', min: 0, max: 100 }, description: 'Continuous numeric slider.' },
  SegmentedButton: { type: 'SegmentedButton', category: 'input', acceptsChildren: false, bindable: true, defaultProps: { bind: '' }, description: 'Inline segmented choice control.' },
  SearchField: { type: 'SearchField', category: 'input', acceptsChildren: false, bindable: true, defaultProps: { bind: '', variant: 'outlined' }, description: 'Search input with clear button.' },
  AutoComplete: { type: 'AutoComplete', category: 'input', acceptsChildren: false, bindable: true, defaultProps: { bind: '', minLength: 1 }, description: 'Type-ahead input over LOV data.' },
  ArrayField: { type: 'ArrayField', category: 'input', acceptsChildren: false, bindable: true, defaultProps: { bind: '', variant: 'outlined' }, description: 'Dynamic array editor. Auto-expands a type:"array" schema property into a repeatable list UI.' },

  // ---- DISPLAY ----
  Text: { type: 'Text', category: 'display', acceptsChildren: false, defaultProps: { content: 'Text', variant: 'bodyMedium' }, description: 'Static or expression-driven text.' },
  Icon: { type: 'Icon', category: 'display', acceptsChildren: false, defaultProps: { name: 'star', size: 'md' }, description: 'Material Design icon by name.' },
  Image: { type: 'Image', category: 'display', acceptsChildren: false, defaultProps: { source: '' }, description: 'Image by URL or expression.' },
  Chip: { type: 'Chip', category: 'display', acceptsChildren: false, defaultProps: { label: 'Chip', variant: 'assist' }, description: 'Compact label/tag chip.' },
  Badge: { type: 'Badge', category: 'display', acceptsChildren: false, defaultProps: { value: '0' }, description: 'Small count or status indicator.' },
  Avatar: { type: 'Avatar', category: 'display', acceptsChildren: false, defaultProps: { shape: 'circle' }, description: 'Profile or entity avatar.' },
  ProgressIndicator: { type: 'ProgressIndicator', category: 'display', acceptsChildren: false, defaultProps: { variant: 'linear' }, description: 'Linear or circular progress bar.' },
  LoadingIndicator: { type: 'LoadingIndicator', category: 'display', acceptsChildren: false, description: 'Indeterminate loading spinner.' },
  Timer: { type: 'Timer', category: 'display', acceptsChildren: false, defaultProps: { duration: 60, format: 'mm:ss', variant: 'chip' }, description: 'Countdown timer; emits timer:expire on reaching zero.' },
  ListTile: {
    type: 'ListTile', category: 'display', acceptsChildren: false, defaultProps: { title: 'Item' },
    description: 'Single-row list item with leading/trailing slots.',
    actionCapability: { field: 'onTap', reservedActions: ['select'], acceptsDispatch: true, acceptsValidateFlag: false },
  },
  RichText: { type: 'RichText', category: 'display', acceptsChildren: false, defaultProps: { spans: [] }, description: 'Text with mixed inline styling.' },
  Snackbar: {
    type: 'Snackbar', category: 'display', acceptsChildren: false, defaultProps: { content: 'Message', variant: 'standard' },
    description: 'Transient inline message strip.',
    actionCapability: { field: 'action', reservedActions: [], acceptsDispatch: true, acceptsValidateFlag: false },
  },

  // ---- ACTION ----
  Button: {
    type: 'Button', category: 'action', acceptsChildren: false,
    defaultProps: { label: 'Button', variant: 'filled', action: 'submit' },
    description: 'Primary user action trigger.',
    actionCapability: { field: 'action', reservedActions: ['submit', 'reset'], acceptsDispatch: true, acceptsValidateFlag: true },
  },
  IconButton: {
    type: 'IconButton', category: 'action', acceptsChildren: false,
    defaultProps: { icon: 'star', action: 'submit' },
    description: 'Icon-only action button.',
    actionCapability: { field: 'action', reservedActions: ['submit', 'reset'], acceptsDispatch: true, acceptsValidateFlag: true },
  },
  FAB: {
    type: 'FAB', category: 'action', acceptsChildren: false,
    defaultProps: { icon: 'plus', action: 'submit' },
    description: 'Floating action button (primary screen action).',
    actionCapability: { field: 'action', reservedActions: ['submit'], acceptsDispatch: true, acceptsValidateFlag: true },
  },

  // ---- NAVIGATION ----
  AppBar: {
    type: 'AppBar',
    category: 'navigation',
    acceptsChildren: true,
    childContainerKey: 'actions',
    childContainerShape: 'wrapped',
    defaultProps: { title: 'Title', actions: [] },
    description: 'Top app bar. Actions are a wrapped ComponentNode array.',
  },
  NavigationBar: {
    type: 'NavigationBar',
    category: 'navigation',
    acceptsChildren: true,
    childContainerKey: 'destinations',
    childContainerShape: 'wrapped',
    bindable: true,
    defaultProps: { bind: '', destinations: [] },
    description: 'Bottom navigation bar. Destinations are wrapped items with label/icon/value.',
  },
  NavigationDrawer: {
    type: 'NavigationDrawer',
    category: 'navigation',
    acceptsChildren: true,
    childContainerKey: 'items',
    childContainerShape: 'wrapped',
    defaultProps: { visible: '$ui.drawerOpen', items: [] },
    description: 'Slide-in navigation drawer with item list.',
    itemActionCapability: {
      itemsField: 'items',
      field: 'action',
      reservedActions: ['select'],
      acceptsDispatch: true,
      acceptsValidateFlag: false,
    },
  },
  Menu: {
    type: 'Menu',
    category: 'navigation',
    acceptsChildren: true,
    childContainerKey: 'items',
    childContainerShape: 'wrapped',
    defaultProps: { items: [] },
    description: 'Popup menu attached to an anchor.',
    itemActionCapability: {
      itemsField: 'items',
      field: 'action',
      reservedActions: ['select'],
      acceptsDispatch: true,
      acceptsValidateFlag: false,
    },
  },
  Toolbar: {
    type: 'Toolbar',
    category: 'navigation',
    acceptsChildren: true,
    childContainerKey: 'children',
    childContainerShape: 'flat',
    defaultProps: { children: [] },
    description: 'Inline toolbar row for grouped controls.',
  },

  // ---- CONTROL FLOW ----
  ForEach: {
    type: 'ForEach',
    category: 'controlFlow',
    acceptsChildren: true,
    childContainerKey: 'template',
    childContainerShape: 'wrapped',
    defaultProps: { source: '', as: 'item', template: { type: 'Text', content: '$item' } },
    description: 'Iterates over an array expression and renders template per item.',
  },
  Carousel: {
    type: 'Carousel',
    category: 'controlFlow',
    acceptsChildren: true,
    childContainerKey: 'template',
    childContainerShape: 'wrapped',
    defaultProps: { source: '', template: { type: 'Card', children: [] }, showIndicators: true },
    description: 'Swipeable carousel iterating a source expression.',
  },
  Component: {
    type: 'Component',
    category: 'controlFlow',
    acceptsChildren: false,
    defaultProps: { ref: '' },
    description: 'Embeds another view by ref (URN/URL). Inherits or rebinds data via bind prop.',
  },
}

export function getComponentMeta(type: string): ComponentMeta | undefined {
  return componentMeta[type]
}

export function listComponentTypes(): string[] {
  return Object.keys(componentMeta)
}
