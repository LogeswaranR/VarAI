# VarAI local board

Tracker: repository | Last updated: 2026-10-23

This file is the source of truth for work-item status, ownership and blockers.
Requirements and acceptance criteria remain in the
[product backlog](./README.md) and [technical breakdown](./technical-tasks.md);
interfaces remain in the [shared contract](./contract-v0.2.md).

Inventory: **1 Epic, 10 Issues and 22 technical Tasks**. This tracks the existing
offside prototype scope. The Cosmos DB and saved-history proposal has not been
added to it. No prototype implementation is marked complete by creating this board.

**Batch 1 start approval (historical):** on 2026-10-22 the user separately authorised enabling
Dispatch, queueing Batch 1 (VAR-101, VAR-102, VAR-105 and VAR-108), resuming
hourly scheduling and requesting one immediate scan. G00 is signed off with
shared baseline `a7d9f82983f4fc35c5a4703dfd69ffde79554240`.
Queueing is not evidence of worker execution. Batch 2 and final acceptance
remain human-gated; no push, commit or application-model spend is authorised.

**Delivery approach approved:** follow the [board-driven workflow](./delivery-workflow.md)
with two GPT-6 Astra development slots, two GPT-6.1 Sol QA slots and user
sign-off after each four-package batch. The user selected hourly native scans
instead of a 10-minute local timer. It was initially saved disabled; the
separate Batch 1 activation approval is recorded below.

Azure Boards publishing remains paused. No PAT or external tracker is needed
to update this board.

## G00 decisions and readiness

Initial decisions were recorded on 2026-10-21. The user separately approved
G00 sign-off, the shared baseline and accountable ownership on 2026-10-22,
following the recorded T01/T02/T03 evidence. This is baseline approval, not
acceptance of a completed review prototype.

