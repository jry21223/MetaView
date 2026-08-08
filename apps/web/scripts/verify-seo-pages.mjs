import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const distDirectory = path.resolve(scriptDirectory, "..", "dist");
const siteBase = process.env.VITE_PUBLIC_SITE_URL?.trim() ?? "";

const homeHtml = await readRoute("/");
assertIncludes(homeHtml, 'name="robots" content="index, follow,', "home indexing policy");
assertIncludes(homeHtml, 'rel="canonical"', "home canonical URL");
assertIncludes(homeHtml, 'id="metaview-structured-data"', "home structured data");

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
  assertIncludes(robots, "Sitemap:", "robots sitemap declaration");
  assertIncludes(sitemap, "<urlset", "sitemap document");
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

function isAbsoluteHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}
