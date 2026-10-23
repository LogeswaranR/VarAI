# Consolidated local prototype — 2026-10-23

This record covers the consolidated VAR-101 through VAR-108 implementation
and local G01 composition. Combined independent QA, a separately authorised
one-request live smoke and explicit human acceptance subsequently completed
the accepted local scope. Historical results and remaining limits are retained below.
Baseline: `a7d9f82983f4fc35c5a4703dfd69ffde79554240`.
All 68 copied candidate files were SHA-256 checked against the coordinator's
input manifest before editing. Historical package READMEs are not current
execution evidence.

## Run from the repository root

The accepted source is consolidated into the normal checkout on
`prototype/accepted-local-delivery`. Activate the existing pinned tools from
the repository root; a fresh clone needs the versions listed in the root README.

```bash
export DOTNET_ROOT="$PWD/.tools/dotnet"
export PATH="$PWD/.tools/node/bin:$DOTNET_ROOT:$PATH"
export PLAYWRIGHT_BROWSERS_PATH="$PWD/.tools/playwright"
mkdir -p artifacts/local/cli-home artifacts/local/nuget artifacts/local/tmp
export DOTNET_CLI_HOME="$PWD/artifacts/local/cli-home"
export NUGET_PACKAGES="$PWD/artifacts/local/nuget"
export TMPDIR="$PWD/artifacts/local/tmp"
export DOTNET_CLI_TELEMETRY_OPTOUT=1 MSBUILDDISABLENODEREUSE=1 UseSharedCompilation=false
```

These use the already installed, read-only pinned tools, not ancestor dependency
or build outputs. Restore after dependency-manifest changes or if dependencies are missing:
`dotnet restore VarAI.slnx --locked-mode` and
`npm ci --cache artifacts/local/npm-cache --no-audit --no-fund`.
Do not install/download a new toolchain.

Choose a free port, never `4173`. The earlier accepted preview may still own
`43175`; leave it running and use `43176` for this checkout. Verify before starting:
if this checkout's preview is already running there, open it rather than starting
a second process.

```bash
node --input-type=module -e 'import {createServer} from "node:net"; const s=createServer(); s.once("error", e=>{console.error(e.code);process.exitCode=1}); s.listen(43176,"127.0.0.1",()=>{console.log("Port free");s.close()})'
npm run publish
ASPNETCORE_ENVIRONMENT=Production DOTNET_ENVIRONMENT=Production \
  dotnet artifacts/publish/VarAI.Server.dll --contentRoot "$PWD/artifacts/publish" \
  --urls http://127.0.0.1:43176 --Explanations:LiveEnabled=false
```

Open **http://127.0.0.1:43176/**. One published .NET process serves the real client
and `/graphql`; there is no fixture server in this path. Stop it with Ctrl-C.
The canonical user preview on `127.0.0.1:4173` must remain untouched.
For separate development servers use verified free API/UI ports, `--no-launch-profile`
and the explicit false live flag on .NET, plus `VARAI_API_ORIGIN` and
`--host 127.0.0.1 --port <ui-port> --strictPort` on Vite.

## Broadcast UI refresh (2026-10-23)

The separately approved visual refresh adds a dark broadcast-style review desk,
team-initial scoreboard, clearer replay/timeline controls, refreshed explanation,
evidence and comparison panels, and mobile reflow. Three.js **0.186.1** is an
exact runtime dependency; **@types/three 0.186.0** is development-only. No UI
framework, React Three Fiber, external model, texture or font was added.

The pitch starts with a bounded **900 ms camera reveal**, then renders on demand
for resize, supplied-data or reduced-motion preference changes. Player markers do not move: supplied snapshots
are not tracking data. All four position facts must be released before any
markers/reference appear, and S3 never receives invented positions. The
**2D diagram** control retains the supplied SVG coordinates and accessible
description. Unsupported WebGL, initialisation failure, context loss and failed
lazy loading produce visible 2D fallbacks. Reduced motion skips the camera
reveal. Cleanup releases geometry/materials, observers, animation frames and
renderer/context; each effect owns its canvas for React StrictMode safety.

Checks actually rerun for this refresh in the normal checkout:

