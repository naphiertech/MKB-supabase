import { describe, expect, it } from 'vitest';
import { getRecoveryLinkError, isPasswordRecoveryUrl, recoveryRedirectUrl } from './authRecoveryRoute';

describe('password recovery routing', () => {
  it('recognizes query and native hash recovery callbacks', () => {
    expect(isPasswordRecoveryUrl({ search: '?recovery=1', hash: '' })).toBe(true);
    expect(isPasswordRecoveryUrl({ search: '', hash: '#access_token=x&type=recovery' })).toBe(true);
    expect(isPasswordRecoveryUrl({ search: '', hash: '#dashboard' })).toBe(false);
  });

  it('preserves the deployed app path in the configured redirect URL', () => {
    expect(recoveryRedirectUrl({ origin: 'https://example.com', pathname: '/dashboard/' })).toBe('https://example.com/dashboard/?recovery=1');
  });

  it('surfaces an expired-link error from Supabase', () => {
    expect(getRecoveryLinkError('#error=access_denied&error_description=Email+link+is+invalid+or+has+expired')).toBe('Email link is invalid or has expired');
  });
});
