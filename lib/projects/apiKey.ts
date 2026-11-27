import { createHash, randomBytes } from 'node:crypto';

const KEY_RE = /^mdf_[0-9a-f]{8}_[A-Za-z0-9_-]{43}$/;

export function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

export function generateApiKey(): { key: string; prefix: string; hash: string } {
  const prefix = randomBytes(4).toString('hex');
  const secret = randomBytes(32).toString('base64url');
  const key = `mdf_${prefix}_${secret}`;
  return { key, prefix, hash: hashApiKey(key) };
}

export function parseBearer(header: string | null | undefined): string | null {
  if (typeof header !== 'string' || header.length < 7 || header.slice(0, 7).toLowerCase() !== 'bearer ') return null;
  const key = header.slice(7);
  return KEY_RE.test(key) ? key : null;
}