| Command actually run | Result |
| --- | --- |
| `npm run lint:client`, `npm run typecheck` | Passed, including the integration test types |
| `npm run test:client` | **243 passed**, including supplied-coordinate/disposal and simulated-renderer lifecycle tests |
| `npm run test:acceptance` | **63 passed**; existing contract/service acceptance tooling remains compatible |
| `npm run typecheck:acceptance`, `npm run lint:acceptance` | Passed |
| `npm run publish` | Passed; refreshed client and Release server published together |
| `npm run test:integration` with ports 43170/43171 | **94 passed / 12 intentionally skipped live cases**, no retries |
| `npm run test:browser` with port 43174 | **22 passed** |
| `npm run test:acceptance:browser` with port 43172 | **48 contract-stub fixture passes / 36 application cases deliberately skipped in this fixture-only run**; real application evidence is the separate integration run above |

The integrated checks exercise actual WebGL drawing, a settled camera, explicit
2D access, real controlled context loss, failed 3D-bundle loading, reduced motion,
Restart keyboard-focus retention, S3 missing data, **320/768/1440 px** reflow,
sampled critical text contrast **at least 4.5:1** and minimum **44 px** buttons/selects.
These Chromium checks are not an independent full accessibility audit or proof
of support on every browser/device. The full server test suite was not rerun
for this frontend-only refresh; publication compiled the unchanged server and
the integrated checks exercised its real HTTP/GraphQL path.

The refreshed publication was also opened in the integrated browser: the
desktop S1 pitch and authored explanation, a **390 px** mobile layout/reader,
the mobile S2 level-position pitch and the S3 missing-evidence overlay were
visually inspected. The mobile document width matched its 390 px viewport.
The earlier accepted preview remained healthy and was not replaced.

The Three.js code is a separate lazy chunk, approximately **537 kB minified /
134 kB gzip**, leaving Vite's normal **500 kB advisory visible**. It is not
requested when the WebGL2 API is absent. Otherwise, mounting the initial 3D view
requests it; selecting 2D afterward does not undo that download.
This is an explicit prototype trade-off, not a performance certification.
Local logs are ignored at `artifacts/local/broadcast-validation.log`,
`artifacts/local/broadcast-browser.log` and
`artifacts/local/broadcast-fixture-browsers.log`.
No new paid model call, Azure deployment, automation dispatch or expert-review
claim is part of this refresh.

## Match Centre: synthetic match insights

The default page (`/`) is the **Match centre**. The offside replay lab is unchanged
and stays at `/?scenario=S1` (also S2 and S3) as the **Key-moment review**. The
disallowed-goal moment in the match links to it. Nothing plays until the viewer
presses **Kick off** or a **Jump to** chip.

### Pipeline

| Stage | What runs | Where |
| --- | --- | --- |
| Ingest | A seeded, deterministic 92-minute fictional match (seed 20261023, about 2,700 events) with pitch coordinates (105 × 68 m), millisecond clock, pass outcome and receiver, pressure, tackles, possession changes, shots, fouls, a card, goals and a review. Authored anchor moments tie it to supplied scenario S1. | `server/Feeds/SyntheticMatchGenerator.cs` |
| Interpret | Per-event metrics from the declared coordinates and durations, plus a control-vs-chaos series every match minute. | `MatchMetrics.cs`, `MatchInsightEngine.cs` |
| Explain | Named rules turn events into cues with a headline, detail, "why it matters" (running score and regulation clock), metrics, the rule text, and the source event IDs or time window. | `MatchInsightEngine.cs` |
| Render | A 16:9 broadcast frame (scorebug, match clock, event map, lower-third), a Studio cue queue and program monitor, and a machine-readable overlay stream. | `client/src/match-centre/`, `/overlays` |
| Personalize | Fan, Analyst or Studio view, favourite club and followed player, saved in `localStorage` on the device only. | `profile.ts`, `MatchCentre.tsx` |

All insight logic runs on the server, so the browser is one consumer of the same
streams a rendering partner would read.

### HTTP interface

| Route | Content |
| --- | --- |
| `GET /api/matches/SYN-MATCH-01` | JSON description: teams, fictional rosters, pitch, periods, key-moment highlights, seed |
| `GET …/events` | Server-Sent Events: `match`, raw `event` records (with `metrics`), `complete` |
| `GET …/overlays` | Server-Sent Events: `match`, versioned `overlay` cues (overlay schema 1.0), `complete` |
| `GET …/stream` | Everything above plus `momentum` samples as one ordered sequence |

