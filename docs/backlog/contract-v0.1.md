# Proposed shared contract v0.1

**Historical draft:** superseded on 2026-10-21 by the approved
[GraphQL contract v0.2](./contract-v0.2.md). The text below is retained as the
original REST-oriented proposal, not the current executable wire contract.

Status: implementation draft for VAR-G00; v0.1 domain and JSON/API behavior
retained by user decision on 2026-10-21. Stack-related implementation/ownership
mapping still requires approval. This is not executable application code.

This contract accompanies the [product backlog](./README.md). Its purpose is to
let packages work against the same inputs and outputs, not to prescribe a large
architecture. G00 must turn it into shared types, executable validation and test
stubs before parallel implementation begins.

## 1. Scenario boundary

All content is fictitious, English-language and explicitly labelled synthetic.
The prototype explains supplied observations and review outcomes. It does not
extract facts from footage, measure offside or make an official decision.

### Controlled scenario family

These are proposed examples requiring primary-source checking and honest
content-review labels. They are not already expert-validated interpretations.

| Field | S1: complete evidence | S2: changed position | S3: missing snapshot |
| --- | --- | --- | --- |
| Pass-time observation available | Yes | Yes | No |
| Receiver in opponents' half | Supplied true | Supplied true | Supplied true |
| Receiver ahead of the ball at the relevant touch | Supplied true | Supplied true | Unknown |
| Receiver relative to second-last opponent at that touch | Nearer the goal line | Level | Unknown |
| Active involvement | Receiver plays/touches the pass | Same | Same |
| Play type | Open play | Same | Same |
| Intervening opponent touch | None supplied | Same | Same |
| Original on-field decision | Goal awarded | Same | Same |
| Supplied synthetic review outcome | Goal disallowed | Goal confirmed | Unavailable |
| Bounded interpretation | Offside supported by supplied facts | No offside supported by supplied facts | Insufficient evidence |
| Illustrative score before | 0-0 | 0-0 | 0-0 |
| Illustrative score after review | 0-0 | 1-0 | Unavailable |

Only `receiverVsSecondLast` is an independent football-fact change between S1
and S2. Outcome, interpretation, explanation and diagram differences are derived
consequences, not additional edited evidence. Different record IDs and labels
are metadata. S3 is a missing-evidence case, not a permitted counterfactual pair.

The v0.1 domain excludes interference-with-opponent judgments, deliberate-play
exceptions, rebounds, saves, direct restarts and other offside edge cases.
If a fixture introduces one, reject it as out of scope rather than applying this
small example as a universal rules engine.

The offside-position observation and active involvement are separate facts.
Missing position evidence does not establish that a goal should be confirmed,
disallowed or retrospectively changed. S3 reports the supplied original decision
and unavailable review outcome separately.

## 2. Data records

Field names and enum values below are proposed public contracts. Required
unknown values must be represented as `null` plus missing status, not omitted
or replaced with a default. Stable identifiers are scoped to a scenario and its
content version.

### Scenario

| Field | Shape / constraint |
| --- | --- |
| `schemaVersion` | Literal `"0.1"` |
| `contentVersion` | Non-empty editorial version; changed whenever facts, sources or authored responses change |
| `id` | `"S1"`, `"S2"` or `"S3"` |
| `synthetic` | Literal `true` |
| `label` | Plain-text display label |
| `match` | Fictitious `homeTeam`, `awayTeam`, `incidentMinute`; `scoreBefore` as `{home, away}` non-negative integers |
| `originalDecision` | Literal `"goal_awarded"` for this family |
| `suppliedReviewOutcome` | `"goal_disallowed"`, `"goal_confirmed"` or `null` |
| `scoreAfterReview` | `{home, away}` or `null`; must agree with the supplied outcome, not a model prediction |
| `interpretation` | `"offside_supported"`, `"no_offside_supported"` or `"insufficient_evidence"`; authored, provisional until reviewed |
| `facts` | Array of Fact records with unique IDs and keys |
| `rules` | Array of RuleReference records with unique IDs |
| `events` | Ordered ReplayEvent records with unique IDs |
| `diagram` | Diagram record; positions are illustrations, never model evidence |
| `comparison` | `{pairId: "PAIR-01", otherScenarioId, changedFactKey: "receiverVsSecondLast"}` for S1/S2; `null` for S3 |
| `authoredExplanations` | One validated explanation body for each audience; provenance remains `"authored"` |

