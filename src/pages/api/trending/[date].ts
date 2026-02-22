import type { APIRoute } from "astro";

export const prerender = false;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isValidDate(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const d = new Date(year, month - 1, day);
  return (
    d.getFullYear() === year &&
    d.getMonth() === month - 1 &&
    d.getDate() === day
  );
}

export const GET: APIRoute = async ({ params, locals }) => {
  const { date } = params;

  if (!date || !isValidDate(date)) {
    return new Response(
      JSON.stringify({ error: "Invalid date format. Expected YYYY-MM-DD." }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const db = locals.runtime.env.DB;

  let results;
  try {
    ({ results } = await db
      .prepare(
        `SELECT repo_owner, repo_name, description, language, language_color,
                total_stars, forks, stars_today, trending_date, scraped_at
           FROM trending_repos
          WHERE trending_date = ?
          ORDER BY stars_today DESC`,
      )
      .bind(date)
      .all());
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return new Response(
      JSON.stringify({ error: "Database query failed", detail: message }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  return new Response(JSON.stringify(results), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