The feed envelope is `{ schemaVersion: "2.0", type, payload }`. Query `speed`
(1–1000 match-seconds per real second; server default 120, UI default 60) and
`fromSeconds` (items at or before it arrive in an immediate catch-up burst so the
state is complete). `Last-Event-ID` resumes by item index. Invalid parameters
return 400, unknown matches 404, and `/api` never falls back to SPA HTML. The
GraphQL v0.2 scenario and explanation contract is unchanged.

### Metric definitions

All values are deterministic derivations from synthetic inputs, not measurements.

- Pass and carry distance is the Euclidean distance between declared start and end
  coordinates. Forward progress is movement toward the attacking goal. Speed is
  distance divided by the declared duration. A sprint is a carry at or above 7.0 m/s.
- A pass is *under pressure* when an opposing `PRESSURE` event occurred within 3 s
  and 8 m before it.
- **Pass difficulty** (0–100) = 5 + 1.5 × min(distance, 45 m) + 0.6 × forward
  progress + 20 if under pressure + 10 if into the final third, clamped to 1–99.
  It is a transparent heuristic, not a trained or expert-validated model.
- Shot distance is to the centre of the attacked goal. Shot speed is start-to-end
  distance divided by duration.

### Control vs chaos

Evaluated every match minute over a five-minute window (shorter before minute 5).
The control index is (home share of passes, carries and shots − 50) × 2. The state
is **CHAOS** at 3.6 or more possession changes per minute, otherwise **CONTROL**
when the index magnitude is at least 36 (a share of 68% or more), otherwise
**BALANCED**. The thresholds were set by inspecting this generator's output; they
are not football research.

### Cue rules

Each cue has a priority (1–3), an on-air window of 9, 7 or 5 seconds of match time
starting 0.8 s after its trigger, and lists the rule that produced it.

| Kind | Rule |
| --- | --- |
| Goal | One cue per goal; stakes use the running score and the 90-minute clock |
| Review, Ruled out | One cue when a review starts and one when a goal is overturned; the latter links to supplied scenario S1 |
| Card | One cue per card; notes that a second yellow means a sending-off |
| High press | At least 3 pressure → tackle → possession-change sequences by a team within 300 s, each tackle in the opposition half |
| Sprint | Carry of at least 20 m at 7.0 m/s or more; one per player per 180 s |
| Pass quality | Completed pass under pressure into the final third with difficulty of at least 75; one per team per 600 s, plus any assisting pass |
| Shot speed | Shot at 110 km/h or more not immediately followed by a goal; one per player per 300 s |
| Control, Chaos | The state changes in the series above, after minute 10; 10-minute cooldown |

### Timing

Cue windows are in match time, so at 1× a lower-third is on screen for exactly its
window. At the faster demo speeds a 9-second window would last milliseconds, so the
interface holds each cue on air for at least 8, 6 or 4.5 real seconds (by
priority); a lower-priority cue never displaces a held higher-priority one. Cues at
or before a jump point are history, not live. The overlay stream emits cues by
match clock; this is not a production scheduler and is not connected to a
graphics-rendering partner or validated against one.

### Audience views

- **Fan:** headline and "why it matters", emphasis on the chosen club, a rail
  following the chosen player, and a plain control-vs-chaos gauge.
- **Analyst:** control-vs-chaos chart, team metrics (accuracy, distance,
  difficulty, sprints, shots, top speeds), every cue with its metrics and rule,
  source buttons that ring the cited events on the pitch, and the raw event feed.
- **Studio:** program monitor, cue queue, the selected cue's JSON, and a
  downloadable cue sheet.

Player statistics count only events tagged with that player's ID.

### Operator-gated mode (AI narration and approval)

