import type { OnLog } from '../types.js';

/**
 * SDK-internal log adapter. `OnLog` host delegate'inin etrafına ince bir
 * sarmalayıcıdır:
 *
 * - `onLog` undefined ise tüm çağrılar no-op.
 * - `with(extra)` mevcut base context'e ek alanlar yazıp yeni `Logger` döner;
 *   chain edilebilir. Per-call `context` argümanı varsa base'in üzerine yazılır
 *   (per-call wins on key collision).
 * - Host delegate'i exception fırlatırsa SDK akışı bozulmaz; `console.error` ile
 *   "page-router: onLog handler threw" diye loglanır.
 */
export interface Logger {
  debug(message: string, error?: unknown, context?: Record<string, unknown>): void;
  info(message: string, error?: unknown, context?: Record<string, unknown>): void;
  warn(message: string, error?: unknown, context?: Record<string, unknown>): void;
  error(message: string, error?: unknown, context?: Record<string, unknown>): void;
  with(extra: Record<string, unknown>): Logger;
}

const NOOP_LOGGER: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  with: () => NOOP_LOGGER,
};

export function createLogger(
  onLog: OnLog | undefined,
  baseContext?: Record<string, unknown>,
): Logger {
  if (!onLog) {
    return NOOP_LOGGER;
  }
  return buildLogger(onLog, baseContext);
}

function buildLogger(
  onLog: OnLog,
  baseContext: Record<string, unknown> | undefined,
): Logger {
  const emit = (
    level: 'debug' | 'info' | 'warn' | 'error',
    message: string,
    error?: unknown,
    context?: Record<string, unknown>,
  ): void => {
    const merged = mergeContext(baseContext, context);
    try {
      onLog(level, message, error, merged);
    } catch (handlerError) {
      // Host delegate threw — never propagate; surface a single console.error so
      // misbehaving log delegates remain debuggable without crashing the SDK.
      console.error('page-router: onLog handler threw', handlerError);
    }
  };

  return {
    debug: (message, error, context) => emit('debug', message, error, context),
    info: (message, error, context) => emit('info', message, error, context),
    warn: (message, error, context) => emit('warn', message, error, context),
    error: (message, error, context) => emit('error', message, error, context),
    with: (extra) => buildLogger(onLog, mergeContext(baseContext, extra) ?? {}),
  };
}

function mergeContext(
  base: Record<string, unknown> | undefined,
  extra: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!base && !extra) return undefined;
  if (!base) return extra;
  if (!extra) return base;
  return { ...base, ...extra };
}
