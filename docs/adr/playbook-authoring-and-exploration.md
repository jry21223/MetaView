# ADR: Structured authoring and element-addressed exploration

Status: Accepted by the user on 2026-11-04; implementation is incremental.

## Context

The rendering contract describes steps and snapshots, while creation and follow-up need stable works, elements and recoverable state. Domain-specific interaction unions cannot represent arbitrary creative composition. Public sharing adds a trust boundary independent of rendering.

## Decision

- Add a structured source document above PlaybookScript. Keep PlaybookScript as the only rendering output; no HTML or iframe output path.
- Put framework-free contracts and deterministic state handling below features. Inject versioned component definitions; core code does not recognize domains.
- Scene, Control and Info instances communicate through declared typed ports and parameters, never by importing one another.
- Separate element identity from semantic-object identity; every authored visible element must be addressable, including nonsemantic labels and axes.
- Snapshots capture actual runtime state, not a tail of interaction events. They are bound to an exact work revision.
- Separate revisions, exploration provenance and visits. Returning restores a visit; it does not mutate the parent's head.
- Publications pin a revision and dependency versions. Public data excludes private conversation and provenance by explicit projection. Public access never grants editing or creator AI credentials.
- Generated executable code is outside this implementation. A future isolated-code adapter requires a separate decision and security acceptance.

## Trade-off

A structured document constrains immediate arbitrary-code freedom but gives deterministic validation, export and identity. Extensibility lives in registered component definitions rather than new domain branches. Old works need not be supported, but existing production entry points are not switched until an integration slice is verified.

## Consequences

The new core can be tested without React, a model or network. Existing renderers are consumers, not owners, of authoring state. Model generation, UI picking and public hosting remain separate integration responsibilities; core tests alone cannot establish their security.
