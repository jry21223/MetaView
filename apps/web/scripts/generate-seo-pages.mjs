import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { TEMPLATES } from "../src/pages/Templates/templates.ts";
import {
  METAVIEW_DEFAULT_IMAGE_PATH,
  PUBLISHED_TEMPLATES,
  PUBLIC_INDEXABLE_PATHS,
  buildStructuredData,
  resolvePublicUrl,
  resolveSeoRoute,
} from "../src/app/seoConfig.ts";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const appDirectory = path.resolve(scriptDirectory, "..");
const distDirectory = path.join(appDirectory, "dist");
const indexPath = path.join(distDirectory, "index.html");
const siteBase = process.env.VITE_PUBLIC_SITE_URL?.trim() ?? "";

const SEO_BLOCK = /<!-- metaview:seo:start -->[\s\S]*?<!-- metaview:seo:end -->/;
const FALLBACK_BLOCK = /<!-- metaview:fallback:start -->[\s\S]*?<!-- metaview:fallback:end -->/;

const privateShellPaths = [
  "/admin",
  "/asset-showcase",
  "/cases",
  "/cases/bfs-tree",
  "/cases/derivative-tangent",
  "/cases/projectile-motion",
  "/create",
  "/history",
  "/payment/result",
  "/run",
  "/settings",
];

const routePaths = [
  "/",
  "/templates",
  ...TEMPLATES.map((template) => `/templates/${template.id}`),
  ...privateShellPaths,
];

const baseHtml = await readFile(indexPath, "utf8");
assertMarker(baseHtml, SEO_BLOCK, "SEO head block");
assertMarker(baseHtml, FALLBACK_BLOCK, "fallback content block");

for (const routePath of routePaths) {
  const html = baseHtml
    .replace(SEO_BLOCK, renderSeoBlock(routePath))
    .replace(FALLBACK_BLOCK, renderFallbackBlock(routePath));
  const outputPath = routePath === "/"
    ? indexPath
    : path.join(distDirectory, routePath.replace(/^\/+/, ""), "index.html");
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, html, "utf8");
}

if (isAbsoluteHttpUrl(siteBase)) {
  await writeFile(
    path.join(distDirectory, "sitemap.xml"),
    renderSitemap(),
    "utf8",
  );
  await injectSitemapIntoRobots();
}

console.log(
  `Generated ${routePaths.length} route-aware HTML shells (${PUBLIC_INDEXABLE_PATHS.length} indexable).`,
);

function renderSeoBlock(routePath) {
  const route = resolveSeoRoute(routePath);
  const canonicalUrl = route.canonicalPath
    ? resolvePublicUrl(route.canonicalPath, siteBase)
    : null;
  const imageUrl = resolvePublicUrl(METAVIEW_DEFAULT_IMAGE_PATH, siteBase);
  const structuredData = canonicalUrl
    ? buildStructuredData(route, canonicalUrl, imageUrl)
    : null;
  const ogType = route.kind === "template" ? "article" : "website";
  const imageAlt = route.template
    ? `${route.template.title}的 MetaView 交互式可视化讲解`
    : "MetaView 教育可视化平台";

  return [
    "<!-- metaview:seo:start -->",
    `    <title>${escapeHtml(route.title)}</title>`,
    `    <meta name="description" content="${escapeAttribute(route.description)}" />`,
    `    <meta name="robots" content="${escapeAttribute(route.robots)}" />`,
    `    <meta name="googlebot" content="${escapeAttribute(route.robots)}" />`,
    `    <meta name="bingbot" content="${escapeAttribute(route.robots)}" />`,
    canonicalUrl
      ? `    <link rel="canonical" href="${escapeAttribute(canonicalUrl)}" />`
      : "",
    "    <meta property=\"og:site_name\" content=\"演算视界 MetaView\" />",
    "    <meta property=\"og:locale\" content=\"zh_CN\" />",
    `    <meta property="og:type" content="${ogType}" />`,
    `    <meta property="og:title" content="${escapeAttribute(route.title)}" />`,
    `    <meta property="og:description" content="${escapeAttribute(route.description)}" />`,
    canonicalUrl
      ? `    <meta property="og:url" content="${escapeAttribute(canonicalUrl)}" />`
      : "",
    `    <meta property="og:image" content="${escapeAttribute(imageUrl)}" />`,
    `    <meta property="og:image:alt" content="${escapeAttribute(imageAlt)}" />`,
    "    <meta name=\"twitter:card\" content=\"summary_large_image\" />",
    `    <meta name="twitter:title" content="${escapeAttribute(route.title)}" />`,
    `    <meta name="twitter:description" content="${escapeAttribute(route.description)}" />`,
    `    <meta name="twitter:image" content="${escapeAttribute(imageUrl)}" />`,
    structuredData
      ? `    <script id="metaview-structured-data" type="application/ld+json">${serializeJsonLd(structuredData)}</script>`
      : "",
    "    <!-- metaview:seo:end -->",
  ].filter(Boolean).join("\n");
}

