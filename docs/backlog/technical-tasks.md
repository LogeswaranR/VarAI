# Technical work breakdown

Backlog revision: 0.4 | Date: 2026-10-21 | Status and ownership: [local board](./board.md)

These 22 technical Tasks sit below the ten Issues in the
[product backlog](./README.md). They make implementation work separately
trackable without creating a second set of competing product requirements.
The original prototype scope is retained. The separately approved
[shared contract v0.2](./contract-v0.2.md) replaces the REST proposal with GraphQL.

Track status, owners and blockers in the [local board](./board.md). This document
remains the source for technical scope, prerequisites and acceptance criteria;
do not maintain a second copy of task status here.

## Product stories versus technical work

| Level | Purpose | Example |
| --- | --- | --- |
| Epic | The overall user outcome | Understand a synthetic offside review |
| Product Issue | A deliverable capability and its user acceptance criteria | Receive an evidence-linked explanation |
| Technical Task | An engineering deliverable with implementation checks | Validate the request, enforce output constraints or implement the provider adapter |
| Enabler/gate Issue | Shared engineering or verification needed across capabilities | Establish contracts and tooling; integrate and verify the application |

Azure Boards' Basic process uses **Epic -> Issue -> Task**. "Technical story"
is a useful description of engineering work, not a custom work-item type needed
for this backlog. G00 and G01 already represent the cross-cutting enablers.

### Delivery rules

- Follow the [approved delivery workflow](./delivery-workflow.md) for batch
  allocation, two development/two QA slots, bounded corrections and sign-off. It
  changes delivery coordination, not the criteria or prerequisites below.
- The parent Issue remains the agent assignment and ownership boundary.
  Its child Tasks normally belong to that same agent, not to additional agents
  editing the same files.
- Each Task inherits its parent's scope, exclusions, business requirements and
  owned paths. Its technical criteria supplement, not replace, the parent's
  acceptance criteria.
- **Predecessors below are completion prerequisites.** Authoring can sometimes
  start earlier against stubs, but final verification may need an earlier local
  Task. No child of a parallel package depends on another parallel package.
- Within-package dependencies are explicit. The eight parent packages still
  develop in parallel after G00; this is not a claim that every small Task can
  finish independently.
- A Task is done only when its deliverable and scoped checks pass. An Issue is
  done only when its children and combined acceptance criteria pass.
  Parallel-package Issues also require user sign-off on their batch; G00 and
  G01 retain their own gate approval rather than a batch assignment.
  Stub-backed success is not end-to-end application success.
- Use approved tooling and shared types; do not choose another stack, copy
  contracts, add cloud services or expand scope inside a Task.
- Every handoff records commands actually run, results and remaining limitations.
  No application checks, provider requests or user studies have run merely
  because these Tasks now exist.

### Allocation

| Parent | Technical Tasks | Engineering focus |
| --- | --- | --- |
| VAR-G00 | T01-T03 | Scaffold, contracts/stubs, isolated harness and CI |
| VAR-101 | T01-T02 | Versioned content, repository adapter and invariants |
| VAR-102 | T01-T02 | Replay state and injectable UI composition |
| VAR-103 | T01 | Illustrative scene and missing-data rendering |
| VAR-104 | T01-T02 | Evidence rendering and citation navigation |
| VAR-105 | T01-T03 | Request handling, provider adapter and output validation |
| VAR-106 | T01-T02 | Request freshness and explanation presentation |
| VAR-107 | T01 | Curated comparison and selection callbacks |
| VAR-108 | T01-T02 | Acceptance harness and semantic/evaluation test pack |
| VAR-G01 | T01-T04 | Wiring, regression, live access and evidence handoff |

## Shared engineering baseline

### VAR-G00-T01: Scaffold the approved application and tooling

**Parent:** VAR-G00

**Covers:** VAR-G00-AC1, VAR-G00-AC2, VAR-G00-AC3

