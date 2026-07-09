/**
 * View handler registry — picks the right handler from `viewType`.
 * Consumers can register additional handlers via `WorkflowManagerOptions.viewHandlers`.
 */

import type { ViewHandler, VNextView, VNextViewType } from '../types.js';

export class ViewHandlerRegistry {
  private readonly handlers = new Map<VNextViewType, ViewHandler>();

  register(handler: ViewHandler): void {
    this.handlers.set(handler.viewType, handler);
  }

  registerAll(handlers: ViewHandler[]): void {
    for (const h of handlers) this.register(h);
  }

  resolve(view: VNextView): ViewHandler | undefined {
    return this.handlers.get(view.viewType);
  }

  has(viewType: VNextViewType): boolean {
    return this.handlers.has(viewType);
  }
}
