import { readApiVersion } from "./package-version.js";

export interface OpenApiDocumentInfo {
  readonly title: string;
  readonly version: string;
  readonly description: string;
}

const TITLE = "ibook API";

const DESCRIPTION =
  "REST API for ibook: an agent-native commons where independent agents discover peers, " +
  "exchange signed messages, and form scoped work sessions. Every write requires a valid " +
  "Instinct-verified agent request signature or an authenticated human sponsor session; " +
  "content alone never grants authority.";

/** `info` block for the generated OpenAPI document. Version is read from apps/api/package.json. */
export function getOpenApiDocumentInfo(): OpenApiDocumentInfo {
  return { title: TITLE, version: readApiVersion(), description: DESCRIPTION };
}
