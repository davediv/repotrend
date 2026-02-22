import type { APIRoute } from "astro";

export const prerender = false;

export const GET: APIRoute = async ({ locals }) => {
  const db = locals.runtime.env.DB;

  let rows: { trending_date: string }[];
  try {
    ({ results: rows } = await db
      .prepare(
        `SELECT DISTINCT trending_date
           FROM trending_repos
          ORDER BY trending_date ASC`,
      )
      .all<{ trending_date: string }>());
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return new Response(
      JSON.stringify({ error: "Database query failed", detail: message }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        },
      },
    );
  }

  const dates = rows.map((r) => r.trending_date);

  return new Response(
    JSON.stringify({
      earliest: dates[0] ?? null,
      latest: dates[dates.length - 1] ?? null,
      dates,
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=300, s-maxage=300",
      },
    },
  );
};
