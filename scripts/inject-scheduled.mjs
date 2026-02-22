/**
 * Post-build script that injects a `scheduled` handler into the Astro-compiled
 * Cloudflare Worker entry point. The scheduled handler triggers the scrape
 * pipeline by self-invoking the /api/cron API route.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ENTRY = resolve("dist/_worker.js/index.js");

const original = readFileSync(ENTRY, "utf-8");

// The Astro Cloudflare adapter exports the default handler as:
//   export { __astrojsSsrVirtualEntry as default, pageMap };
// We replace this to wrap it with a scheduled handler.

const OLD_EXPORT =
  "export { __astrojsSsrVirtualEntry as default, pageMap };";

if (!original.includes(OLD_EXPORT)) {
  console.error(
    "inject-scheduled: Could not find expected export line in compiled worker. " +
      "The Astro Cloudflare adapter output format may have changed.",
  );
  process.exit(1);
}

const SCHEDULED_HANDLER = `
const _scheduledWorker = {
  fetch: __astrojsSsrVirtualEntry.fetch,
  async scheduled(controller, env, ctx) {
    const start = Date.now();
    console.log(JSON.stringify({ level: "info", event: "cron_triggered", scheduledTime: controller.scheduledTime }));
    try {
      const response = await _scheduledWorker.fetch(
        new Request("http://trigger.internal/api/cron"),
        env,
        ctx,
      );
      if (!response.ok) {
        const text = await response.text();
        console.error(JSON.stringify({ level: "error", event: "cron_handler_failed", status: response.status, body: text, durationMs: Date.now() - start }));
      } else {
        const result = await response.json();
        console.log(JSON.stringify({ level: "info", event: "cron_handler_done", ...result, durationMs: Date.now() - start }));
      }
    } catch (error) {
      console.error(JSON.stringify({ level: "error", event: "cron_handler_error", error: error instanceof Error ? error.message : String(error), durationMs: Date.now() - start }));
    }
  },
};
export { _scheduledWorker as default, pageMap };
`;

const patched = original.replace(OLD_EXPORT, SCHEDULED_HANDLER);

writeFileSync(ENTRY, patched, "utf-8");
console.log("inject-scheduled: Successfully injected scheduled handler into worker entry.");
