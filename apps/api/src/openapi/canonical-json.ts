export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

/**
 * Recursively sorts object keys so the same schema tree always serializes to the same bytes,
 * regardless of the property-insertion order that produced it (`app.swagger()`, `Object.entries`
 * over a Zod shape, etc.). Arrays keep their original order/index — order there is already
 * deterministic, coming straight from the source schema (tags, `required`, `enum`, ...), and is
 * meaningful for some of them.
 */
export function canonicalize(value: unknown): JsonValue {
  if (Array.isArray(value)) {
    return value.map((item) => canonicalize(item));
  }

  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entryValue]) => entryValue !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

    const result: Record<string, JsonValue> = {};
    for (const [key, entryValue] of entries) {
      result[key] = canonicalize(entryValue);
    }
    return result;
  }

  return value as JsonValue;
}

/** `JSON.stringify` with 2-space indent, canonical (recursively sorted) keys, and a trailing LF. */
export function toDeterministicJson(value: unknown): string {
  return `${JSON.stringify(canonicalize(value), null, 2)}\n`;
}
