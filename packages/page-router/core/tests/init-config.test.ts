import { describe, expect, it } from 'vitest';
import { mergeInitConfig } from '../src/internal/init-config.js';
import { RouteLifetime, ShellMode } from '../src/index.js';

describe('mergeInitConfig — precedence: code > JSON > SDK defaults', () => {
  it('returns code-only init when JSON config is absent', () => {
    const r = mergeInitConfig(
      { shellMode: ShellMode.sdi, locale: 'tr', fallbackLocale: 'en' },
      undefined,
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.config).toEqual({
        shellMode: ShellMode.sdi,
        locale: 'tr',
        fallbackLocale: 'en',
        defaultLifetime: RouteLifetime.singleton,
        defaultShellModeOnConflict: 'cancel',
      });
    }
  });

  it('returns JSON-only init when code provides no overlap', () => {
    const r = mergeInitConfig(
      {},
      {
        shellMode: ShellMode.mdi,
        locale: 'en',
        fallbackLocale: 'tr',
        defaultLifetime: RouteLifetime.transient,
        defaultShellModeOnConflict: 'autoSwitch',
      },
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.config).toEqual({
        shellMode: ShellMode.mdi,
        locale: 'en',
        fallbackLocale: 'tr',
        defaultLifetime: RouteLifetime.transient,
        defaultShellModeOnConflict: 'autoSwitch',
      });
    }
  });

  it('code wins on overlap (every field independently)', () => {
    const r = mergeInitConfig(
      {
        shellMode: ShellMode.sdi,
        locale: 'tr',
        defaultShellModeOnConflict: 'cancel',
      },
      {
        shellMode: ShellMode.mdi,
        locale: 'en',
        fallbackLocale: 'en',
        defaultLifetime: RouteLifetime.transient,
        defaultShellModeOnConflict: 'autoSwitch',
      },
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.config.shellMode).toBe(ShellMode.sdi);
      expect(r.config.locale).toBe('tr');
      expect(r.config.fallbackLocale).toBe('en');
      expect(r.config.defaultLifetime).toBe(RouteLifetime.transient);
      expect(r.config.defaultShellModeOnConflict).toBe('cancel');
    }
  });

  it('falls back to SDK defaults (singleton + cancel) when neither side provides them', () => {
    const r = mergeInitConfig({ shellMode: ShellMode.sdi, locale: 'tr' }, {});
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.config.defaultLifetime).toBe(RouteLifetime.singleton);
      expect(r.config.defaultShellModeOnConflict).toBe('cancel');
    }
  });

  it('rejects with init-config-missing listing every missing field', () => {
    const r = mergeInitConfig({}, undefined);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe('init-config-missing');
      expect(r.missing).toEqual(['shellMode', 'locale']);
    }
  });

  it('rejects with init-config-missing when only locale is missing', () => {
    const r = mergeInitConfig({ shellMode: ShellMode.sdi }, undefined);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.missing).toEqual(['locale']);
    }
  });

  it('omits fallbackLocale when neither side supplies it (does not insert undefined)', () => {
    const r = mergeInitConfig({ shellMode: ShellMode.sdi, locale: 'tr' }, undefined);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect('fallbackLocale' in r.config).toBe(false);
    }
  });
});
