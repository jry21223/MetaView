import { afterAll, afterEach, beforeAll } from "vitest";
import { server } from "./server";

// In CI we want unhandled requests to hard-fail so missing mocks don't slip
// past PRs; locally we only warn so iterating on a single test doesn't blow
// up the whole run while sibling code paths are unmocked. (issue #71)
const onUnhandledRequest = process.env.CI ? "error" : "warn";

beforeAll(() => server.listen({ onUnhandledRequest }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
