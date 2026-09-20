/** Minimal shape we need from the Fetch API response, kept narrow so tests can fake it easily. */
export interface FetchLikeResponse {
  readonly ok: boolean;
}

export type FetchLike = (
  url: string,
  init?: { readonly signal?: AbortSignal },
) => Promise<FetchLikeResponse>;

export interface CheckApiHealthOptions {
  /** Aborts the request after this many milliseconds. Defaults to 1500ms. */
  readonly timeoutMs?: number;
  /** Injectable fetch implementation, so this stays a pure, unit-testable helper. */
  readonly fetchImpl?: FetchLike;
}

const DEFAULT_TIMEOUT_MS = 1500;

/**
 * Checks whether the API is reachable at `url`, failing soft: any error (network failure,
 * non-2xx/3xx status, or timeout) resolves to `false` rather than throwing. Used by the landing
 * page's server-side render to show API reachability without ever failing the page render.
 */
export async function checkApiHealth(
  url: string,
  options: CheckApiHealthOptions = {},
): Promise<boolean> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, fetchImpl = fetch } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(url, { signal: controller.signal });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
