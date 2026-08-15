import {
  TEMPLATES,
  TEMPLATE_DOMAIN_LABEL,
  type TemplateDef,
} from "../pages/Templates/templates";

export const METAVIEW_BRAND_NAME = "MetaView 教育可视化平台";
export const METAVIEW_ENTITY_NAME = "演算视界 MetaView";
export const METAVIEW_DEFAULT_DESCRIPTION =
  "MetaView 将数学、算法、物理等知识转化为可分步播放、可调参数、可追问并可导出的交互式可视化讲解。";
export const METAVIEW_DEFAULT_IMAGE_PATH = "/brand/metaview-og-image.png";
export const METAVIEW_INDEX_ROBOTS =
  "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1";
export const METAVIEW_NOINDEX_ROBOTS = "noindex, nofollow";
export const METAVIEW_NOINDEX_FOLLOW_ROBOTS = "noindex, follow";

export type SeoPageKind =
  | "home"
  | "templates"
  | "template"
  | "private"
  | "pending-template"
  | "not-found";

export interface SeoRouteConfig {
  kind: SeoPageKind;
  title: string;
  description: string;
  canonicalPath: string | null;
  robots: string;
  indexable: boolean;
  template?: TemplateDef;
}

export const PUBLISHED_TEMPLATES = Object.freeze(
  TEMPLATES.filter(
    (template): template is TemplateDef & { previewCaseId: NonNullable<TemplateDef["previewCaseId"]> } =>
      Boolean(template.previewCaseId),
  ),
);

export const PUBLIC_INDEXABLE_PATHS = Object.freeze([
  "/",
  "/templates",
  ...PUBLISHED_TEMPLATES.map((template) => `/templates/${template.id}`),
]);

const PRIVATE_ROUTE_PREFIXES = [
  "/admin",
  "/asset-showcase",
  "/create",
  "/history",
  "/payment",
  "/run",
  "/settings",
] as const;

export function normalizeSeoPath(pathname: string): string {
  const path = pathname.startsWith("/") ? pathname : `/${pathname}`;
  if (path === "/") return path;
  return path.replace(/\/+$/, "") || "/";
}

export function resolveSeoRoute(pathname: string): SeoRouteConfig {
  const path = normalizeSeoPath(pathname);

  if (path === "/") {
    return {
      kind: "home",
      title: "MetaView 教育可视化平台｜让理解过程被看见",
      description: METAVIEW_DEFAULT_DESCRIPTION,
      canonicalPath: "/",
      robots: METAVIEW_INDEX_ROBOTS,
      indexable: true,
    };
  }

  if (path === "/templates") {
    return {
      kind: "templates",
      title: "数学、算法与理科交互式可视化案例｜MetaView",
      description:
        "浏览 MetaView 的数学、算法、物理、化学、生物和地理交互式讲解案例，逐步查看公式、代码、参数和画面如何同步变化。",
      canonicalPath: "/templates",
      robots: METAVIEW_INDEX_ROBOTS,
      indexable: true,
    };
  }

  if (path.startsWith("/templates/")) {
    const templateId = path.slice("/templates/".length);
    const template = TEMPLATES.find((item) => item.id === templateId);
    if (template?.previewCaseId) {
      const domain = TEMPLATE_DOMAIN_LABEL[template.domain];
      return {
        kind: "template",
        title: `${template.title}可视化讲解｜MetaView`,
        description: `${template.desc}。通过 MetaView 的${domain}交互式讲解，分步查看关键状态、参数变化与推导过程。`,
        canonicalPath: path,
        robots: METAVIEW_INDEX_ROBOTS,
        indexable: true,
        template,
      };
    }

    return {
      kind: "pending-template",
      title: template
        ? `${template.title}案例制作中｜MetaView`
        : "案例暂未发布｜MetaView",
      description: template
        ? `${template.title}交互式讲解仍在制作中，请先浏览已经发布的 MetaView 案例。`
        : "该 MetaView 案例尚未发布，请返回案例目录浏览已完成的交互式讲解。",
      canonicalPath: null,
      robots: METAVIEW_NOINDEX_FOLLOW_ROBOTS,
      indexable: false,
      template,
    };
  }

  if (PRIVATE_ROUTE_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) {
    return {
      kind: "private",
      title: privateRouteTitle(path),
      description: "MetaView 应用工作台页面。该页面不进入公开搜索索引。",
      canonicalPath: null,
      robots: METAVIEW_NOINDEX_ROBOTS,
      indexable: false,
    };
  }

  return {
    kind: "not-found",
    title: "页面未找到｜MetaView",
    description: "该页面不存在或已移动，请返回 MetaView 首页或公开案例目录。",
    canonicalPath: null,
    robots: METAVIEW_NOINDEX_ROBOTS,
    indexable: false,
  };
}

