import { describe, expect, it, vi } from 'vitest';
import {
  buildNavigationItem,
  resolveRoutePayload,
} from '../src/internal/route-resolver.js';
import { createLogger } from '../src/internal/logger.js';
import {
  RouteLifetime,
  type OnLog,
  type RouteDefinition,
  type RouteInput,
} from '../src/index.js';

describe('resolveRoutePayload — input merge', () => {
  it('returns empty payload + resolvedData when there are no inputs', () => {
    const r = resolveRoutePayload(undefined, undefined, { routeKey: 'r' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.payload).toEqual({});
      expect(r.resolvedData).toEqual([]);
    }
  });

  it('records origin = extraData when caller supplies the value', () => {
    const inputs: RouteInput[] = [{ name: 'accountNo', required: true }];
    const r = resolveRoutePayload(
      inputs,
      { accountNo: '1234' },
      { routeKey: 'account-detail' },
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.payload).toEqual({ accountNo: '1234' });
      expect(r.resolvedData).toEqual([
        { name: 'accountNo', value: '1234', origin: 'extraData' },
      ]);
    }
  });

  it('falls back to RouteInput.default when extraData omits the field', () => {
    const inputs: RouteInput[] = [
      { name: 'period', default: 'last-30-days' },
    ];
    const r = resolveRoutePayload(inputs, undefined, { routeKey: 'r' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.payload).toEqual({ period: 'last-30-days' });
      expect(r.resolvedData[0]).toEqual({
        name: 'period',
        value: 'last-30-days',
        origin: 'default',
      });
    }
  });

  it('cancels with missing-required-input when a required field has no extraData and no default', () => {
    const onLog = vi.fn<OnLog>();
    const inputs: RouteInput[] = [
      { name: 'accountNo', required: true },
      { name: 'period', default: 'last-30-days' },
    ];
    const r = resolveRoutePayload(inputs, undefined, {
      routeKey: 'account-transactions',
      logger: createLogger(onLog),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe('missing-required-input');
      expect(r.missing).toEqual(['accountNo']);
    }
    expect(onLog).toHaveBeenCalledWith(
      'warn',
      expect.stringContaining('missing-required-input'),
      undefined,
      expect.objectContaining({
        routeKey: 'account-transactions',
        missing: ['accountNo'],
      }),
    );
  });

  it('collects all required misses into a single cancellation', () => {
    const inputs: RouteInput[] = [
      { name: 'a', required: true },
      { name: 'b', required: true },
      { name: 'c' },
    ];
    const r = resolveRoutePayload(inputs, {}, { routeKey: 'r' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.missing).toEqual(['a', 'b']);
  });

  it('marks optional+missing as origin: "missing" with debug log, payload[name] = undefined', () => {
    const onLog = vi.fn<OnLog>();
    const inputs: RouteInput[] = [{ name: 'optional' }];
    const r = resolveRoutePayload(inputs, undefined, {
      routeKey: 'r',
      logger: createLogger(onLog),
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(Object.prototype.hasOwnProperty.call(r.payload, 'optional')).toBe(true);
      expect(r.payload['optional']).toBeUndefined();
      expect(r.resolvedData[0]).toEqual({
        name: 'optional',
        value: undefined,
        origin: 'missing',
      });
    }
    expect(onLog).toHaveBeenCalledWith(
      'debug',
      expect.stringContaining('input-missing'),
      undefined,
      expect.objectContaining({ routeKey: 'r', name: 'optional' }),
    );
  });

  it('passes undeclared extraData keys through (debug log)', () => {
    const onLog = vi.fn<OnLog>();
    const inputs: RouteInput[] = [{ name: 'declared' }];
    const r = resolveRoutePayload(
      inputs,
      { declared: 'A', extraField: 'B' },
      { routeKey: 'r', logger: createLogger(onLog) },
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.payload).toEqual({ declared: 'A', extraField: 'B' });
    }
    expect(onLog).toHaveBeenCalledWith(
      'debug',
      expect.stringContaining('undeclared-input'),
      undefined,
      expect.objectContaining({ routeKey: 'r', name: 'extraField' }),
    );
  });

  it('does not mutate the caller-provided extraData object', () => {
    const inputs: RouteInput[] = [{ name: 'a' }];
    const extra = { a: 1, b: 2 };
    resolveRoutePayload(inputs, extra, { routeKey: 'r' });
    expect(extra).toEqual({ a: 1, b: 2 });
  });

  it('extraData explicit undefined still triggers default fallback', () => {
    const inputs: RouteInput[] = [{ name: 'period', default: 'last-30-days' }];
    const r = resolveRoutePayload(inputs, { period: undefined }, { routeKey: 'r' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.payload['period']).toBe('last-30-days');
  });
});

describe('buildNavigationItem', () => {
  const baseRoute: RouteDefinition = {
    key: 'account-detail',
    config: { resource: 'urn:amorphie:res:view:account-detail-view' },
    inputs: [{ name: 'accountNo', required: true }],
    defaultTitle: { tr: 'Hesap {{accountNo}}', en: 'Account {{accountNo}}' },
    defaultSubtitle: 'Detay',
  };

  it('produces a NavigationItem with locale-resolved + interpolated title/subtitle', () => {
    const item = buildNavigationItem({
      route: baseRoute,
      payload: { accountNo: '1234' },
      resolvedData: [{ name: 'accountNo', value: '1234', origin: 'extraData' }],
      locale: 'tr',
      defaultLifetime: RouteLifetime.singleton,
    });
    expect(item.key).toBe('account-detail');
    expect(item.title).toBe('Hesap 1234');
    expect(item.subtitle).toBe('Detay');
    expect(item.locale).toBe('tr');
    expect(item.lifetime).toBe(RouteLifetime.singleton);
    expect(item.config).toBe(baseRoute.config);
  });

  it('uses fallbackLocale when active locale is not in the map', () => {
    const item = buildNavigationItem({
      route: baseRoute,
      payload: { accountNo: '1234' },
      resolvedData: [],
      locale: 'de',
      fallbackLocale: 'en',
      defaultLifetime: RouteLifetime.singleton,
    });
    expect(item.title).toBe('Account 1234');
  });

  it('inherits defaultLifetime when route does not declare lifetime', () => {
    const item = buildNavigationItem({
      route: { key: 'r', config: {} },
      payload: {},
      resolvedData: [],
      locale: 'tr',
      defaultLifetime: RouteLifetime.transient,
    });
    expect(item.lifetime).toBe(RouteLifetime.transient);
  });

  it("respects route's explicit lifetime over defaultLifetime", () => {
    const item = buildNavigationItem({
      route: {
        key: 'r',
        lifetime: RouteLifetime.transient,
        config: {},
      },
      payload: {},
      resolvedData: [],
      locale: 'tr',
      defaultLifetime: RouteLifetime.singleton,
    });
    expect(item.lifetime).toBe(RouteLifetime.transient);
  });

  it('omits title/subtitle when route does not provide defaults', () => {
    const item = buildNavigationItem({
      route: { key: 'r', config: {} },
      payload: {},
      resolvedData: [],
      locale: 'tr',
      defaultLifetime: RouteLifetime.singleton,
    });
    expect(item.title).toBeUndefined();
    expect(item.subtitle).toBeUndefined();
  });

  it('passes route.config by reference (opaque)', () => {
    const cfg = { resource: 'x', custom: { a: 1 } };
    const item = buildNavigationItem({
      route: { key: 'r', config: cfg },
      payload: {},
      resolvedData: [],
      locale: 'tr',
      defaultLifetime: RouteLifetime.singleton,
    });
    expect(item.config).toBe(cfg);
  });

  it('snapshots resolvedData as a new array (does not alias the input)', () => {
    const resolvedData: Array<{
      name: string;
      value: unknown;
      origin: 'extraData' | 'default' | 'missing';
    }> = [{ name: 'accountNo', value: '1', origin: 'extraData' }];
    const item = buildNavigationItem({
      route: baseRoute,
      payload: { accountNo: '1' },
      resolvedData,
      locale: 'tr',
      defaultLifetime: RouteLifetime.singleton,
    });
    expect(item.resolvedData).toEqual(resolvedData);
    expect(item.resolvedData).not.toBe(resolvedData);
  });
});
