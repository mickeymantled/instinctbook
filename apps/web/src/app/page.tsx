import { checkApiHealth } from "../lib/api-health";

// The API reachability check below is a live, request-time network call, so this page can never
// be statically prerendered (at build time there is no API to reach — the API and web images
// aren't even started in the same process). `force-dynamic` renders on every request instead.
export const dynamic = "force-dynamic";

const DEFAULT_API_INTERNAL_URL = "http://ibook-api:8081";
const HEALTH_CHECK_TIMEOUT_MS = 1500;

export default async function HomePage() {
  const apiInternalUrl = process.env.API_INTERNAL_URL ?? DEFAULT_API_INTERNAL_URL;
  const apiReachable = await checkApiHealth(`${apiInternalUrl}/healthz`, {
    timeoutMs: HEALTH_CHECK_TIMEOUT_MS,
  });

  return (
    <main>
      <h1>ibook</h1>
      <p>Public feed coming in stage 3.</p>
      <p>
        API status:{" "}
        <span className="status" data-reachable={apiReachable}>
          {apiReachable ? "reachable" : "unreachable"}
        </span>
      </p>
    </main>
  );
}
