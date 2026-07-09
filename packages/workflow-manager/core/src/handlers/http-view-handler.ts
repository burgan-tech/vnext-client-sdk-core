/**
 * View handler that opens external URLs.
 *
 * Expects `view.content.url` (or legacy `href`) to be an absolute URL string.
 * `${param}` placeholders are bound through the supplied `ParameterBinder`.
 */

import { ViewHandlerError } from '../errors.js';
import type {
  LaunchUrl,
  VNextView,
  VNextViewType,
  ViewHandler,
  ViewHandlerResult,
} from '../types.js';
import type { ParameterBinder } from '../utils/parameter-binder.js';

export class HttpViewHandler implements ViewHandler {
  readonly viewType: VNextViewType = 'http';

  private readonly launchUrl: LaunchUrl;
  private readonly binder?: ParameterBinder;

  constructor(opts: { launchUrl: LaunchUrl; parameterBinder?: ParameterBinder }) {
    this.launchUrl = opts.launchUrl;
    if (opts.parameterBinder) this.binder = opts.parameterBinder;
  }

  async handle(view: VNextView, context: Record<string, unknown>): Promise<ViewHandlerResult> {
    const rawUrl = pickUrl(view);
    if (!rawUrl) {
      return {
        success: false,
        error: new ViewHandlerError({
          message: 'Http view content has no url/href',
          viewType: 'http',
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
      const opened = await this.launchUrl(url);
      return { success: opened };
    } catch (e) {
      return {
        success: false,
        error: e instanceof Error ? e : new Error(String(e)),
      };
    }
  }
}

function pickUrl(view: VNextView): string | undefined {
  const content = view.content as Record<string, unknown> | undefined;
  if (!content) return undefined;
  const fromUrl = content.url;
  if (typeof fromUrl === 'string' && fromUrl.length > 0) return fromUrl;
  const fromHref = content.href;
  if (typeof fromHref === 'string' && fromHref.length > 0) return fromHref;
  return undefined;
}
