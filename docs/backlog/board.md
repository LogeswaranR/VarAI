# VarAI local board

Tracker: repository | Last updated: 2026-10-22

This file is the source of truth for work-item status, ownership and blockers.
Requirements and acceptance criteria remain in the
[product backlog](./README.md) and [technical breakdown](./technical-tasks.md);
interfaces remain in the [shared contract](./contract-v0.2.md).

Inventory: **1 Epic, 10 Issues and 22 technical Tasks**. This tracks the existing
offside prototype scope. The Cosmos DB and saved-history proposal has not been
added to it. No prototype implementation is marked complete by creating this board.

**Next decision:** separately authorise how to start Batch 1 (VAR-101, VAR-102,
VAR-105 and VAR-108). G00 was signed off by the user on 2026-10-22 with shared
baseline `a7d9f82983f4fc35c5a4703dfd69ffde79554240`. All feature packages remain
To Do and Dispatch remains Paused; no worker launch, queueing, scheduling or push
is authorised by this gate approval.

**Delivery approach approved:** follow the [board-driven workflow](./delivery-workflow.md)
with two GPT-6 Astra development slots, two GPT-6.1 Sol QA slots and user
sign-off after each four-package batch. The user selected hourly native scans
instead of a 10-minute local timer, saved disabled. No feature workers have run;
current G00 work does not start either batch.

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
| Current authorisation | G00 sign-off and a local approval-record commit authorised on 2026-10-22; no push, remote CI, feature implementation, queueing or dispatch |
| Scaffold tooling/layout | ASP.NET Core in `server/`, React/TypeScript + Vite in `client/`; Node.js 24 LTS/npm, MSTest, Vitest, Testing Library and ESLint approved; [pins and checks recorded](../../README.md#local-scaffold) |
| Shared-contract mapping | T02 uses C# contracts/schema under `server/Contracts/`, generated TypeScript under `client/src/contracts/`, and shared deterministic stubs under `tests/contract-stubs/`; no HTTP endpoint or UI wiring |
| Reference-only follow-up | User approved pointing the paused dispatcher, its fixture tests and handoff skill link to v0.2; all 30 existing fixture tests passed, without enabling scheduling or dispatch |
| T03 local implementation | Typed feature harness, 23 UI hooks, eight package selectors, Playwright Chromium checks and a SHA-pinned model-free GitHub Actions definition are saved and locally checked; remote CI not run |
| T03 clean-checkout gate | Completed after explicit approval on 2026-10-22; two independent clean clones passed against `e7b8d138d58228521ae95f5dfb68fd2599b95107` |
| Verified T03 revision | `e7b8d138d58228521ae95f5dfb68fd2599b95107`; a verified code baseline, not automatic approval of the dispatcher control below |
| G00 shared revision | User approved `a7d9f82983f4fc35c5a4703dfd69ffde79554240`; executable source matches the twice-verified T03 revision, with only documentation/status differences |
| Package accountability | Copilot coordinator is accountable for VAR-101 through VAR-108 and G01; actual developer/QA identities are recorded only through separately authorised claims and attachment |
| Separate permissions | Only the explicitly approved baseline/evidence/gate-record commits and verification checkouts are authorised; no push, cloud provisioning, live-model calls, Azure DevOps/PAT access or persistence/storage additions |

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

Still unverified or unapproved: remote CI/Linux execution, actual development/QA
worker invocation, source-interpretation/expert review, application live-model
access/spending, full product acceptance and the learning study. These are not
converted into success claims by closing G00.

## Automation controls

Only the coordinator changes these controls after explicit user approval.
Both the native schedule and board dispatch must be enabled for automatic
work. G00 and its three technical Tasks must also be Done; T01 alone does not
open the gate. Queue only approved parent packages, never G00/T02/T03.

| Setting | Value |
| --- | --- |
| Dispatch | Paused |
| Active batch | 1 |
| Approved baseline | a7d9f82983f4fc35c5a4703dfd69ffde79554240 |
| Batch 1 sign-off | Pending |

The native hourly definition is saved disabled; its identifier and read-back
evidence are in the [automation runbook](./delivery-workflow.md#native-hourly-coordinator-runbook).
There have been no scheduled runs or real worker assignments from this setup.

## Epic and work packages

| ID | Work item | Kind | Status | Owner | Notes |
| --- | --- | --- | --- | --- | --- |
| VAR-E01 | [Understand a synthetic offside goal review](./README.md#epic-var-e01-understand-a-synthetic-offside-goal-review) | Epic | To Do | User (product) | Product/content approval; no completed product claim |
| VAR-G00 | [Approve the shared development baseline](./README.md#var-g00-approve-the-shared-development-baseline) | Gate | Done | Copilot (this session) | [User sign-off and evidence](#g00-sign-off-2026-10-22); shared baseline `a7d9f82`; dispatch remains paused |
| VAR-101 | [Create the synthetic review library](./README.md#var-101-create-the-synthetic-review-library) | Package | To Do | Copilot coordinator | - |
| VAR-102 | [Build the review-room replay](./README.md#var-102-build-the-review-room-replay) | Package | To Do | Copilot coordinator | - |
| VAR-103 | [Visualise the supplied offside scene](./README.md#var-103-visualise-the-supplied-offside-scene) | Package | To Do | Copilot coordinator | - |
| VAR-104 | [Explore evidence and rule references](./README.md#var-104-explore-evidence-and-rule-references) | Package | To Do | Copilot coordinator | - |
| VAR-105 | [Provide bounded evidence-linked explanations](./README.md#var-105-provide-bounded-evidence-linked-explanations) | Package | To Do | Copilot coordinator | - |
| VAR-106 | [Read personalised explanations and recaps](./README.md#var-106-read-personalised-explanations-and-recaps) | Package | To Do | Copilot coordinator | - |
| VAR-107 | [Compare one controlled fact](./README.md#var-107-compare-one-controlled-fact) | Package | To Do | Copilot coordinator | - |
| VAR-108 | [Prepare acceptance and learning evaluation](./README.md#var-108-prepare-acceptance-and-learning-evaluation) | Package | To Do | Copilot coordinator | - |
| VAR-G01 | [Integrate and verify the prototype](./README.md#var-g01-integrate-and-verify-the-prototype) | Gate | To Do | Copilot coordinator | Accountable integration owner; work not started |

## Technical Tasks

Task owners inherit their parent Issue's owner unless explicitly overridden.
An inherited owner is unassigned while the parent remains unassigned.

| ID | Parent | Work item | Status | Owner | Notes |
| --- | --- | --- | --- | --- | --- |
| VAR-G00-T01 | VAR-G00 | [Scaffold the approved application and tooling](./technical-tasks.md#var-g00-t01-scaffold-the-approved-application-and-tooling) | Done | Inherit parent | [Verification evidence](../../README.md#t01-verification-2026-10-21); both criteria passed; no feature package or complete G00 claim |
| VAR-G00-T02 | VAR-G00 | [Implement shared contracts and deterministic stubs](./technical-tasks.md#var-g00-t02-implement-shared-contracts-and-deterministic-stubs) | Done | Inherit parent | [GraphQL v0.2 evidence](../../README.md#t02-verification-2026-10-21); both criteria passed; no HTTP/live-provider or feature-completion claim |
| VAR-G00-T03 | VAR-G00 | [Provide an isolated feature harness and CI checks](./technical-tasks.md#var-g00-t03-provide-an-isolated-feature-harness-and-ci-checks) | Done | Inherit parent | [Completion evidence](../../README.md#t03-clean-checkout-completion-2026-10-22); both criteria passed on two clean clones of `e7b8d13`; remote CI not run; no G00/dispatch approval implied |
| VAR-101-T01 | VAR-101 | [Author versioned scenario and source records](./technical-tasks.md#var-101-t01-author-versioned-scenario-and-source-records) | To Do | Inherit parent | - |
| VAR-101-T02 | VAR-101 | [Implement the scenario repository and integrity checks](./technical-tasks.md#var-101-t02-implement-the-scenario-repository-and-integrity-checks) | To Do | Inherit parent | - |
| VAR-102-T01 | VAR-102 | [Implement deterministic replay state](./technical-tasks.md#var-102-t01-implement-deterministic-replay-state) | To Do | Inherit parent | - |
| VAR-102-T02 | VAR-102 | [Compose replay controls and injectable panels](./technical-tasks.md#var-102-t02-compose-replay-controls-and-injectable-panels) | To Do | Inherit parent | - |
| VAR-103-T01 | VAR-103 | [Render illustrative and missing-snapshot states](./technical-tasks.md#var-103-t01-render-illustrative-and-missing-snapshot-states) | To Do | Inherit parent | - |
| VAR-104-T01 | VAR-104 | [Render typed evidence and rule entries](./technical-tasks.md#var-104-t01-render-typed-evidence-and-rule-entries) | To Do | Inherit parent | - |
| VAR-104-T02 | VAR-104 | [Implement citation focus and unavailable-reference states](./technical-tasks.md#var-104-t02-implement-citation-focus-and-unavailable-reference-states) | To Do | Inherit parent | - |
| VAR-105-T01 | VAR-105 | [Implement request validation and scenario resolution](./technical-tasks.md#var-105-t01-implement-request-validation-and-scenario-resolution) | To Do | Inherit parent | - |
| VAR-105-T02 | VAR-105 | [Implement the guarded live-provider adapter](./technical-tasks.md#var-105-t02-implement-the-guarded-live-provider-adapter) | To Do | Inherit parent | - |
| VAR-105-T03 | VAR-105 | [Validate generated claims and output limits](./technical-tasks.md#var-105-t03-validate-generated-claims-and-output-limits) | To Do | Inherit parent | - |
| VAR-106-T01 | VAR-106 | [Implement explicit requests and response freshness](./technical-tasks.md#var-106-t01-implement-explicit-requests-and-response-freshness) | To Do | Inherit parent | - |
| VAR-106-T02 | VAR-106 | [Render sourced explanation and recap states](./technical-tasks.md#var-106-t02-render-sourced-explanation-and-recap-states) | To Do | Inherit parent | - |
| VAR-107-T01 | VAR-107 | [Implement the curated comparison selector](./technical-tasks.md#var-107-t01-implement-the-curated-comparison-selector) | To Do | Inherit parent | - |
| VAR-108-T01 | VAR-108 | [Build the requirement-mapped acceptance harness](./technical-tasks.md#var-108-t01-build-the-requirement-mapped-acceptance-harness) | To Do | Inherit parent | - |
| VAR-108-T02 | VAR-108 | [Prepare semantic expectations and the learning study](./technical-tasks.md#var-108-t02-prepare-semantic-expectations-and-the-learning-study) | To Do | Inherit parent | - |
| VAR-G01-T01 | VAR-G01 | [Wire real modules and the explanation route](./technical-tasks.md#var-g01-t01-wire-real-modules-and-the-explanation-route) | To Do | Inherit parent | - |
| VAR-G01-T02 | VAR-G01 | [Execute integrated regression and browser acceptance](./technical-tasks.md#var-g01-t02-execute-integrated-regression-and-browser-acceptance) | To Do | Inherit parent | - |
| VAR-G01-T03 | VAR-G01 | [Verify authorised live-model access through the application](./technical-tasks.md#var-g01-t03-verify-authorised-live-model-access-through-the-application) | To Do | Inherit parent | - |
| VAR-G01-T04 | VAR-G01 | [Publish verification evidence and developer handoff](./technical-tasks.md#var-g01-t04-publish-verification-evidence-and-developer-handoff) | To Do | Inherit parent | - |

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

<!-- dispatch-state:start -->
```json
{
  "schemaVersion": 1,
  "claims": {},
  "candidates": {},
  "qaFailures": {},
  "contextReplacements": {},
  "history": []
}
```
<!-- dispatch-state:end -->
