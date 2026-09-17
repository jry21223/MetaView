# Browser acceptance

The Browser E2E workflow runs Chromium against a fresh self-edition build and an
isolated FastAPI/SQLite instance. It neither deploys nor merges the PR.

## Run locally

```bash
npm ci
python3 -m venv .venv
.venv/bin/pip install -r apps/api/requirements-dev.txt
npx playwright install --with-deps chromium
npm --workspace apps/web run template-previews:export
(cd apps/web && PATH="$PWD/../../.venv/bin:$PATH" npx playwright test --config playwright.e2e.config.ts)
npm --workspace apps/web run test:visual:conics
```

Ports 4173 and 8000 must be free. Existing servers are not reused by the core
acceptance suite. Each launch uses its own database under ignored `data/e2e/`.
Reports, screenshots and failure traces stay under ignored `eval/reports/` and
`eval/shots/`; CI retains them for seven days.

## Coverage and boundaries

- The exporter distinguishes registered fixtures from published catalog routes.
  Each published case is stepped through on desktop and narrow touch mobile;
  controls present on the opening step, reset and a local followup are exercised.
  Intentionally hidden fixtures must retain their unavailable-route behavior.
- A deterministic BFS prompt crosses the real browser/API/persistence boundary.
  Explanation-only followup, a title patch, reload and history reopening are
  verified. The first explanation is seeded via HTTP to exercise existing
  self-edition history without configuring a real browser Provider.
- A clearly labelled seeded derivative run exercises interaction-version saving
  and the export dialog's persisted-version guard. It is not generated output.
- Parameter changes issued through local followups must reset to defaults.
- Six conic cases use the existing fourteen viewport/theme combinations.

No real model or TTS provider is called. The fixture LLM is injected only into the
explicitly gated test server, and browser requests to external hosts are blocked.
The real renderer is used for playback, but these tests do not start MP4 renders.
Production deployment identity, OAuth, payments, live model quality and real
mobile Safari remain separate acceptance requirements.
