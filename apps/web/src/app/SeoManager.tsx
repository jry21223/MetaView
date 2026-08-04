import { useEffect } from "react";
import { useLocation } from "react-router-dom";

import {
  METAVIEW_DEFAULT_IMAGE_PATH,
  METAVIEW_ENTITY_NAME,
  buildStructuredData,
  resolvePublicUrl,
  resolveSeoRoute,
} from "./seoConfig";

const MANAGED_ATTRIBUTE = "data-metaview-seo";
const STRUCTURED_DATA_ID = "metaview-structured-data";

export function SeoManager() {
  const location = useLocation();

  useEffect(() => {
    const route = resolveSeoRoute(location.pathname);
    const siteBase = resolveSiteBase();
    const canonicalUrl = route.canonicalPath
      ? resolvePublicUrl(route.canonicalPath, siteBase)
      : null;
    const imageUrl = resolvePublicUrl(METAVIEW_DEFAULT_IMAGE_PATH, siteBase);

    document.title = route.title;
    document.documentElement.lang = "zh-CN";

    upsertMeta("name", "description", route.description);
    upsertMeta("name", "robots", route.robots);
    upsertMeta("name", "googlebot", route.robots);
    upsertMeta("name", "bingbot", route.robots);

    upsertMeta("property", "og:site_name", METAVIEW_ENTITY_NAME);
    upsertMeta("property", "og:locale", "zh_CN");
    upsertMeta("property", "og:type", route.kind === "template" ? "article" : "website");
    upsertMeta("property", "og:title", route.title);
    upsertMeta("property", "og:description", route.description);
    upsertMeta("property", "og:image", imageUrl);
    upsertMeta(
      "property",
      "og:image:alt",
      route.template
        ? `${route.template.title}的 MetaView 交互式可视化讲解`
        : "MetaView 教育可视化平台",
    );

    upsertMeta("name", "twitter:card", "summary_large_image");
    upsertMeta("name", "twitter:title", route.title);
    upsertMeta("name", "twitter:description", route.description);
    upsertMeta("name", "twitter:image", imageUrl);

    if (canonicalUrl) {
      upsertLink("canonical", canonicalUrl);
      upsertMeta("property", "og:url", canonicalUrl);
    } else {
      removeManagedLink("canonical");
      removeManagedMeta("property", "og:url");
    }

    const structuredData = canonicalUrl
      ? buildStructuredData(route, canonicalUrl, imageUrl)
      : null;
    upsertStructuredData(structuredData);
  }, [location.pathname]);

  return null;
}

function resolveSiteBase(): string {
  const configured = import.meta.env.VITE_PUBLIC_SITE_URL?.trim();
  if (configured) return configured;

  if (typeof window === "undefined") return "";

  const basePath = import.meta.env.BASE_URL || "/";
  return new URL(basePath, window.location.origin).toString();
}

function upsertMeta(
  attribute: "name" | "property",
  key: string,
  content: string,
): void {
  const selector = `meta[${attribute}="${key}"]`;
  const existing = document.head.querySelector<HTMLMetaElement>(selector);
  const element = existing ?? document.createElement("meta");
  element.setAttribute(attribute, key);
  element.setAttribute("content", content);
  element.setAttribute(MANAGED_ATTRIBUTE, "managed");
  if (!existing) document.head.append(element);
}

function removeManagedMeta(
  attribute: "name" | "property",
  key: string,
): void {
  document.head
    .querySelector<HTMLMetaElement>(`meta[${attribute}="${key}"]`)
    ?.remove();
}

function upsertLink(rel: string, href: string): void {
  const existing = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  const element = existing ?? document.createElement("link");
  element.setAttribute("rel", rel);
  element.setAttribute("href", href);
  element.setAttribute(MANAGED_ATTRIBUTE, "managed");
  if (!existing) document.head.append(element);
}

function removeManagedLink(rel: string): void {
  document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`)?.remove();
}

function upsertStructuredData(
  structuredData: Record<string, unknown> | null,
): void {
  const existing = document.head.querySelector<HTMLScriptElement>(
    `script#${STRUCTURED_DATA_ID}`,
  );

  if (!structuredData) {
    existing?.remove();
    return;
  }

  const element = existing ?? document.createElement("script");
  element.id = STRUCTURED_DATA_ID;
  element.type = "application/ld+json";
  element.textContent = JSON.stringify(structuredData).replace(/</g, "\\u003c");
  element.setAttribute(MANAGED_ATTRIBUTE, "managed");
  if (!existing) document.head.append(element);
}
