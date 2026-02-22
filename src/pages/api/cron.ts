import type { APIRoute } from "astro";
import { runScrapePipeline } from "../../lib/scraper/pipeline";

export const prerender = false;

export const GET: APIRoute = async ({ locals }) => {
  const env = locals.runtime.env;
  const result = await runScrapePipeline(env.DB);

  return new Response(JSON.stringify(result), {
    status: result.success ? 200 : 500,
    headers: { "Content-Type": "application/json" },
  });
};
