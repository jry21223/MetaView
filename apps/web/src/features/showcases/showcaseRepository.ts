import {
  assertSafeShowcaseSlug,
  parseShowcaseCase,
  safeParseShowcaseManifest,
  type ShowcaseCase,
  type ShowcaseManifest,
  type ShowcaseManifestEntry,
} from "./showcaseSchema";

const SHOWCASES_ROOT = "/showcases";

export class ShowcaseLoadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ShowcaseLoadError";
  }
}

function staticUrl(path: string): string {
  if (!path.startsWith(`${SHOWCASES_ROOT}/`) || path.includes("..") || path.includes("\\")) {
    throw new ShowcaseLoadError("案例资源地址无效。");
  }
  return path;
}

async function readJson(url: string, fetcher: typeof fetch): Promise<unknown> {
  let response: Response;
  try {
    response = await fetcher(url, { headers: { Accept: "application/json" } });
  } catch {
    throw new ShowcaseLoadError("精选案例暂时无法加载，请稍后再试。");
  }
  if (!response.ok) {
    throw new ShowcaseLoadError("精选案例暂时无法加载，请稍后再试。");
  }
  try {
    return await response.json();
  } catch {
    throw new ShowcaseLoadError("案例数据格式无效。");
  }
}

export async function fetchShowcaseManifest(fetcher: typeof fetch = fetch): Promise<ShowcaseManifest> {
  const parsed = safeParseShowcaseManifest(
    await readJson(`${SHOWCASES_ROOT}/manifest.json`, fetcher),
  );
  if (!parsed.success) throw new ShowcaseLoadError("案例清单格式无效。");
  return parsed.data;
}

export async function fetchShowcaseCase(
  entry: ShowcaseManifestEntry,
  fetcher: typeof fetch = fetch,
): Promise<ShowcaseCase> {
  assertSafeShowcaseSlug(entry.slug);
  const parsed = parseShowcaseCase(await readJson(staticUrl(entry.metaUrl), fetcher));
  if (parsed.visibility !== "public" || parsed.id !== entry.id || parsed.slug !== entry.slug) {
    throw new ShowcaseLoadError("案例清单与详情不一致。");
  }
  return parsed;
}

export async function fetchShowcaseBySlug(
  slug: string,
  fetcher: typeof fetch = fetch,
): Promise<ShowcaseCase | null> {
  assertSafeShowcaseSlug(slug);
  const manifest = await fetchShowcaseManifest(fetcher);
  const entry = manifest.cases.find((candidate) => candidate.slug === slug);
  if (!entry) return null;
  return fetchShowcaseCase(entry, fetcher);
}

export async function fetchShowcaseJson(
  path: string,
  fetcher: typeof fetch = fetch,
): Promise<unknown> {
  return readJson(staticUrl(path), fetcher);
}
