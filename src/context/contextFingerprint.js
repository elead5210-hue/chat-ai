import { normalizeSnapshot } from "./contextSnapshot.js";

/**
 * Context fingerprint: a short, stable id for one exact version of a Context
 * Snapshot, for example "CTX-7F92A1".
 *
 * The fingerprint is a hash of the snapshot's canonical JSON, so:
 *   - the same snapshot always produces the same fingerprint,
 *   - key order never matters,
 *   - changing anything in the snapshot (including its version) produces a
 *     different fingerprint,
 *   - two AIs that report the same fingerprint are working from the same
 *     snapshot.
 *
 * The hash is synchronous and dependency-free (no crypto API), so it can be
 * called while rendering. It is an identifier, not a security feature: it
 * keeps 24 bits, which is plenty to tell the versions of one conversation
 * apart but is not collision-proof. Use isSameSnapshot() when an exact
 * comparison matters.
 */

export const FINGERPRINT_PREFIX = "CTX-";
export const FINGERPRINT_HEX_LENGTH = 6;
export const FINGERPRINT_PATTERN = /^CTX-[0-9A-F]{6}$/;

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function serialise(value, ancestors) {
  if (value !== null && typeof value === "object" && typeof value.toJSON === "function") {
    return serialise(value.toJSON(), ancestors);
  }

  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return Number.isFinite(value) ? JSON.stringify(value) : "null";
  if (typeof value === "bigint") return JSON.stringify(value.toString());

  // undefined, functions and symbols have no JSON form. Callers decide whether
  // to omit them (object members) or write null (array items).
  if (typeof value !== "object") return undefined;

  if (ancestors.has(value)) {
    throw new TypeError("Cannot fingerprint a value that contains a circular reference.");
  }
  ancestors.add(value);

  let result;
  if (Array.isArray(value)) {
    const items = value.map((item) => serialise(item, ancestors) ?? "null");
    result = `[${items.join(",")}]`;
  } else {
    const members = [];
    for (const key of Object.keys(value).sort()) {
      const text = serialise(value[key], ancestors);
      if (text !== undefined) {
        members.push(`${JSON.stringify(key)}:${text}`);
      }
    }
    result = `{${members.join(",")}}`;
  }

  ancestors.delete(value);
  return result;
}

/**
 * Serialise a value as canonical JSON: no whitespace, object keys sorted at
 * every level, array order preserved. Mirrors JSON.stringify for values it
 * cannot represent (members are dropped, array items and non-finite numbers
 * become null).
 */
export function canonicalJson(value) {
  return serialise(value, new Set()) ?? "null";
}

/**
 * Hash text to 6 uppercase hex characters (24 bits): 32-bit FNV-1a, with the
 * top byte folded into the rest so every input character affects all six
 * characters.
 */
export function hashText(text) {
  let hash = 0x811c9dc5;
  const input = String(text);
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  const folded = ((hash >>> 0) ^ (hash >>> 24)) & 0xffffff;
  return folded.toString(16).toUpperCase().padStart(FINGERPRINT_HEX_LENGTH, "0");
}

/**
 * Fingerprint a Context Snapshot, e.g. "CTX-7F92A1".
 *
 * The snapshot is normalised first, so partial or legacy objects are accepted.
 * A snapshot without a conversation_id is given a fresh random one by
 * normalisation, so pass complete snapshots (as the session does) when the
 * result needs to be repeatable.
 */
export function computeContextFingerprint(snapshot) {
  return `${FINGERPRINT_PREFIX}${hashText(canonicalJson(normalizeSnapshot(snapshot)))}`;
}

/** True when the text looks like a context fingerprint (CTX- plus 6 hex digits). */
export function isValidFingerprint(value) {
  return typeof value === "string" && FINGERPRINT_PATTERN.test(value);
}

/**
 * True when both snapshots hold exactly the same content. Compares canonical
 * JSON rather than fingerprints, so a hash collision can never report two
 * different snapshots as the same.
 */
export function isSameSnapshot(a, b) {
  return canonicalJson(normalizeSnapshot(a)) === canonicalJson(normalizeSnapshot(b));
}

/**
 * True when a snapshot's fingerprint equals the given one (case-insensitive,
 * surrounding whitespace ignored). Use it to check whether a fingerprint
 * reported by an AI matches the snapshot the app holds.
 */
export function matchesFingerprint(snapshot, fingerprint) {
  if (typeof fingerprint !== "string") return false;
  return computeContextFingerprint(snapshot) === fingerprint.trim().toUpperCase();
}