export type PasswordStrengthLevel = 'empty' | 'weak' | 'fair' | 'good' | 'strong';

export interface PasswordStrengthResult {
  level: PasswordStrengthLevel;
  score: number; // 0 (empty), 1 (weak), 2 (fair), 3 (good), 4 (strong)
  meetsMinimumLength: boolean;
  hasUppercase: boolean;
  hasLowercase: boolean;
  hasNumber: boolean;
  hasSymbol: boolean;
  length: number;
  label: string;
}

/**
 * Deterministic, dependency-free password strength evaluation.
 * Evaluates length and character variety without conflating policy compliance with strength.
 */
export function evaluatePasswordStrength(password: string): PasswordStrengthResult {
  const input = password || '';
  const length = input.length;

  if (length === 0) {
    return {
      level: 'empty',
      score: 0,
      meetsMinimumLength: false,
      hasUppercase: false,
      hasLowercase: false,
      hasNumber: false,
      hasSymbol: false,
      length: 0,
      label: '—',
    };
  }

  const hasUppercase = /[A-Z]/.test(input);
  const hasLowercase = /[a-z]/.test(input);
  const hasNumber = /[0-9]/.test(input);
  const hasSymbol = /[^A-Za-z0-9]/.test(input);
  const varietyCount = [hasUppercase, hasLowercase, hasNumber, hasSymbol].filter(Boolean).length;
  const meetsMinimumLength = length >= 8;

  let points = 0;
  if (length >= 8) points += 1;
  if (length >= 12) points += 1;
  if (length >= 16) points += 1;

  if (varietyCount >= 2) points += 1;
  if (varietyCount >= 3) points += 1;
  if (varietyCount >= 4) points += 1;

  let score = 1;
  if (points >= 5) {
    score = 4; // Strong
  } else if (points >= 4) {
    score = 3; // Good
  } else if (points >= 2) {
    score = 2; // Fair
  } else {
    score = 1; // Weak
  }

  // Guardrails:
  // 1. Passwords shorter than 8 cannot be Good or Strong
  if (!meetsMinimumLength) {
    score = Math.min(score, 2);
  }
  // 2. Passwords with only one character variety cannot exceed Fair
  if (varietyCount <= 1) {
    score = Math.min(score, 2);
  }

  const labelMap: Record<number, { level: PasswordStrengthLevel; label: string }> = {
    1: { level: 'weak', label: 'Weak' },
    2: { level: 'fair', label: 'Fair' },
    3: { level: 'good', label: 'Good' },
    4: { level: 'strong', label: 'Strong' },
  };

  const { level, label } = labelMap[score] || labelMap[1];

  return {
    level,
    score,
    meetsMinimumLength,
    hasUppercase,
    hasLowercase,
    hasNumber,
    hasSymbol,
    length,
    label,
  };
}
