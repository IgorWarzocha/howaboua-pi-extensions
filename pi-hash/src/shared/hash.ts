import { normalizeForHash } from "./normalize.js";

/**
 * In-process hashing using a simple, fast Jenkins-like or DJB2 hash 
 * if a native xxHash isn't available. However, since Pi runs in Node/Bun,
 * we can use crypto.createHash for stability if we don't want external deps,
 * but for 2-char hex, a simple bitwise hash is usually enough and faster.
 * 
 * Let's use a standard fast string hash.
 */
export function computeStringHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0; // Convert to 32bit integer
  }
  return hash >>> 0; // Convert to unsigned
}

export function computeLineHash(content: string): string {
  const normalized = normalizeForHash(content, false);
  if (normalized === "") return "00";
  
  const hash = computeStringHash(normalized);
  const truncated = hash % 256;
  return truncated.toString(16).padStart(2, "0");
}
