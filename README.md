# School No. 33 (Qibray District) — website

A fast, multilingual (Uzbek / Russian / English) school website. It is built with [Astro](https://astro.build),
has a simple web editor at `/admin`, includes a contact form, and runs in Docker.

- **Pages:** Home, About, Director's welcome, Statement of community, Staff & leadership, Employment,
  Admissions, Academics, News, Events, Gallery, Contact, Child protection, Privacy policy, 404
- **Languages:** `/uz/…` (default), `/ru/…`, `/en/…`. Opening `/` sends visitors to their browser's language.
- **Search engines:** every page is pre-built HTML with a title, description, canonical URL,
  `hreflang` alternates, Open Graph tags and schema.org data. `sitemap-index.xml` and `robots.txt` are generated.
- **Performance:** no JavaScript framework is shipped to visitors. The few small scripts (menu, scroll animations,
  lightbox, form) are inlined. Images are lazy-loaded, and the Onest font is self-hosted.

School details (address, phone, email, director, student and teacher figures) come from the school’s public profile in the Ministry of Preschool and School Education system. Check them with the school and update them through the editor or the Markdown files.

---

## Quick start (developers)

```bash
npm install
npm run dev          # http://localhost:4321
npm run build        # production build into dist/
npm start            # run the production build
npm run check        # type-check
```

Requires **Node.js 22.12+ with npm 10+**. Install Node from [nodejs.org](https://nodejs.org) or with
[nvm](https://github.com/nvm-sh/nvm) (`nvm install 22`). The `npm` package from Debian/Ubuntu `apt` (npm 9.x) is too old
and can hang during `npm install`.

## Project structure

```
public/
  admin/             Web editor settings (Decap CMS config.yml + preview styles)
  uploads/           Images uploaded through the editor
src/
  content/           ← ALL TEXT CONTENT (Markdown / JSON)
    home/<lang>/index.md
    pages/<lang>/*.md        about, directors-welcome, admissions, …
    news/<lang>/*.md
    events/<lang>/*.md
    staff/<lang>/*.md
    gallery/<lang>/*.md
    settings/site.json       school name, address, phone, socials, logo
  content.config.ts  Content schemas (which fields each file needs)
  i18n/ui.ts         Interface texts (menu, buttons, labels) in 3 languages
  lib/routes.ts      URL map and navigation menus
  components/        Header, Footer, cards, …
  layouts/           BaseLayout (SEO head), PageLayout (text pages)
  pages/             Routes. [lang]/… are the localized pages; api/… are server endpoints; admin/ is the editor
  styles/global.css  Design tokens (colors, spacing, fonts) and base styles
Dockerfile, docker-compose.yml   Docker image + local compose
deploy/            Production compose, deploy script, nginx config (see DEPLOY.md)
.github/workflows/ Build & deploy pipeline
```

### Brand colors

Defined once in `src/styles/global.css`:

The layout takes cues from commonapp.org: a sky-blue utility bar, pill buttons, a large white headline on a sky
gradient, a lime "steps" block, lime-to-cyan gradient frames, grey card sections and a dark grey footer with a cyan
line drawing. The school building drawing (`src/components/SchoolDrawing.astro`) is original.

| Token | Value | Use |
|---|---|---|
| `--brand` | `#0b6dbd` | blue: links, primary buttons, big numbers |
| `--accent` | `#25c7dd` | cyan: icons and line drawings |
| `--lime` | `#b6d961` | steps block |
| `--sky` | `#8fdfff` | utility bar |
| `--grad-green` / `--grad-blue` | gradients | frames around boxes |

Font: **Onest** for everything. It is self-hosted and covers Uzbek Latin (including `oʻ`, `gʻ`), Cyrillic and English.

Home page blocks are edited in the CMS: *Steps* (numbered 1–4), *Key numbers*, *Boxes* (parents/teachers) and the
contact banner. When a *Hero image* is uploaded, the photo replaces the sky gradient and drawing.

---

## Editing content

### Option A: the web editor (`/admin`)

1. Open `https://<your-domain>/admin/` and click **Login with GitHub**.
2. Choose a section (Pages, News, Events, Staff, Gallery, Settings).
3. Edit. Uzbek and Russian are shown side by side; switch the right column to English with **Writing in RU ▾**.
4. Click **Publish**. The change is saved to the repository, and the site shows it after the next rebuild (see *Deployment*).

Notes:
- **Uzbek is the main language.** If a translation is missing, the Uzbek text is shown in its place.
- **Photos:** upload them once, in the Uzbek column. Other languages use the same photo automatically.
  Empty photo fields show a neat branded placeholder.
- **Logo:** *Settings → School details → Logo*. Until a logo is uploaded, a "33" badge is shown.
- **Draft:** news and events have a *Draft* switch that hides them from the site.
- Upload photos at a reasonable size (JPG/WebP, ideally under 1 MB). Photos straight from a camera or phone
  (5–10 MB) slow the site down. To shrink everything in `public/uploads` that is over 1 MB or larger than 2560 px,
  run `npm run optimize-images` and commit the result. It keeps file names (so pages don't change), fixes rotation,
  and removes hidden camera data such as GPS location.

#### Editing locally without GitHub

```bash
npm run dev       # starts the site on http://localhost:4321
npm run cms       # in a second terminal: local editor backend on :8081 (keep it running)
# open http://localhost:4321/admin and click "Login"
```

Changes are written straight to the files in `src/content/` and appear on the dev site immediately.
Commit and push them with git as usual.

Tips:
- Open the editor at **`localhost`** (not your LAN IP). Local mode only turns on for `localhost`/`127.0.0.1`.
- Astro 7 keeps one dev server per project. If `npm run dev` says *"Dev server already running"*,
  use `npx astro dev stop`, then start it again.

### Option B: editing the files

Each page is a Markdown file with a small header (front matter):

```markdown
---
title: "Director’s welcome"
description: "A message from the Head of School."   # shown under the title and in Google
hero_image: ""                                       # e.g. /uploads/director.jpg
---

Dear students, parents and guests, …
```

Add a news article by creating `src/content/news/uz/<slug>.md`, and the same file name in `ru/` and `en/` if you
have translations. The build stops with a clear message if a required field is missing.

Interface texts (menu items, button labels, form labels) are in `src/i18n/ui.ts`.

---

## Contact form

The form posts to `/api/contact`, which sends an email over SMTP. Configure it in `.env`:

```
SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, CONTACT_TO, CONTACT_FROM
```

Without `SMTP_HOST`, messages are only printed to the server log, which is handy for testing.
Spam protection: a hidden honeypot field, an origin check, and a limit of 5 messages per IP every 10 minutes.
The form also works with JavaScript disabled.

## Web editor login (GitHub OAuth)

Editors sign in with their GitHub account. The site itself handles the login (`/api/auth`, `/api/callback`),
so no third-party service is needed.

1. GitHub → **Settings → Developer settings → OAuth Apps → New OAuth App**
   - Homepage URL: `https://<your-domain>`
   - Authorization callback URL: `https://<your-domain>/api/callback`
2. Put the **Client ID** and a new **Client secret** in `.env` (`GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`).
3. Give every editor **write access** to the `Abduzim/school33-site` repository.
4. The editor saves to the `main` branch (set in `src/pages/admin/index.astro` and `public/admin/config.yml`).

---

## Database (PostgreSQL)

Contact-form messages are saved in PostgreSQL when `DATABASE_URL` is set (table `contact_messages`,
created automatically). Email via SMTP still works alongside it; a message counts as delivered if at least one of
them succeeds. `GET /api/health` returns `{"ok":true,"db":"ok"}` when the database is reachable.

Local setup: `createdb school33`, then put `DATABASE_URL=postgresql://<you>@localhost:5432/school33` in `.env`.
`npm run dev` and `npm start` read `.env` automatically. To read messages:
`psql school33 -c "select * from contact_messages order by created_at desc"`.

## Deployment (Render, free)

1. Create a free PostgreSQL database on [neon.tech](https://neon.tech) and copy its connection string.
2. On [render.com](https://render.com): **New → Blueprint**, pick this GitHub repository. `render.yaml` sets everything up.
   Paste the connection string into `DATABASE_URL` when asked.
3. If the service address is not `https://school33-qibray.onrender.com`, update `SITE_URL` in Render and in `render.yaml`.

Every push to `main` (including **Publish** in `/admin`) redeploys the site.

## Deployment (own VPS, legacy)

The files in `deploy/` and `DEPLOY.md` describe an older VPS setup written for school28.uz. Its GitHub Actions
workflow is kept as `deploy/github-actions-vps-deploy.yml.example` and is not active.

Production runs on the VPS behind the existing edge nginx, and is deployed automatically from GitHub:
**push to `main` → GitHub Actions builds the image → Docker Hub (`nazacd/school28-web`) → the VPS pulls and restarts it.**
Publishing in `/admin` is a push to `main` too, so content changes go live on their own within a few minutes.

The step-by-step setup (secrets, deploy key, nginx and certificate) is in **[DEPLOY.md](DEPLOY.md)**.

To run the production image locally:

```bash
cp .env.example .env
docker compose up -d --build     # http://localhost:4321
```
