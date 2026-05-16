import { setupServer } from "msw/node";
import { handlers } from "./handlers";

/**
 * Vitest-side MSW server. Imported by ``src/mocks/setup.ts`` and exposed so
 * individual tests can call ``server.use(...)`` to layer on per-test fixtures.
 */
export const server = setupServer(...handlers);
