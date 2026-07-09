import { describe, expect, it, vi } from 'vitest';
import { createSignal } from '../src/internal/signal.js';

describe('createSignal', () => {
  it('delivers emitted payload to every subscribed handler', () => {
    const sig = createSignal<number>();
    const a = vi.fn();
    const b = vi.fn();
    sig.subscribe(a);
    sig.subscribe(b);

    sig.emit(42);

    expect(a).toHaveBeenCalledWith(42);
    expect(b).toHaveBeenCalledWith(42);
  });

  it('size reflects active subscription count', () => {
    const sig = createSignal<void>();
    expect(sig.size).toBe(0);
    const sub1 = sig.subscribe(() => undefined);
    const sub2 = sig.subscribe(() => undefined);
    expect(sig.size).toBe(2);
    sub1.unsubscribe();
    expect(sig.size).toBe(1);
    sub2.unsubscribe();
    expect(sig.size).toBe(0);
  });

  it('unsubscribe stops further deliveries to that handler only', () => {
    const sig = createSignal<string>();
    const a = vi.fn();
    const b = vi.fn();
    const subA = sig.subscribe(a);
    sig.subscribe(b);

    sig.emit('one');
    subA.unsubscribe();
    sig.emit('two');

    expect(a).toHaveBeenCalledTimes(1);
    expect(a).toHaveBeenCalledWith('one');
    expect(b).toHaveBeenCalledTimes(2);
  });

  it('unsubscribe is idempotent', () => {
    const sig = createSignal<void>();
    const handler = vi.fn();
    const sub = sig.subscribe(handler);
    sub.unsubscribe();
    expect(() => sub.unsubscribe()).not.toThrow();
    expect(sig.size).toBe(0);
  });

  it('one handler throwing does not block others; calls onHandlerError', () => {
    const onHandlerError = vi.fn();
    const sig = createSignal<void>({ onHandlerError });
    const boom = new Error('boom');
    const a = vi.fn(() => {
      throw boom;
    });
    const b = vi.fn();

    sig.subscribe(a);
    sig.subscribe(b);
    sig.emit();

    expect(a).toHaveBeenCalled();
    expect(b).toHaveBeenCalled();
    expect(onHandlerError).toHaveBeenCalledWith(boom);
  });

  it('subscribe inside emit applies to NEXT emit, not the in-flight one', () => {
    const sig = createSignal<number>();
    const late = vi.fn();
    const early = vi.fn(() => {
      sig.subscribe(late);
    });

    sig.subscribe(early);
    sig.emit(1);
    expect(late).not.toHaveBeenCalled();

    sig.emit(2);
    expect(late).toHaveBeenCalledWith(2);
  });

  it('unsubscribe inside emit prevents the cancelled handler from being called in-flight', () => {
    const sig = createSignal<number>();
    let subB: { unsubscribe(): void } | null = null;
    const a = vi.fn(() => {
      subB!.unsubscribe();
    });
    const b = vi.fn();

    sig.subscribe(a);
    subB = sig.subscribe(b);

    sig.emit(1);
    expect(b).not.toHaveBeenCalled();

    sig.emit(2);
    expect(b).not.toHaveBeenCalled();
    expect(a).toHaveBeenCalledTimes(2);
  });

  it('clear() removes all handlers immediately', () => {
    const sig = createSignal<void>();
    const a = vi.fn();
    const b = vi.fn();
    sig.subscribe(a);
    sig.subscribe(b);

    sig.clear();
    sig.emit();

    expect(a).not.toHaveBeenCalled();
    expect(b).not.toHaveBeenCalled();
    expect(sig.size).toBe(0);
  });
});
