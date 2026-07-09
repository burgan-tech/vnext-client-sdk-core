import { describe, expect, it } from 'vitest';
import { URNParser } from '../../../src/utils/urn-parser.js';
import { MalformedURNError } from '../../../src/errors.js';
import { loadFixture } from '../../helpers/load-fixture.js';

interface UrnFixture {
  valid: Array<{
    input: string;
    expected: {
      namespace: string;
      type: string;
      command: 'start' | 'transition' | 'continue';
      domain: string;
      flowName: string;
      instanceId?: string;
      transitionKey?: string;
    };
  }>;
  invalid: Array<{ input: string; reason: string }>;
}

const fixtures = loadFixture<UrnFixture>('urn-cases.json');

describe('URNParser', () => {
  const parser = new URNParser();

  describe('valid fixtures', () => {
    for (const c of fixtures.valid) {
      it(`parses ${c.input}`, () => {
        const parsed = parser.parse(c.input);
        expect(parsed).toMatchObject(c.expected);
        // virtual flag getters
        expect(parsed.isStart).toBe(c.expected.command === 'start');
        expect(parsed.isTransition).toBe(c.expected.command === 'transition');
        expect(parsed.isContinue).toBe(c.expected.command === 'continue');
      });
    }
  });

  describe('invalid fixtures', () => {
    for (const c of fixtures.invalid) {
      it(`rejects "${c.input}" (${c.reason})`, () => {
        expect(() => parser.parse(c.input)).toThrow(MalformedURNError);
      });
    }
  });

  describe('isValid', () => {
    it('returns true for a well-formed URN', () => {
      expect(parser.isValid('urn:vnext:flow:start:onboarding:kyc-main-flow')).toBe(true);
    });

    it('returns false for a malformed URN', () => {
      expect(parser.isValid('not-a-urn')).toBe(false);
    });
  });

  describe('error envelope', () => {
    it('captures the offending URN and an explanatory expectedFormat', () => {
      try {
        parser.parse('urn:vnext:flow:foo:d:f');
        throw new Error('should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(MalformedURNError);
        const err = e as MalformedURNError;
        expect(err.urn).toBe('urn:vnext:flow:foo:d:f');
        expect(err.expectedFormat.toLowerCase()).toContain('command');
      }
    });

    it('reports empty-string URN as MalformedURNError', () => {
      expect(() => parser.parse('')).toThrow(MalformedURNError);
    });
  });

  describe('preserves case-sensitivity for payload segments', () => {
    it('keeps domain/flow/instance casing as-is', () => {
      const parsed = parser.parse('urn:vnext:flow:transition:OnBoarding:Kyc-Flow:ABC-123:Approved');
      expect(parsed.domain).toBe('OnBoarding');
      expect(parsed.flowName).toBe('Kyc-Flow');
      expect(parsed.instanceId).toBe('ABC-123');
      expect(parsed.transitionKey).toBe('Approved');
    });
  });
});