The mode switch under the match controls changes **Preview** (everything above, deterministic, English only) to
**Operator-gated**. There, the server asks an Azure OpenAI model to word each cue in English and Tamil, checks the answer
mechanically against the facts, and falls back to the labelled deterministic English text when anything fails. A person approves,
holds or overrides each cue in an operator desk before it airs, undecided cues are held, and every step goes into a hash-chained
decision log that can be downloaded. It is off unless the server is started with narration enabled; without it, gated mode runs
on the deterministic text and Tamil falls back to English. The details, measured results and limits are in
[ai-narration-and-approval.md](./ai-narration-and-approval.md); deployment and cost are in [azure-deployment.md](./azure-deployment.md).

To try it locally with live narration, sign in with `az login`, be granted *Cognitive Services OpenAI User* on the model account,
and start the published server with narration on, for example:

```sh
Narration__Enabled=true Narration__MaxModelCalls=12 Explanations__LiveEnabled=false \
Explanations__AzureOpenAi__AuthMode=AzureCli \
Explanations__AzureOpenAi__Endpoint=https://<account>.openai.azure.com/ Explanations__AzureOpenAi__DeploymentName=<deployment> \
dotnet artifacts/publish/VarAI.Server.dll --urls http://127.0.0.1:<free port> --contentRoot artifacts/publish
```

`Narration__MaxModelCalls` caps the paid calls the process may make. No key is read or needed.

### Limits

- Every team, player and event is fictional and generated. The event map draws only
  declared synthetic coordinates; no player tracking, video or real match data is
  involved or implied.
- In Preview no AI model is called: the rules are deterministic. In operator-gated mode only
  the narrator calls a model (Azure OpenAI, off unless `Narration__Enabled=true`). The live
  offside explainer is separate and stays disabled by default.
- Not implemented: languages other than English and Tamil, accounts or an operator login,
  server-side persistence (gated sessions and the decision log are in memory), real-time
  video or automatic eventing, and an official graphics-partner format. Football accuracy
  and thresholds have had no expert review, the Tamil has not been reviewed by a native
  speaker, and there has been no viewer study.

Validation of the Preview-only version (live AI disabled throughout; superseded by the record below):

| Command | Result |
| --- | --- |
| `dotnet format VarAI.slnx --verify-no-changes`, client ESLint | Passed |
| `npm run typecheck`; `tsc -p client/tsconfig.browser.json --noEmit` | Passed |
| `npm test` | Passed: 628 server and 288 client tests |
| `npm run publish` | Passed. The existing advisory for the 537 kB Three.js chunk remains |
| `npm run test:integration`, ports 43170/43171 | Passed: 98 Chromium checks at 375 px and 1280 px, 12 live-AI cases skipped |
| `npm run test:acceptance`; `VARAI_HARNESS_PORT=43174 npm run test:browser`; `npm run contracts:check` | Passed: 63, 22 and no contract drift |