### Fact

Each fact has `id`, `key`, `value`, `status` (`"supplied"` or `"missing"`) and
`sourceLabel` (an explicit synthetic authoring label, not camera evidence).

| Key | Allowed supplied values | Missing value |
| --- | --- | --- |
| `passTimeObserved` | Boolean | `null` |
| `receiverInOpponentsHalf` | Boolean | `null` |
| `receiverAheadOfBall` | Boolean | `null` |
| `receiverVsSecondLast` | `"nearer"` or `"level"` | `null` |
| `activeInvolvement` | `"touch"` | `null` |
| `playType` | `"open_play"` | `null` |
| `interveningOpponentTouch` | Boolean, restricted to `false` in v0.1 | `null` |

S3 has supplied `passTimeObserved: false`; the two unavailable pass-time
relations have `status: "missing"` and `value: null`. A known absence of an
observation is different from an observed positional fact.

### RuleReference

Required fields:

- `id`, `title`, `section`, `publisher: "IFAB"`, `url` (HTTPS primary source).
- `edition`: confirmed edition label, or `null` while the draft is unresolved.
- `checkedOn`: source-check date, or `null` before a check.
- `reviewStatus`: `"draft"`, `"source-checked"` or `"expert-reviewed"`.
- `summary`: original concise wording, not a copied law document.

`source-checked` requires a recorded edition and check date. `expert-reviewed`
additionally requires an actual review record. G00 must confirm an edition
before dispatch; neither a `latest` URL nor the date of this backlog pins it.
Rule summaries and section references are inputs to be checked, not evidence
that a model's interpretation is correct.

### ReplayEvent

Fields: `id`, `offsetMs` (non-negative integer), `kind`, `label`,
`revealFactIds` (known fact IDs).

Kinds: `"pass"`, `"receiver_touch"`, `"shot"`, `"goal"`, `"review_started"`,
`"review_ready"`. Offsets must be strictly increasing. The final event permits
explanation requests and reveals the supplied review outcome, if any.

Replay timing is compressed for demonstration and labelled accordingly.
`review_ready` means the prototype evidence pack is available, not that an
actual referee completed a real review.

### Diagram

Fields: `status` (`"illustrative"` or `"unavailable"`),
`direction: "left_to_right"`, `markers`, `secondLastReferenceX`, `textAlternative`.

- A marker has `id`, `role` (`"passer"`, `"receiver"`, `"opponent"` or `"ball"`),
  `label`, and illustrative `x`/`y` coordinates from 0 to 100.
- S1/S2 show only the relevant players, not a claim to reconstruct all players.
- S3 uses an empty marker list and `secondLastReferenceX: null` for the
  unavailable pass-time snapshot.
- Never infer a fact or measurement from these coordinates. Fact records, not
  marker positions, are the explanation input.

## 3. Explanation boundary

Proposed endpoint: `POST /api/explanations`. Route wiring belongs to G01; VAR-105
implements the underlying module independently. Credentials remain server-side.

### Request

```json
{
  "schemaVersion": "0.1",
  "requestId": "unique-per-attempt",
  "scenarioId": "S1",
  "contentVersion": "approved-content-version",
  "audience": "casual",
  "sourceMode": "authored"
}
```

- Audience: `"casual"` or `"analyst"`.
- Source mode: `"authored"` or `"live-ai"`, explicitly selected by the viewer.
- No arbitrary prompt, invented event data or user-supplied rule text is accepted.
- The server loads the matching scenario through an injected repository.
- A content-version mismatch is an error, not an invitation to use newer facts
  silently.
- The browser enables requests only at review-ready. The server does not infer
  match progression or invent an official outcome.

### Successful response

Required fields: `schemaVersion`, `requestId`, `scenarioId`, `contentVersion`,
`audience`, `sourceMode`, `status`, `interpretation`, `headline`, `points`,
`limitations`, `recap`.

