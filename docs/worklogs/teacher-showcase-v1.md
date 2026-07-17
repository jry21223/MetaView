# Teacher Showcase V1 Worklog

Status: PR 1 validated; Draft PR pending

## Baseline

- Base commit: `f62d88171a0dc6a90996aad46462e5bf6ed0851b` (`origin/main` on 2026-07-13).
- Working branch: `codex/intake-smart-routing-contract`.
- The primary checkout contained unrelated uncommitted changes and was four commits behind
  `origin/main`. PR 1 therefore uses a separate clean worktree; none of those changes are
  copied, modified, staged, or published.
- PR #123 (`docs: rewrite README for product positioning`): open Draft, clean merge state.
  Root `README.md` is out of scope until that PR lands.
- PR #124 (`fix(web): preserve studio theme and isolate hidden landing panels`): open Draft,
  clean merge state. PR 1 starts from `origin/main` because its Intake contract does not depend
  on the Landing changes; later public-route/Landing phases must resolve that dependency.

## Environment

- macOS Darwin 25.5.0 arm64.
- Node.js 22.18.0; npm 10.9.3.
- Python 3.14.4 in the ignored worktree-local `.venv`.
- Dependencies installed from `package-lock.json` and `apps/api/requirements-dev.txt`.
- npm reported that two agent packages declare Node `>=22.19.0`; installation still completed.

## Baseline commands

### `make check`

- Exit code: 2.
- Ruff: passed.
- API pytest: 946 passed, 0 failed.
- Web Vitest: 956 passed, 10 failed across four files.
- Failing files: `usePipelinePoller.test.tsx` (4), `App.edition.test.tsx` (3),
  `routing.test.tsx` (2), and `OpsDashboardPage.test.tsx` (1).
- Failure shape: full-suite timeouts plus later DOM leakage after timeouts. These failures were
  observed before PR 1 edits and must be rechecked independently and again after implementation.
- The target stopped at Web tests, so Agent/MCP tests and production builds did not run in this
  baseline invocation.
- Existing lint signal: two non-error Fast Refresh warnings in `AlgorithmParamPanel.tsx`.
- Full ignored log: `eval/reports/teacher-showcase-pr1-baseline-check.log`.

### `make visual-check`

- Exit code: 0.
- Asset audit passed.
- Showcase smoke rendered and passed 15 fixtures.
- Showcase baseline and review packet generation passed.
- Full ignored log: `eval/reports/teacher-showcase-pr1-baseline-visual-check.log`.

### `make eval-gold`

- Exit code: 2.
- Recorded Benchmark V2: 0/12 attempts passed.
- This is the documented negative-migration baseline: all four recorded fixtures contain hard
  failures. No threshold, Gold expectation, or fixture was changed.
- No recorded output may be promoted or described as verified.
- Full ignored log: `eval/reports/teacher-showcase-pr1-baseline-eval-gold.log`.

## PR 1 scope and known blockers

- In scope: a single-column `/create` Intake, backend-owned domain routing, nullable language,
  a 256 KB single-code-file contract, request filename/size metadata, focused tests, and direct
  contract documentation.
- Out of scope: `/cases` implementation, public static playback, Benchmark auto-routing mode,
  Promotion, verified case publication, Landing case cards, and Preview deployment.
- Live provider verification is not required for PR 1 and has not been claimed.
- The pre-existing full-Web-suite failures must either pass on rerun or remain explicitly
  documented; PR 1 cannot be described as making `make check` green unless the command exits 0.

## PR 1 implementation

- Replaced the two-column routing-oriented Intake with one quiet 820 px single-column creation
  surface. It contains only the prompt, optional single-file attachment, submit action, three
  prompt-only examples and the stable `/cases` link.
- Removed frontend domain inference and domain/template metadata from `IntakeContext`. Both app
  editions now submit only prompt and optional source evidence.
- Normal Web requests always serialize `domain: null`; text requests serialize nullable source
  fields, while code requests include real language, filename and byte size.
- Made API language nullable end-to-end and removed the implicit Python fallback from CIR and
  Playbook source handling. Added DTO validation for orphan metadata and the 256 KB limit.
- Added focused Web/API/router/coverage/CIR tests for text and code contracts, replacement,
  drag/drop rejection, size/type/read errors, keyboard submission and async deduplication.

Focused verification completed before the final gate:

- Web: 4 files, 34 tests passed.
- API: 4 files, 100 tests passed.

## PR 1 final verification

### `make check`

- Exit code: 0.
- Ruff, Agent lint/typecheck, MCP typecheck and all production builds passed.
- API: 954 tests passed.
- Web: 117 files, 979 tests passed.
- Agent: 63 tests passed.
- MCP server: 18 tests passed.
- ESLint retained only the two pre-existing non-error Fast Refresh warnings in
  `AlgorithmParamPanel.tsx`; PR 1 introduced no new lint warning.
- Full ignored log: `eval/reports/teacher-showcase-pr1-final-check.log`.

### `make visual-check`

- Exit code: 0.
- Asset audit passed; all 15 showcase fixtures passed smoke render, baseline and review packet
  generation.
- Full ignored log: `eval/reports/teacher-showcase-pr1-final-visual-check.log`.

### Browser contract check

- Playwright CLI opened the real Vite `/create` route in light and dark themes and with reduced
  motion enabled.
- Checked 1440x900, 1280x800, 768x1024, 390x844 and 375x812. Every viewport had
  `documentElement.scrollWidth === clientWidth`; title, composer, actions, all three examples and
  `/cases` remained in the first viewport.
- At 390 px and 375 px, upload, submit and example controls measured 44 px high.
- `Ctrl+Enter` on the derivative example produced a captured request with `domain`, `source_code`,
  `language`, filename and size all null. Uploading the repository's `main.py` produced
  `domain=null`, `language=python`, `source_filename=main.py`, and a byte count matching the
  submitted source.
- The local browser run intentionally had no API process, so submission ended in the accessible
  error state after the request contract was captured. No provider or live-generation evidence
  is claimed by PR 1.

### Remaining phase boundary

- The recorded `make eval-gold` baseline remains 0/12 because all four repository fixtures carry
  documented hard failures. PR 1 does not alter Gold thresholds, fixtures or verified labels.
- PR 2–PR 4 remain unstarted. In particular, `/cases` is only a stable link target in PR 1 and no
  public case, promotion artifact, Landing card or Preview deployment exists yet.
