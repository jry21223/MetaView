import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { TEMPLATES } from "../src/pages/Templates/templates.ts";
import {
  METAVIEW_DEFAULT_IMAGE_PATH,
  PUBLISHED_TEMPLATES,
  PUBLIC_INDEXABLE_PATHS,
  isAbsoluteHttpUrl,
  resolvePublicUrl,
} from "../src/app/seoConfig.ts";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const distDirectory = path.resolve(scriptDirectory, "..", "dist");
const siteBase = process.env.VITE_PUBLIC_SITE_URL?.trim() ?? "";

const homeHtml = await readRoute("/");
assertIncludes(homeHtml, 'name="robots" content="index, follow,', "home indexing policy");
assertIncludes(homeHtml, canonicalTag("/"), "home canonical URL");
assertIncludes(homeHtml, openGraphUrl("/"), "home social URL");
assertIncludes(
  homeHtml,
  `content="${resolvePublicUrl(METAVIEW_DEFAULT_IMAGE_PATH, siteBase)}"`,
  "home social image",
);
assertIncludes(homeHtml, 'id="metaview-structured-data"', "home structured data");
assertIncludes(homeHtml, '"@type":"WebSite"', "home schema type");

const catalogueHtml = await readRoute("/templates");
assertIncludes(catalogueHtml, canonicalTag("/templates"), "catalogue canonical URL");
assertIncludes(catalogueHtml, '"@type":"CollectionPage"', "catalogue schema type");
assertIncludes(catalogueHtml, '"@type":"ItemList"', "catalogue item list");

for (const template of PUBLISHED_TEMPLATES) {
  assertIncludes(
    catalogueHtml,
    `href="${resolvePublicUrl(`/templates/${template.id}`, siteBase)}"`,
    `catalogue link for ${template.id}`,
  );
}

const publishedTemplate = PUBLISHED_TEMPLATES[0];
if (!publishedTemplate) throw new Error("Expected at least one published template");
const publishedPath = `/templates/${publishedTemplate.id}`;
const publishedHtml = await readRoute(publishedPath);
assertIncludes(publishedHtml, 'name="robots" content="index, follow,', "published template policy");
assertIncludes(publishedHtml, canonicalTag(publishedPath), "published template canonical URL");
assertIncludes(publishedHtml, openGraphUrl(publishedPath), "published template social URL");
assertIncludes(publishedHtml, '"@type":"LearningResource"', "published template schema type");
assertIncludes(
  publishedHtml,
  `href="${resolvePublicUrl(publishedPath, siteBase)}"`,
  "published template fallback link",
);

const pendingTemplate = TEMPLATES.find((template) => !template.previewCaseId);
if (!pendingTemplate) throw new Error("Expected at least one pending template");
const pendingHtml = await readRoute(`/templates/${pendingTemplate.id}`);
assertIncludes(pendingHtml, 'content="noindex, follow"', "pending template policy");
assertExcludes(pendingHtml, 'rel="canonical"', "pending template canonical URL");
assertExcludes(pendingHtml, 'id="metaview-structured-data"', "pending template structured data");

const privateHtml = await readRoute("/run");
assertIncludes(privateHtml, 'content="noindex, nofollow"', "private route policy");
assertExcludes(privateHtml, 'rel="canonical"', "private canonical URL");
assertExcludes(privateHtml, 'id="metaview-structured-data"', "private structured data");

const fallbackHtml = await readRoute("/__spa__");
assertIncludes(fallbackHtml, 'content="noindex, nofollow"', "SPA fallback policy");
assertExcludes(fallbackHtml, 'rel="canonical"', "SPA fallback canonical URL");
assertExcludes(fallbackHtml, 'id="metaview-structured-data"', "SPA fallback structured data");
assertIncludes(fallbackHtml, 'rel="stylesheet"', "fallback stylesheet relation");
assertIncludes(fallbackHtml, "boot-fallback.css", "fallback stylesheet URL");

const nginxConfig = await readFile(
  path.resolve(scriptDirectory, "..", "nginx.conf"),
  "utf8",
);
assertIncludes(
  nginxConfig,
  "try_files $uri $uri/ /__spa__/index.html;",
  "Nginx noindex SPA fallback",
);

if (isAbsoluteHttpUrl(siteBase)) {
  const robots = await readFile(path.join(distDirectory, "robots.txt"), "utf8");
  const sitemap = await readFile(path.join(distDirectory, "sitemap.xml"), "utf8");
  const sitemapUrl = resolvePublicUrl("/sitemap.xml", siteBase);
  assertIncludes(robots, `Sitemap: ${sitemapUrl}`, "robots sitemap declaration");
  const actualLocations = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)]
    .map((match) => match[1]);
  const expectedLocations = PUBLIC_INDEXABLE_PATHS.map((routePath) =>
    resolvePublicUrl(routePath, siteBase));
  assertEqualList(actualLocations, expectedLocations, "sitemap public URL set");
}

console.log("Verified generated SEO route shells and crawler contracts.");

async function readRoute(routePath) {
  const filePath = routePath === "/"
    ? path.join(distDirectory, "index.html")
    : path.join(distDirectory, routePath.replace(/^\/+/, ""), "index.html");
  return readFile(filePath, "utf8");
}

function assertIncludes(value, expected, label) {
  if (!value.includes(expected)) {
    throw new Error(`Missing ${label}: ${expected}`);
  }
}

function assertExcludes(value, unexpected, label) {
  if (value.includes(unexpected)) {
    throw new Error(`Unexpected ${label}: ${unexpected}`);
  }
}

function canonicalTag(routePath) {
  return `rel="canonical" href="${resolvePublicUrl(routePath, siteBase)}"`;
}

function openGraphUrl(routePath) {
  return `property="og:url" content="${resolvePublicUrl(routePath, siteBase)}"`;
}

function assertEqualList(actual, expected, label) {
  if (
    actual.length !== expected.length
    || actual.some((value, index) => value !== expected[index])
  ) {
    throw new Error(
      `${label} mismatch:\nactual=${JSON.stringify(actual)}\nexpected=${JSON.stringify(expected)}`,
    );
  }
}