| Decision | Recorded position |
| --- | --- |
| Technology direction | ASP.NET Core/C# on .NET 10 LTS with React/TypeScript; one deployable application |
| Contract change scope | Retain the original scenarios and domain behavior; user subsequently approved GraphQL v0.2 instead of the proposed REST wire format, with typed values/errors and mapped ownership |
| Rule edition | IFAB 2026/27; publication confirmed in the [official library](https://www.theifab.com/laws-of-the-game-documents/), but scenario content remains draft until checked against that edition |
| Content authority | No expert review or official approval claimed |
| Baseline scope | Shared scaffold, executable contracts, labelled deterministic stubs, isolated harness and model-free checks in two clean checkouts; no feature implementation |
| Product/content approval owner | User |
| G00 integration owner | Copilot in this session; no agent dispatch for this step |
| Current authorisation | Separate 2026-10-22 approval: enable board Dispatch, queue VAR-101/102/105/108, resume hourly scans and request one immediate scan using two Astra development/two Sol QA slots |
| Scaffold tooling/layout | ASP.NET Core in `server/`, React/TypeScript + Vite in `client/`; Node.js 24 LTS/npm, MSTest, Vitest, Testing Library and ESLint approved; [pins and checks recorded](../../README.md#local-prototype) |
| Shared-contract mapping | T02 uses C# contracts/schema under `server/Contracts/`, generated TypeScript under `client/src/contracts/`, and shared deterministic stubs under `tests/contract-stubs/`; no HTTP endpoint or UI wiring |
| Reference-only follow-up | User approved pointing the paused dispatcher, its fixture tests and handoff skill link to v0.2; all 30 existing fixture tests passed, without enabling scheduling or dispatch |
| T03 local implementation | Typed feature harness, 23 UI hooks, eight package selectors, Playwright Chromium checks and a SHA-pinned model-free GitHub Actions definition are saved and locally checked; remote CI not run |
| T03 clean-checkout gate | Completed after explicit approval on 2026-10-22; two independent clean clones passed against `e7b8d138d58228521ae95f5dfb68fd2599b95107` |
| Verified T03 revision | `e7b8d138d58228521ae95f5dfb68fd2599b95107`; a verified code baseline, not automatic approval of the dispatcher control below |
| G00 shared revision | User approved `a7d9f82983f4fc35c5a4703dfd69ffde79554240`; executable source matches the twice-verified T03 revision, with only documentation/status differences |
| Package accountability | Copilot coordinator is accountable for VAR-101 through VAR-108 and G01; actual developer/QA identities are recorded only through separately authorised claims and attachment |
| Separate permissions | Existing baseline/evidence/gate-record commit approvals are historical; this activation adds no commit or push approval, remote CI, cloud provisioning, application live-model calls/spending, Azure DevOps/PAT access or persistence/storage additions |

Read-only tooling checks on 2026-10-21 found .NET SDK `10.0.400`, Node.js
`25.5.0` and npm `11.8.0`. These are observed local versions, not approved
reproducible toolchain pins. The [Node.js release table](https://nodejs.org/en/about/previous-releases)
marks Node.js 25 end-of-life and Node.js 24 LTS; propose a project-scoped
Node.js 24 toolchain rather than changing the machine-wide installation.
The selected pins are .NET SDK `10.0.402` (runtime `10.0.13`), Node.js
`24.22.1` and its bundled npm `11.19.1`, verified against the public Microsoft
and Node.js release metadata. The archives were checksum-verified and installed
only in the ignored project-local tool directory; existing machine-wide SDK/Node
installations were not replaced.

[T01 verification evidence](../../README.md#t01-verification-2026-10-21)
records successful locked restores, lint/type checks, four server tests,
three UI tests, builds, local publication and startup checks. Development-browser
width/focus checks passed; the published shell rendered, but additional published
keyboard automation was inconclusive when the browser became hidden/unavailable.
Temporary servers were stopped. The subsequent
[T02 verification](../../README.md#t02-verification-2026-10-21) records the
in-memory GraphQL contract, generated TypeScript, 63 shared rejection cases,
12 scenario/audience/mode cases and all seven errors. Full regression passed
112 C# tests and 92 UI/TypeScript tests, with locked restores, lint, type checks,
builds and local publish. The published shell remains unchanged; HTTP GraphQL
wiring and live-model access are not implemented.

[T03 local evidence](../../README.md#t03-local-evidence-and-remaining-gate-2026-10-22)
records all eight package selectors passing, 114 C# tests, 108 Vitest tests,
22 Chromium checks at 375px/1280px, lint/types/builds, local CI syntax checks and
production-harness isolation. The initial browser/install failures and successful
rechecks are recorded there. The subsequent
[clean-checkout completion record](../../README.md#t03-clean-checkout-completion-2026-10-22)
confirms that both independent clones passed locked restore, all baseline
checks, local publication and all 30 dispatcher fixture tests. Each retained
clean Git state at the same baseline revision, with independent dependency
directories/build outputs and stopped test servers. Remote CI remains not run.
That T03 verification did not change scheduling, dispatch or human batch gates.
The subsequent G00 sign-off below explicitly approves the shared-baseline value;
Dispatch and the batch sign-off gate remain unchanged.

### G00 sign-off (2026-10-22)

| Criterion | Evidence / approval |
| --- | --- |
| VAR-G00-AC1 | User approved the existing scope, .NET/React tooling, GraphQL v0.2 and package boundaries, with unresolved capabilities/permissions retained below |
| VAR-G00-AC2 | T01/T02/T03 provide the runnable scaffold, shared validation, S1/S2/S3 and response/error stubs, harness and passing repository commands |
| VAR-G00-AC3 | User retains product/content approval; coordinator accountability is recorded for all packages and G01; IFAB 2026/27 and draft content status remain explicit; live-model access/spending remain unapproved |
| VAR-G00-AC4 | Two clean clones passed at `e7b8d13`; approved revision `a7d9f82` has identical executable source. Every future claim/handoff must use the full approved revision before worker attachment |

The accountable owner is not a claim that a feature worker is running. For
To Do packages, the Owner column records coordinator accountability. The
existing helper replaces that operational owner with a claim identifier when
an authorised worker is reserved/attached; accountability remains with the
coordinator. No claim or runtime worker identity has been created for this gate.

The approved baseline's checked-in board is a historical snapshot. The current
canonical coordinating checkout remains the status authority, as described in
the [claim-helper workflow](./delivery-workflow.md#claim-helper-and-local-checks).
Future handoffs must include the approved revision and current gate/claim
context, not infer live status from an older worker copy.

Still unverified or unapproved at G00 sign-off: remote CI/Linux execution, actual development/QA
worker invocation, source-interpretation/expert review, application live-model
access/spending, full product acceptance and the learning study. These are not
converted into success claims by closing G00.

## Local prototype acceptance (2026-10-23)

The user selected `accept-local-prototype` after reviewing the final acceptance
summary, including the coverage disposition, one successful real live smoke
and documented limits. All 33 work items are now Done for this accepted local
prototype, with all 98 criterion statements retained. The previous staged
reports remain historical evidence, not rewritten claims of full live coverage.

Acceptance record: `.git/varai-workflow/evidence/human-acceptance-2026-10-23.json`.
The tested application assembly SHA-256 is
`4f942f0911cbfe28cb3c11a40530f8effadb4ec610f0e7c4c4b8f7bb23b1ad36`.
The accepted source has subsequently been consolidated into the normal
checkout on `prototype/accepted-local-delivery`, following the user's separate
commit/push instruction. The original worktrees remain intact. The earlier
preview at `http://127.0.0.1:43175/` continues to serve the corrected build
with live AI disabled.

Acceptance is not expert-referee approval, a completed learning study, a
full-live-matrix result, production certification or a spending/latency
guarantee. The known expert-reviewed-pair limitation remains documented.
The subsequent publication approval covers committing and pushing the current
changes on the feature branch, not merging into `main`. No further paid calls,
deployments or scheduler runs are authorised. Automatic dispatch stays paused
with no active claims.

## Automation controls

**Consolidated-local approval (2026-10-23):** the user authorised one bounded
implementation for VAR-103/104/106/107 and local G01 wiring in a separate
integration worktree. VAR-108's pending QA is included in one final combined
Sol review. This explicitly changes implementation/review sequencing; it does
not mark Batch 1 signed off, waive any criterion or authorise Done, commits,
pushes, deployment or paid application-model calls. Native automation stays
off and automatic board dispatch is paused during this manual assignment.
The coordinator records the single worker below; do not create four automatic
claims or dispatch another worker against these same files.

Consolidated worker: GPT-6 Astra, runtime ID
`ce36026d-e1f0-45a9-894b-571df4133661`.
Worktree: `local-only:varai-local-integration` (original location retained in
owner-local evidence).
The coordinator verified and copied 68 candidate files byte-identically from
VAR-101/102/105/108; the original candidates remain intact. The input manifest
is `.git/varai-workflow/evidence/consolidated-inputs-2026-10-23.json`.
Implementation was delivered in this worktree. Combined read-only QA passed
with GPT-6.1 Sol, runtime ID `4e348652-da8d-4d6b-a4d4-8c8ba8bb4338`, against
source fingerprint `22fb3ba0209231bfd5dd996f1053235df9ba717497c11903021b00c1d9777214`.
The coordinator ran one complete browser suite: 82 application/component checks
passed, 12 unauthorised live cases skipped, no failures or retries. A published
preview is available at `http://127.0.0.1:43175/` with live generation disabled;
the coordinator observed S1 playback and its actual authored explanation through
the real `/graphql` service. The combined reviewer found no significant issues
in the implemented local scope, including VAR-108, and made no edits or runtime
calls. Record: `.git/varai-workflow/evidence/consolidated-local-qa-2026-10-23.json`.
That review alone did not establish live-model verification, full G01/epic
approval or integration into the canonical checkout. Subsequent checks and
explicit local-prototype acceptance are recorded in this board; no
implementation worker is active.

**Completion follow-up (2026-10-23):** the coordinator accounted for the seven
blocked adapter-fault cases using real GraphQL HTTP tests with test-only injected
collaborators, plus six team-label cases across both audiences. The original
8 PASS / 7 BLOCKED / 12 SKIPPED report remains unchanged. Two validator false
rejections were fixed with regression coverage; 357 targeted tests, scoped
formatting and a separate Release publish passed. Current candidate fingerprint:
`635cb6b2942651963faa490c800c206fb9d0272582385aa58da784410d88e33c`.
These changes have coordinator checks after the earlier combined QA, not a
claim that the earlier reviewer assessed a later candidate.
Read-only Azure checks verified the existing FootballAnalytics `gpt-6-luna`
deployment and advertised chat-completion capability. The user initially
deferred paid testing, then separately authorised one request after configuring
the local key. The actual S1/Casual LIVE_AI request passed in 8.171 seconds with
no retry; identity, references, 48/23-word limits and disclaimers were verified.
The temporary live-enabled process was stopped and its PID absence checked.
Normal preview stays live-disabled; no key was displayed or put in source/logs.
The live evidence is `.git/varai-workflow/evidence/live-smoke-2026-10-23-attempt1.json`.
The user then accepted the local prototype and these scoped coverage limits.
Record: `.git/varai-workflow/evidence/completion-gates-2026-10-23.json`.

Only the coordinator changes these controls after explicit user approval.
Both the native schedule and board dispatch must be enabled for automatic
work. G00 and its three technical Tasks must also be Done; T01 alone does not
open the gate. Queue only approved parent packages, never G00/T02/T03.

| Setting | Value |
| --- | --- |
| Dispatch | Paused |
| Active batch | 1 |
| Approved baseline | a7d9f82983f4fc35c5a4703dfd69ffde79554240 |
| Batch 1 sign-off | Approved |

The existing native hourly definition was already enabled when inspected on
2026-10-22, but prior scans stopped at the paused board. It is being resumed
with the now-authorised queue; see the
[automation runbook](./delivery-workflow.md#native-hourly-coordinator-runbook).
Worker execution is recorded only through actual claims and evidence, not by
this activation note.

## Epic and work packages

| ID | Work item | Kind | Status | Owner | Notes |
| --- | --- | --- | --- | --- | --- |
| VAR-E01 | [Understand a synthetic offside goal review](./README.md#epic-var-e01-understand-a-synthetic-offside-goal-review) | Epic | Done | User (product) | User accepted local prototype and documented coverage limits on2026-10-23; evidence: .git/varai-workflow/evidence/human-acceptance-2026-10-23.json. Not production/expert/study certification. |
| VAR-G00 | [Approve the shared development baseline](./README.md#var-g00-approve-the-shared-development-baseline) | Gate | Done | Copilot coordinator | [User sign-off and evidence](#g00-sign-off-2026-10-22); baseline `a7d9f82`; independent Sol review complete: G00-REVIEW-001 (medium, Pair review-evidence forwarding) open; static finding, no runtime reproduction; original sign-off preserved; local report `.git/varai-workflow/evidence/g00-baseline-review-2026-10-22.json` |
| VAR-101 | [Create the synthetic review library](./README.md#var-101-create-the-synthetic-review-library) | Package | Done | Copilot coordinator | User accepted local prototype and documented coverage limits on2026-10-23; evidence: .git/varai-workflow/evidence/human-acceptance-2026-10-23.json. Not production/expert/study certification. |
| VAR-102 | [Build the review-room replay](./README.md#var-102-build-the-review-room-replay) | Package | Done | Copilot coordinator | User accepted local prototype and documented coverage limits on2026-10-23; evidence: .git/varai-workflow/evidence/human-acceptance-2026-10-23.json. Not production/expert/study certification. |
| VAR-103 | [Visualise the supplied offside scene](./README.md#var-103-visualise-the-supplied-offside-scene) | Package | Done | Copilot coordinator | User accepted local prototype and documented coverage limits on2026-10-23; evidence: .git/varai-workflow/evidence/human-acceptance-2026-10-23.json. Not production/expert/study certification. |
| VAR-104 | [Explore evidence and rule references](./README.md#var-104-explore-evidence-and-rule-references) | Package | Done | Copilot coordinator | User accepted local prototype and documented coverage limits on2026-10-23; evidence: .git/varai-workflow/evidence/human-acceptance-2026-10-23.json. Not production/expert/study certification. |
| VAR-105 | [Provide bounded evidence-linked explanations](./README.md#var-105-provide-bounded-evidence-linked-explanations) | Package | Done | Copilot coordinator | User accepted local prototype and documented coverage limits on2026-10-23; evidence: .git/varai-workflow/evidence/human-acceptance-2026-10-23.json. Not production/expert/study certification. |
| VAR-106 | [Read personalised explanations and recaps](./README.md#var-106-read-personalised-explanations-and-recaps) | Package | Done | Copilot coordinator | User accepted local prototype and documented coverage limits on2026-10-23; evidence: .git/varai-workflow/evidence/human-acceptance-2026-10-23.json. Not production/expert/study certification. |
| VAR-107 | [Compare one controlled fact](./README.md#var-107-compare-one-controlled-fact) | Package | Done | Copilot coordinator | User accepted local prototype and documented coverage limits on2026-10-23; evidence: .git/varai-workflow/evidence/human-acceptance-2026-10-23.json. Not production/expert/study certification. |
| VAR-108 | [Prepare acceptance and learning evaluation](./README.md#var-108-prepare-acceptance-and-learning-evaluation) | Package | Done | Copilot coordinator | User accepted local prototype and documented coverage limits on2026-10-23; evidence: .git/varai-workflow/evidence/human-acceptance-2026-10-23.json. Not production/expert/study certification. |
| VAR-G01 | [Integrate and verify the prototype](./README.md#var-g01-integrate-and-verify-the-prototype) | Gate | Done | Copilot coordinator | User accepted local prototype and documented coverage limits on2026-10-23; evidence: .git/varai-workflow/evidence/human-acceptance-2026-10-23.json. Not production/expert/study certification. |

## Technical Tasks

Task owners inherit their parent Issue's owner unless explicitly overridden.
An inherited owner is unassigned while the parent remains unassigned.

| ID | Parent | Work item | Status | Owner | Notes |
| --- | --- | --- | --- | --- | --- |
| VAR-G00-T01 | VAR-G00 | [Scaffold the approved application and tooling](./technical-tasks.md#var-g00-t01-scaffold-the-approved-application-and-tooling) | Done | Inherit parent | [Verification evidence](../../README.md#t01-verification-2026-10-21); both criteria passed; no feature package or complete G00 claim |
| VAR-G00-T02 | VAR-G00 | [Implement shared contracts and deterministic stubs](./technical-tasks.md#var-g00-t02-implement-shared-contracts-and-deterministic-stubs) | Done | Inherit parent | [GraphQL v0.2 evidence](../../README.md#t02-verification-2026-10-21); both criteria passed; no HTTP/live-provider or feature-completion claim |
| VAR-G00-T03 | VAR-G00 | [Provide an isolated feature harness and CI checks](./technical-tasks.md#var-g00-t03-provide-an-isolated-feature-harness-and-ci-checks) | Done | Inherit parent | [Completion evidence](../../README.md#t03-clean-checkout-completion-2026-10-22); both criteria passed on two clean clones of `e7b8d13`; remote CI not run; no G00/dispatch approval implied |
| VAR-101-T01 | VAR-101 | [Author versioned scenario and source records](./technical-tasks.md#var-101-t01-author-versioned-scenario-and-source-records) | Done | Inherit parent | Development and independent Sol QA verified on 2026-10-22; authored records/source metadata and six explanations checked; parent remains Ready for Review, unintegrated |
| VAR-101-T02 | VAR-101 | [Implement the scenario repository and integrity checks](./technical-tasks.md#var-101-t02-implement-the-scenario-repository-and-integrity-checks) | Done | Inherit parent | Coordinator reran 121 passing scenario tests; independent Sol QA passed lookup/version/immutability and negative-data checks; parent remains Ready for Review, unintegrated |
| VAR-102-T01 | VAR-102 | [Implement deterministic replay state](./technical-tasks.md#var-102-t01-implement-deterministic-replay-state) | Done | Inherit parent | User accepted local prototype and documented coverage limits on2026-10-23; evidence: .git/varai-workflow/evidence/human-acceptance-2026-10-23.json. Not production/expert/study certification. |
| VAR-102-T02 | VAR-102 | [Compose replay controls and injectable panels](./technical-tasks.md#var-102-t02-compose-replay-controls-and-injectable-panels) | Done | Inherit parent | User accepted local prototype and documented coverage limits on2026-10-23; evidence: .git/varai-workflow/evidence/human-acceptance-2026-10-23.json. Not production/expert/study certification. |
| VAR-103-T01 | VAR-103 | [Render illustrative and missing-snapshot states](./technical-tasks.md#var-103-t01-render-illustrative-and-missing-snapshot-states) | Done | Inherit parent | User accepted local prototype and documented coverage limits on2026-10-23; evidence: .git/varai-workflow/evidence/human-acceptance-2026-10-23.json. Not production/expert/study certification. |
| VAR-104-T01 | VAR-104 | [Render typed evidence and rule entries](./technical-tasks.md#var-104-t01-render-typed-evidence-and-rule-entries) | Done | Inherit parent | User accepted local prototype and documented coverage limits on2026-10-23; evidence: .git/varai-workflow/evidence/human-acceptance-2026-10-23.json. Not production/expert/study certification. |
| VAR-104-T02 | VAR-104 | [Implement citation focus and unavailable-reference states](./technical-tasks.md#var-104-t02-implement-citation-focus-and-unavailable-reference-states) | Done | Inherit parent | User accepted local prototype and documented coverage limits on2026-10-23; evidence: .git/varai-workflow/evidence/human-acceptance-2026-10-23.json. Not production/expert/study certification. |
| VAR-105-T01 | VAR-105 | [Implement request validation and scenario resolution](./technical-tasks.md#var-105-t01-implement-request-validation-and-scenario-resolution) | Done | Inherit parent | User accepted local prototype and documented coverage limits on2026-10-23; evidence: .git/varai-workflow/evidence/human-acceptance-2026-10-23.json. Not production/expert/study certification. |
| VAR-105-T02 | VAR-105 | [Implement the guarded live-provider adapter](./technical-tasks.md#var-105-t02-implement-the-guarded-live-provider-adapter) | Done | Inherit parent | User accepted local prototype and documented coverage limits on2026-10-23; evidence: .git/varai-workflow/evidence/human-acceptance-2026-10-23.json. Not production/expert/study certification. |
| VAR-105-T03 | VAR-105 | [Validate generated claims and output limits](./technical-tasks.md#var-105-t03-validate-generated-claims-and-output-limits) | Done | Inherit parent | User accepted local prototype and documented coverage limits on2026-10-23; evidence: .git/varai-workflow/evidence/human-acceptance-2026-10-23.json. Not production/expert/study certification. |
| VAR-106-T01 | VAR-106 | [Implement explicit requests and response freshness](./technical-tasks.md#var-106-t01-implement-explicit-requests-and-response-freshness) | Done | Inherit parent | User accepted local prototype and documented coverage limits on2026-10-23; evidence: .git/varai-workflow/evidence/human-acceptance-2026-10-23.json. Not production/expert/study certification. |
| VAR-106-T02 | VAR-106 | [Render sourced explanation and recap states](./technical-tasks.md#var-106-t02-render-sourced-explanation-and-recap-states) | Done | Inherit parent | User accepted local prototype and documented coverage limits on2026-10-23; evidence: .git/varai-workflow/evidence/human-acceptance-2026-10-23.json. Not production/expert/study certification. |
| VAR-107-T01 | VAR-107 | [Implement the curated comparison selector](./technical-tasks.md#var-107-t01-implement-the-curated-comparison-selector) | Done | Inherit parent | User accepted local prototype and documented coverage limits on2026-10-23; evidence: .git/varai-workflow/evidence/human-acceptance-2026-10-23.json. Not production/expert/study certification. |
| VAR-108-T01 | VAR-108 | [Build the requirement-mapped acceptance harness](./technical-tasks.md#var-108-t01-build-the-requirement-mapped-acceptance-harness) | Done | Inherit parent | User accepted local prototype and documented coverage limits on2026-10-23; evidence: .git/varai-workflow/evidence/human-acceptance-2026-10-23.json. Not production/expert/study certification. |
| VAR-108-T02 | VAR-108 | [Prepare semantic expectations and the learning study](./technical-tasks.md#var-108-t02-prepare-semantic-expectations-and-the-learning-study) | Done | Inherit parent | User accepted local prototype and documented coverage limits on2026-10-23; evidence: .git/varai-workflow/evidence/human-acceptance-2026-10-23.json. Not production/expert/study certification. |
| VAR-G01-T01 | VAR-G01 | [Wire real modules and the explanation route](./technical-tasks.md#var-g01-t01-wire-real-modules-and-the-explanation-route) | Done | Inherit parent | User accepted local prototype and documented coverage limits on2026-10-23; evidence: .git/varai-workflow/evidence/human-acceptance-2026-10-23.json. Not production/expert/study certification. |
| VAR-G01-T02 | VAR-G01 | [Execute integrated regression and browser acceptance](./technical-tasks.md#var-g01-t02-execute-integrated-regression-and-browser-acceptance) | Done | Inherit parent | User accepted local prototype and documented coverage limits on2026-10-23; evidence: .git/varai-workflow/evidence/human-acceptance-2026-10-23.json. Not production/expert/study certification. |
| VAR-G01-T03 | VAR-G01 | [Verify authorised live-model access through the application](./technical-tasks.md#var-g01-t03-verify-authorised-live-model-access-through-the-application) | Done | Inherit parent | User accepted local prototype and documented coverage limits on2026-10-23; evidence: .git/varai-workflow/evidence/human-acceptance-2026-10-23.json. Not production/expert/study certification. |
| VAR-G01-T04 | VAR-G01 | [Publish verification evidence and developer handoff](./technical-tasks.md#var-g01-t04-publish-verification-evidence-and-developer-handoff) | Done | Inherit parent | User accepted local prototype and documented coverage limits on2026-10-23; evidence: .git/varai-workflow/evidence/human-acceptance-2026-10-23.json. Not production/expert/study certification. |

## Updating the board

| Status | Meaning |
| --- | --- |
| To Do | Not started; check the linked item's prerequisites before claiming it |
| Doing | Manual gate or technical-Task work, not an automatic dispatch queue |
| Development | Approved parent package queued for an Astra developer |
| In Development | A developer or its reserved replacement holds the claim |
| Ready for QA | Frozen candidate and development evidence ready for Sol QA |
| In QA | QA or its reserved replacement holds the claim; do not edit the candidate |
| Ready for Review | QA passed; combined checks and human sign-off remain |
| Blocked | Progress cannot continue; Notes must identify the reason, decision owner and next action |
| Done | Required deliverables and checks have passed, with evidence recorded |

1. Queue an approved parent package in Development. The dispatcher claims it
   atomically; do not manually mark a package In Development or In QA. Technical
   Tasks inherit their parent owner and are not separate automatic assignments.
2. Follow prerequisites in the linked requirements. Queued work waiting for its
   normal predecessors can remain To Do rather than being marked Blocked.
3. Successful development moves a package to Ready for QA; successful QA moves
   it to Ready for Review, never directly to Done. QA failures return it to
   Development for up to two corrections, then Blocked. Update child Task status
   as work progresses. Check acceptance criteria in
   their source document only when supported by actual results; link completion
   evidence from Notes.
4. Close an Issue only after its child Tasks and combined acceptance criteria
   pass. Parallel-package Issues also require user sign-off on their batch;
   G00 and G01 use their own gate criteria and approval, not a batch assignment.
   Close the Epic only after its Issues and epic-level criteria pass.
   Passing isolated stub tests is not proof of integrated or live-model behavior.
5. Keep status and ownership only here. Keep requirements and acceptance criteria
   in their existing documents, using the same stable IDs.
6. The coordinating owner maintains this board; parallel agents report their
   updates through handoffs to avoid competing edits to this shared file.
7. Change scope through the backlog's change process before adding or removing
   rows. The optional Azure CSV is not a status tracker and does not need to be
   regenerated for a status-only update.

## Dispatcher state

This block records claims, evidence references and recovery counts, not a
second board. Only the [dispatch helper](../../scripts/board_dispatch.py)
updates it under a shared Git-directory lock. Do not edit or expire claims
while a worker may still be running. Unknown outcomes stay reserved.
Pause scheduling and reconcile active workers before manually editing live
rows; an editor that ignores the helper's lock is not part of its transaction.

For public publication, machine-specific paths in completed candidate/history
records below are replaced by `local-only:` archive references. The exact
pre-publication board is retained locally at
`.git/varai-workflow/evidence/pre-publication-board-2026-10-23.md`.
There are no active claims. These archive references are not reusable workspace
paths; any future requeue requires explicit approval and coordinator
reconciliation with the preserved local records. Models, ownership, fingerprints,
evidence hashes, retry counts and human gates are unchanged.

<!-- dispatch-state:start -->
```json
{
  "candidates": {
    "VAR-101": {
      "baseline": "a7d9f82983f4fc35c5a4703dfd69ffde79554240",
      "developerAgentId": "0b191490-9ca1-45a3-93cc-3edabbcc6d23",
      "developmentEvidence": ".git/varai-workflow/evidence/var101-development-2026-10-22.json",
      "developmentEvidenceHash": "0f1962142b264caf3003077cf069a19e5ff13d1f03980f2b025c232c72d1ec6e",
      "fingerprint": "eee211c8177c882a19ed32f00c381aeaeb144126a220155d0a3c17365a8969d3",
      "qaEvidence": ".git/varai-workflow/evidence/var101-independent-qa-2026-10-22.json",
      "qaEvidenceHash": "747f3b98eb481dcd2b312ab0c30add64862b12c6169d67f77ddbe1d73069ac43",
      "workspace": "local-only:var-101-development"
    },
    "VAR-102": {
      "baseline": "a7d9f82983f4fc35c5a4703dfd69ffde79554240",
      "developerAgentId": "d61e2783-18dc-42e2-a225-daa08201b94e",
      "developmentEvidence": ".git/varai-workflow/evidence/var102-development-2026-10-22.json",
      "developmentEvidenceHash": "ea085fd707aea0ca7baec0f7d801d213921f46628709b5e53ff36ecc4693b300",
      "fingerprint": "21f0be648caf8a6cb1d30a7ee38142c1027bcdf411709fa07e272969ef7df46b",
      "qaEvidence": ".git/varai-workflow/evidence/var102-independent-qa-2026-10-22.json",
      "qaEvidenceHash": "735f090bbd81eca5dd50bafcbe887f8d7288a0dff6a4e143e2f6991de875a596",
      "workspace": "local-only:var-102-development"
    },
    "VAR-105": {
      "baseline": "a7d9f82983f4fc35c5a4703dfd69ffde79554240",
      "developerAgentId": "9291aa85-8330-4d58-9e04-e38c6a6ef5cc",
      "developmentEvidence": ".git/varai-workflow/evidence/var105-correction1-development-2026-10-22.json",
      "developmentEvidenceHash": "c64aae6df8e7ee23574ea12dc10be86314dd3b6e886a4a0bc0b58cfcc26cf39a",
      "fingerprint": "7ba2b6a1a6a9e5bd031260b0f69f8524b4f599a7a7777a6ede4649f681a7fb1b",
      "qaEvidence": ".git/varai-workflow/evidence/var105-correction1-qa-2026-10-22.json",
      "qaEvidenceHash": "2500e15923bcaa8d49de5525503f4ca4f95b84ef11fa743545ef486549b5d4b6",
      "workspace": "local-only:var-105-development"
    },
    "VAR-108": {
      "baseline": "a7d9f82983f4fc35c5a4703dfd69ffde79554240",
      "developerAgentId": "d100ea6e-5613-4c73-8de6-5b0612ef50a0",
      "developmentEvidence": ".git/varai-workflow/evidence/var108-development-2026-10-22.json",
      "developmentEvidenceHash": "606bc7ff8d5df9fdd62f97192e66972c0baac3572eb5f113b78294e531c83db6",
      "fingerprint": "ef16eeb4dc7d750b49c8b1f196d9e3d7b890f32f661118b03400a7b5312d2782",
      "workspace": "local-only:var-108-development"
    }
  },
  "claims": {},
  "contextReplacements": {},
  "history": [
    {
      "agentId": "0b191490-9ca1-45a3-93cc-3edabbcc6d23",
      "at": "2026-10-22T10:25:35.839083+00:00",
      "baseline": "a7d9f82983f4fc35c5a4703dfd69ffde79554240",
      "card": "VAR-101",
      "claim": "6da53c9662004fe5a19b9ed9ad19e0ec",
      "event": "complete:pass",
      "model": "gpt-6-astra",
      "role": "development",
      "runId": "direct-var101-g00-review-2026-10-22",
      "stopEvidence": "Runtime read_agent reports worker 0b191490-9ca1-45a3-93cc-3edabbcc6d23 idle after completed handoff; worker reports no application processes and stopped build servers. Coordinator independently reran 121 tests and successfully shut down isolated MSBuild/C# servers (shell 307 exit 0). No further execution message sent to the developer.",
      "workspace": "local-only:var-101-development"
    },
    {
      "agentId": "ad8d7a07-2d00-4230-a005-a2599730a49c",
      "at": "2026-10-22T10:36:04.525754+00:00",
      "baseline": "a7d9f82983f4fc35c5a4703dfd69ffde79554240",
      "card": "VAR-101",
      "claim": "a7a756dafa6d478e82ec83536c41ceaf",
      "event": "complete:pass",
      "model": "gpt-6.1-sol",
      "role": "qa",
      "runId": "direct-var101-qa-2026-10-22",
      "stopEvidence": "Runtime reports reviewer ad8d7a07-2d00-4230-a005-a2599730a49c idle after completed read-only QA. Reviewer explicitly reports no source changes and no owned processes; no commands needing installation, builds or application servers were run. Developer remains stopped, and coordinator previously shut down its isolated build servers. No further execution message sent to either worker.",
      "workspace": "local-only:var-101-development"
    },
    {
      "agentId": "09e5a039-a5d2-4eeb-a8ea-81ebc8e1406b",
      "at": "2026-10-22T16:29:17.944053+00:00",
      "baseline": "a7d9f82983f4fc35c5a4703dfd69ffde79554240",
      "card": "VAR-105",
      "claim": "72f615be1ba741baaeeedf3fddd64027",
      "event": "complete:pass",
      "model": "gpt-6-astra",
      "role": "development",
      "runId": "direct-var105-2026-10-22",
      "stopEvidence": "Runtime read_agent reports actual Astra worker 09e5a039-a5d2-4eeb-a8ea-81ebc8e1406b idle after completed handoff; it explicitly reports no owned processes or services. Coordinator reran 233 injected-provider tests and observed successful isolated MSBuild/C# server shutdown (shell 363 exit 0). No further developer execution message was sent.",
      "workspace": "local-only:var-105-development"
    },
    {
      "agentId": "d87af16d-0f4f-4e51-8a70-80c0a700ed74",
      "at": "2026-10-22T16:50:16.549102+00:00",
      "baseline": "a7d9f82983f4fc35c5a4703dfd69ffde79554240",
      "card": "VAR-105",
      "claim": "69dec519abb34fe99352a3033945876f",
      "event": "complete:changes_requested",
      "model": "gpt-6.1-sol",
      "role": "qa",
      "runId": "direct-var105-qa-2026-10-22",
      "stopEvidence": "Runtime read_agent reports actual GPT-6.1 Sol reviewer d87af16d-0f4f-4e51-8a70-80c0a700ed74 idle after completed read-only QA; reviewer explicitly reports no edits, new runtime commands or owned processes. Candidate developer remains idle and coordinator previously stopped isolated build servers. No further execution message sent to either worker.",
      "workspace": "local-only:var-105-development"
    },
    {
      "agentId": "d61e2783-18dc-42e2-a225-daa08201b94e",
      "at": "2026-10-22T16:51:34.321031+00:00",
      "baseline": "a7d9f82983f4fc35c5a4703dfd69ffde79554240",
      "card": "VAR-102",
      "claim": "a38c5455b955410a871c00720e468c5a",
      "event": "complete:pass",
      "model": "gpt-6-astra",
      "role": "development",
      "runId": "direct-var102-2026-10-22",
      "stopEvidence": "Runtime reports Astra worker d61e2783-18dc-42e2-a225-daa08201b94e idle after completed handoff; worker explicitly reports no owned processes and stopped preview. Coordinator independently ran61 unit tests and10 Chromium checks; the owned strict test server was gracefully stopped and port4184 was confirmed free (shell392 exit0). No further execution sent to the developer.",
      "workspace": "local-only:var-102-development"
    },
    {
      "agentId": "9291aa85-8330-4d58-9e04-e38c6a6ef5cc",
      "at": "2026-10-22T17:07:48.789548+00:00",
      "baseline": "a7d9f82983f4fc35c5a4703dfd69ffde79554240",
      "card": "VAR-105",
      "claim": "0925a57c8922456eaa03a77e2ec5f195",
      "event": "complete:pass",
      "model": "gpt-6-astra",
      "role": "development",
      "runId": "direct-var105-correction1-2026-10-22",
      "stopEvidence": "Runtime reports Astra correction worker9291aa85-8330-4d58-9e04-e38c6a6ef5cc idle after completed handoff and no owned processes. Coordinator independently reran323 explanation tests and stopped the isolated MSBuild/C# servers (shell431 exit0). No further execution message sent to the worker.",
      "workspace": "local-only:var-105-development"
    },
    {
      "agentId": "a4a0377a-883b-413b-95be-fe07554d2c94",
      "at": "2026-10-22T17:56:52.659616+00:00",
      "baseline": "a7d9f82983f4fc35c5a4703dfd69ffde79554240",
      "card": "VAR-102",
      "claim": "7f83e2c015f94229805e0c49328e737a",
      "event": "complete:pass",
      "model": "gpt-6.1-sol",
      "role": "qa",
      "runId": "direct-var102-qa-2026-10-22",
      "stopEvidence": "Runtime reports reviewer a4a0377a-883b-413b-95be-fe07554d2c94 idle after final evidence handoff. Reviewer confirms all read-only shell checks completed, no edits, no tests/servers started and no owned processes. Developer and coordinator test servers were stopped earlier; no further worker execution sent.",
      "workspace": "local-only:var-102-development"
    },
    {
      "agentId": "21f35713-1adb-458c-a8e6-2b950b57a41c",
      "at": "2026-10-22T18:03:58.811754+00:00",
      "baseline": "a7d9f82983f4fc35c5a4703dfd69ffde79554240",
      "card": "VAR-105",
      "claim": "5da4366ce8674b7d8b1c928523fba4f5",
      "event": "complete:pass",
      "model": "gpt-6.1-sol",
      "role": "qa",
      "runId": "direct-var105-correction1-qa-2026-10-22",
      "stopEvidence": "Runtime reports read-only correction reviewer21f35713-1adb-458c-a8e6-2b950b57a41c idle after final no-significant-issues verdict. Inspected shell registry reports no running/pending shell entries; no further execution was sent. Candidate writers were stopped earlier and the frozen candidate is checked by the helper.",
      "workspace": "local-only:var-105-development"
    },
    {
      "agentId": "d100ea6e-5613-4c73-8de6-5b0612ef50a0",
      "at": "2026-10-22T18:03:59.040763+00:00",
      "baseline": "a7d9f82983f4fc35c5a4703dfd69ffde79554240",
      "card": "VAR-108",
      "claim": "2da6e1869c9647a2a4c656b26d508ae6",
      "event": "complete:pass",
      "model": "gpt-6-astra",
      "role": "development",
      "runId": "direct-var108-2026-10-22",
      "stopEvidence": "Runtime reports developer d100ea6e-5613-4c73-8de6-5b0612ef50a0 idle after completed handoff. Developer records owned server shutdown and successful port43108 bind after stopping it. Coordinator57-test foreground run and report validator exited0; no coordinator server started or further developer execution sent.",
      "workspace": "local-only:var-108-development"
    }
  ],
  "qaFailures": {
    "VAR-105": 1
  },
  "schemaVersion": 1
}
```
<!-- dispatch-state:end -->
