import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL('../../supabase/migrations/20260811105020_legacy_staff_profile_normalization.sql', import.meta.url),
  'utf8'
).replace(/\s+/g, ' ');

describe('legacy staff email normalization migration contract', () => {
  it('reconciles an existing confirmed Auth/public email mismatch during migration', () => {
    expect(migration).toMatch(
      /update public\.users as profile set email = auth_user\.email,[^;]+from auth\.users as auth_user[^;]+auth_user\.email_confirmed_at is not null[^;]+profile\.email is distinct from auth_user\.email;/i
    );
  });

  it('copies only the confirmed Auth email and never the pending email-change value', () => {
    expect(migration).toContain('set email = auth_user.email');
    expect(migration).not.toMatch(/set email = auth_user\.email_change/i);
    expect(migration).not.toMatch(/set email = auth_user\.new_email/i);
  });

  it('does not rewrite historical activity-log rows', () => {
    expect(migration).not.toMatch(/(?:update|delete from) public\.activity_logs/i);
  });
});
