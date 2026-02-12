function normalizeUnicode(str) {
  return str
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/[\u2010\u2011\u2012\u2013\u2014\u2015\u2212]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(
      /[\u00A0\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200A\u202F\u205F\u3000]/g,
      " ",
    );
}

function normalizeForHash(str, lowerCase = false) {
  let normalized = normalizeUnicode(str);
  normalized = normalized.replace(/\s+/g, "");
  return lowerCase ? normalized.toLowerCase() : normalized;
}

function computeStringHash(str) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = (hash * 0x01000193) | 0;
  }
  return hash >>> 0;
}

function computeLineHash(content, lowerCase = false) {
  const normalized = normalizeForHash(content, lowerCase);
  if (normalized === "") return "00";
  const hash = computeStringHash(normalized);
  const truncated = hash % 256;
  return truncated.toString(16).padStart(2, "0");
}

const snippets = [
  "const user = new User();",
  "const User = require('./user');",
  "function getUser() {",
  "function getuser() {",
  "export class UserProfile {",
  "export class userprofile {",
  "  if (isReady) {",
  "  if (isready) {",
  "import { State } from './types';",
  "import { state } from './types';",
];

console.log("--- Hash Investigation (Case Sensitive vs Insensitive) ---");
console.log("Content".padEnd(40) + " | Sens | Insens");
console.log("-".repeat(60));

let collisionsSens = 0;
let collisionsInsens = 0;
const seenSens = new Set();
const seenInsens = new Set();

for (const s of snippets) {
  const hSens = computeLineHash(s, false);
  const hIns = computeLineHash(s, true);
  
  if (seenSens.has(hSens)) {
     // collision
  } else {
    seenSens.add(hSens);
  }

  if (seenInsens.has(hIns)) {
    collisionsInsens++;
  } else {
    seenInsens.add(hIns);
  }
  
  console.log(`${s.padEnd(40)} | ${hSens}   | ${hIns}`);
}

console.log("-".repeat(60));
console.log(`Collisions (Insensitive): ${collisionsInsens}`);
