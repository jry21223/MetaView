import { afterAll, afterEach, beforeAll } from "vitest";
import { server } from "./server";

function createStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    },
  };
}

function ensureStorage(name: "localStorage" | "sessionStorage") {
  const current = globalThis[name] as Storage | undefined;
  if (
    current &&
    typeof current.clear === "function" &&
    typeof current.getItem === "function" &&
    typeof current.setItem === "function"
  ) {
    return;
  }
  Object.defineProperty(globalThis, name, {
    configurable: true,
    value: createStorage(),
  });
}

ensureStorage("localStorage");
ensureStorage("sessionStorage");

// In CI we want unhandled requests to hard-fail so missing mocks don't slip
// past PRs; locally we only warn so iterating on a single test doesn't blow
// up the whole run while sibling code paths are unmocked. (issue #71)
const onUnhandledRequest = process.env.CI ? "error" : "warn";

beforeAll(() => server.listen({ onUnhandledRequest }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
