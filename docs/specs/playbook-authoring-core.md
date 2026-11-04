# Playbook authoring and continuous exploration

Status: Architecture accepted 2026-11-04. Core implementation slice; integrations below remain open.

## Problem Statement

Creators need to assemble their own interactive works, ask or revise any visible element, extend a work into another and publish a chosen edition. Existing domain-specific interactions and run-local patch history do not provide that common foundation.

## Solution

Use one versioned document and component registry with a deterministic runtime. Give elements stable addresses distinct from knowledge-object references. Capture actual state for element-specific AI actions. Track independent child works and return visits separately. Prepare publications without leaking private context.

## User Stories

1. As a creator, I can combine Scene, Control and Info instances without a domain branch in the core.
2. As a kit author, I can register a new definition with validated configuration, state and ports without editing the runtime.
3. As a creator, I can bind a control output to a parameter consumed by another component.
4. As a reader, I can address a label separately from the knowledge object it names.
5. As a reader, I can target elements without semantic objects.
6. As a reader, I can capture and restore my actual parameters, frame, view and selection.
7. As a creator, I can form an ask, revise or explore request tied to a captured element and exact revision.
8. As a creator, I can keep an independent child work with source context and return to my parent visit.
9. As a creator, I can prepare a public edition that excludes private conversation and exploration history.
10. As a reader, I get explicit errors for stale references, unknown definitions and invalid state.
11. As a maintainer, I can exercise the same public contracts using astronomy and a graph example.

## Implementation Decisions

The agreed test seams are the registry/document loader, runtime dispatch/capture/restore, action construction, exploration navigation and publication projection. Tests exercise those interfaces rather than private helpers.

The state runtime is synchronous and serializable. Exploration orchestration depends on an injected asynchronous provider port, while remaining independent of React, HTTP, real model providers and domain kits. Dependency schemas reject malformed input. Configuration, state, parameters and generated element descriptions are validated; updates are atomic. Definitions are trusted installed code, not executable strings received from the model. Data has bounded size and finite numbers. Public getters return detached values so callers cannot mutate internal snapshots.

First slice supplies numeric, string and boolean parameters; typed control outputs bind to parameters, which are consumed through named inputs. Binding is explicit and one-way; evaluation cannot emit recursive events. Element identifiers are stable within a component instance and carry exact revision and scene identity. Selection surfaces and screen coordinates remain rendering adapters.

The current rendering contract is consumed only by a feature-side bridge. The shared core is generic over renderer output and never imports feature types. Both example kits use the same registry/runtime/action/navigation interfaces. They are deterministic integration examples, not real AI generation or validated scientific simulations.

Publications are prepared data, not authority: HTTP authentication, authorization, asset admission, revocation, cache invalidation and hosting must be implemented and tested before public availability. No API key, conversation, private visit or exploration graph belongs in the publication projection. Public document content itself must be reviewed for intended disclosure.

## Testing Decisions

Tests use public interfaces with real registry definitions and known expected states. Add each behavior red-first, then implement the smallest working slice. Verify strict input validation, mutation isolation, duplicate identifiers, missing dependencies, reference integrity, typed port bindings, atomic failures, exact snapshot restoration and stale-reference rejection. Run one parameterized cross-domain scenario for creation, selection, action construction, extension, return and public preparation. Render both example outputs through the existing composition as an integration check.

## Out of Scope for This Core Slice

- Production endpoint or database changes, deployment and actual publication.
- Real model calls, billing or guarantees about generated content quality.
- The interactive element picker, anchored composer, asynchronous 2–3 hints and their accessibility/browser tests.
- Arbitrary generated-code execution or adoption of Porthole as a rendering path.
- Migrating existing works or replacing the current player before integration acceptance.

## Follow-on Acceptance

The full product remains incomplete until every visible authored element can be picked in supported renderers; the anchored composer supplies 2–3 current-context hints; ask/revise/explore are authorized and atomically persisted; visits and revisions remain distinct; anonymous public viewing uses fixed release/asset versions with independent access control; visitor AI uses visitor credentials/quotas; security and viewport checks pass. Failed/cancelled/duplicate generations cannot overwrite a source or leave partial history. Deployment requires separate authorization.


## Integrated local checkpoint — 2026-11-04

Implemented: registry/document validation, stable element references distinct from semantic objects, atomic runtime state, snapshots, provider-mediated request/reply/proposal, independent child creation, parent visit restoration, cancellation/stale-response handling, and one shared React workbench used by astronomy and weighted-graph fixtures. Scene/Control/Info are separately registered and connected by typed parameter ports. Both scenes compile into the existing PlaybookScript/Composition/MotionSceneRenderer path; the SVG overlay only performs element picking and selection feedback.

The graph fixture computes shortest-path comparisons at the captured weight, including direct, indirect and tied paths. Child parameters start from the question snapshot; returning restores the parent's visit state and conversation. Preset content is a local fixture adapter; unsupported questions explicitly report that limitation.

The presentation layer uses an optional View Transition between the selected source element and the destination scene's declared focus element. Motion never decides navigation or source identity. Unsupported browsers and Reduced Motion use the same completed navigation without the animation.

Open: public publication projection/hosting, backend authorization and persistence, production player migration, real AI, arbitrary generated components, richer authoring controls and the full set of renderers. The lab is local and separate from app navigation. No deployment or public publication is included.
