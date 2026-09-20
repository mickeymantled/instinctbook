import { describe, expect, it } from "vitest";
import { z } from "zod";
import { buildTestApp } from "./test-helpers.js";

// Distinct, greppable markers so a false negative (a marker slipping through under a different
// spelling) is easy to notice.
const MARKER_BODY = "MARKER-BODY-2f9a";
const MARKER_AUTH = "MARKER-AUTH-8b1c";
const MARKER_SIGNATURE = "MARKER-SIG-71ad";
const MARKER_COOKIE = "MARKER-COOKIE-44ee";
const MARKER_QUERY_SIG = "MARKER-QSIG-90cd";
const MARKER_QUERY_TOKEN = "MARKER-QTOKEN-15fb";
const MARKER_ATTESTATION = "MARKER-ATTEST-ab12";
const MARKER_NESTED_TOKEN = "MARKER-NESTEDTOK-cd34";
const MARKER_PRESIGNED = "MARKER-PRESIGN-ef56";

const ALL_MARKERS = [
  MARKER_BODY,
  MARKER_AUTH,
  MARKER_SIGNATURE,
  MARKER_COOKIE,
  MARKER_QUERY_SIG,
  MARKER_QUERY_TOKEN,
  MARKER_ATTESTATION,
  MARKER_NESTED_TOKEN,
  MARKER_PRESIGNED,
];

describe("logging redaction", () => {
  it("never leaks a body, header, query, or explicitly-logged secret field", async () => {
    const { app, capture } = buildTestApp();

    app.post(
      "/test/log-markers",
      { schema: { body: z.strictObject({ secret: z.string() }) } },
      async (request) => {
        request.log.info(
          {
            attestation: MARKER_ATTESTATION,
            nested: { token: MARKER_NESTED_TOKEN },
            presigned_url: `https://example.com/upload?sig=${MARKER_PRESIGNED}`,
          },
          "handler side note",
        );
        return { ok: true, secretLength: request.body.secret.length };
      },
    );

    const response = await app.inject({
      method: "POST",
      url: `/test/log-markers?X-Amz-Signature=${MARKER_QUERY_SIG}&token=${MARKER_QUERY_TOKEN}`,
      headers: {
        authorization: `Bearer ${MARKER_AUTH}`,
        "x-agent-signature": MARKER_SIGNATURE,
        cookie: `session=${MARKER_COOKIE}`,
      },
      payload: { secret: MARKER_BODY },
    });

    expect(response.statusCode).toBe(200);

    const output = capture.text();
    for (const marker of ALL_MARKERS) {
      expect(output).not.toContain(marker);
    }
  });

  it("logs a request-completed line with method, path (no query), status, and correlation id", async () => {
    const { app, capture } = buildTestApp();

    const response = await app.inject({
      method: "GET",
      url: "/healthz?should=not-appear",
    });

    const correlationId = response.headers["x-correlation-id"] as string;
    const completedLine = capture
      .lines()
      .find((line) => line.msg === "request completed" && line.method === "GET");

    expect(completedLine).toBeDefined();
    expect(completedLine?.path).toBe("/healthz");
    expect(completedLine?.path).not.toContain("should");
    expect(completedLine?.statusCode).toBe(200);
    expect(completedLine?.correlationId).toBe(correlationId);
  });
});
