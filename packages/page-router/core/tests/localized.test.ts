import { describe, expect, it, vi } from 'vitest';
import {
  interpolateTemplate,
  pickLocaleString,
  resolveLocalized,
} from '../src/internal/localized.js';
import { createLogger } from '../src/internal/logger.js';
import type { OnLog } from '../src/index.js';

describe('pickLocaleString', () => {
  it('returns plain string input as-is regardless of locale', () => {
    expect(pickLocaleString('Plain', { locale: 'tr' })).toBe('Plain');
    expect(pickLocaleString('Plain', { locale: 'en' })).toBe('Plain');
  });

  it('selects the active locale from a map when present', () => {
    const out = pickLocaleString({ tr: 'Hesap', en: 'Account' }, { locale: 'tr' });
    expect(out).toBe('Hesap');
  });

  it('falls back to fallbackLocale when active locale is absent', () => {
    const out = pickLocaleString(
      { tr: 'Hesap', en: 'Account' },
      { locale: 'de', fallbackLocale: 'en' },
    );
    expect(out).toBe('Account');
  });

  it('falls back to first key when neither active nor fallback locale match', () => {
    const out = pickLocaleString(
      { tr: 'Hesap', en: 'Account' },
      { locale: 'de', fallbackLocale: 'fr' },
    );
    expect(out).toBe('Hesap');
  });

  it('returns "" and warns locale-fallback-empty for an empty map', () => {
    const onLog = vi.fn<OnLog>();
    const logger = createLogger(onLog);
    const out = pickLocaleString(
      {},
      { locale: 'tr', fallbackLocale: 'en', logger, routeKey: 'r' },
    );
    expect(out).toBe('');
    expect(onLog).toHaveBeenCalledWith(
      'warn',
      expect.stringContaining('locale-fallback-empty'),
      undefined,
      expect.objectContaining({
        routeKey: 'r',
        locale: 'tr',
        fallbackLocale: 'en',
        availableKeys: [],
      }),
    );
  });

  it('does not warn when active locale resolves cleanly', () => {
    const onLog = vi.fn<OnLog>();
    pickLocaleString(
      { tr: 'Hesap' },
      { locale: 'tr', logger: createLogger(onLog), routeKey: 'r' },
    );
    expect(onLog).not.toHaveBeenCalled();
  });
});

describe('interpolateTemplate', () => {
  it('replaces a single placeholder with the payload value', () => {
    expect(interpolateTemplate('Acct {{accountNo}}', { accountNo: '1234' })).toBe(
      'Acct 1234',
    );
  });

  it('replaces multiple placeholders independently', () => {
    expect(
      interpolateTemplate('{{a}} / {{b}}', { a: 'x', b: 'y' }),
    ).toBe('x / y');
  });

  it('passes through templates without placeholders', () => {
    expect(interpolateTemplate('static', {})).toBe('static');
  });

  it('coerces primitive values (number, boolean) to strings', () => {
    expect(interpolateTemplate('n={{n}} b={{b}}', { n: 42, b: true })).toBe(
      'n=42 b=true',
    );
  });

  it('keeps placeholder literal and warns when key is missing', () => {
    const onLog = vi.fn<OnLog>();
    const out = interpolateTemplate(
      'Loan {{instanceId}}',
      {},
      { logger: createLogger(onLog), routeKey: 'loan' },
    );
    expect(out).toBe('Loan {{instanceId}}');
    expect(onLog).toHaveBeenCalledWith(
      'warn',
      expect.stringContaining('template-key-not-found'),
      undefined,
      expect.objectContaining({
        routeKey: 'loan',
        key: 'instanceId',
        placeholder: '{{instanceId}}',
      }),
    );
  });

  it('keeps placeholder literal and warns when value is null or undefined', () => {
    const onLog = vi.fn<OnLog>();
    const out = interpolateTemplate(
      '{{a}} | {{b}}',
      { a: null, b: undefined },
      { logger: createLogger(onLog), routeKey: 'r' },
    );
    expect(out).toBe('{{a}} | {{b}}');
    expect(onLog).toHaveBeenCalledTimes(2);
  });

  it('does not interpret nested paths or format specs (flat keys only)', () => {
    const onLog = vi.fn<OnLog>();
    const out = interpolateTemplate(
      '{{user.name}} {{amount:currency}}',
      { user: { name: 'Ada' }, amount: 10 },
      { logger: createLogger(onLog), routeKey: 'r' },
    );
    expect(out).toBe('{{user.name}} {{amount:currency}}');
    expect(onLog).toHaveBeenCalledTimes(2);
  });

  it('handles empty string template', () => {
    expect(interpolateTemplate('', { a: 1 })).toBe('');
  });
});

describe('resolveLocalized', () => {
  it('returns undefined for undefined input', () => {
    expect(resolveLocalized(undefined, {}, { locale: 'tr' })).toBeUndefined();
  });

  it('chains locale pick + template interpolation', () => {
    const out = resolveLocalized(
      { tr: 'Hesap {{accountNo}}', en: 'Account {{accountNo}}' },
      { accountNo: '1234' },
      { locale: 'en' },
    );
    expect(out).toBe('Account 1234');
  });

  it('warns once per missing key during the combined flow', () => {
    const onLog = vi.fn<OnLog>();
    const out = resolveLocalized(
      { tr: 'Hesap {{accountNo}}' },
      {},
      { locale: 'tr', logger: createLogger(onLog), routeKey: 'r' },
    );
    expect(out).toBe('Hesap {{accountNo}}');
    expect(onLog).toHaveBeenCalledTimes(1);
  });
});
