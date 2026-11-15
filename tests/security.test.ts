import { describe, it, expect } from 'vitest';
import { passwordVerifier, validOwnerSession, SESSION_MAX_AGE_MS } from '../apps/api/src/security';
describe('authentication boundary', () => {
  it('checks passwords asynchronously without exposing verification material', async () => {
    const verify = await passwordVerifier('test-only-owner-password');
    expect(await verify('test-only-owner-password')).toBe(true);
    expect(await verify('incorrect')).toBe(false);
    expect(await verify('x'.repeat(201))).toBe(false);
  });
  it('bounds concurrent expensive password work', async () => {
    const verify = await passwordVerifier('test-only-owner-password');
    const a = verify('first'),
      b = verify('second');
    await expect(verify('third')).rejects.toThrow('Authentication busy');
    await Promise.all([a, b]);
    expect(await verify('test-only-owner-password')).toBe(true);
  });
  it('enforces owner identity and absolute expiry independently of cookie refresh', () => {
    const now = Date.now();
    expect(validOwnerSession({ ownerId: 'owner', authenticatedAt: now }, 'owner', now)).toBe(true);
    for (const authenticatedAt of [now + 1, NaN, Infinity, now - SESSION_MAX_AGE_MS])
      expect(validOwnerSession({ ownerId: 'owner', authenticatedAt }, 'owner', now)).toBe(false);
    expect(validOwnerSession({ ownerId: 'other', authenticatedAt: now }, 'owner', now)).toBe(false);
    expect(validOwnerSession({ ownerId: 'owner' }, 'owner', now)).toBe(false);
  });
});
