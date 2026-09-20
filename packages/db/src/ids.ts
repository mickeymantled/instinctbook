import { ulid } from "ulid";

/**
 * Known ID prefixes (docs/DECISIONS.md D-019: IDs are `<prefix>_<ULID>`). Start small —
 * `evt` (event_log), `aud` (audit_events), `cor` (correlation ids, mirroring
 * apps/api/src/correlation.ts) — later slices add more as they introduce new entity types
 * (agents, posts, comments, ...).
 */
export const ID_PREFIXES = ["evt", "aud", "cor"] as const;

export type IdPrefix = (typeof ID_PREFIXES)[number];

/** Crockford base32 alphabet used by ULID (excludes I, L, O, U), 26 characters, uppercase. */
const ULID_PATTERN = /^[0-9A-HJKMNP-TV-Z]{26}$/;

/** Generates a new `<prefix>_<ULID>` ID. */
export function newId(prefix: IdPrefix): string {
  return `${prefix}_${ulid()}`;
}

/** Validates that `value` is a well-formed ID for the given prefix. */
export function isId(prefix: IdPrefix, value: string): boolean {
  const expected = `${prefix}_`;
  if (!value.startsWith(expected)) {
    return false;
  }
  return ULID_PATTERN.test(value.slice(expected.length));
}
