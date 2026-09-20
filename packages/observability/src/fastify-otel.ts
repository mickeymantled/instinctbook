import * as FastifyOtelModule from "@fastify/otel";

// `@fastify/otel`'s types are declared as a CJS `export =` namespace (`FastifyOtelInstrumentation`
// plus a `default` alias to the same class inside it), which TypeScript's esModuleInterop default
// import synthesis resolves to the whole namespace object rather than the class — so a plain
// `import FastifyOtelInstrumentation from "@fastify/otel"` is not constructable. A namespace
// import plus pulling the named export out avoids that.
export type FastifyOtelInstrumentationOpts = FastifyOtelModule.FastifyOtelInstrumentationOpts;
export const FastifyOtelInstrumentation = FastifyOtelModule.FastifyOtelInstrumentation;
export type FastifyOtelInstrumentation = InstanceType<typeof FastifyOtelInstrumentation>;

/**
 * `@fastify/otel` (maintained by the Fastify authors; `@opentelemetry/instrumentation-fastify`
 * is deprecated in its favor) is both an `Instrumentation` (pass it to `initTelemetry`'s
 * `extraInstrumentations`) and a Fastify plugin (`.plugin()`, registered on the app instance).
 * Both roles must share the same instance, so callers construct it once here and pass the same
 * object to both places — see apps/api/src/instrumentation.ts.
 */
export function createFastifyOtelInstrumentation(
  options?: FastifyOtelInstrumentationOpts,
): FastifyOtelInstrumentation {
  return new FastifyOtelInstrumentation(options);
}
