import { cleanup, render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SeoManager } from "./SeoManager";
import {
  METAVIEW_INDEX_ROBOTS,
  METAVIEW_NOINDEX_FOLLOW_ROBOTS,
  METAVIEW_NOINDEX_ROBOTS,
  PUBLIC_INDEXABLE_PATHS,
  resolvePublicUrl,
  resolveSeoRoute,
} from "./seoConfig";

describe("SeoManager", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
    document.head
      .querySelectorAll('[data-metaview-seo="managed"]')
      .forEach((element) => element.remove());
    document.title = "";
  });

  it("publishes canonical metadata and LearningResource JSON-LD for a released case", async () => {
    vi.stubEnv("VITE_PUBLIC_SITE_URL", "https://learn.example/metaview/");

    renderSeo("/templates/binary-search");

    await waitFor(() => {
      expect(document.title).toBe("二分查找可视化讲解｜MetaView");
    });
    expect(metaContent("name", "robots")).toBe(METAVIEW_INDEX_ROBOTS);
    expect(document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href)
      .toBe("https://learn.example/metaview/templates/binary-search");
    expect(structuredData()?.["@type"]).toBe("LearningResource");
    expect(structuredData()?.name).toBe("二分查找");
  });

  it("keeps private workbench routes out of search indexes", async () => {
    renderSeo("/run/run-1");

    await waitFor(() => {
      expect(metaContent("name", "robots")).toBe(METAVIEW_NOINDEX_ROBOTS);
    });
    expect(document.head.querySelector('link[rel="canonical"]')).toBeNull();
    expect(structuredData()).toBeNull();
  });

  it("marks unpublished template placeholders as noindex while preserving crawlable links", async () => {
    renderSeo("/templates/fib-memo");

    await waitFor(() => {
      expect(metaContent("name", "robots")).toBe(
        METAVIEW_NOINDEX_FOLLOW_ROBOTS,
      );
    });
    expect(document.title).toContain("案例制作中");
    expect(document.head.querySelector('link[rel="canonical"]')).toBeNull();
  });

  it("describes the public template index as a CollectionPage", async () => {
    renderSeo("/templates");

    await waitFor(() => {
      expect(structuredData()?.["@type"]).toBe("CollectionPage");
    });
    const mainEntity = structuredData()?.mainEntity as
      | Record<string, unknown>
      | undefined;
    expect(mainEntity?.["@type"]).toBe("ItemList");
  });

  it("normalizes trailing slashes before resolving route policy", () => {
    expect(resolveSeoRoute("/templates/binary-search/").kind).toBe("template");
    expect(resolveSeoRoute("/settings/").kind).toBe("private");
  });

  it("keeps every sitemap route unique, canonical, and indexable", () => {
    expect(new Set(PUBLIC_INDEXABLE_PATHS).size).toBe(
      PUBLIC_INDEXABLE_PATHS.length,
    );

    for (const pathname of PUBLIC_INDEXABLE_PATHS) {
      const route = resolveSeoRoute(pathname);
      expect(route.indexable, pathname).toBe(true);
      expect(route.canonicalPath, pathname).toBe(pathname);
      expect(route.robots, pathname).toBe(METAVIEW_INDEX_ROBOTS);
    }
  });

  it("preserves an explicitly configured deployment base path", () => {
    expect(
      resolvePublicUrl(
        "/templates/binary-search",
        "https://learn.example/metaview/",
      ),
    ).toBe("https://learn.example/metaview/templates/binary-search");
  });
});

function renderSeo(pathname: string) {
  return render(
    <MemoryRouter initialEntries={[pathname]}>
      <SeoManager />
    </MemoryRouter>,
  );
}

function metaContent(attribute: "name" | "property", key: string) {
  return document.head
    .querySelector<HTMLMetaElement>(`meta[${attribute}="${key}"]`)
    ?.getAttribute("content");
}

function structuredData(): Record<string, unknown> | null {
  const content = document.head.querySelector<HTMLScriptElement>(
    "script#metaview-structured-data",
  )?.textContent;
  return content ? JSON.parse(content) as Record<string, unknown> : null;
}