export function resolvePublicUrl(pathname: string, siteBase: string): string {
  const normalizedPath = normalizeSeoPath(pathname);
  const configured = siteBase.trim();

  if (!configured) return normalizedPath;

  try {
    const base = new URL(configured.endsWith("/") ? configured : `${configured}/`);
    const relative = normalizedPath === "/" ? "" : normalizedPath.replace(/^\/+/, "");
    return new URL(relative, base).toString();
  } catch {
    return normalizedPath;
  }
}

export function isAbsoluteHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function buildStructuredData(
  route: SeoRouteConfig,
  canonicalUrl: string,
  imageUrl: string,
): Record<string, unknown> | null {
  const publisher = {
    "@type": "Organization",
    name: METAVIEW_ENTITY_NAME,
    url: canonicalUrlForHome(canonicalUrl, route.canonicalPath),
  };

  if (route.kind === "home") {
    return {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "WebSite",
          name: METAVIEW_BRAND_NAME,
          alternateName: METAVIEW_ENTITY_NAME,
          url: canonicalUrl,
          description: route.description,
          inLanguage: "zh-CN",
          publisher,
        },
        {
          "@type": "SoftwareApplication",
          name: METAVIEW_ENTITY_NAME,
          applicationCategory: "EducationalApplication",
          operatingSystem: "Web",
          url: canonicalUrl,
          description: route.description,
          image: imageUrl,
          isAccessibleForFree: true,
          inLanguage: "zh-CN",
          publisher,
        },
      ],
    };
  }

  if (route.kind === "templates") {
    return {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: route.title,
      description: route.description,
      url: canonicalUrl,
      inLanguage: "zh-CN",
      isPartOf: {
        "@type": "WebSite",
        name: METAVIEW_BRAND_NAME,
        url: canonicalUrlForHome(canonicalUrl, route.canonicalPath),
      },
      mainEntity: {
        "@type": "ItemList",
        numberOfItems: PUBLISHED_TEMPLATES.length,
        itemListElement: PUBLISHED_TEMPLATES.map((template, index) => ({
          "@type": "ListItem",
          position: index + 1,
          name: template.title,
          url: replaceCanonicalPath(
            canonicalUrl,
            route.canonicalPath,
            `/templates/${template.id}`,
          ),
        })),
      },
    };
  }

  if (route.kind === "template" && route.template) {
    return {
      "@context": "https://schema.org",
      "@type": "LearningResource",
      name: route.template.title,
      headline: route.title,
      description: route.description,
      url: canonicalUrl,
      image: imageUrl,
      inLanguage: "zh-CN",
      isAccessibleForFree: true,
      learningResourceType: "Interactive visualization",
      educationalUse: ["instruction", "self study"],
      about: [
        TEMPLATE_DOMAIN_LABEL[route.template.domain],
        route.template.title,
      ],
      publisher,
      isPartOf: {
        "@type": "CollectionPage",
        name: "MetaView 交互式可视化案例",
        url: replaceCanonicalPath(
          canonicalUrl,
          route.canonicalPath,
          "/templates",
        ),
      },
    };
  }

  return null;
}

function privateRouteTitle(pathname: string): string {
  if (pathname.startsWith("/create")) return "新建可视化讲解｜MetaView";
  if (pathname.startsWith("/run")) return "可视化讲解工作台｜MetaView";
  if (pathname.startsWith("/history")) return "历史记录｜MetaView";
  if (pathname.startsWith("/settings")) return "设置｜MetaView";
  if (pathname.startsWith("/admin")) return "运营后台｜MetaView";
  if (pathname.startsWith("/payment")) return "支付结果｜MetaView";
  return "MetaView 应用页面";
}

function replaceCanonicalPath(
  canonicalUrl: string,
  currentPath: string | null,
  nextPath: string,
): string {
  if (!currentPath) return nextPath;
  if (canonicalUrl === currentPath) return nextPath;

  try {
    const url = new URL(canonicalUrl);
    const current = normalizeSeoPath(currentPath);
    const basePath = url.pathname.endsWith(current)
      ? url.pathname.slice(0, url.pathname.length - current.length)
      : "/";
    url.pathname = `${basePath.replace(/\/$/, "")}${normalizeSeoPath(nextPath)}`;
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return nextPath;
  }
}

function canonicalUrlForHome(
  canonicalUrl: string,
  currentPath: string | null,
): string {
  return replaceCanonicalPath(canonicalUrl, currentPath, "/");
}
