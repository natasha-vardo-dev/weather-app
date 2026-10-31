import { timingSafeEqual } from 'node:crypto';

/** Constant-time comparison of a bearer secret (internal endpoints). */
export function sameSecret(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
