import { PageRouter } from './page-router.js';
import type { IPageRouter, PageRouterOptions } from './types.js';

/**
 * Top-level entry point. Equivalent to {@link PageRouter.create}; exported as
 * a named function for ergonomics:
 *
 * ```ts
 * import { createPageRouter } from 'page-router';
 * const router = await createPageRouter({ ... });
 * ```
 */
export function createPageRouter(options: PageRouterOptions): Promise<IPageRouter> {
  return PageRouter.create(options);
}