| Field | Shape / constraint |
| --- | --- |
| `status` | `"complete"` for S1/S2 or `"limited"` for S3; describes evidence availability, not certainty of official correctness |
| `interpretation` | Same bounded enum and supported authored interpretation as the scenario |
| `headline` | One Claim |
| `points` | Array of Claims |
| `limitations` | Plain-text array, including synthetic/provisional content limits and missing evidence where applicable |
| `recap` | One Claim describing the supplied consequence, not a predicted result |

A Claim contains `id`, `text`, `evidenceIds` and `ruleIds`. Every claim needs at
least one valid supporting reference. Rule-application claims need both fact and
rule references. References may point to fact IDs or these fixed evidence IDs:
`DECISION-ORIGINAL`, `DECISION-REVIEW`, `MATCH-SCORE-BEFORE`,
`MATCH-SCORE-AFTER`. An unavailable outcome may support a statement that the
outcome is unknown, never a statement asserting a result.

The shell projects those four context fields into evidence entries with `id`,
`label`, `value`, `status` (`"supplied"` or `"missing"`) and `sourceLabel`, so the
evidence explorer can resolve these citations as well as Fact IDs. Before
`review_ready`, review outcome and after-review score entries are not exposed.
Original-decision evidence is exposed at the goal event; score-before evidence
is available from the start.

Output targets, proposed for this prototype:

- Casual headline plus points: at most 90 whitespace-separated words.
- Analyst headline plus points: at most 220 whitespace-separated words.
- Recap: at most 40 whitespace-separated words.
- No unsupported certainty percentages.
- Same substantive interpretation across audience modes and team-label changes.

Reference existence, allowed enums and length can be checked in code. Whether
each sentence actually follows from its cited evidence also requires evaluation
and human review. Do not market schema validation as a hallucination guarantee.

Live generation receives approved facts, rule summaries and supplied outcomes,
not diagram measurements. It explains an authored scenario rather than proving
that the model independently adjudicated it correctly.

### Error response

```json
{
  "schemaVersion": "0.1",
  "requestId": "unique-per-attempt",
  "status": "error",
  "code": "MODEL_NOT_CONFIGURED",
  "message": "Live explanations are not configured.",
  "retryable": false
}
```

For a malformed or missing request ID, the server supplies a new correlation ID.
Messages are user-safe and must not contain credentials or raw provider payloads.

| Code | Proposed HTTP status | Retryable |
| --- | --- | --- |
| `INVALID_REQUEST` | 400 | No |
| `SCENARIO_NOT_FOUND` | 404 | No |
| `CONTENT_VERSION_MISMATCH` | 409 | No; reload scenario |
| `MODEL_NOT_CONFIGURED` | 503 | No |
| `MODEL_UNAVAILABLE` | 503 | Yes |
| `TIMEOUT` | 504 | Yes |
| `INVALID_OUTPUT` | 502 | Yes |

One attempt has a 15-second deadline. Stop waiting and surface timeout; do not
launch invisible retries. A viewer can deliberately retry a retryable error.
Live failure never switches to authored mode. Authored mode remains separately
selectable and visibly labelled.

The client treats malformed or mismatched successful responses as invalid
output. Every retry has a new request ID.

## 4. UI composition and state ownership

G00 selects the framework and makes the following interfaces executable.
Names describe responsibilities; they do not assert that these files already exist.

| Owner | Receives | Emits / owns |
| --- | --- | --- |
| Review-room shell | Scenario repository, injected feature slots | Selected scenario; replay run ID; current event; visible fact IDs; review-ready flag; current source selection |
| Scene | Scenario diagram, visible facts, review-ready flag | Presentation only |
| Evidence explorer | Visible facts and context evidence entries, rule references, source selection | Focus/navigation within sources |
| Explanation reader | Scenario ID/version, run ID, review-ready flag, injected explanation client | Audience and mode state; request action; result state; `inspectSources({evidenceIds, ruleIds})` |
| Comparison | Current scenario, approved S1/S2 pair records supplied by the host, review-ready flag | `selectScenario("S1" | "S2")` |

