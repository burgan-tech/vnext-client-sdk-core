import { describe, expect, it, expectTypeOf } from 'vitest';
import {
  RouteLifetime,
  ShellMode,
  type HomepageConfig,
  type IPageRouter,
  type NavigateRequest,
  type RouteDefinition,
  type RouteRegistry,
} from '../src/index.js';

describe('public types & enums', () => {
  it('exports ShellMode enum with sdi/mdi values', () => {
    expect(ShellMode.sdi).toBe('sdi');
    expect(ShellMode.mdi).toBe('mdi');
  });

  it('exports RouteLifetime enum with singleton/transient values', () => {
    expect(RouteLifetime.singleton).toBe('singleton');
    expect(RouteLifetime.transient).toBe('transient');
  });

  it('RouteDefinition shape compiles with mandatory and optional fields', () => {
    const def: RouteDefinition = {
      key: 'account-list',
      lifetime: RouteLifetime.singleton,
      singletonKey: ['accountNo'],
      restoreMode: 'refresh',
      presentation: 'surface',
      allowedShellModes: [ShellMode.sdi, ShellMode.mdi],
      shellModeOnConflict: 'autoSwitch',
      config: { resource: 'urn:local:component:demoAccountList' },
      inputs: [{ name: 'accountNo', required: true }],
      defaultTitle: { tr: 'Hesap Listesi', en: 'Account List' },
    };
    expect(def.key).toBe('account-list');
    expect(def.config['resource']).toBe('urn:local:component:demoAccountList');
  });

  it('RouteRegistry accepts optional config block (config-oriented boot)', () => {
    const reg: RouteRegistry = {
      config: {
        shellMode: ShellMode.sdi,
        locale: 'tr',
        fallbackLocale: 'en',
        defaultLifetime: RouteLifetime.singleton,
        defaultShellModeOnConflict: 'cancel',
      },
      routes: [],
    };
    expect(reg.config?.locale).toBe('tr');
  });

  it('NavigateRequest allows routeKey/routeDefinition/extraData combos', () => {
    const a: NavigateRequest = { routeKey: 'x' };
    const b: NavigateRequest = { routeKey: 'x', extraData: { id: 1 } };
    const c: NavigateRequest = {
      routeDefinition: { key: 'y', config: {} },
      source: 'routeDefinition',
    };
    expect([a, b, c]).toHaveLength(3);
  });

  it('HomepageConfig is a routeKey + optional extraData tuple', () => {
    const h: HomepageConfig = { routeKey: 'account-list' };
    const h2: HomepageConfig = {
      routeKey: 'account-detail',
      extraData: { accountNo: '1234' },
    };
    expect(h.routeKey).toBe('account-list');
    expect(h2.extraData?.['accountNo']).toBe('1234');
  });

  it('IPageRouter declares the full public surface', () => {
    expectTypeOf<IPageRouter>().toHaveProperty('navigate');
    expectTypeOf<IPageRouter>().toHaveProperty('setHomepage');
    expectTypeOf<IPageRouter>().toHaveProperty('goHome');
    expectTypeOf<IPageRouter>().toHaveProperty('findTabs');
    expectTypeOf<IPageRouter>().toHaveProperty('findOverlays');
    expectTypeOf<IPageRouter>().toHaveProperty('onHomepageChanged');
  });
});
