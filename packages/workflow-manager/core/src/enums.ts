/**
 * Small runtime helpers that map between backend wire formats and the SDK's
 * canonical enum literals. Keeping these in a single module ensures the
 * conversion happens at exactly one boundary (response parsing).
 */

import type {
  NeoNavigationType,
  VNextInstanceStatus,
  VNextStateSubType,
  VNextStateType,
  VNextViewDisplayMode,
  VNextViewType,
} from './types.js';

// ----------------------------------------------------------------------------
// instance status
// ----------------------------------------------------------------------------

/**
 * Convert a backend wire-format instance status to the canonical enum literal.
 *
 * Accepts either single-letter codes (`'A'`/`'B'`/`'P'`/`'C'`/`'F'`) or full
 * names (`'Active'`/`'Busy'`/`'Passive'`/`'Completed'`/`'Faulted'`) in any
 * casing. Returns `'faulted'` (with `onUnknown` callback) for unknown values
 * to keep the SDK silent.
 */
export function instanceStatusFromWire(
  wire: string | undefined | null,
  onUnknown?: (raw: string) => void,
): VNextInstanceStatus {
  if (!wire) {
    onUnknown?.(String(wire));
    return 'faulted';
  }

  const normalized = wire.trim().toLowerCase();
  switch (normalized) {
    case 'a':
    case 'active':
      return 'active';
    case 'b':
    case 'busy':
      return 'busy';
    case 'p':
    case 'passive':
      return 'passive';
    case 'c':
    case 'completed':
      return 'completed';
    case 'f':
    case 'faulted':
      return 'faulted';
    default:
      onUnknown?.(wire);
      return 'faulted';
  }
}

// ----------------------------------------------------------------------------
// state type / sub type
// ----------------------------------------------------------------------------

const STATE_TYPES: ReadonlySet<VNextStateType> = new Set([
  'initial',
  'intermediate',
  'finish',
  'subFlow',
  'wizard',
]);

export function stateTypeFromWire(
  wire: string | undefined | null,
  onUnknown?: (raw: string) => void,
): VNextStateType | undefined {
  if (!wire) return undefined;
  const v = wire as VNextStateType;
  if (STATE_TYPES.has(v)) return v;

  // Definition format uses numeric codes 1=Initial, 2=Intermediate, 3=Finish,
  // 4=SubFlow, 5=Wizard.
  switch (wire) {
    case '1':
      return 'initial';
    case '2':
      return 'intermediate';
    case '3':
      return 'finish';
    case '4':
      return 'subFlow';
    case '5':
      return 'wizard';
    default:
      onUnknown?.(wire);
      return undefined;
  }
}

const STATE_SUB_TYPES: ReadonlySet<VNextStateSubType> = new Set([
  'none',
  'success',
  'error',
  'terminated',
  'suspended',
  'busy',
  'human',
  'cancelled',
  'timeout',
]);

export function stateSubTypeFromWire(
  wire: string | undefined | null,
  onUnknown?: (raw: string) => void,
): VNextStateSubType | undefined {
  if (!wire) return undefined;
  const v = wire as VNextStateSubType;
  if (STATE_SUB_TYPES.has(v)) return v;
  onUnknown?.(wire);
  return undefined;
}

// ----------------------------------------------------------------------------
// view type
// ----------------------------------------------------------------------------

const VIEW_TYPE_MAP: Readonly<Record<string, VNextViewType>> = {
  json: 'json',
  html: 'html',
  markdown: 'markdown',
  http: 'http',
  deeplink: 'deepLink',
  urn: 'urn',
};

export function viewTypeFromWire(
  wire: string | undefined | null,
  onUnknown?: (raw: string) => void,
): VNextViewType {
  if (!wire) {
    onUnknown?.(String(wire));
    return 'json';
  }
  const key = wire.trim().toLowerCase();
  const mapped = VIEW_TYPE_MAP[key];
  if (mapped) return mapped;
  onUnknown?.(wire);
  return 'json';
}

// ----------------------------------------------------------------------------
// view display mode
// ----------------------------------------------------------------------------

const DISPLAY_MODES: ReadonlySet<VNextViewDisplayMode> = new Set([
  'full-page',
  'popup',
  'bottom-sheet',
  'top-sheet',
  'drawer',
  'inline',
]);

export function displayModeFromWire(
  wire: string | undefined | null,
  onUnknown?: (raw: string) => void,
): VNextViewDisplayMode {
  if (!wire) return 'full-page';
  const normalized = wire.trim().toLowerCase() as VNextViewDisplayMode;
  if (DISPLAY_MODES.has(normalized)) return normalized;
  onUnknown?.(wire);
  return 'full-page';
}

// ----------------------------------------------------------------------------
// display mode → navigation type
// ----------------------------------------------------------------------------

/**
 * Map a backend `VNextViewDisplayMode` to the SDK's `NeoNavigationType` hint.
 * The host can still inspect the original `displayMode` carried on
 * `NavigationRequest` to pick a finer container (e.g. side-panel for
 * `drawer`).
 */
export function displayModeToNavigationType(mode: VNextViewDisplayMode): NeoNavigationType {
  switch (mode) {
    case 'full-page':
      return 'pushReplacement';
    case 'popup':
      return 'popup';
    case 'bottom-sheet':
      return 'bottomSheet';
    case 'top-sheet':
    case 'drawer':
      return 'popup';
    case 'inline':
      return 'push';
    default:
      return 'push';
  }
}
