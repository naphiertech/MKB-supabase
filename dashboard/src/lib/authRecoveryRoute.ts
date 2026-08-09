export function isPasswordRecoveryUrl(location: { search: string; hash: string }): boolean {
  return new URLSearchParams(location.search).get('recovery') === '1'
    || new URLSearchParams(location.hash.replace(/^#/, '')).get('type') === 'recovery';
}

export function recoveryRedirectUrl(location: { origin: string; pathname: string }): string {
  return `${location.origin}${location.pathname}?recovery=1`;
}

export function getRecoveryLinkError(hash: string): string | null {
  return new URLSearchParams(hash.replace(/^#/, '')).get('error_description');
}
