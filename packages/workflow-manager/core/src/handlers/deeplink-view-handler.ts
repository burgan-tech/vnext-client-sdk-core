/**
 * View handler for `deepLink` views — passes the resolved URL to the host's
 * `navigateDeepLink` callback (typically a router).
 */

import { ViewHandlerError } from '../errors.js';
import type {
  NavigateDeepLink,
  VNextView,
  VNextViewType,
  ViewHandler,
  ViewHandlerResult,
} from '../types.js';
import type { ParameterBinder } from '../utils/parameter-binder.js';

export class DeepLinkViewHandler implements ViewHandler {
  readonly viewType: VNextViewType = 'deepLink';

  private readonly navigate: NavigateDeepLink;
  private readonly binder?: ParameterBinder;

  constructor(opts: { navigateDeepLink: NavigateDeepLink; parameterBinder?: ParameterBinder }) {
    this.navigate = opts.navigateDeepLink;
    if (opts.parameterBinder) this.binder = opts.parameterBinder;
  }

  async handle(view: VNextView, context: Record<string, unknown>): Promise<ViewHandlerResult> {
    const rawUrl = pickHref(view);
    if (!rawUrl) {
      return {
        success: false,
        error: new ViewHandlerError({
          message: 'DeepLink view content has no href/url',
          viewType: 'deepLink',
          operation: 'handle',
        }),
      };
    }

    let url = rawUrl;
    if (this.binder) {
      try {
        url = this.binder.bind({ template: rawUrl, context });
      } catch (e) {
        return {
          success: false,
          error: e instanceof Error ? e : new Error(String(e)),
          message: 'parameter binding failed',
        };
      }
    }

    try {
      await this.navigate(url);
      return { success: true };
    } catch (e) {
      return {
        success: false,
        error: e instanceof Error ? e : new Error(String(e)),
      };
    }
  }
}

function pickHref(view: VNextView): string | undefined {
  const content = view.content as Record<string, unknown> | undefined;
  if (!content) return undefined;
  const href = content.href;
  if (typeof href === 'string' && href.length > 0) return href;
  const url = content.url;
  if (typeof url === 'string' && url.length > 0) return url;
  return undefined;
}
