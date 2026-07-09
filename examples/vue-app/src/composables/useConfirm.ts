// Tiny promise-based confirm service backed by a module-level reactive state.
// A single <ConfirmDialog> (mounted in AppShell) renders `state`; callers await
// `confirm(opts)` which resolves true/false.
import { reactive, readonly } from 'vue';

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

interface ConfirmState extends ConfirmOptions {
  open: boolean;
}

const state = reactive<ConfirmState>({
  open: false,
  title: '',
  message: '',
});

let resolver: ((ok: boolean) => void) | null = null;

export function confirm(opts: ConfirmOptions): Promise<boolean> {
  Object.assign(state, opts, { open: true });
  return new Promise<boolean>((resolve) => {
    resolver = resolve;
  });
}

export function resolveConfirm(ok: boolean): void {
  state.open = false;
  resolver?.(ok);
  resolver = null;
}

export function useConfirmState() {
  return readonly(state);
}
