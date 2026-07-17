# Agent Development Rules

These rules are for coding agents working in this repository. Follow the user's
direct instructions first, then this file, then the rest of the repo docs.

## Work From Evidence

- Start by reading the actual files, commands, schemas, and git state. Do not
  guess from memory when the repo can answer the question.
- Separate confirmed facts from inference. If evidence is missing, say so and
  skip claims that cannot be proven.
- For reviews and bug scans, only report issues backed by concrete repository
  evidence: file paths, line references, test output, logs, or reproducible
  behavior.
- Keep the change small unless the user explicitly asks for a broader refactor.

## Protect The Worktree

- Run `git status --short --branch` before editing.
- Treat existing changes as user-owned unless you made them in this turn. Do not
  revert, overwrite, format, or stage unrelated files.
- If a file already has unrelated edits, read it carefully and make the smallest
  compatible change.
- Stage only the files required for the current task. Never stage broad paths
  such as `.` when unrelated changes exist.

## Git Ignore Discipline

- Check `.gitignore` before creating local artifacts. Verification output,
  caches, screenshots, videos, SQLite files, secrets, and machine-local config
  must stay out of Git.
- Prefer ignored locations for generated evidence:
  `data/`, `eval/reports/`, `eval/videos/`, and `eval/shots/`.
- Do not commit real secrets or local config: `.env`, `.env.*`,
  `.claude/LOCAL_RULES.md`, local deployment scripts, database files, or export
  media.
- `.env.example` is the committed contract for environment variables. Update it
  when adding public configuration keys.
- If a generated artifact is important enough to version, move the durable
  information into `docs/` or explain clearly why the artifact itself must be
  tracked.
- If `.gitignore` itself needs to become tracked after being ignored, use
  `git add -f .gitignore` and do not force-add any other ignored file without a
  specific reason.

## Implementation Rules

- Follow existing architecture and local patterns before inventing new
  abstractions.
- Do not add large generic systems when a narrow deterministic feature solves
  the current problem.
- Keep backend domain code free of external I/O dependencies. Keep application
  logic wired through ports. Keep presentation code at the edge.
- Keep frontend Feature-Sliced boundaries intact: `shared` must not import
  `features` or `pages`, `entities` must not import `features`, and `features`
  should not import each other.
- PlaybookScript is the only rendering contract. Do not introduce Manim, HTML
  iframe rendering, or server-side HTML video rendering as an alternate output
  path.
- New deterministic skills must be added through `SkillPack` packages and
  `build_default_skill_registry()`. Do not add skill-specific branches to
  `RunPipelineUseCase`.

## Frontend Design Contract

- Before changing any `apps/web` UI, layout, styling, interaction, or visible
  copy, read the repository-root `DESIGN.md` in full and inspect the relevant
  runtime theme implementation. Do not start from remembered or generic design
  conventions.
- Treat `DESIGN.md` as the product-design source of truth and reconcile it with
  `shared/config/themePalette.ts`, `themeVars()`, and the affected page CSS. If
  they disagree, do not silently choose one; update the implementation and the
  documentation together or call out the unresolved migration explicitly.
- App-shell and page styles must consume the semantic CSS variables defined by
  the design contract. Do not introduce fixed colors, radii, or motion timings
  in page JSX or CSS when an existing semantic token or documented role applies.
- Validate visual changes at the viewports required by the `DESIGN.md` review
  checklist, including the relevant desktop and mobile sizes.

## Validation

- Match validation to risk. For broad changes, run `make check`.
- For targeted backend work, prefer focused `pytest` plus `ruff` before the full
  check.
- For targeted frontend work, prefer the relevant workspace test or lint command
  before the full build.
- If a verification command fails, report the exact command and the failure
  reason. Do not call the work complete until the failure is resolved or clearly
  marked as pre-existing.

## Git And Release Flow

- Use Conventional Commits when committing.
- Before pushing, run `make check`, then `git fetch origin`, then merge the
  target branch with `git merge origin/main` or the current PR base.
- If the merge changes files or resolves conflicts, rerun `make check` before
  pushing.
- Push only after the worktree state and staged files match the task.

## Final Response

- Summarize what changed, which files were touched, and which verification
  commands passed.
- Mention anything not verified and why.
- Call out remaining risk without inflating certainty.
