// ─────────────────────────────────────────────────────────────────────────
// Context providers — the boot-time seeders that populate the context-store with
// code-embedded ambient/environment values (clientId, device id, screen size,
// os version …), so schema-driven flows can read them back via `x-context-source`
// without any per-flow client code.
//
// `x-context-source` is a READER contract; it assumes the value already lives in
// the context-store. Providers are the WRITERS that put it there. They run
// EAGERLY at app start, before the `initialization` sequence — which is exactly
// what needs these values.
//
// Platform-agnostic on purpose (no web/mobile APIs, no context-store dependency)
// so the same contract exports to Dart/Swift/Kotlin via parity checks. Deliberately
// an explicit interface + explicit registry list — NO decorators / reflection /
// codegen — because that is the one shape that maps identically across languages
// (annotation *discovery* diverges per platform; an explicit list does not).
// ─────────────────────────────────────────────────────────────────────────

import type { DeviceIdentity } from './identity.js';

/** A context-store boundary (mirrors the context-store enum string values). */
export type ContextBoundary = 'device' | 'user' | 'subject';
/** A context-store storage tier (mirrors the context-store enum string values). */
export type ContextStorage = 'memory' | 'localStorage' | 'secureStorage' | 'secureStorageEncrypted';

/** One context-store location. */
export interface ContextSlot {
  boundary: ContextBoundary;
  key: string;
}

/** A single value a provider writes to the context-store. */
export interface ContextWrite extends ContextSlot {
  value: unknown;
  /** Defaults to the host sink's default tier (typically `memory`). */
  storage?: ContextStorage;
}

/**
 * Ambient inputs a provider may read while computing its writes. Open for growth
 * (index signature) so hosts can pass extra boot facts without changing the SDK.
 * Providers should be INDEPENDENT in v1 (they run concurrently) — read from here,
 * not from each other's writes.
 */
export interface ProviderContext {
  clientId: string;
  appVersion?: string;
  /** The device identity resolved at startup (deviceId/installationId/deviceInfo). */
  deviceIdentity?: DeviceIdentity;
  log?: (level: 'info' | 'warn' | 'error' | 'debug', message: string, extra?: unknown) => void;
  [k: string]: unknown;
}

/**
 * A context provider seeds one or more context-store slots at boot. Platform code
 * (web `navigator`, mobile native APIs) implements `provide`; the SDK only runs
 * the registry.
 */
export interface ContextProvider {
  /** Stable id, used for logging and conflict warnings. */
  id: string;
  /**
   * The slots this provider intends to fill. DECLARATIVE metadata ONLY — it is
   * not enforced. The context-store has other legitimate writers (e.g. a master
   * schema's `x-context-target` applied on instance reads), and writes are
   * last-writer-wins. `provides` exists for documentation, conflict warnings, and
   * a possible future lazy (pull) resolution mode.
   */
  provides?: ContextSlot[];
  /** Boot tolerance: if false (default), a throw aborts boot; if true, it is logged and skipped. */
  optional?: boolean;
  /**
   * Compute the values to seed. Always async (parity: Future / async / suspend) —
   * a synchronous provider simply resolves immediately.
   */
  provide(ctx: ProviderContext): Promise<ContextWrite[]>;
}

/** Applies one resolved write to the host's context-store. Injected so this
 * module stays free of any concrete store/framework dependency. */
export type ContextWriteSink = (write: ContextWrite) => void;

/**
 * Run every provider EAGERLY (v1) and apply the resulting writes via `sink`.
 *
 * - Providers run concurrently. Writes are applied afterwards in registry order,
 *   so a later provider deterministically wins a slot both wrote (last-writer-wins).
 * - A non-optional provider that throws aborts the boot; an optional one is logged
 *   and skipped.
 * - A slot written by two providers is applied (last wins) and warned.
 */
export async function runContextProviders(
  providers: ContextProvider[],
  ctx: ProviderContext,
  sink: ContextWriteSink,
): Promise<void> {
  const resolved = await Promise.all(
    providers.map(async (p) => {
      try {
        return { p, writes: await p.provide(ctx) };
      } catch (e) {
        if (p.optional) {
          ctx.log?.('warn', `[context-provider] "${p.id}" failed (optional) — skipping`, e);
          return { p, writes: [] as ContextWrite[] };
        }
        throw new Error(`[context-provider] "${p.id}" failed: ${(e as Error)?.message ?? String(e)}`);
      }
    }),
  );

  const owner = new Map<string, string>(); // "boundary:key" -> providerId (for conflict warnings)
  for (const { p, writes } of resolved) {
    for (const w of writes) {
      if (w.value === undefined) continue; // nothing to seed
      const slot = `${w.boundary}:${w.key}`;
      const prev = owner.get(slot);
      if (prev && prev !== p.id) {
        ctx.log?.('warn', `[context-provider] slot "${slot}" written by both "${prev}" and "${p.id}" (last wins)`);
      }
      owner.set(slot, p.id);
      sink(w);
    }
  }
}
