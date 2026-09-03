import { Check, Circle } from 'lucide-react';
import { evaluatePasswordStrength, type PasswordStrengthResult } from '../../services/auth/passwordStrength';

export interface PasswordSecurityFeedbackProps {
  password?: string;
  className?: string;
}

function getStrengthVisuals(strength: PasswordStrengthResult): {
  textColor: string;
  barColor: string;
} {
  switch (strength.level) {
    case 'weak':
      return {
        textColor: 'text-amber-700',
        barColor: 'bg-amber-500',
      };
    case 'fair':
      return {
        textColor: 'text-amber-600',
        barColor: 'bg-amber-500',
      };
    case 'good':
      return {
        textColor: 'text-emerald-600',
        barColor: 'bg-emerald-500',
      };
    case 'strong':
      return {
        textColor: 'text-emerald-700',
        barColor: 'bg-emerald-600',
      };
    case 'empty':
    default:
      return {
        textColor: 'text-muted-foreground',
        barColor: 'bg-gray-200',
      };
  }
}

export function PasswordSecurityFeedback({ password = '', className = '' }: PasswordSecurityFeedbackProps) {
  const strength = evaluatePasswordStrength(password);
  const visuals = getStrengthVisuals(strength);
  const isEmpty = strength.level === 'empty';

  return (
    <div
      data-testid="password-security-feedback"
      role="status"
      aria-live="polite"
      className={`rounded-xl border border-border/80 bg-gray-50/70 p-3 space-y-2.5 text-xs ${className}`.trim()}
    >
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground font-medium">Password strength:</span>
        <span
          data-testid="password-strength-label"
          className={`font-semibold ${visuals.textColor}`}
        >
          {strength.label}
        </span>
      </div>

      {/* Segmented Strength Meter */}
      <div
        className="grid grid-cols-4 gap-1.5"
        role="progressbar"
        aria-valuenow={strength.score}
        aria-valuemin={0}
        aria-valuemax={4}
        aria-label={`Password strength is ${strength.label}`}
      >
        {[1, 2, 3, 4].map((step) => {
          const isFilled = !isEmpty && strength.score >= step;
          return (
            <div
              key={step}
              data-testid={`strength-meter-segment-${step}`}
              className={`h-1.5 rounded-full transition-colors duration-150 ${
                isFilled ? visuals.barColor : 'bg-gray-200'
              }`}
            />
          );
        })}
      </div>

      {/* Mandatory Requirement */}
      <div className="pt-0.5 space-y-1.5">
        <div
          data-testid="requirement-min-length"
          className={`flex items-center gap-2 text-xs transition-colors ${
            strength.meetsMinimumLength ? 'text-emerald-700 font-medium' : 'text-muted-foreground'
          }`}
        >
          {strength.meetsMinimumLength ? (
            <Check
              data-testid="requirement-check-icon"
              className="w-3.5 h-3.5 text-emerald-600 shrink-0 stroke-[2.5]"
              aria-hidden="true"
            />
          ) : (
            <Circle
              data-testid="requirement-circle-icon"
              className="w-3.5 h-3.5 text-muted-foreground/60 shrink-0"
              aria-hidden="true"
            />
          )}
          <span>At least 8 characters</span>
        </div>
      </div>

      {/* Advisory Guidance */}
      <p className="text-[11px] text-muted-foreground leading-relaxed">
        Longer passwords and greater character variety improve strength.
      </p>
    </div>
  );
}
