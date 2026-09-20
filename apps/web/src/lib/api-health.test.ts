import { describe, expect, it, vi } from "vitest";
import { checkApiHealth } from "./api-health.js";

describe("checkApiHealth", () => {
  it("resolves true when the fetch implementation resolves ok", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true });
    await expect(checkApiHealth("http://api.internal/healthz", { fetchImpl })).resolves.toBe(true);
  });

  it("resolves false when the fetch implementation resolves not-ok", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false });
    await expect(checkApiHealth("http://api.internal/healthz", { fetchImpl })).resolves.toBe(false);
  });

  it("fails soft (resolves false, never throws) when the fetch implementation rejects", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("network error"));
    await expect(checkApiHealth("http://api.internal/healthz", { fetchImpl })).resolves.toBe(false);
  });

  it("aborts and resolves false when the request exceeds the timeout", async () => {
    const fetchImpl = vi.fn(
      (_url: string, init?: { signal?: AbortSignal }) =>
        new Promise<{ ok: boolean }>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
        }),
    );

    await expect(
      checkApiHealth("http://api.internal/healthz", { fetchImpl, timeoutMs: 5 }),
    ).resolves.toBe(false);
  });
});
