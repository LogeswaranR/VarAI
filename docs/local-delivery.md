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
- The only added dependency is official `HotChocolate.AspNetCore` **16.6.9**,
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
