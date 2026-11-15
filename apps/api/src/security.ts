import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
export const SESSION_MAX_AGE_MS = 12 * 60 * 60 * 1000;
export function validOwnerSession(
  session: { ownerId?: string; authenticatedAt?: number },
  owner: string,
  now = Date.now(),
): boolean {
  return (
    session.ownerId === owner &&
    typeof session.authenticatedAt === 'number' &&
    Number.isFinite(session.authenticatedAt) &&
    session.authenticatedAt <= now &&
    now - session.authenticatedAt < SESSION_MAX_AGE_MS
  );
}
function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(password, salt, 32, { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 }, (error, key) =>
      error ? reject(error) : resolve(key),
    ),
  );
}
export async function passwordVerifier(password: string) {
  const salt = randomBytes(16),
    expected = await derive(password, salt);
  let active = 0;
  return async (candidate: string): Promise<boolean> => {
    if (candidate.length > 200) return false;
    if (active >= 2) throw new Error('Authentication busy');
    active++;
    try {
      return timingSafeEqual(await derive(candidate, salt), expected);
    } finally {
      active--;
    }
  };
}