Validation of the operator-gated version (2026-10-23). The browser suites and unit tests ran with narration off; live model
calls were made only by the bounded manual probes described in
[ai-narration-and-approval.md](./ai-narration-and-approval.md#what-the-live-model-did-measured-on-2026-10-23):

| Command | Result |
| --- | --- |
| `npm run lint` (includes `dotnet format --verify-no-changes`), `npm run typecheck`, `npm run lint:acceptance`, `npm run typecheck:acceptance` | Passed |
| `npm test` | Passed: 803 server and 547 client tests |
| `npm run publish`; `npm run contracts:check`; `git diff --check` | Passed |
| `npm run test:integration`, ports 43170/43171 | Passed: 98, 12 skipped. An earlier run had one timing failure in the existing real-time replay test while the machine was loaded; see [azure-deployment.md](./azure-deployment.md#verification-record) |
| Gated spec: `cd client && VARAI_APP_PORT=43170 npx playwright test --config playwright.gated.config.ts` | Passed: 4 (start, approve, Tamil override, undecided cue held, log hash chain), narration off |
| `npm run test:acceptance`; `VARAI_HARNESS_PORT=43174 npm run test:browser` | Passed: 63 and 22 |

Selective guidance came from `github/awesome-copilot` at the pinned revision listed in
[the reference index](../.github/skills/awesome-copilot-guidance/references.md):
native radios and labelled selects, a text alternative for the SVG map and
reduced-motion handling. Its Vitest note was applied to focused boundary tests, while
the project keeps TypeScript `null` for missing values. No external tooling was imported.

## Normal-checkout publication verification (2026-10-23)

After consolidating the accepted source into the normal repository checkout,
the following checks were rerun there with live generation explicitly disabled:

| Command actually run | Result |
| --- | --- |
| `dotnet restore VarAI.slnx --locked-mode --disable-build-servers -p:UseSharedCompilation=false -nodeReuse:false --verbosity minimal` | Passed after the accepted dependency-manifest changes |
| `npm run contracts:check`, `npm run lint`, `npm run typecheck`, `npm run typecheck:acceptance`, `npm run lint:acceptance` | All passed |
| `npm test` | **592 server + 234 client tests passed**, no failures or skips |
| `npm run test:acceptance` | **63 passed** |
| `python3 -B -m unittest discover -s scripts/tests -p 'test_board*.py'` | **58 passed**, including macOS policy fixtures; no worker/model session created |
| `node --test scripts/tests/board_worker.test.mjs` | **8 passed** |
| `npm run publish` | Passed; current client and Release server in `artifacts/publish` |
| `npm run test:integration` with ports 43170/43171 | **82 passed / 12 deliberately skipped live cases**, no retries or failures |
| `npm run test:browser` with port 43174 | **22 passed** |
| `python3 -B scripts/board_dispatch.py scan` | Dispatch paused, no eligible work or active claims |

All accepted non-documentation files were SHA-256 checked against the preserved
integration input. Publication edits are documentation-only: current run/status
guidance and removal of private machine paths/resource identifiers. All 98
acceptance-criterion statements retain their wording and accepted checked state.
Historical dispatcher metadata is unchanged apart from archived workspace paths;
the exact original board remains owner-local as described in the canonical board.
All 176 checked local Markdown links resolved.

Logs are ignored local artifacts at `artifacts/local/publication-validation.log`
and `artifacts/local/publication-browser.log`. Test ports were verified released
afterward, and the existing preview on 43175 still returned healthy status.
No new paid application-model call, deployment or scheduler action occurred.
Local results do not establish remote GitHub Actions success.

## Walkthrough

1. S1 is an explicit initial selection (not an error fallback). Before Play,
   position evidence, diagram and supplied outcome are withheld.
2. Play, pause, resume or restart the compressed six-second replay. Markers are
   a static supplied illustration, never tracked movement or an offside calculation.
   The original decision appears at the goal; the supplied outcome waits for review-ready.
3. Select Casual or Analyst and **Authored**, then Generate. There is no automatic
   explanation request. Inspect a claim's sources to focus the cited fact/rule.
   Facts, context IDs, rule section/edition, provenance and limitations stay visible.
4. Try the hypothetical S2 level position. Selection resets replay, explanation,
   recap and citation emphasis. Replay it and use Restore S1 to reverse the choice.
5. Select S3. After position release it has no receiver or reference line. Its
   authored result is LIMITED; outcome/after-score remain unavailable. No comparison
   is offered. Unknown or hidden source IDs are not guessed.
6. Select Live AI and Generate explicitly after review-ready. In this model-free
   configuration the real service returns non-retryable `MODEL_NOT_CONFIGURED`.
   No authored text is substituted. Choose Authored explicitly to continue.

## Provider boundary and transport

- `SyntheticScenarioRepository`, `ExplanationService`, `ExplanationOutputValidator`,
  `TimeProvider.System` and the approved `AzureOpenAiExplanationProvider` are
  registered in startup. Disabling `Explanations:LiveEnabled` supplies an empty
  provider configuration without reading provider settings.
- Live deployment compatibility retains the approved HttpClient Azure OpenAI v1
  Chat Completions adapter and server-only endpoint/deployment/API-key fields.
  Enabling live access and supplying credentials requires separate approval.
  No actual credential or provider request was used during initial implementation.
  The later separately approved smoke is recorded below.
- The initial server transport added official `HotChocolate.AspNetCore` **16.6.9**,
  matching the existing HotChocolate version. .NET tooling updated the server
  and transitively affected test lockfiles. Generated schema/operations remain unchanged.
- Fetch adapters send the checked-in operations, validate media type/HTTP status,
  reject GraphQL errors and incomplete data, and validate identity/content/citations.
  Error, stale and partial responses cannot restore a recap. No `/api/explanations`
  compatibility route exists. Missing API and asset routes remain 404.
- G00-REVIEW-001 remains a known limitation: the shared pair helper does not
  forward trusted expert-review records. Current SourceChecked scenarios do not
  trigger it; no expert approval has been invented.

## Reproducible checks and evidence

The ordinary checks remain `npm run contracts:check`, `npm run lint`,
`npm run typecheck`, `npm run typecheck:acceptance`, `npm run lint:acceptance`,
`npm test`, `npm run build` and `npm run publish`.
`test:package:101` through `108` now select the delivered package tests rather
than relabel G00 probes. `npm run test:acceptance` builds the executable runner
and explicit application adapter before its tests.

For browser checks, verify the listed ports with the same loopback bind check
above. The configs refuse port `4173` and never reuse an existing server:

```bash
export VARAI_APP_PORT=43170 VARAI_COMPONENT_PORT=43171
npm run acceptance:build
npm run publish
npm run test:integration
# Separate preserved baseline/fixture evidence:
VARAI_HARNESS_PORT=43174 npm run test:browser
VAR108_PORT=43172 npm run test:acceptance:browser
node tests/acceptance/artifacts/runner/cli.mjs --target contract-stub
```

The integrated browser config starts/stops its own published .NET process and
test-only Vite component fixture page. Most journeys advance the real replay's
timers with Playwright's clock; a separate check uses actual elapsed replay
timing and reduced-motion settings. Both 375px and 1280px are checked.

The real-application data adapter is explicitly supplied, never a fixture fallback:

```bash
# Against your currently running, live-disabled published app:
VARAI_APPLICATION_URL=http://127.0.0.1:43176 \
  node tests/acceptance/artifacts/runner/cli.mjs --target real-application \
  --adapter tests/acceptance/artifacts/application-adapter/adapter.mjs
```

An exit code of **2 / INCOMPLETE** is intentional for unavailable gates. The
adapter has no production test-data mutation endpoint, team-label seam or
failure-injection client. Injected browser faults are separately named test
results, not observed provider outages. Live matrix/audience checks remain
unauthorised. Do not run `--allow-live` for this delivery.

| Requirements | Implementation / observable checks |
| --- | --- |
| VAR-103 / T01 | `client/src/scene/Scene.test.tsx`; isolated S1/S2/S3 and staged browser scenes |
| VAR-104 / T01-T02 | `client/src/evidence/EvidenceExplorer.test.tsx`; keyboard focus, context IDs, unsafe links, missing/unknown sources |
| VAR-106 / T01-T02 | `client/src/explanation-view/ExplanationReader.test.tsx`; `tests/acceptance/application-reader.test.tsx`; real browser freshness and explicitly injected failures |
| VAR-107 / T01 | `client/src/comparison/Comparison.test.tsx`; isolated keyboard callbacks and actual host reset/restoration |
| G01 / T01-T02 | `client/src/transport/graphql.test.ts`, actual `App.test.tsx`, `tests/VarAI.Server.Tests/Integration/GraphQlHttpTests.cs`, `client/tests/integration/**` |
| VAR-108 / G01 evidence | `tests/acceptance/artifacts/unit-report.json`, `real-application.json`, `browser-report.json` (fixture scope only); `artifacts/local/browser-initial.json` and the targeted correction reports below |

### Executed local verification

| Check actually executed | Result / saved evidence |
| --- | --- |
| `npm run contracts:check` | PASS: schema, generated fixtures/guards and three operations unchanged |
| `dotnet test VarAI.slnx --no-restore` (isolated environment above) | **572 passed**; `artifacts/local/test-results/server-regression.trx` |
| Focused HTTP/contract/scaffold tests after static-route fix | **39 passed**; `artifacts/local/test-results/local-http-final.trx` |
| `npm run test:client` | **234 passed**; `artifacts/local/client-unit.log` |
| Focused actual UI/transport/app tests with JSON reporter | **68 passed**; `artifacts/local/ui-transport-unit.json` |
| VAR-108 unit/report/real-reader checks | **63 passed**; `tests/acceptance/artifacts/unit-report.json` |
| Client/browser TypeScript, acceptance TypeScript, ESLint for both scopes, .NET formatting | PASS using `typecheck`, `typecheck:acceptance`, `lint:client`, `lint:acceptance`, `lint:server` |
| `npm run build`, `npm run publish` | PASS; Release build had 0 warnings/errors; actual published HTML/JS/CSS and GraphQL exercised in Chromium |
| Preserved G00 browser suite, port 43174 | **22 passed**; `artifacts/local/baseline-browser.log` |
| VAR-108 fixture-only browser suite, port 43172 | **48 passed / 36 application cases skipped** by that deliberately fixture-only config; `tests/acceptance/artifacts/browser-report.json` and its verifier passed |
| Contract-stub data runner | **27 passed**, all simulated; `tests/acceptance/artifacts/contract-stub.json` |
| Real `/graphql` application data runner, invoked by integrated browser tests | **8 passed / 7 blocked / 12 skipped**, exit 2 / INCOMPLETE; `tests/acceptance/artifacts/real-application.json` |
| Integrated and isolated real-component browsers, ports 43170/43171, both widths | **82 distinct cases have passing latest results across the full run and targeted corrections; 12 live cases skipped.** Details below; no single all-green final full run is claimed. |

The full browser run recorded 74 passes, eight assertion failures and 12
unauthorised-live skips in `artifacts/local/browser-initial.json`. The failing
expectations assumed a non-contract error name, a different fixture description,
no accessible-name whitespace, and a nonzero geometry box for a vertical SVG
line. Corrections compare the actual contract/fixture text and the SVG's painted
stroke instead. The first targeted run passed four cases and exposed the four
remaining SVG assertions (`browser-corrections-round1.json`); the final four
scene cases passed (`browser-report.json`). These were test-only changes after
the full run; no product behavior was changed to manufacture success. No
automatic test retries were used. Full run reproduction remains `npm run test:integration`.

Actual composition defects found earlier and fixed: static routing initially
shadowed published JS/CSS; placing static middleware before explicit routing
restored assets while retaining missing-route 404s. The transport's generated
namespace caused a provider exception-name ambiguity, fixed by qualification.
The cross-package Playwright import needed the test-only ESM boundary. Source
modules, their tests and all 68 inputs remain present; only seven copied files
have the documented small integration/docs adjustments.

Published review-ready screenshots at both widths were visually inspected:
`artifacts/local/review-ready-375.png` and `review-ready-1280.png`.
This inspection is not a qualified rules or semantic review. All owned web
servers and build helpers were stopped; ports 43170, 43171, 43172 and 43174 were
verified free after execution. The canonical 4173 preview was not used.

## Acceptance and remaining limitations

Combined independent Sol review subsequently passed the implemented local scope
(including VAR-108) on 2026-10-23; the coordinator's final full browser run
passed 82 checks with 12 explicit live skips. The
[completion follow-up](./completion-gates.md) records additional HTTP fault/
team-label checks, two narrowly corrected validator false rejections and
357 passing targeted tests after that review.
Read-only Azure metadata checks found an existing chat-capable deployment.
The user subsequently authorised one S1/Casual smoke: it passed through the
actual published app and `gpt-6-luna` deployment in 8.171 seconds with no retry.
The temporary live-enabled process was stopped; the normal preview stays
live-disabled. This verifies one bounded deployment/adapter interaction, not
the full live matrix or a spending/availability guarantee. The user then
accepted the local prototype and documented coverage disposition on 2026-10-23;
the completion follow-up records that sign-off and continuing limitations.
Expert rules review, semantic claim review, the five-viewer study and demonstrated
learning impact are **NOT RUN**. The 2026/27 rule metadata is supplied
SourceChecked content, not a certification of interpretation. Human acceptance
and completed local prototype work are recorded with the explicitly accepted
limitations; no unperformed research or production certification is claimed.

Guidance consulted: `github/awesome-copilot` at
`613efc8c21d9b3ce642dff361d17006cd9967e28`,
`instructions/a11y.instructions.md` (semantic controls, text alternatives,
visible focus, non-colour cues and status feedback). No upstream architecture
or tooling was imported. Transport APIs were checked against the
[official endpoint documentation](https://chillicream.com/docs/hotchocolate/server/endpoints)
and [16.6.9 package metadata](https://www.nuget.org/packages/HotChocolate.AspNetCore/16.6.9),
then verified by the actual installed signatures and HTTP tests.
