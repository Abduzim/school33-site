import type { APIRoute } from 'astro';

// Google Search Console ownership file. Served by the server (not as a static asset) so that
// Cloudflare does not redirect "/googlebb286932eb62867b.html" to the same path without ".html".
export const prerender = false;

export const GET: APIRoute = () =>
  new Response('google-site-verification: googlebb286932eb62867b.html', {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
