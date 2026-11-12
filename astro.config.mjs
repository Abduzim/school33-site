// @ts-check
import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import cloudflare from '@astrojs/cloudflare';
import sitemap from '@astrojs/sitemap';

// Public URL of the site. Used for canonical links, hreflang and the sitemap.
// Set it at build time: SITE_URL=https://example.com npm run build
const site = process.env.SITE_URL || 'http://localhost:4321';

// Where the server part runs:
//   default             → Node.js (npm start, Docker, Render)
//   DEPLOY_TARGET=cloudflare → Cloudflare Workers (npm run deploy:cf)
const onCloudflare = process.env.DEPLOY_TARGET === 'cloudflare';

export default defineConfig({
  site,
  trailingSlash: 'ignore',
  // Every page is pre-rendered to static HTML at build time.
  // Only the routes that opt out (`export const prerender = false`) run on the server:
  // the contact form API, the CMS login and the language redirect on "/".
  output: 'static',
  adapter: onCloudflare
    ? cloudflare({ imageService: 'passthrough', prerenderEnvironment: 'node' })
    : node({ mode: 'standalone' }),
  // No feature of the site uses Astro sessions; this also keeps Cloudflare from creating a KV store.
  ...(onCloudflare ? { session: false } : {}),
  security: {
    // The contact endpoint checks the Origin header itself (see src/lib/origin.ts),
    // so it keeps working behind a reverse proxy.
    checkOrigin: false,
  },
  integrations: [
    sitemap({
      // "/" only redirects to a language; the editor and thank-you page are not for search engines.
      filter: (page) => {
        const path = new URL(page).pathname;
        return path !== '/' && !path.startsWith('/admin') && !path.includes('/contact/thanks/');
      },
      i18n: {
        defaultLocale: 'uz',
        locales: { uz: 'uz-UZ', ru: 'ru-RU', en: 'en-US' },
      },
    }),
  ],
});
