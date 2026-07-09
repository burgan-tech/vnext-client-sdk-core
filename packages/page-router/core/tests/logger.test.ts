import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLogger } from '../src/internal/logger.js';
import type { OnLog } from '../src/index.js';

describe('createLogger', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('forwards debug/info/warn/error to onLog with the right level', () => {
    const onLog = vi.fn<OnLog>();
    const log = createLogger(onLog);

    log.debug('d');
    log.info('i');
    log.warn('w');
    log.error('e');

    expect(onLog).toHaveBeenNthCalledWith(1, 'debug', 'd', undefined, undefined);
    expect(onLog).toHaveBeenNthCalledWith(2, 'info', 'i', undefined, undefined);
    expect(onLog).toHaveBeenNthCalledWith(3, 'warn', 'w', undefined, undefined);
    expect(onLog).toHaveBeenNthCalledWith(4, 'error', 'e', undefined, undefined);
  });

  it('passes error and context through unchanged', () => {
    const onLog = vi.fn<OnLog>();
    const log = createLogger(onLog);
    const err = new Error('boom');

    log.error('failed', err, { tabKey: 't1' });

    expect(onLog).toHaveBeenCalledWith('error', 'failed', err, { tabKey: 't1' });
  });

  it('is a no-op when onLog is undefined', () => {
    const log = createLogger(undefined);
    expect(() => {
      log.debug('x');
      log.info('x');
      log.warn('x');
      log.error('x', new Error('e'), { a: 1 });
    }).not.toThrow();
  });

  it('with(extra) merges base context with per-call context (per-call wins on key collision)', () => {
    const onLog = vi.fn<OnLog>();
    const root = createLogger(onLog, { module: 'router' });
    const child = root.with({ tabKey: 't1' });

    child.warn('hi', undefined, { tabKey: 't1-override', extra: 'x' });

    expect(onLog).toHaveBeenCalledWith('warn', 'hi', undefined, {
      module: 'router',
      tabKey: 't1-override',
      extra: 'x',
    });
  });

  it('with() chains preserve and merge previous contexts', () => {
    const onLog = vi.fn<OnLog>();
    const root = createLogger(onLog, { module: 'router' });
    const a = root.with({ subsystem: 'tabs' });
    const b = a.with({ tabKey: 't1' });

    b.info('done');

    expect(onLog).toHaveBeenCalledWith('info', 'done', undefined, {
      module: 'router',
      subsystem: 'tabs',
      tabKey: 't1',
    });
  });

  it('omits context arg when there is no merged context to send', () => {
    const onLog = vi.fn<OnLog>();
    const log = createLogger(onLog);

    log.info('plain');

    expect(onLog).toHaveBeenCalledWith('info', 'plain', undefined, undefined);
  });

  it('isolates host onLog throws so SDK callers do not crash', () => {
    const onLog = vi.fn<OnLog>().mockImplementation(() => {
      throw new Error('host bug');
    });
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const log = createLogger(onLog);

    expect(() => log.warn('x')).not.toThrow();
    expect(consoleSpy).toHaveBeenCalledTimes(1);
    expect(consoleSpy.mock.calls[0]?.[0]).toMatch(/page-router/i);
  });
});
