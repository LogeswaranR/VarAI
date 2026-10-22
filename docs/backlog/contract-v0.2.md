# Shared GraphQL contract v0.2

Approved by the user on 2026-10-21 for VAR-G00-T02. This replaces the proposed
REST transport in [v0.1](./contract-v0.1.md), which is retained as history.
The football scope and uncertainty policy are unchanged. T02 provides an
executable in-memory contract and test stubs, not a running GraphQL HTTP service,
review feature, live-model integration or completed G00 gate.

## 1. Sources of truth and ownership

- [C# models and interfaces](../../server/Contracts/Models.cs) define the schema's
  types. [Registration](../../server/Contracts/GraphQlContract.cs) supplies thin
  resolver boundaries with injected collaborators.
- [Exported schema](../../contracts/schema.graphql) and
  [approved operations](../../contracts/operations.graphql) define the wire
  shape used by the TypeScript client. Do not hand-edit generated artifacts.
- [C# rules](../../server/Contracts/ContractRules.cs) define domain constraints.
  Shared constants/fact expectations are exported to TypeScript. Both runtimes
  exercise the same [negative scenario cases](../../tests/contract-stubs/invalid-scenarios.json).
- [Client validation](../../client/src/contracts/validation.ts) checks selected
  response shapes, correlation, citations, limits and scenario invariants.
  Generated operation types alone are not runtime validation.
- The [board](./board.md) is the only status/assignment tracker.

| Owner | Paths / responsibility |
| --- | --- |
| G00 integration owner | `server/Contracts/**`, `client/src/contracts/**`, `contracts/**`, `tests/contract-stubs/**`, `tools/VarAI.ContractTool/**`, `scripts/generate-graphql.mjs`, shared contract tests, root manifests/lockfiles/configuration and application entry points |
| VAR-101 | `server/Scenarios/**`, `tests/VarAI.Server.Tests/Scenarios/**`; full authored content and repository implementation |
| VAR-102 | `client/src/review-room/**`, including package-local tests |
| VAR-103 | `client/src/scene/**`, including package-local tests |
| VAR-104 | `client/src/evidence/**`, including package-local tests |
| VAR-105 | `server/Explanations/**`, `tests/VarAI.Server.Tests/Explanations/**`; real explanation service/provider integration |
| VAR-106 | `client/src/explanation-view/**`, including package-local tests |
| VAR-107 | `client/src/comparison/**`, including package-local tests |
| VAR-108 | `tests/acceptance/**`, `docs/evaluation/**` |
| G01 integration owner | Register the real collaborators, HTTP transport/client adapters and UI composition; no test stubs in the production path |

These are ownership boundaries, not additional agents or implemented features.
The contract is an isolated class library. The stub library references only
contracts, never the web host or feature implementations. The web host references
contracts but not the stub library or export tool.

## 2. Transport and version changes

The planned endpoint is `/graphql`, to be mounted in G01. There is no
`POST /api/explanations` compatibility API. G00/T02 tests execute the schema
directly in memory without mounting a route or making HTTP/provider requests.

```graphql
type Query {
  scenarios: [ScenarioSummary!]!
  scenario(id: String!, requestId: String!): ScenarioResult!
}

type Mutation {
  explain(input: ExplanationRequestInput!): ExplanationResult!
}

union ScenarioResult = Scenario | ContractError
union ExplanationResult = ExplanationSuccess | ContractError
```

The queries expose supplied synthetic content, not live match observations.
`scenario` accepts a string ID so an unavailable ID can produce the explicit
`SCENARIO_NOT_FOUND` result. The explanation input uses the bounded `ScenarioId`
enum. GraphQL rejects unknown input fields and invalid enum/type/null values
before service execution.

Wire changes from the previous draft:

- `schemaVersion` is now `"0.2"`; old versions are rejected, not coerced.
- GraphQL enum tokens are uppercase, such as `CASUAL`, `ANALYST`, `AUTHORED`,
  `LIVE_AI`, `SUPPLIED`, `MISSING`, `COMPLETE` and `LIMITED`.
- A fact value is a typed object union or explicit `null`, not a mixed primitive
  hidden inside an opaque JSON scalar.
- `authoredExplanations` is explicitly `{casual, analyst}`. Each body contains
  `sourceMode: AUTHORED`, `status`, `interpretation`, `headline`, `points`,
  `limitations` and `recap`; correlation metadata is added only in a response.
- Domain errors are typed union members, not a per-error HTTP-status mapping.
  GraphQL transport/execution failures are separate and never count as a
  successful explanation merely because HTTP succeeded.

GraphQL permits clients to select fewer fields. The application baseline uses
the complete checked-in operations, with `__typename` on unions. Their generated
runtime guards reject omitted fields, incorrect types and missing nullable
properties. A nullable selected value must be explicitly `null`; absence is not
an invented value or default.

## 3. Synthetic scenario family

All scenarios are fictitious, English-language and explicitly synthetic.
Position observations and playing the pass are separate supplied facts.

| Supplied fact / result | S1 | S2 | S3 |
| --- | --- | --- | --- |
| Pass-time observation exists | `true` | `true` | `false` |
| Receiver in opponents' half | `true` | `true` | `true` |
| Receiver ahead of ball | `true` | `true` | missing, `null` |
| Receiver versus second-last opponent | `NEARER` | `LEVEL` | missing, `null` |
| Active involvement | `TOUCH` | `TOUCH` | `TOUCH` |
| Play type | `OPEN_PLAY` | `OPEN_PLAY` | `OPEN_PLAY` |
| Intervening opponent touch | `false` | `false` | `false` |
| Original decision | `GOAL_AWARDED` | `GOAL_AWARDED` | `GOAL_AWARDED` |
| Supplied review outcome | `GOAL_DISALLOWED` | `GOAL_CONFIRMED` | `null` |
| Authored interpretation | `OFFSIDE_SUPPORTED` | `NO_OFFSIDE_SUPPORTED` | `INSUFFICIENT_EVIDENCE` |
| Fixture score before / after | 0-0 / 0-0 | 0-0 / 1-0 | 0-0 / `null` |
| Explanation status | `COMPLETE` | `COMPLETE` | `LIMITED` |

The sole independent football-fact difference in the S1/S2 pair is
`RECEIVER_VS_SECOND_LAST`. Results, text and illustrative marker positions are
derived differences, not extra edited evidence. `comparison` identifies
`PAIR-01`, the reciprocal scenario ID and that changed key. S3 has no comparison.
The pair's version, match context and rule references must agree.

Excluded: interference judgments, deliberate-play exceptions, rebounds, saves,
direct restarts, other incident families, real footage and autonomous decisions.
Missing evidence does not establish either confirmation or disallowance.

### Scenario and fact records

The schema preserves `schemaVersion`, `contentVersion`, `id`, `synthetic`,
`label`, `match`, `originalDecision`, `suppliedReviewOutcome`, `scoreAfterReview`,
`interpretation`, `facts`, `rules`, `events`, `diagram`, `comparison` and
`authoredExplanations`. Editorial changes require a new content version.
Stable evidence IDs are scoped to a scenario/content version.

Every fact has `id`, `key`, `value`, `status` and a synthetic `sourceLabel`.
All seven keys must occur once, with unique IDs that cannot collide with the
reserved context evidence IDs. Supplied values must use the appropriate union:

| Keys | `FactValue` member / field |
| --- | --- |
| `PASS_TIME_OBSERVED`, `RECEIVER_IN_OPPONENTS_HALF`, `RECEIVER_AHEAD_OF_BALL`, `INTERVENING_OPPONENT_TOUCH` | `BooleanFactValue.boolean` |
| `RECEIVER_VS_SECOND_LAST` | `PositionFactValue.position` |
| `ACTIVE_INVOLVEMENT` | `InvolvementFactValue.involvement` |
| `PLAY_TYPE` | `PlayTypeFactValue.playType` |

For example, a selected supplied position has
`{"__typename":"PositionFactValue","position":"LEVEL"}`. Missing positions have
`value: null` and `status: MISSING`. S3's `PASS_TIME_OBSERVED` remains a supplied
boolean `false`, not a missing or guessed position.

### Rules and review authority

Each reference has `id`, `title`, `section`, `publisher`, an HTTPS IFAB primary
`url`, `edition`, `checkedOn`, `reviewStatus` and an original concise `summary`.
The approved edition is **2026/27**, confirmed as published in the
[official IFAB library](https://www.theifab.com/laws-of-the-game-documents/).
No competition-specific applicability or interpretation is certified by that.

Unresolved draft metadata may have explicit null edition/check date. A
`SOURCE_CHECKED` reference needs the approved edition and a valid check date;
`EXPERT_REVIEWED` additionally requires a trusted review record matching
scenario, content version, rule ID and edition. Such a record is external to
model output. Structural validation cannot authenticate a human's expertise.

All T02 fixtures are **DRAFT**, have edition `2026/27` and `checkedOn: null`.
They have not received source-interpretation or expert review. A synthetic
review record used by a validator test is not an actual content review.

### Replay and illustration

Events have unique IDs, non-negative strictly increasing `offsetMs`, a kind,
label and known `revealFactIds`. They progress through `PASS`, `RECEIVER_TOUCH`,
`SHOT`, `GOAL`, `REVIEW_STARTED` and a final, single `REVIEW_READY`. Additional
ordered events are permitted. Timing is labelled as compressed demonstration
timing; readiness means a prototype evidence pack, not a referee verdict.

Diagrams use `LEFT_TO_RIGHT`, labelled markers with coordinates from 0 to 100,
`secondLastReferenceX` and `textAlternative`. S1/S2 are `ILLUSTRATIVE`. S3 is
`UNAVAILABLE` with no markers and an explicit null reference line. Coordinates
must never be used to calculate a fact or interpretation.

## 4. Explanation and error boundary

`ExplanationRequestInput` requires `schemaVersion`, a non-empty per-attempt
`requestId`, `scenarioId`, exact `contentVersion`, `audience` and `sourceMode`.
There is no arbitrary prompt, model selection, rule text or fixture data input.
Changing context never automatically triggers generation or a paid call.

`ExplanationSuccess` echoes those six fields and adds `status`, `interpretation`,
`headline`, `points`, `limitations` and `recap`. The structured interpretation
must match the selected scenario across both audiences and team-label changes.

A claim has `id`, plain `text`, `evidenceIds` and `ruleIds`. Every claim needs
valid supporting references. Rule-application claims need fact and rule
references. Context references are:

- `DECISION-ORIGINAL`
- `DECISION-REVIEW`
- `MATCH-SCORE-BEFORE`
- `MATCH-SCORE-AFTER`

An unavailable outcome supports a statement of uncertainty, never an invented
result. The shell's eventual context-evidence projection preserves labels,
source labels, supplied/missing status and explicit nulls.

| Bound | Maximum |
| --- | --- |
| Casual headline plus points | 90 whitespace-separated words |
| Analyst headline plus points | 220 whitespace-separated words |
| Recap | 40 whitespace-separated words |
| One generation attempt | 15 seconds; no invisible retries |

Both validators use Unicode whitespace separation and test the exact word
boundaries plus one word over. Limitation strings must be non-empty and must
honestly communicate synthetic/provisional content and missing evidence.
Unsupported certainty percentages remain prohibited. Reference existence,
length and structured interpretation checks do not prove that prose follows
from its evidence or that a limitation sentence is truthful; semantic evaluation
and human content review remain VAR-105/VAR-108/G01 work.

`ContractError` contains `schemaVersion`, `requestId`, `status: ERROR`, `code`,
a user-safe `message` and `retryable`:

| Code | Retryable |
| --- | --- |
| `INVALID_REQUEST` | No |
| `SCENARIO_NOT_FOUND` | No |
| `CONTENT_VERSION_MISMATCH` | No; reload scenario |
| `MODEL_NOT_CONFIGURED` | No |
| `MODEL_UNAVAILABLE` | Yes |
| `TIMEOUT` | Yes |
| `INVALID_OUTPUT` | Yes |

Malformed GraphQL syntax/types/required inputs may produce top-level `errors`
instead of a domain union member. Clients reject execution errors, missing
data, incomplete selected responses and mismatched correlation/context. They
never treat partial data as a successful explanation. G01 must implement and
test the actual HTTP/media-type behavior; T02 does not assert transport status
codes for these in-memory results.

In production, a malformed/missing correlation ID requires a new safe ID.
Only the deterministic test service uses a fixed `stub-invalid-request` ID.
Each viewer retry must generate a fresh request ID. No live failure switches
to authored mode; authored output is a separate explicit selection.

## 5. Interfaces, composition and stub isolation

The C# interfaces are `IScenarioRepository`, `IExplanationService` and
`IExplanationProvider`. The provider accepts `GenerationInput` with supplied
facts, rule summaries, outcomes, score/context and audience, never a diagram or
embedded authored answers. Its raw string result must be validated by VAR-105,
not trusted as an already valid explanation. Cancellation is explicit.

TypeScript exposes injected `ScenarioRepository` and `ExplanationClient`
interfaces, source selection and minimal panel-input types in
[interfaces.ts](../../client/src/contracts/interfaces.ts). No panel imports
another panel's implementation. The shell owns scenario selection, replay run,
visible evidence and source selection; the reader owns audience/mode and recap.

The eventual shell must gate outcome/after-score evidence until review-ready,
original-decision evidence until the goal, and pass-time illustration until the
relevant facts are visible. Comparison uses the normal scenario-reset path.
Freshness includes request ID, replay run ID, scenario, content version, audience
and source mode. Reset increments the run ID and clears stale explanation/recap
even when the selected scenario is unchanged. T02 defines inputs, not this UI.

The existing stable UI hooks and accessibility expectations in the
[historical composition section](./contract-v0.1.md#stable-ui-hooks-for-independent-acceptance-test-authoring)
are retained unchanged and exported by
[ui-hooks.ts](../../client/src/contracts/ui-hooks.ts). The test-only
[FeatureHarness](../../client/src/harness/FeatureHarness.tsx) provides typed
injection slots without changing this wire contract or package ownership.
Its manually staged inputs and probes are not production replay/reader logic.
See the [T03 usage and verification limits](../../README.md#isolated-feature-harness-and-ci-t03)
and the board before treating this as an approved baseline.

Shared JSON scenarios/errors are in [tests/contract-stubs/](../../tests/contract-stubs/).
The C# fixture service covers all 3 scenarios x 2 audiences x 2 modes. Every
`LIVE_AI` fixture adds an explicit **SIMULATED LIVE-AI TEST STUB** limitation and
uses authored fixture content, never a provider call. Generated TypeScript
fixtures are actual in-memory GraphQL results, checked against generated types.
Client/repository adapters clone their data. Provider stubs include a constant
raw response (including malformed content) and a cancellation-only response.

These stubs import contracts only. They are not production fallback providers.
The 15-second value and timeout fixtures do not demonstrate a real timed provider
request; deadline enforcement/fake-clock verification remain VAR-105 work.

## 6. Generation, approval and change control

After a deliberate contract change:

```bash
npm run contracts:generate
npm run test:contracts
npm run verify
```

`contracts:check` is part of `verify` and checks C# schema, generated rule
constants, actual GraphQL fixture results, TypeScript operation types and
runtime response shapes without rewriting them. Generation uses local files
and an in-memory schema, not remote introspection.

Any field, enum, error, operation or ownership-boundary change requires impact
review and an approved contract revision. Content-only changes require a new
content version. The v0.2 transport/mapping affects all package contracts and
future integration/acceptance tests, not their product scope or prerequisites.
The optional CSV remains an old creation snapshot to reconcile before any
separately authorised import.

T02 does not authorise T03, feature work, worker dispatch, scheduling, commits,
cloud resources, live requests, Cosmos DB, Blob storage or saved-history/rule
retrieval services. See [verification evidence](../../README.md#t02-verification-2026-10-21)
and the [board](./board.md) before making completion claims.
