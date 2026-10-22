# VarAI prototype backlog

Backlog revision: 0.4 | Date: 2026-10-21 | Status and ownership: [local board](./board.md)

Revision 0.2 added explicit technical child Tasks. Revision 0.3 records the G00
technology and rule-edition decisions, with separate approval and evidence for
the T01 scaffold. Revision 0.4 records the separately approved
[GraphQL contract v0.2](./contract-v0.2.md) and .NET/TypeScript ownership mapping.
The original product scope is unchanged; the former REST transport is replaced,
not maintained in parallel. T03 harness/CI work was separately authorised on
2026-10-22. After an initial deferral, the user approved local baseline/evidence
commits and two clean-checkout runs. Both runs passed against
`e7b8d138d58228521ae95f5dfb68fd2599b95107`; see the
[completion record](../../README.md#t03-clean-checkout-completion-2026-10-22).
The user separately signed off G00 on 2026-10-22 using shared revision
`a7d9f82983f4fc35c5a4703dfd69ffde79554240`, whose executable code is unchanged
from that tested revision. Feature work and dispatch still need separate
approval; see the [gate record](./board.md#g00-sign-off-2026-10-22).

This is a product backlog, not an implementation or a claim that the prototype
works. The user selected an offside-related goal review and repository-only
tracking. Azure Boards publishing is paused because organisation policy blocks
access. The creation CSV is retained for possible future approved use; no remote
work items have been created.

## How to use this backlog

- [Local status board](./board.md): the single place to track work-item status,
  ownership and blockers.
- [Delivery workflow](./delivery-workflow.md): hourly board-driven dispatch,
  two development/two QA slots, guarded context recovery and batch review gates.
- [Shared contract](./contract-v0.2.md): approved GraphQL inputs/outputs,
  scenario boundaries and component responsibilities; v0.1 is historical.
- [Technical Tasks](./technical-tasks.md): 22 engineering deliverables with
  technical acceptance criteria, parent traceability and completion prerequisites.
- [Azure Boards CSV](./azure-boards.csv): one Epic, ten child Issues
  (eight parallel work packages and two delivery gates) and 22 child Tasks.
- In Azure Boards' Basic process, an Issue can represent feature work. Each
  parallel Issue below is a complete agent assignment; its technical Tasks make
  the engineering work separately trackable under that same ownership boundary.
- Identifiers such as `VAR-101` are stable product references, not Azure-generated
  numeric work-item IDs.
- Live status and ownership belong in the local board. Checkboxes below
  represent acceptance evidence, not work already performed or approval to
  dispatch agents before G00.

## Epic VAR-E01: Understand a synthetic offside goal review

**User story:** As a football viewer, I want to explore what happened, which
evidence mattered and why a controlled variation changes the interpretation,
so that I understand the review without treating AI as the referee.

**Primary user:** a casual or moderately knowledgeable football viewer.

**Secondary user:** a rules-aware viewer who wants to inspect evidence and
sources. A broadcaster is a possible future distributor, not a validated buyer.

**Problem hypothesis:** a short, interactive explanation may help viewers
understand a review better than a standalone written explanation. This has not
been demonstrated by user research.

**Core journey:**

1. Choose a clearly labelled synthetic scenario.
2. Play, pause or restart the incident timeline.
3. Inspect an illustrative scene, supplied observations and missing evidence.
4. Request an explanation in casual or analyst mode.
5. Inspect the explanation's evidence and rule references.
6. Compare one permitted changed fact.
7. Read a short recap of the supplied match consequence.

### Scope

| Included in v0.1 | Explicitly excluded |
| --- | --- |
| One offside-related goal-review family; three scenarios | Penalties, handball, red cards and general VAR adjudication |
| Synthetic teams, events and observations | Real footage, real match feeds, computer vision or tracking measurements |
| English casual and analyst explanations | Translation, club-biased conclusions and open-ended chat |
| One curated comparison | Free-form scenario editing, arbitrary sliders and universal rules simulation |
| Authored mode and an explicitly enabled live-model mode | Disguised mocks, automatic fallback to authored text and automatic paid calls |
| Local browser prototype with a server-side model boundary | User accounts, payments, persistent database and production hosting |
| Evidence-linked explanations and a match-impact recap | Claims of official approval, perfect accuracy or commercial validation |

### Business requirements

| ID | Requirement | Owner packages |
| --- | --- | --- |
| BR-01 | Clearly distinguish synthetic material and provisional content from real or official evidence. | 101, 103, 104, 106 |
| BR-02 | Keep the original decision, supplied review outcome and generated explanation distinct. | 101, 102, 105, 106 |
| BR-03 | Support complete evidence, one controlled changed fact and missing evidence. | 101, 103, 107 |
| BR-04 | Let viewers inspect supplied facts, unknowns and versioned rule references. | 101, 104 |
| BR-05 | Link substantive explanation claims to supplied evidence and applicable rule references. | 104, 105, 106 |
| BR-06 | Change explanation depth without changing the underlying interpretation. | 105, 106 |
| BR-07 | Make the permitted comparison understandable and reversible. | 102, 107 |
| BR-08 | Show limitations, provenance and failures honestly; never silently substitute a successful answer. | 103, 104, 105, 106, 107 |
| BR-09 | Deliver a usable replay, accessible presentation and accurate supplied match consequence. | 101, 102, 103, 106 |
| BR-10 | Produce observable test evidence and a plan to measure learning rather than assert value. | 108, G01 |

### Epic acceptance criteria

- [ ] [VAR-E01-AC1] All three scenarios complete the core journey, with the
  comparison available only for the supported pair.
- [ ] [VAR-E01-AC2] Explanations expose valid evidence and rule references;
  missing decisive evidence never becomes a definitive offside conclusion.
- [ ] [VAR-E01-AC3] Authored and live-model output are visibly distinguished;
  at least one authorised live request succeeds through the actual application.
- [ ] [VAR-E01-AC4] The integrated prototype passes its recorded automated and
  browser checks, including keyboard use and 375px and 1280px viewport widths.
- [ ] [VAR-E01-AC5] Run instructions, limitations, source-review status and actual
  verification results are available; unperformed user research is marked not run.

**Completion boundary:** a runnable authored-only demo is an intermediate
milestone, not completion of this AI prototype epic. A completed technical
prototype is still not proof of user value or a validated business.

**Exploratory value target, not an observed result:** in an initial study with
five viewers, aim for at least four to explain the decisive distinction on a
new example. Compare against a short written explanation, vary presentation
order, and record errors and preferences. This small study cannot establish
market demand. A qualified rules reviewer should separately assess the content.

## Independence and real dependencies

There is no feature-to-feature implementation dependency among `VAR-101` through
`VAR-108`. Each package uses the approved contract, common stubs and its own
tests rather than waiting for another package's implementation.

That does **not** mean there are zero prerequisites:

```text
VAR-G00: approved contract + runnable shared baseline
    |
    +-- VAR-101  Scenario content
    +-- VAR-102  Review-room shell
    +-- VAR-103  Scene visualisation
    +-- VAR-104  Evidence explorer
    +-- VAR-105  Explanation service
    +-- VAR-106  Explanation reader
    +-- VAR-107  Controlled comparison
    +-- VAR-108  Acceptance and learning test pack
    |
VAR-G01: integration + real verification + authorised live-model smoke test
```

- `VAR-G00` is a prerequisite for every parallel package.
- `VAR-G01` depends on all eight packages and on authorised model access.
- Rule-source confirmation, permission to use a model and budget approval are
  external decisions, not assumptions or hidden feature dependencies.
- Contract tests against stubs demonstrate an isolated package, not integrated
  behavior. Browser-test authoring can run in parallel; execution against the
  completed application belongs to `VAR-G01`.
- No development agent should provision paid resources or modify external work
  trackers as part of these packages.
- Technical Tasks inherit their parent package's boundary. Some have explicit
  within-package completion prerequisites; they are not all separate parallel
  agent assignments. No parallel package gains a dependency on another.

### Work-item index

All listed items are **Must** for the defined epic; features outside the scope
table are deferred rather than quietly added to these tickets.

| Track | ID | Deliverable | Suggested owner | Start condition |
| --- | --- | --- | --- | --- |
| Gate | [VAR-G00](#var-g00-approve-the-shared-development-baseline) | Approved scope, contract and runnable baseline | Product owner + integration owner | Can start now |
| Parallel | [VAR-101](#var-101-create-the-synthetic-review-library) | Three traceable scenario records | Content/data agent | G00 |
| Parallel | [VAR-102](#var-102-build-the-review-room-replay) | Replay and composition shell | Experience-shell agent | G00 |
| Parallel | [VAR-103](#var-103-visualise-the-supplied-offside-scene) | Illustrative scene component | Visualisation agent | G00 |
| Parallel | [VAR-104](#var-104-explore-evidence-and-rule-references) | Evidence and rules component | Evidence-UX agent | G00 |
| Parallel | [VAR-105](#var-105-provide-bounded-evidence-linked-explanations) | Server-side explanation module | AI/backend agent | G00 |
| Parallel | [VAR-106](#var-106-read-personalised-explanations-and-recaps) | Explanation and recap component | Explanation-UX agent | G00 |
| Parallel | [VAR-107](#var-107-compare-one-controlled-fact) | Comparison component | Comparison-UX agent | G00 |
| Parallel | [VAR-108](#var-108-prepare-acceptance-and-learning-evaluation) | Acceptance harness and study pack | Quality/research agent | G00 |
| Gate | [VAR-G01](#var-g01-integrate-and-verify-the-prototype) | Verified end-to-end prototype | Integration owner | 101-108 + authorised model access |

Owner roles are proposed assignments, not agents already launched or Azure user
accounts. One person or agent can take multiple packages sequentially.

## Detailed work packages

The Issues below specify user outcomes, scope and package acceptance. Their
[technical child Tasks](./technical-tasks.md) specify engineering deliverables
such as runtime schemas, replay state, provider adapters, output validation,
response freshness and CI checks. G00 and G01 are shared engineering enablers
and gates, not artificially worded fan-facing stories.

Both levels must pass: completing technical Tasks does not automatically
establish the parent user outcome.

### VAR-G00: Approve the shared development baseline

**Outcome:** agents can work independently without inventing incompatible
interfaces or competing over project configuration.

**Scope:** approve this backlog and the shared contract; select the framework
and tooling; create only the shared scaffold, typed contracts, stub adapters and
test fixtures needed for isolated development.

**Not included:** any completed feature package, live deployment or paid resource
creation.

**Approved technology direction (2026-10-21):** ASP.NET Core/C# on .NET 10 LTS
with a React/TypeScript frontend, targeting one deployable application. This
replaces the earlier TypeScript-only recommendation. T01's initial `server/`
and `client/` layout, tooling and version-pinning approach were separately
approved and [verified](../../README.md#t01-verification-2026-10-21).
The user subsequently approved GraphQL v0.2 and T02 implementation. The
[contract](./contract-v0.2.md) records the transport/type changes and package
mapping while retaining the domain behavior. The
[board's decision record](./board.md#g00-decisions-and-readiness) records owners,
permissions and observed local tooling.

**Ownership:** integration owner exclusively controls dependency manifests,
lockfiles, root configuration, shared contracts, common stubs and CI setup.

**Acceptance criteria:**

- [x] [VAR-G00-AC1] The product owner approves the scope, technical stack,
  contract version and proposed package boundaries; unresolved decisions are recorded.
- [x] [VAR-G00-AC2] A runnable baseline contains shared types, all three
  illustrative scenario stubs, success/error response stubs and documented test,
  type-check and build commands that actually pass.
- [x] [VAR-G00-AC3] Package ownership, the applicable rule edition and content
  review status are recorded; model access and spending remain unapproved unless
  separately authorised.
- [x] [VAR-G00-AC4] Two isolated checkouts can run the baseline checks without
  a feature implementation or live model; all agents receive the same baseline
  revision before dispatch.

**Sign-off evidence (2026-10-22):** the user approved the scope/stack/contract,
shared revision and coordinator accountability. The
[board's gate record](./board.md#g00-sign-off-2026-10-22) maps each criterion to
the T01/T02/T03 evidence and records remaining limitations. Approved
`a7d9f82` differs from twice-verified `e7b8d13` only in documentation/status.
Every future worker claim/handoff must identify the full approved revision;
no real worker has been dispatched or claimed merely to satisfy this gate.
G00 completion is not feature acceptance, live-model approval or permission
to start automation.

**Dependencies:** none of the parallel packages. Requires product decisions.

### VAR-101: Create the synthetic review library

**User story:** As a viewer, I want coherent, transparent examples so I can
understand the review without mistaking invented events for a real match.

**Scope:** full content for S1, S2 and S3; event sequences; facts; rule metadata;
authored explanations for both audiences; supplied outcomes and recaps.

**Out of scope:** model calls, UI, shared schema changes and footage analysis.

**Owned areas:** `server/Scenarios/**`, `tests/VarAI.Server.Tests/Scenarios/**`.

**Independent input:** approved schema and illustrative baseline stubs.
**Handoff:** immutable, validated scenario records and authored responses.

**Acceptance criteria:**

- [ ] [VAR-101-AC1] S1, S2 and S3 use fictitious teams and include a pass,
  receiver touch, shot, goal event and review sequence, with explicit synthetic
  and content-version labels.
- [ ] [VAR-101-AC2] S1 and S2 differ in exactly one independent football fact;
  derived layouts and outcomes may differ. S3 marks missing pass-time position
  evidence explicitly rather than substituting a value.
- [ ] [VAR-101-AC3] Rule summaries link to primary sources with sections,
  edition, check date and honest review status; no expert approval is claimed
  without an actual review.
- [ ] [VAR-101-AC4] Original decision and supplied review outcome are separate;
  S3 has no invented review outcome or final score. Both audience versions
  preserve the same supported interpretation.
- [ ] [VAR-101-AC5] Isolated tests validate all records and reject duplicate
  identifiers, out-of-order events, inconsistent outcomes and unsupported
  comparison changes.

**Standalone demonstration:** inspect and validate the library without a
browser or model. Full rule correctness still needs content review.

### VAR-102: Build the review-room replay

**User story:** As a viewer, I want to control a short incident replay so I can
follow the sequence at my own pace.

**Scope:** scenario selection, replay state, play/pause/restart, visible match
context and composition slots for other packages.

**Out of scope:** implementing child panels, writing scenario content or
calling a model automatically.

**Owned area:** `client/src/review-room/**`, including package-local tests.

**Independent input:** scenario stubs and injected placeholder panels.
**Handoff:** a replay shell with documented state and event bindings.

**Acceptance criteria:**

- [ ] [VAR-102-AC1] All three scenarios can be selected, played, paused, resumed
  and restarted; fake-clock tests demonstrate deterministic event ordering.
- [ ] [VAR-102-AC2] Only information released by the current replay stage is
  visible. Scenario changes and restart reset the replay, explanation and recap
  state without changing the source scenario.
- [ ] [VAR-102-AC3] The shell renders injected scene, evidence, explanation and
  comparison slots against stubs; feature implementations are not required for
  its isolated tests.
- [ ] [VAR-102-AC4] Invalid selection or failed scenario loading produces an
  explicit recoverable error, never an undisclosed default scenario.
- [ ] [VAR-102-AC5] Controls work by keyboard, focus is visible, stage changes
  are announced and the shell has no horizontal overflow at 375px or 1280px.

**Standalone demonstration:** complete a replay using clearly labelled
placeholder panels. Placeholder output is not an integrated product.

### VAR-103: Visualise the supplied offside scene

**User story:** As a viewer, I want a simple visual explanation of the relevant
positions without being misled into thinking the drawing is tracking evidence.

**Scope:** an illustrative pitch view with key players, ball, attacking
direction, relevant positional reference and an equivalent text description.

**Out of scope:** video, body-part tracking, measured distances, automated
offside calculation and match-state ownership.

**Owned area:** `client/src/scene/**`, including package-local tests.

**Independent input:** scene props and visible-fact stubs.
**Handoff:** a presentational scene component.

**Acceptance criteria:**

- [ ] [VAR-103-AC1] S1 and S2 visibly represent their different supplied
  positional relation and label the drawing as synthetic and illustrative,
  not a measured reconstruction.
- [ ] [VAR-103-AC2] S3 shows an unavailable pass-time snapshot and no precise
  offside reference line or invented receiver position.
- [ ] [VAR-103-AC3] The component does not derive a ruling, distance or
  confidence percentage from diagram coordinates.
- [ ] [VAR-103-AC4] The scene respects the host's visible-fact list and cannot
  reveal a later review outcome before the replay permits it.
- [ ] [VAR-103-AC5] Isolated tests cover all three states at both target widths;
  the scene has a useful text alternative and does not rely on colour alone.

**Standalone demonstration:** render each state from props without the replay,
scenario library or model service.

### VAR-104: Explore evidence and rule references

**User story:** As a curious viewer, I want to inspect why a statement was made
and what is unknown so I can judge its basis.

**Scope:** supplied/missing fact presentation, rule references, review-status
labels and navigation to cited evidence.

**Out of scope:** generating explanations, deciding incidents and maintaining
the source library.

**Owned area:** `client/src/evidence/**`, including package-local tests.

**Independent input:** fact/rule props and source-navigation events.
**Handoff:** an evidence explorer with an agreed focus/navigation interface.

**Acceptance criteria:**

- [ ] [VAR-104-AC1] Visible supplied facts and missing observations are
  distinguished, with stable identifiers and their provenance.
- [ ] [VAR-104-AC2] Rule entries show an original summary, section, primary
  source link, edition and review status, without presenting VarAI as official.
- [ ] [VAR-104-AC3] A citation-navigation event focuses the referenced fact or
  rule; an unknown identifier produces an explicit unavailable-reference state.
- [ ] [VAR-104-AC4] Missing decisive evidence remains visible as a limitation;
  the component never replaces it with a guessed fact or confidence score.
- [ ] [VAR-104-AC5] Isolated tests cover known, missing and invalid references,
  keyboard navigation and rejection of non-HTTPS rule links.

**Standalone demonstration:** explore fixture evidence and send navigation
events without an explanation component or model.

### VAR-105: Provide bounded evidence-linked explanations

**User story:** As a viewer, I want an understandable explanation grounded in
the supplied incident rather than a confident answer invented by a model.

**Scope:** a server-side explanation module, scenario-repository interface,
explicit authored/live modes, provider boundary, output validation and errors.

**Out of scope:** browser components, provisioning, root route registration,
open chat, autonomous refereeing and changing rule content.

**Owned areas:** `server/Explanations/**`, `tests/VarAI.Server.Tests/Explanations/**`.

**Independent input:** injected scenario repository and deterministic provider
stubs, including malformed responses and timeouts.
**Handoff:** the explanation service and provider adapter, ready for wiring.

**Acceptance criteria:**

- [ ] [VAR-105-AC1] The service implements the versioned request/response
  contract and rejects invalid requests, unknown scenarios and content-version
  mismatches with the specified errors.
- [ ] [VAR-105-AC2] Claims contain valid references to the supplied scenario;
  missing decisive evidence forces limited status and an insufficient-evidence
  interpretation. Reference validation is not represented as proof of semantic accuracy.
- [ ] [VAR-105-AC3] Authored mode is explicitly labelled. Live mode uses only
  an authorised server-side provider configuration and never silently returns
  authored text or exposes credentials on failure.
- [ ] [VAR-105-AC4] Tests cover every specified error, the 15-second request
  deadline and the agreed output limits; invalid model output is rejected
  rather than shown as a successful explanation.
- [ ] [VAR-105-AC5] Tests cover all scenario/audience combinations with injected
  data and providers. A real model request is reported as not run until the
  authorised integration check in VAR-G01 succeeds.

**Standalone demonstration:** exercise the module with deterministic providers
and injected scenario records. This does not prove Azure access.

### VAR-106: Read personalised explanations and recaps

**User story:** As a viewer, I want an explanation at my preferred level of
detail, with clear sources, limitations and the match consequence.

**Scope:** audience and source-mode controls, explicit generation action,
loading/error/result states, claim navigation and recap presentation.

**Out of scope:** prompt design, provider calls inside the component, rule
authoring and global replay ownership.

**Owned area:** `client/src/explanation-view/**`, including package-local tests.

**Independent input:** an injected explanation client and all response stubs.
**Handoff:** a reader component with request and source-navigation callbacks.

**Acceptance criteria:**

- [ ] [VAR-106-AC1] Casual and analyst views use the same scenario/version and
  supported interpretation; a live request requires an explicit user action
  after the replay reaches review-ready.
- [ ] [VAR-106-AC2] Loading, error, limited and complete states are distinct;
  retry is offered only when permitted, and authored/live provenance is always visible.
- [ ] [VAR-106-AC3] Responses for an old scenario, replay run, audience or mode
  cannot overwrite current content; changing context clears stale explanation
  and recap content.
- [ ] [VAR-106-AC4] Claim-source controls emit evidence-navigation events.
  The recap reports only the supplied match consequence; S3 explicitly states
  that the review outcome is unavailable.
- [ ] [VAR-106-AC5] Isolated tests cover success, missing evidence, all error
  categories and out-of-order responses, with keyboard and responsive checks.

**Standalone demonstration:** switch audience and injected response states
without the backend, evidence explorer or real model.

### VAR-107: Compare one controlled fact

**User story:** As a viewer, I want to see which single difference matters so
I can understand why superficially similar incidents may differ.

**Scope:** the S1/S2 comparison, changed-fact highlight and reversible selection.

**Out of scope:** arbitrary fact editing, free movement of players, new incident
families, model calls and authoritative counterfactual adjudication.

**Owned area:** `client/src/comparison/**`, including package-local tests.

**Independent input:** the approved pair and selection callbacks.
**Handoff:** a controlled comparison component.

**Acceptance criteria:**

- [ ] [VAR-107-AC1] Only the S1/S2 pair can be compared; the changed independent
  fact is identified separately from derived layout and outcome changes.
- [ ] [VAR-107-AC2] The comparison is labelled a curated hypothetical, not a
  revision of the original scenario or a real official decision.
- [ ] [VAR-107-AC3] Selecting either variant emits its identifier to the host;
  the original can be restored and neither source record is mutated.
- [ ] [VAR-107-AC4] S3 has no enabled comparison control and explains that
  missing position evidence does not support the offered comparison.
- [ ] [VAR-107-AC5] Isolated tests prove correct callbacks, immutability,
  keyboard use and the permitted changed-fact boundary without other features.

**Standalone demonstration:** compare the baseline pair and inspect emitted
events without replay or explanation implementations.

### VAR-108: Prepare acceptance and learning evaluation

**User story:** As the product owner, I want repeatable technical checks and a
small learning study so acceptance is based on evidence rather than demo polish.

**Scope:** a black-box acceptance harness, requirement-to-test matrix, provider
fault cases, manual review checklist and viewer-study materials.

**Out of scope:** fixing other packages, marking unexecuted tests passed,
inventing reviewer feedback and claiming that a small study proves demand.

**Owned areas:** `tests/acceptance/**`, `docs/evaluation/**`.

**Independent input:** published routes, UI hooks, contract stubs and requirements.
**Handoff:** a runnable acceptance harness and a ready-to-use study pack.

**Acceptance criteria:**

- [ ] [VAR-108-AC1] The test matrix covers all three scenarios, both audiences,
  both modes, failure paths, replay reset, stale responses and target browser states.
- [ ] [VAR-108-AC2] The harness can be developed against a contract stub;
  stub results and real-application results are clearly separated, and absent
  live credentials produce a reported skip or block, never a pass.
- [ ] [VAR-108-AC3] Checks cover unknown citations, contradictory structured
  interpretations, team-name swaps and audience consistency; semantic claim
  correctness is also assigned to human review.
- [ ] [VAR-108-AC4] The study pack includes a written-explanation baseline,
  new comprehension examples, expected answers, a five-viewer protocol and a
  separate qualified-rules-review checklist, all labelled with content-review status.
- [ ] [VAR-108-AC5] Each business requirement maps to a check, expected result
  and evidence location; result fields remain not run until execution.

**Standalone demonstration:** run the harness against its contract stub and
inspect the study materials. Actual integrated acceptance is a VAR-G01 dependency.

### VAR-G01: Integrate and verify the prototype

**Outcome:** one working experience, rather than eight isolated demonstrations.

**Scope:** integrate completed packages, register real routes, replace
composition stubs, run acceptance checks and perform an authorised live-model
smoke test through the application.

**Ownership:** the integration owner handles shared entry points, route wiring,
dependency changes and the final verification record. Feature defects return to
the relevant package owner rather than expanding another agent's scope.

**Acceptance criteria:**

- [ ] [VAR-G01-AC1] All eight packages are integrated against the same contract
  and content version; production execution paths contain no undisclosed
  placeholder panels, provider stubs or success-shaped fallbacks.
- [ ] [VAR-G01-AC2] The real application passes the requirement-mapped
  automated and browser checks; rule-source and semantic-content review findings
  are recorded and material failures are resolved.
- [ ] [VAR-G01-AC3] After separate access and spending approval, a live request
  succeeds through the application; its scenario, content version, mode and
  measured outcome are recorded without credentials or sensitive logs.
- [ ] [VAR-G01-AC4] The demo walkthrough, run instructions, limitations and
  actual verification results are saved; user-study and expert-review results
  are marked not run wherever they have not happened.
- [ ] [VAR-G01-AC5] Every epic criterion has linked evidence. Missing live
  access or failed mandatory checks keeps this gate open; an authored-only
  demonstration is not marked as completion of the full epic.

**Dependencies:** VAR-101 through VAR-108, authorised model access and any
required spending approval. This is deliberately not an independent feature task.

## Multi-agent delivery rules

The user approved the [board-driven delivery workflow](./delivery-workflow.md)
on 2026-10-21: two GPT-6 Astra development slots and two GPT-6.1 Sol QA slots,
automatic lane handoffs and an hourly native schedule saved disabled. This
does not complete G00, approve a baseline commit or expand implementation scope.

1. Complete G00 once; for each batch, give its agents the same approved baseline
   revision and contract.
2. Use a separate branch/worktree for each active package. These are future
   delivery instructions; no branches or agents have been created by this backlog.
3. Each agent owns only its listed area and package-local tests. The integration
   owner owns root files, shared types, common fixtures and global styling.
4. Inject collaborators; do not import another unfinished package. Use approved
   test stubs, never a duplicate production implementation of someone else's work.
5. An interface change is a change request, not a unilateral edit. Identify
   impacted packages, update the contract version and get approval before resuming.
6. Handoff includes changed files, commands actually run, results, limitations
   and any remaining integration assumptions. No claim of end-to-end success from
   isolated tests.
7. Do not add services, dependencies, infrastructure or features simply to keep
   an agent busy. Parallelism is optional; integration quality is mandatory.
8. Dispatch parent packages, not each technical child to a separate agent.
   Follow the child's explicit prerequisites and verify combined package
   behavior before closing the parent.
9. Follow the two four-package batches, independent review and human sign-off
   in the delivery workflow. Do not silently substitute a reviewer model or
   advance past unresolved blocking findings.

## Tracking and changing requirements

**Current decision (2026-10-21): repository-only tracking.** This document, the
technical breakdown and the shared contract are the planning source of truth;
the [local board](./board.md) is the source of truth for status, ownership and
blockers. Acceptance checkboxes remain in the requirement documents and track
evidence. The CSV is an optional creation snapshot, not a live board.

Only after a future approved import would Azure Boards become the source for
ticket descriptions, ownership and status; the versioned contract would remain
in Git. Do not maintain two supposedly live copies of ticket status.

Manual gates/Tasks use **To Do -> Doing -> Done**. Feature packages use
**Development -> In Development -> Ready for QA -> In QA -> Ready for Review**,
then **Done** only after combined checks and human sign-off. **Blocked** records
work that cannot continue. The claim helper, not individual workers, updates
automatic package transitions. See the board for controls and recovery counters.
For a blocked item, record the reason, decision owner and next action in the
board's Notes column. Follow the linked prerequisites before starting work.
If a future approved import uses Azure Boards' Basic process, represent a
blocked item with an open workflow state and a `blocked` tag. Use `parallel`
and `gate` tags to distinguish Issue types, and `technical` for child Tasks.
"Technical story" does not require a custom Azure Boards work-item type.

For each requirement change, record:

| Field | Required information |
| --- | --- |
| Reference | Stable BR, package, technical Task and acceptance-criterion identifiers |
| Reason | User problem or constraint motivating the change |
| Change | Previous requirement and proposed replacement |
| Impact | Affected contracts, scenarios, packages, tests and cost/access assumptions |
| Decision | Product owner approval, date and new version |
| Evidence | Updated tests or user findings; explicitly note what has not been checked |

Do not silently edit an approved contract while agents are implementing it.
Re-export existing Azure items with their numeric IDs for later updates;
re-importing this ID-free creation CSV would create duplicates.

### Open decisions before development

| Decision | Current position | Owner / gate |
| --- | --- | --- |
| Incident family | Offside-related goal review, selected by user | Decided |
| Tracker | Repository-only; Azure Boards import paused by user decision after an organisation access block | Decided |
| Delivery workflow | Hourly native scans saved disabled; two Astra development/two Sol QA slots; four-package batch sign-off | Approved configuration; native worker execution remains unverified |
| Framework | ASP.NET Core/C# on .NET 10 LTS with React/TypeScript; one deployable application | Direction approved, 2026-10-21 |
| Tooling and version pins | T01/T02 tooling plus Playwright 1.64.1 and SHA-pinned GitHub Actions configuration; [local checks and limitations recorded](../../README.md#t03-local-evidence-and-remaining-gate-2026-10-22) | Product/integration owner, G00 |
| Shared contract and layout | GraphQL v0.2 replaces the proposed REST transport; C# schema, generated TypeScript operation types and mapped package ownership; domain behavior retained | Approved, 2026-10-21 |
| G00 sign-off / shared baseline | User approved `a7d9f82983f4fc35c5a4703dfd69ffde79554240` and the recorded gate evidence/limitations | Approved, 2026-10-22 |
| Package accountability | Copilot coordinator accountable for VAR-101 through VAR-108 and G01; actual workers assigned only through separately authorised claims | Approved, 2026-10-22; live assignments only in board |
| Implementation permission | Baseline work and the local G00 approval-record commit authorised; no feature package, worker dispatch, scheduling activation, push or remote CI authorised | Product owner, separate next approval |
| Clean-checkout verification | Both isolated clones passed at `e7b8d138d58228521ae95f5dfb68fd2599b95107`; source remained clean; remote CI not run | Verified T03 evidence, 2026-10-22 |
| Applicable law edition | IFAB 2026/27 approved; publication confirmed in the [official library](https://www.theifab.com/laws-of-the-game-documents/); scenario-specific source checks remain required | Edition approved, 2026-10-21; content owner, G00 |
| Legal/content authority | Illustrative prototype, not official adjudication; scenario content remains draft and expert review has not been performed | Content owner, G00/G01 |
| Azure provider/model access | Not verified from this environment | Project owner, G01 |
| Cloud spending and hosting | No provisioning authorised; local hosting is the v0.1 scope | Project owner, separate approval |
| User value | Hypothesis only; study not performed | Product owner, follow-up evaluation |

## Import into Azure Boards

**Paused, not the current workflow.** These instructions are retained for future
approved access. Do not attempt alternative sign-in methods or imports to
bypass organisation policy.

### Account and project setup

Microsoft's current guidance says the first five Basic users are free and
Stakeholder access is free with reduced capabilities. This is a tracker access
allowance, not a budget for model calls or app hosting.

Creating a new Azure DevOps organisation currently requires an active Azure
subscription and manual portal signup. An Azure Portal
`Microsoft.DevCenter/projects` resource is a different service, not an Azure
Boards project. Use the Azure DevOps web portal for this workflow.

1. Create an Azure DevOps Services organisation using an authorised account.
   Respect organisation restrictions; do not bypass a work-account policy.
2. Create a **private** project, for example `VarAI`, selecting the **Basic**
   work-item process. Do not confuse that process choice with the Basic user
   access level; they are separate settings.
3. Confirm the organisation's available free Basic-user allowance. Paid
   Test Plans are not needed for this backlog.
4. Before import, confirm that the project supports `Epic`, `Issue`, `Task` and
   `Description`, for example by creating/exporting a sample item and checking
   its fields. If the project uses Agile, Scrum or a custom process, adapt the
   file instead of assuming these work-item types exist.

### Import and verify

1. Open **Boards -> Queries -> Import work items** and choose
   [azure-boards.csv](./azure-boards.csv).
2. Review the unsaved preview: **33 items**, comprising **1 Epic**,
   **10 Issues** and **22 Tasks**. The eight packages and two gates must all be
   children of `VAR-E01`, not a chain of nested Issues. Each technical Task must
   be a child of its named Issue, not a sibling Issue or a child of another Task.
3. Save only after the preview validates. Verify descriptions, acceptance
   criteria and parent links in the created items.
4. Assign actual human owners, iterations and tags after import. No fictional
   Azure identities or project-specific fields are embedded in the CSV.
5. Add dependency links after import: G00 precedes each package; all eight
   packages precede G01. Also add the explicit completion predecessors in the
   technical Task descriptions. CSV supports the parent-child hierarchy here,
   not arbitrary predecessor/successor links; importing does not create these
   dependency links automatically.
6. Record the generated numeric IDs for updates. Do not run the creation import twice.

The CSV deliberately omits `ID`, `Assigned To`, `State`, `Area Path`, `Iteration
Path` and custom fields. Hierarchy uses `Title 1` for the Epic, `Title 2` for
its child Issues and `Title 3` for their technical Tasks. Acceptance criteria
are included in HTML `Description` so a custom acceptance-criteria field is not
required.

**Verification boundary:** local CSV parsing and consistency checks cannot
establish that a particular Azure organisation accepts the import. The actual
import, permissions and resulting hierarchy must be checked after setup.

## References

Checked for this planning work on 2026-10-21:

- [Azure DevOps user access and free allowance](https://learn.microsoft.com/en-us/azure/devops/organizations/billing/buy-basic-access-add-users?view=azure-devops)
- [Azure DevOps organisation creation and subscription requirement](https://learn.microsoft.com/en-us/azure/devops/organizations/accounts/create-organization?view=azure-devops)
- [Access levels and Stakeholder limitations](https://learn.microsoft.com/en-us/azure/devops/organizations/security/access-levels?view=azure-devops)
- [Basic process and work-item hierarchy](https://learn.microsoft.com/en-us/azure/devops/boards/get-started/plan-track-work?view=azure-devops)
- [CSV creation, hierarchy and HTML descriptions](https://learn.microsoft.com/en-us/azure/devops/boards/queries/import-work-items-from-csv?view=azure-devops)
- [IFAB Law 11 source for content verification](https://www.theifab.com/laws/latest/offside/)
- [IFAB VAR protocol source for content verification](https://www.theifab.com/laws/latest/video-assistant-referee-var-protocol/)

The rule links identify primary sources; they do not certify the proposed
fixtures or establish the edition applicable to a future competition.