Source inspection is forwarded through the shell; no panel imports another
panel's implementation. The explanation reader owns and renders the recap.
Comparison selection goes through the same host reset path as the main selector.
Comparison results remain hidden until review-ready. The scene shows its
pass-time snapshot only once the relevant positional facts are visible; before
that it renders a neutral replay placeholder rather than leaking the variant.

Response freshness includes request ID, replay run ID, scenario, content version,
audience and mode. Restart increments the run ID even when the scenario is
unchanged. Old responses are ignored and cannot restore a cleared recap.

Audience/mode changes clear mismatched content and require a new explicit
generation action; they do not trigger automatic paid requests. Changing
scenario or restarting similarly clears the current result.

### Stable UI hooks for independent acceptance-test authoring

Prefer accessible roles and labels. Where a stable hook is necessary, G00
reserves these `data-testid` values:

| Package | Hooks |
| --- | --- |
| 102 | `scenario-select`, `replay-play`, `replay-pause`, `replay-reset`, `review-ready`, `synthetic-badge` |
| 103 | `scene-panel`, `missing-snapshot` |
| 104 | `evidence-panel`, `rule-reference`, `missing-evidence` |
| 106 | `audience-select`, `source-mode-select`, `explain-button`, `explanation-loading`, `explanation-error`, `explanation-result`, `claim-source-link`, `source-mode-badge`, `recap-panel` |
| 107 | `comparison-panel`, `comparison-toggle`, `comparison-unavailable` |

Repeated hooks such as claim-source links are scoped to their claim row.
Required browser checks include keyboard access, visible focus, announced status,
non-colour-only distinctions and no horizontal overflow at 375px and 1280px.
These checks do not establish complete accessibility compliance.

## 5. Shared baseline versus package deliverables

The approved T01 scaffold has its host in `server/` and UI in `client/`.
It contains only entry points, a labelled placeholder, a readiness route and
scaffold tests. G00 still owns these entry points and root configuration.
The shared-contract paths below and feature-package paths in the backlog remain
proposals to map during T02; they do not describe implemented schemas or stubs.

G00 owns `src/contracts/**`, `tests/contract-stubs/**`, root configuration,
dependency manifests, common design tokens and the application entry points.
It must provide:

- Executable schemas/types for this approved contract.
- Minimal illustrative S1/S2/S3 stubs, a comparison pair and response/error stubs.
- A scenario-repository interface and explanation-client/provider interfaces.
- A slot-based host entry with clearly labelled placeholders.
- Repository-defined test, type-check and build commands.

These stubs unblock development but are not the full reviewed scenario library
delivered by VAR-101. Production wiring to real modules happens in G01.

Do not create a separate deployable application or independent dependency stack
for each agent. Do not copy shared schemas into feature folders. Agents request
root dependency changes from the integration owner.

If the approved stack uses different paths, update the ownership table and
baseline once before dispatch. Do not ask separate agents to improvise it.

## 6. Approval and change record

On 2026-10-21, the user selected an ASP.NET Core/C# backend on .NET 10 LTS
with a React/TypeScript frontend and requested stack-only contract adaptations.
The existing scenarios, fields, enums, events, errors and JSON/API behavior are
retained. IFAB 2026/27 is the approved source edition; scenario content remains
draft until checked against it, and expert review has not been performed.

The initial T01 scaffold layout and tooling were separately approved, implemented
and [checked](../../README.md#t01-verification-2026-10-21). The remaining shared-contract
and feature-package paths must be mapped to .NET/React before T02 implementation.
No domain/API ownership boundary or wire-schema version is changed by the
scaffold. Follow the change rule below when approving the detailed mapping. See the
[G00 decision record](./board.md#g00-decisions-and-readiness) for permissions,
owners and remaining decisions. T01 approval does not authorise T02/T03, feature
implementation, commits, agent dispatch or paid services.

Before G00 closes, record product approval, stack/tool versions, baseline commit,
rule edition, source-review status and package owners. Model access may remain
unapproved at this stage; record that as an external G01 dependency.

A change to a field, enum, event, error or ownership boundary requires an impact
review across affected packages and a contract version update. Content-only
changes update `contentVersion` and their affected expectations.

No part of this proposed contract is an assertion of current application
behavior, confirmed account access or validated football expertise.
