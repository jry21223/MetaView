# SEO / GEO public discovery contract

Status: Active

MetaView exposes public learning pages to search engines and answer engines
without making private application routes indexable. The browser and generated
HTML shells share the route policy in `apps/web/src/app/seoConfig.ts`.

## Public indexing boundary

The only indexable routes are:

- `/`;
- `/templates`;
- `/templates/:templateId` entries backed by a published `previewCaseId`.

Pending template routes use `noindex, follow` when requested. Workbench,
history, settings, payment, admin, asset-showcase, unknown, and legacy redirect
shells do not publish canonical URLs or structured data and use `noindex`
policies.

The standard Nginx image serves the generated `/__spa__/index.html` noindex
shell when no concrete static route exists. Dynamic workbench URLs such as
`/run/:runId` and unknown URLs therefore cannot inherit the home page canonical
metadata before the client router starts.

`PlaybookScript` remains the only rendering contract. The HTML fallback is a
semantic loading/indexing surface for existing public pages, not an alternate
lesson renderer or video path.

## Metadata and structured data

`SeoManager` updates title, description, robots directives, canonical URL,
Open Graph, Twitter card, and JSON-LD when the browser route changes.

The build then runs `seo:generate` to emit route-aware HTML shells. Public
pages use `WebSite`, `SoftwareApplication`, `CollectionPage`, `ItemList`, and
`LearningResource` schema.org types. The generated fallback preserves real
headings, descriptions, prompts, and links when JavaScript has not loaded.

## Required public URL configuration

Set `VITE_PUBLIC_SITE_URL` to the public HTTPS origin before a production-like
build. An optional deployment base path is supported, for example:

```text
VITE_PUBLIC_SITE_URL=https://learn.example/metaview/
```

With an absolute HTTP(S) value, the build emits absolute canonical/social URLs,
`dist/sitemap.xml`, and a `Sitemap:` entry in `dist/robots.txt`. Without it, the
application still builds and route metadata resolves against the browser
origin, but no sitemap is generated; do not treat that mode as release-ready
SEO evidence.

The web Dockerfile accepts the same value as a build argument, and
`docker-compose.yml` forwards it from the operator environment. It is a build
time value; changing a running container environment does not rewrite static
metadata.

## Verification

Run the focused policy tests and a production-like build:

```bash
npm --workspace apps/web run test -- SeoManager.test.tsx --run
VITE_PUBLIC_SITE_URL=https://metaview.example npm --workspace apps/web run build
```

Inspect at least the home page, catalogue, one published template, one pending
template, and one private route in `apps/web/dist/`. Confirm canonical URLs,
robots directives, JSON-LD, fallback links, `sitemap.xml`, and `robots.txt` all
agree with the route policy. Generated `dist/` files are verification output
and remain ignored.
