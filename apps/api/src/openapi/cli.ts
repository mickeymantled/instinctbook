import { pathToFileURL } from "node:url";

/** True when `moduleUrl` (pass `import.meta.url`) is the script Node was invoked with directly. */
export function isMainModule(moduleUrl: string): boolean {
  const entryArg = process.argv[1];
  return entryArg !== undefined && moduleUrl === pathToFileURL(entryArg).href;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? (error.stack ?? error.message) : String(error);
}

/** Runs `main`, printing an uncaught rejection to stderr and setting a non-zero exit code. */
export function runCli(main: () => Promise<void>): void {
  main().catch((error: unknown) => {
    process.stderr.write(`${errorMessage(error)}\n`);
    process.exitCode = 1;
  });
}
