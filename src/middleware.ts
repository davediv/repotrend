import { defineMiddleware } from "astro:middleware";
import { logError } from "./lib/log";

/**
 * Global error boundary middleware.
 * Catches unhandled rendering errors and returns a styled fallback page
 * instead of exposing raw error details or a blank screen.
 */
export const onRequest = defineMiddleware(async (context, next) => {
	try {
		return await next();
	} catch (error) {
		logError("unhandled_render_error")(error);

		// Return JSON for API routes, HTML for everything else.
		if (context.url.pathname.startsWith("/api/")) {
			return new Response(JSON.stringify({ error: "Internal server error" }), {
				status: 500,
				headers: { "Content-Type": "application/json" },
			});
		}

		return new Response(errorPageHTML, {
			status: 500,
			headers: { "Content-Type": "text/html; charset=utf-8" },
		});
	}
});

/**
 * Inline HTML for the 500 error page. Uses the same design tokens and layout
 * structure as Layout.astro so it looks consistent even when the Astro
 * rendering pipeline has failed.
 *
 * NOTE: Keep visually in sync with Layout.astro — this is an intentionally
 * simplified version that can render without the Astro component pipeline.
 */
const errorPageHTML = /* html */ `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Something Went Wrong — RepoTrend</title>
<script>
(function () {
	var stored = localStorage.getItem("repotrend-theme");
	if (stored === "dark" || (!stored && matchMedia("(prefers-color-scheme: dark)").matches)) {
		document.documentElement.classList.add("dark");
	}
})();
</script>
<style>
*,*::before,*::after{box-sizing:border-box}
html{
--color-bg:#ffffff;--color-bg-secondary:#f6f8fa;--color-text:#1f2328;
--color-text-secondary:#656d76;--color-border:#d0d7de;--color-border-hover:#afb8c1;
--color-link:#0969da;--color-link-hover:#0550ae;--color-accent:#0969da;--color-accent-text:#ffffff;
margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans",Helvetica,Arial,sans-serif;
font-size:16px;background-color:var(--color-bg);color:var(--color-text);line-height:1.5;color-scheme:light;
}
html.dark{
--color-bg:#0d1117;--color-bg-secondary:#161b22;--color-text:#e6edf3;
--color-text-secondary:#8b949e;--color-border:#30363d;--color-border-hover:#484f58;
--color-link:#58a6ff;--color-link-hover:#79c0ff;--color-accent:#58a6ff;--color-accent-text:#0d1117;
color-scheme:dark;
}
body{margin:0;min-height:100vh;display:flex;flex-direction:column}
.skip-link{position:absolute;top:-100%;left:50%;transform:translateX(-50%);z-index:200;
padding:0.5rem 1rem;background:var(--color-accent);color:var(--color-accent-text);
font-size:0.875rem;font-weight:500;text-decoration:none;border-radius:0 0 6px 6px;transition:top 0.15s}
.skip-link:focus{top:0}
header{border-bottom:1px solid var(--color-border);background-color:var(--color-bg)}
.header-inner{max-width:1200px;margin:0 auto;padding:0 1rem;height:64px;display:flex;align-items:center}
.logo{text-decoration:none;color:var(--color-text);font-size:1.25rem;font-weight:700;letter-spacing:-0.02em}
main{flex:1;display:flex;align-items:center;justify-content:center}
.error-container{display:flex;flex-direction:column;align-items:center;gap:1rem;padding:4rem 1rem;
color:var(--color-text-secondary);text-align:center;max-width:480px}
.error-container h1{margin:0;font-size:1.5rem;color:var(--color-text)}
.error-container p{margin:0;font-size:1rem}
.error-actions{display:flex;gap:0.75rem;margin-top:0.5rem;flex-wrap:wrap;justify-content:center}
.btn{display:inline-flex;align-items:center;justify-content:center;padding:0.625rem 1.5rem;
min-height:44px;border:1px solid var(--color-border);border-radius:6px;background:var(--color-bg);
color:var(--color-text);font-family:inherit;font-size:0.875rem;font-weight:500;text-decoration:none;
cursor:pointer;transition:border-color 0.15s,background-color 0.15s}
.btn:hover{border-color:var(--color-border-hover);background-color:var(--color-bg-secondary)}
.btn-primary{background:var(--color-accent);color:var(--color-accent-text);border-color:var(--color-accent)}
.btn-primary:hover{opacity:0.9;background:var(--color-accent);border-color:var(--color-accent)}
footer{border-top:1px solid var(--color-border);background-color:var(--color-bg-secondary)}
.footer-inner{max-width:1200px;margin:0 auto;padding:1.5rem 1rem;font-size:0.8125rem;
color:var(--color-text-secondary);text-align:center}
a:focus-visible,button:focus-visible{outline:2px solid var(--color-accent);outline-offset:2px;border-radius:2px}
@media(max-width:640px){.header-inner{height:56px;padding:0 0.75rem}.logo{font-size:1.125rem}
.error-container{padding:3rem 0.75rem}}
</style>
</head>
<body>
<a href="#main-content" class="skip-link">Skip to content</a>
<header role="banner"><div class="header-inner"><a href="/" class="logo">RepoTrend</a></div></header>
<main id="main-content" role="main">
<div class="error-container" role="alert">
<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none"
stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
<line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
</svg>
<h1>Something went wrong</h1>
<p>An unexpected error occurred while loading this page. Please try again.</p>
<div class="error-actions">
<button class="btn btn-primary" onclick="location.reload()">Try again</button>
<a href="/" class="btn">Back to homepage</a>
</div>
</div>
</main>
<footer role="contentinfo"><div class="footer-inner">RepoTrend &mdash; GitHub Trending Archive</div></footer>
</body>
</html>`;
