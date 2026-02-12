import { normalizeForHash } from "./normalize.js";

/**
 * In-process hashing using a simple, fast Jenkins-like or DJB2 hash 
 * if a native xxHash isn't available. However, since Pi runs in Node/Bun,
 * we can use crypto.createHash for stability if we don't want external deps,
 * but for 2-char hex, a simple bitwise hash is usually enough and faster.
 * 
 * Let's use a standard fast string hash.
 */
/**
 * FNV-1a hash algorithm. 
 * Better dispersion than DJB2 for small strings (common in code like '}', '{', 'else').
 */
export function computeStringHash(str: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = (hash * 0x01000193) | 0;
  }
  return hash >>> 0;
}

/**
 * Base26 encoding using only lowercase letters (a-z).
 */
function toBase26(n: number): string {
  let s = "";
  for (let i = 0; i < 4; i++) {
    s = String.fromCharCode(97 + (n % 26)) + s;
    n = Math.floor(n / 26);
  }
  return s;
}

export function computeLineHash(content: string): string {
  const normalized = normalizeForHash(content, false);
  if (normalized === "") return "aaaa";
  
  const hash = computeStringHash(normalized);
  const truncated = hash % 456976; // 26^4
  return toBase26(truncated);
}