function renderFallbackBlock(routePath) {
  const route = resolveSeoRoute(routePath);

  if (route.kind === "home") {
    return [
      "<!-- metaview:fallback:start -->",
      "      <main class=\"mv-boot-fallback__content\">",
      "        <p class=\"mv-boot-fallback__eyebrow\">METAVIEW EDUCATION</p>",
      "        <h1>把一道题，变成一段看得见的理解过程。</h1>",
      `        <p>${escapeHtml(route.description)}</p>`,
      "        <nav aria-label=\"MetaView 公开入口\">",
      "          <a href=\"/templates\">浏览交互式案例</a>",
      "          <a href=\"/templates/binary-search\">二分查找可视化</a>",
      "          <a href=\"/templates/derivative-tangent\">导数与切线可视化</a>",
      "        </nav>",
      "        <small>应用正在加载；即使 JavaScript 暂不可用，公开内容仍可被浏览与索引。</small>",
      "      </main>",
      "      <!-- metaview:fallback:end -->",
    ].join("\n");
  }

  if (route.kind === "templates") {
    const links = PUBLISHED_TEMPLATES.map(
      (template) =>
        `          <li><a href="/templates/${escapeAttribute(template.id)}">${escapeHtml(template.title)}</a><span>${escapeHtml(template.desc)}</span></li>`,
    ).join("\n");
    return [
      "<!-- metaview:fallback:start -->",
      "      <main class=\"mv-boot-fallback__content mv-boot-fallback__content--catalog\">",
      "        <p class=\"mv-boot-fallback__eyebrow\">PUBLIC LEARNING CASES</p>",
      "        <h1>数学、算法与理科交互式可视化案例</h1>",
      `        <p>${escapeHtml(route.description)}</p>`,
      "        <ul class=\"mv-boot-fallback__links\">",
      links,
      "        </ul>",
      "        <a class=\"mv-boot-fallback__back\" href=\"/\">返回 MetaView 首页</a>",
      "      </main>",
      "      <!-- metaview:fallback:end -->",
    ].join("\n");
  }

  if (route.kind === "template" && route.template) {
    return [
      "<!-- metaview:fallback:start -->",
      "      <main class=\"mv-boot-fallback__content\">",
      "        <p class=\"mv-boot-fallback__eyebrow\">INTERACTIVE LEARNING RESOURCE</p>",
      `        <h1>${escapeHtml(route.template.title)}可视化讲解</h1>`,
      `        <p>${escapeHtml(route.description)}</p>`,
      `        <p class="mv-boot-fallback__prompt"><strong>讲解目标：</strong>${escapeHtml(route.template.prompt)}</p>`,
      "        <nav aria-label=\"案例入口\">",
      `          <a href="${escapeAttribute(routePath)}">进入完整交互案例</a>`,
      "          <a href=\"/templates\">浏览全部案例</a>",
      "        </nav>",
      "        <small>播放器正在加载。MetaView 会同步呈现步骤、画面、公式或代码状态。</small>",
      "      </main>",
      "      <!-- metaview:fallback:end -->",
    ].join("\n");
  }

  return [
    "<!-- metaview:fallback:start -->",
    "      <main class=\"mv-boot-fallback__content\">",
    `        <h1>${escapeHtml(route.title)}</h1>`,
    `        <p>${escapeHtml(route.description)}</p>`,
    "        <nav aria-label=\"MetaView 公开入口\">",
    "          <a href=\"/\">返回首页</a>",
    "          <a href=\"/templates\">浏览公开案例</a>",
    "        </nav>",
    "      </main>",
    "      <!-- metaview:fallback:end -->",
  ].join("\n");
}

function renderSitemap() {
  const urls = PUBLIC_INDEXABLE_PATHS.map((routePath) => {
    const location = resolvePublicUrl(routePath, siteBase);
    const priority = routePath === "/" ? "1.0" : routePath === "/templates" ? "0.9" : "0.8";
    return [
      "  <url>",
      `    <loc>${escapeXml(location)}</loc>`,
      "    <changefreq>weekly</changefreq>",
      `    <priority>${priority}</priority>`,
      "  </url>",
    ].join("\n");
  }).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

async function injectSitemapIntoRobots() {
  const robotsPath = path.join(distDirectory, "robots.txt");
  let robots = await readFile(robotsPath, "utf8");
  robots = robots
    .split("\n")
    .filter((line) => !line.startsWith("Sitemap:"))
    .join("\n")
    .trimEnd();
  const sitemapUrl = resolvePublicUrl("/sitemap.xml", siteBase);
  await writeFile(robotsPath, `${robots}\n\nSitemap: ${sitemapUrl}\n`, "utf8");
}

function serializeJsonLd(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeAttribute(value) {
  return escapeHtml(value)
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeXml(value) {
  return escapeAttribute(value);
}

function assertMarker(html, pattern, label) {
  if (!pattern.test(html)) {
    throw new Error(`Missing ${label} in dist/index.html`);
  }
}

function isAbsoluteHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}
