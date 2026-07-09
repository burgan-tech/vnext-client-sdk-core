import { describe, expect, it } from 'vitest';
import {
  displayModeFromWire,
  displayModeToNavigationType,
  instanceStatusFromWire,
  stateSubTypeFromWire,
  stateTypeFromWire,
  viewTypeFromWire,
} from '../../src/enums.js';

describe('enums', () => {
  describe('instanceStatusFromWire', () => {
    it.each([
      ['A', 'active'],
      ['Active', 'active'],
      ['active', 'active'],
      ['B', 'busy'],
      ['Busy', 'busy'],
      ['P', 'passive'],
      ['Passive', 'passive'],
      ['C', 'completed'],
      ['Completed', 'completed'],
      ['F', 'faulted'],
      ['Faulted', 'faulted'],
    ])('maps %s → %s', (input, expected) => {
      expect(instanceStatusFromWire(input)).toBe(expected);
    });

    it('warns and returns faulted for unknown', () => {
      let raw: string | undefined;
      const out = instanceStatusFromWire('Z', (r) => (raw = r));
      expect(out).toBe('faulted');
      expect(raw).toBe('Z');
    });

    it('returns faulted with callback for null/undefined', () => {
      let called = false;
      expect(instanceStatusFromWire(null, () => (called = true))).toBe('faulted');
      expect(called).toBe(true);
    });
  });

  describe('stateTypeFromWire', () => {
    it.each([
      ['initial', 'initial'],
      ['intermediate', 'intermediate'],
      ['finish', 'finish'],
      ['subFlow', 'subFlow'],
      ['wizard', 'wizard'],
      ['1', 'initial'],
      ['2', 'intermediate'],
      ['3', 'finish'],
      ['4', 'subFlow'],
      ['5', 'wizard'],
    ])('maps %s → %s', (input, expected) => {
      expect(stateTypeFromWire(input)).toBe(expected);
    });

    it('returns undefined for null/empty input without callback', () => {
      expect(stateTypeFromWire(undefined)).toBeUndefined();
      expect(stateTypeFromWire('')).toBeUndefined();
    });

    it('warns and returns undefined for unknown', () => {
      let raw: string | undefined;
      expect(stateTypeFromWire('weird', (r) => (raw = r))).toBeUndefined();
      expect(raw).toBe('weird');
    });
  });

  describe('stateSubTypeFromWire', () => {
    it('passes through known literals', () => {
      expect(stateSubTypeFromWire('success')).toBe('success');
      expect(stateSubTypeFromWire('cancelled')).toBe('cancelled');
    });

    it('returns undefined for unknown / empty', () => {
      let warned = false;
      expect(stateSubTypeFromWire('zzz', () => (warned = true))).toBeUndefined();
      expect(warned).toBe(true);
      expect(stateSubTypeFromWire(null)).toBeUndefined();
    });
  });

  describe('viewTypeFromWire', () => {
    it.each([
      ['Json', 'json'],
      ['HTML', 'html'],
      ['Markdown', 'markdown'],
      ['HTTP', 'http'],
      ['DeepLink', 'deepLink'],
      ['urn', 'urn'],
    ])('maps %s → %s', (input, expected) => {
      expect(viewTypeFromWire(input)).toBe(expected);
    });

    it('warns and falls back to json for unknown', () => {
      let raw: string | undefined;
      expect(viewTypeFromWire('XYZ', (r) => (raw = r))).toBe('json');
      expect(raw).toBe('XYZ');
    });

    it('falls back to json for missing input', () => {
      expect(viewTypeFromWire(null)).toBe('json');
    });
  });

  describe('displayModeFromWire', () => {
    it('maps known modes case-insensitively', () => {
      expect(displayModeFromWire('Full-Page')).toBe('full-page');
      expect(displayModeFromWire('popup')).toBe('popup');
      expect(displayModeFromWire('Bottom-Sheet')).toBe('bottom-sheet');
    });

    it('falls back to full-page for unknown / missing', () => {
      let warned = false;
      expect(displayModeFromWire('zzz', () => (warned = true))).toBe('full-page');
      expect(warned).toBe(true);
      expect(displayModeFromWire(undefined)).toBe('full-page');
    });
  });

  describe('displayModeToNavigationType', () => {
    it('maps each known mode', () => {
      expect(displayModeToNavigationType('full-page')).toBe('pushReplacement');
      expect(displayModeToNavigationType('popup')).toBe('popup');
      expect(displayModeToNavigationType('bottom-sheet')).toBe('bottomSheet');
      expect(displayModeToNavigationType('top-sheet')).toBe('popup');
      expect(displayModeToNavigationType('drawer')).toBe('popup');
      expect(displayModeToNavigationType('inline')).toBe('push');
    });

    it('defaults to push for unrecognised input', () => {
      expect(displayModeToNavigationType('weird' as unknown as 'full-page')).toBe('push');
    });
  });
});