**Predecessors:** None; product-owner approval of the framework, runtime and tooling is required.

**Scope:** Create the approved ASP.NET Core/C# and React/TypeScript application
scaffold, coordinated dependency manifests and lockfiles, development entry
points and repository-defined validation commands. The target remains one
deployable application, not independent services. Use the approved initial
`server/` and `client/` layout and record the selected versions and root-file
ownership. Shared-contract/package mapping is recorded in v0.2. Do not
select additional tooling silently or provision infrastructure.

- [x] [VAR-G00-T01-AC1] The approved scaffold starts locally and its documented
  test, type-check and build commands pass without live-model credentials;
  placeholder content is clearly labelled.
- [x] [VAR-G00-T01-AC2] Dependency installation is reproducible from the lockfile,
  environment examples contain placeholders only, secret-bearing local files
  are excluded from version control and startup does not call a paid service.

**Evidence (2026-10-21):** [T01 checks and limitations](../../README.md#t01-verification-2026-10-21).
Locked reinstalls, tests/type/build checks and local startup passed without
provider configuration. The environment example is placeholder-only and local
secret-bearing paths are ignored. Two isolated checkouts and the full shared
baseline are still T03/G00 checks, not completed by this evidence.

### VAR-G00-T02: Implement shared contracts and deterministic stubs

**Parent:** VAR-G00

**Covers:** VAR-G00-AC2, VAR-G00-AC3

**Predecessors:** VAR-G00-T01; product approval of the contract and applicable source edition is also required.

**Scope:** Implement shared schemas/types and repository, client and provider
interfaces. Supply minimal illustrative records and responses for isolated
development; these are not the full content library. Use the approved C# GraphQL
schema, generated TypeScript operation types/guards and shared fixture corpus.
No GraphQL HTTP endpoint or real feature implementation is part of T02.

- [x] [VAR-G00-T02-AC1] Executable validation represents versions, supplied and
  missing evidence, rule metadata, replay events, comparison boundaries and
  response/error shapes; tests reject malformed values rather than defaulting them.
- [x] [VAR-G00-T02-AC2] Shared stubs cover S1/S2/S3, both audiences, both source
  modes and all seven error codes; source-edition and review-status decisions
  are recorded, and stubs import no feature implementation or live provider.

**Evidence (2026-10-21):** [T02 checks and limitations](../../README.md#t02-verification-2026-10-21).
The shared malformed-scenario corpus, complete in-memory operation matrix,
exact length boundaries, explicit errors/nulls and drift checks passed.
These are contract/stub results, not implementation of VAR-101/VAR-105 or G01.

### VAR-G00-T03: Provide an isolated feature harness and CI checks

**Parent:** VAR-G00

**Covers:** VAR-G00-AC2, VAR-G00-AC4

**Predecessors:** VAR-G00-T01, VAR-G00-T02.

**Scope:** Provide injectable feature slots, common UI hooks and test entry
points. Configure the agreed CI mechanism to run the same repository commands,
without introducing a second application or test stack.

- [x] [VAR-G00-T03-AC1] Each package can be mounted or exercised with the
  approved stubs, stable hooks and package-scoped checks while every other
  feature implementation is absent.
- [ ] [VAR-G00-T03-AC2] Baseline checks pass in two isolated clean checkouts;
  the CI definition invokes the same model-free checks without provider secrets,
  and any unexecuted remote workflow is explicitly reported as not run.

**Local evidence (2026-10-22):** [T03 checks and limits](../../README.md#t03-local-evidence-and-remaining-gate-2026-10-22).
All eight baseline package selectors, the shared injectable harness, common
hooks and model-free browser/regression checks passed while real features were
absent. The CI definition is saved but has not run remotely. The user subsequently
authorised a local baseline commit, two sequential clean-checkout runs and an
evidence/status commit on 2026-10-22. AC2 stays unchecked until those checks pass.
This does not close G00 or authorise feature dispatch, pushing or remote CI.

## Synthetic content

### VAR-101-T01: Author versioned scenario and source records

**Parent:** VAR-101

**Covers:** VAR-101-AC1, VAR-101-AC2, VAR-101-AC3, VAR-101-AC4

**Predecessors:** VAR-G00.

**Scope:** Populate S1/S2/S3, events, facts, original summaries of primary rules,
diagram inputs and authored explanations for both audiences using the approved
schema and source edition.

- [ ] [VAR-101-T01-AC1] All three records include synthetic provenance, content
  version and honest source-review status; facts, original decision, supplied
  outcome and score consequence occupy their separate contract fields.
- [ ] [VAR-101-T01-AC2] S1/S2 change only the permitted independent fact, S3
  preserves unknown positions and outcome, and the six authored explanations
  use valid references and the same supported interpretation across audiences.

### VAR-101-T02: Implement the scenario repository and integrity checks

**Parent:** VAR-101

**Covers:** VAR-101-AC2, VAR-101-AC4, VAR-101-AC5

**Predecessors:** VAR-G00, VAR-101-T01.

**Scope:** Expose immutable local scenario lookup through the agreed repository
interface. Add dataset invariants and package tests; test authoring can start
against baseline stubs before full content is available.

- [ ] [VAR-101-T02-AC1] Lookup preserves the requested scenario and content
  version, reports unknown IDs, mismatched versions and invalid content
  explicitly, and cannot mutate the source records.
- [ ] [VAR-101-T02-AC2] Tests run against the delivered library and reject
  duplicate IDs, broken references, non-increasing event times, inconsistent
  outcomes and a second independent fact change in the comparison pair.

## Replay experience

### VAR-102-T01: Implement deterministic replay state

**Parent:** VAR-102

**Covers:** VAR-102-AC1, VAR-102-AC2

**Predecessors:** VAR-G00.

**Scope:** Implement replay transitions, event visibility and the replay-run
identifier independently of the panel implementations.

- [ ] [VAR-102-T01-AC1] Fake-clock tests prove play, pause, resume and restart
  behavior; pause stops progression and restarting or selecting a scenario
  resets the sequence with a fresh run ID without mutating input records.
- [ ] [VAR-102-T01-AC2] Facts and context evidence appear only at their approved
  stages, including the original decision at the goal event and supplied review
  outcome at review-ready; reset invalidates explanation and recap state.

### VAR-102-T02: Compose replay controls and injectable panels

**Parent:** VAR-102

**Covers:** VAR-102-AC3, VAR-102-AC4, VAR-102-AC5

**Predecessors:** VAR-G00, VAR-102-T01.

**Scope:** Bind the replay state to scenario controls and feature slots. Route
source-navigation and comparison-selection callbacks through the host without
importing unfinished panels.

- [ ] [VAR-102-T02-AC1] The shell runs with placeholder panels and a stub
  repository, forwards the agreed props/events and exposes recoverable loading
  or selection errors instead of silently selecting another scenario.
- [ ] [VAR-102-T02-AC2] Keyboard, focus, status-announcement and 375px/1280px
  layout checks pass with the delivered replay state; shell interaction never
  initiates an automatic model request.

## Scene visualisation

### VAR-103-T01: Render illustrative and missing-snapshot states

**Parent:** VAR-103

**Covers:** VAR-103-AC1, VAR-103-AC2, VAR-103-AC3, VAR-103-AC4, VAR-103-AC5

**Predecessors:** VAR-G00.

**Scope:** Render the supplied diagram props and equivalent text, respecting
fact visibility. Do not calculate a decision from coordinates.

- [ ] [VAR-103-T01-AC1] S1/S2 visibly differ as supplied; before fact release
  the scene is neutral, and S3 has no invented receiver position or reference
  line. No coordinate becomes a measured distance, ruling or confidence score.
- [ ] [VAR-103-T01-AC2] Isolated rendering tests cover all states at 375px and
  1280px; synthetic/illustrative labels, text alternatives and non-colour-only
  distinctions remain available without other feature modules.

## Evidence exploration

### VAR-104-T01: Render typed evidence and rule entries

**Parent:** VAR-104

**Covers:** VAR-104-AC1, VAR-104-AC2, VAR-104-AC4, VAR-104-AC5

**Predecessors:** VAR-G00.

**Scope:** Render supplied, missing and context evidence plus rule metadata,
using only the visible records passed by the host.

- [ ] [VAR-104-T01-AC1] Fact and context entries retain their IDs, provenance
  and missing status; rule entries show section, edition and honest review
  status without claiming official or expert approval that has not occurred.
- [ ] [VAR-104-T01-AC2] Tests cover missing evidence, draft metadata and unsafe
  link schemes; text is rendered as text, only HTTPS rule links are actionable
  and no absent value is replaced by a guessed fact or confidence percentage.

### VAR-104-T02: Implement citation focus and unavailable-reference states

**Parent:** VAR-104

**Covers:** VAR-104-AC3, VAR-104-AC5

**Predecessors:** VAR-G00, VAR-104-T01.

**Scope:** Resolve source-selection events to visible fact, rule and fixed
context IDs; provide keyboard-accessible focus and explicit unresolved states.

- [ ] [VAR-104-T02-AC1] Tests navigate to known fact/rule references and all
  four context-reference types when visible; hidden or unknown IDs produce an
  unavailable-reference state, not a revealed or substituted source.
- [ ] [VAR-104-T02-AC2] Focus and status changes are accessible by keyboard;
  a cleared selection cannot leave stale source emphasis after a scenario
  change, and no explanation component is needed for these tests.

## Explanation service

### VAR-105-T01: Implement request validation and scenario resolution

**Parent:** VAR-105

**Covers:** VAR-105-AC1, VAR-105-AC3, VAR-105-AC5

**Predecessors:** VAR-G00.

**Scope:** Implement the service entry point with injected repository, provider
and output-validator boundaries. Handle correlation IDs, authored mode and
user-safe errors without registering the root HTTP route.

- [ ] [VAR-105-T01-AC1] Requests are validated against the approved contract;
  unknown scenarios and version mismatches return their specified errors, while
  authored responses are explicitly labelled and never initiate provider calls.
- [ ] [VAR-105-T01-AC2] Tests exercise all scenario/audience combinations with
  injected collaborators; failures retain safe correlation and error codes
  without exposing credentials or raw provider payloads in responses or logs.

### VAR-105-T02: Implement the guarded live-provider adapter

**Parent:** VAR-105

**Covers:** VAR-105-AC3, VAR-105-AC4, VAR-105-AC5

**Predecessors:** VAR-G00.

**Scope:** Implement the approved provider interface and server-only
configuration boundary. Verify the chosen SDK/API before implementation; this
Task does not authorise deployment, spending or a real request.

- [ ] [VAR-105-T02-AC1] Explicit live mode uses server-side configuration;
  missing configuration, provider unavailability and the 15-second deadline
  produce the specified errors without invisible retries or authored fallback.
- [ ] [VAR-105-T02-AC2] Injected-provider and fake-clock tests cover success,
  failure and cancellation/deadline behavior; secrets stay out of browser
  bundles, responses and logs, and real access remains not run until G01.

### VAR-105-T03: Validate generated claims and output limits

**Parent:** VAR-105

**Covers:** VAR-105-AC2, VAR-105-AC4, VAR-105-AC5

**Predecessors:** VAR-G00.

**Scope:** Implement the injected output validator for structured interpretations,
reference integrity, required limitations and length bounds. Do not claim that
structural validation proves semantic correctness. Reuse G00's contract helpers;
add provider-output parsing, semantic expectations and real service integration
rather than copying shared validation or treating stub checks as this feature.

- [ ] [VAR-105-T03-AC1] Malformed output, unknown references, contradictory
  structured interpretations and missing required limitations are rejected as
  INVALID_OUTPUT; S3 can only produce limited, insufficient-evidence output.
- [ ] [VAR-105-T03-AC2] Tests exercise exactly 90/220 explanation words and
  40 recap words plus one-word-over failures, both audiences and team-label
  swaps; no failed output is silently rewritten into a successful response.

## Explanation reader

### VAR-106-T01: Implement explicit requests and response freshness

**Parent:** VAR-106

**Covers:** VAR-106-AC1, VAR-106-AC2, VAR-106-AC3, VAR-106-AC5

**Predecessors:** VAR-G00.

**Scope:** Implement the request state with an injected client, explicit user
action, audience/mode selection and stale-response protection.

- [ ] [VAR-106-T01-AC1] Requests are enabled only at review-ready and contain
  the current scenario, content version, audience, mode and a fresh request ID;
  changing context clears old explanation/recap state without automatic requests.
- [ ] [VAR-106-T01-AC2] Out-of-order and prior-run responses cannot overwrite
  current state; tests cover all error codes, permit retry only when allowed
  and prove that retries require another explicit user action.

### VAR-106-T02: Render sourced explanation and recap states

**Parent:** VAR-106

**Covers:** VAR-106-AC2, VAR-106-AC4, VAR-106-AC5

**Predecessors:** VAR-G00, VAR-106-T01.

**Scope:** Bind reader state to loading, error, limited and complete views;
render citations, provenance and the supplied match consequence.

- [ ] [VAR-106-T02-AC1] Fixture-backed views distinguish authored/live output,
  emit agreed source-navigation events and show S3's unavailable outcome without
  inventing a final score; model text is not rendered as executable markup.
- [ ] [VAR-106-T02-AC2] Keyboard, focus, announcement and responsive checks pass
  with the delivered request state and all error/limited-result fixtures;
  no backend or evidence-panel implementation is required.

## Controlled comparison

### VAR-107-T01: Implement the curated comparison selector

**Parent:** VAR-107

**Covers:** VAR-107-AC1, VAR-107-AC2, VAR-107-AC3, VAR-107-AC4, VAR-107-AC5

**Predecessors:** VAR-G00.

**Scope:** Render only the approved S1/S2 comparison and emit host selection
callbacks. Keep independent fact changes distinct from their derived outcomes.

- [ ] [VAR-107-T01-AC1] The comparison is labelled hypothetical and available
  only when permitted by replay state; S3 and invalid pairs show an explicit
  unavailable state rather than an arbitrary comparison.
- [ ] [VAR-107-T01-AC2] Tests highlight the permitted changed fact, select and
  restore the original variant without mutating either record, and verify
  keyboard operation and callbacks without replay or model implementations.

## Acceptance engineering and evaluation

### VAR-108-T01: Build the requirement-mapped acceptance harness

**Parent:** VAR-108

**Covers:** VAR-108-AC1, VAR-108-AC2, VAR-108-AC3, VAR-108-AC5

**Predecessors:** VAR-G00.

**Scope:** Author black-box checks from published routes, hooks and fixtures;
map business requirements to expected outcomes and evidence records.

- [ ] [VAR-108-T01-AC1] The matrix covers BR-01 through BR-10, the twelve
  scenario/audience/mode combinations, error paths, reference and interpretation
  failures, replay resets, stale responses and both target viewport widths.
- [ ] [VAR-108-T01-AC2] The harness runs against a contract stub with results
  labelled accordingly; missing application access or live credentials is
  reported as not run, skipped or blocked rather than successful acceptance.

### VAR-108-T02: Prepare semantic expectations and the learning study

**Parent:** VAR-108

**Covers:** VAR-108-AC3, VAR-108-AC4, VAR-108-AC5

**Predecessors:** VAR-G00.

**Scope:** Define expected interpretations and source relationships, a manual
claim-review rubric and the viewer-study pack. Test inputs may use approved
baseline stubs rather than waiting for the production library.

- [ ] [VAR-108-T02-AC1] Golden expectations cover missing evidence, audience
  consistency and team-label swaps; the rubric separately checks reference
  existence and whether a claim follows from its evidence, with review status recorded.
- [ ] [VAR-108-T02-AC2] The five-viewer protocol includes the written baseline,
  varied presentation order, new comprehension examples and proposed expected
  answers, plus a qualified-review checklist; unperformed reviews and study
  results remain not run and cannot be reported as proven user value.

## Integration and verification

### VAR-G01-T01: Wire real modules and the explanation route

**Parent:** VAR-G01

**Covers:** VAR-G01-AC1

**Predecessors:** VAR-101, VAR-102, VAR-103, VAR-104, VAR-105, VAR-106, VAR-107, VAR-108.

**Scope:** Register the real repository, panels and explanation service behind
the approved `/graphql` transport, with scenario queries, the `explain` mutation
and client transport adapters. Replace development placeholders without changing
another package's ownership. Validate HTTP/media-type and GraphQL error handling;
do not revive the superseded `/api/explanations` REST proposal.

- [ ] [VAR-G01-T01-AC1] All modules use the approved schema/content versions;
  application routes and composition slots invoke real implementations, with
  no undisclosed fixture provider or placeholder in the runtime path.
- [ ] [VAR-G01-T01-AC2] An authored-mode smoke journey reaches explanation,
  source navigation, comparison reset and recap through the actual application
  without initiating a live-model request.

### VAR-G01-T02: Execute integrated regression and browser acceptance

**Parent:** VAR-G01

**Covers:** VAR-G01-AC2, VAR-G01-AC5

**Predecessors:** VAR-G01-T01.

**Scope:** Execute the real application's repository checks and acceptance
suite, then inspect semantic content and the browser experience. Fault-injected
provider checks are recorded separately from actual provider observations.

- [ ] [VAR-G01-T02-AC1] Mandatory type, build, automated and browser checks pass
  against the delivered application, including evidence failures, freshness,
  missing data, keyboard navigation and 375px/1280px layouts.
- [ ] [VAR-G01-T02-AC2] Rule-source and claim-review findings are recorded,
  material failures return to their owning package and keep acceptance open,
  and no unavailable or unexecuted check is relabelled as a pass.

### VAR-G01-T03: Verify authorised live-model access through the application

**Parent:** VAR-G01

**Covers:** VAR-G01-AC3, VAR-G01-AC5

**Predecessors:** VAR-G01-T01; separate model-access and spending approval is required.

**Scope:** Verify an approved server-side configuration with an explicit live
request through the real application. Do not provision resources or bypass
account restrictions.

- [ ] [VAR-G01-T03-AC1] At least one authorised live request returns the
  expected scenario/version, visible live provenance and valid references;
  record its time, measured duration and result without credentials or raw payloads.
- [ ] [VAR-G01-T03-AC2] Missing authorisation, configuration or a failed request
  leaves this Task blocked or failed; an authored response or provider stub is
  never accepted as live evidence, and no unmeasured cost is presented as a cap.

### VAR-G01-T04: Publish verification evidence and developer handoff

**Parent:** VAR-G01

**Covers:** VAR-G01-AC4, VAR-G01-AC5

**Predecessors:** VAR-G01-T02, VAR-G01-T03.

**Scope:** Save reproducible run instructions, the demo walkthrough, versioned
verification records and explicit limitations. Keep secrets out of all artifacts.

- [ ] [VAR-G01-T04-AC1] The handoff records commands actually run, their results,
  content/source versions and safe setup instructions; not-run expert review,
  user studies and unavailable checks are identified separately.
- [ ] [VAR-G01-T04-AC2] Every epic criterion has linked evidence and all
  mandatory gates pass before full completion is claimed; technical success is
  not described as validated learning impact, complete security or commercial demand.
