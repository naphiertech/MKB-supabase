import { describe, expect, it } from 'vitest';
import { evaluatePasswordStrength } from './passwordStrength';

describe('evaluatePasswordStrength pure scoring utility', () => {
  it('returns neutral empty state when password is empty or undefined', () => {
    const emptyResult = evaluatePasswordStrength('');
    expect(emptyResult.level).toBe('empty');
    expect(emptyResult.score).toBe(0);
    expect(emptyResult.meetsMinimumLength).toBe(false);
    expect(emptyResult.label).toBe('—');

    const undefResult = evaluatePasswordStrength(undefined as unknown as string);
    expect(undefResult.level).toBe('empty');
    expect(undefResult.score).toBe(0);
    expect(undefResult.meetsMinimumLength).toBe(false);
  });

  it('marks passwords with less than 8 characters as incomplete for minimum length', () => {
    const short7 = evaluatePasswordStrength('abc1234');
    expect(short7.meetsMinimumLength).toBe(false);
    expect(short7.length).toBe(7);
    // Short passwords cannot be Good or Strong
    expect(['weak', 'fair']).toContain(short7.level);
    expect(short7.score).toBeLessThanOrEqual(2);
  });

  it('satisfies minimum requirement for 8 basic characters without being automatically Strong', () => {
    const basic8 = evaluatePasswordStrength('12345678');
    expect(basic8.meetsMinimumLength).toBe(true);
    expect(basic8.length).toBe(8);
    // Meets minimum policy but is NOT strong
    expect(basic8.level).not.toBe('strong');
    expect(basic8.level).not.toBe('good');
    expect(['weak', 'fair']).toContain(basic8.level);
    expect(basic8.score).toBeLessThanOrEqual(2);
  });

  it('increases strength level with character variety for 8-character passwords', () => {
    const singleVariety = evaluatePasswordStrength('abcdefgh');
    const mixedVariety = evaluatePasswordStrength('Abc123!@');

    expect(singleVariety.meetsMinimumLength).toBe(true);
    expect(mixedVariety.meetsMinimumLength).toBe(true);
    expect(mixedVariety.score).toBeGreaterThan(singleVariety.score);
    expect(mixedVariety.level).toBe('good');
  });

  it('awards strong level to long passwords with diverse character sets', () => {
    const strongPassword = evaluatePasswordStrength('Super#Secure987!Pass');
    expect(strongPassword.meetsMinimumLength).toBe(true);
    expect(strongPassword.level).toBe('strong');
    expect(strongPassword.score).toBe(4);
    expect(strongPassword.hasUppercase).toBe(true);
    expect(strongPassword.hasLowercase).toBe(true);
    expect(strongPassword.hasNumber).toBe(true);
    expect(strongPassword.hasSymbol).toBe(true);
  });

  it('keeps compliance and strength as strictly separate concepts', () => {
    // 6 chars with high variety: meetsMinimumLength is false, but variety exists
    const shortMixed = evaluatePasswordStrength('A1!b2@');
    expect(shortMixed.meetsMinimumLength).toBe(false);
    expect(shortMixed.hasUppercase).toBe(true);
    expect(shortMixed.hasLowercase).toBe(true);
    expect(shortMixed.hasNumber).toBe(true);
    expect(shortMixed.hasSymbol).toBe(true);
    // Even with 4 varieties, cannot be Strong because length < 8
    expect(shortMixed.level).not.toBe('strong');
    expect(shortMixed.level).not.toBe('good');
  });
});
