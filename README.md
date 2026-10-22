# VarAI
An evidence-backed synthetic offside-review explainer, not an AI referee.

## Local scaffold

VAR-G00-T01 provides an ASP.NET Core/C# host and a React/TypeScript client.
The UI is explicitly a placeholder: no scenarios, replay, rule inspection,
authored explanations or live-model integration are implemented.
T02 adds the isolated [GraphQL contract](./docs/backlog/contract-v0.2.md) and
deterministic development/test fixtures. They are not wired into this UI or an
HTTP GraphQL endpoint.

### Toolchain

| Tool | Pinned version | Source |
| --- | --- | --- |
| .NET SDK | 10.0.402 | [global.json](./global.json), targeting .NET 10 |
| Node.js | 24.22.1 LTS | [.node-version](./.node-version) and [package.json](./package.json) |
| npm | 11.19.1 | [package.json](./package.json); bundled with this Node.js release |
| React / TypeScript / Vite | 19.3.1 / 6.0.3 / 8.3.4 | [Client manifest](./client/package.json) |
| MSTest / Vitest | 4.0.2 / 5.0.5 | [Server test project](./tests/VarAI.Server.Tests/VarAI.Server.Tests.csproj) and [client manifest](./client/package.json) |
| Playwright | 1.64.1 | [Client manifest](./client/package.json); Chromium for the isolated harness |

Use the pinned SDK and Node/npm versions, not the machine's older defaults.
The [Microsoft release metadata](https://dotnetcli.blob.core.windows.net/dotnet/release-metadata/10.0/releases.json)
and [Node.js release archive](https://nodejs.org/en/download/archive/v24.22.1)
identify the selected releases. The macOS ARM64 archives used in this checkout
were checksum-verified and extracted into the ignored `.tools/` directory;
machine-wide SDK/Node installations were not replaced.

In this checkout, activate those local tools in each terminal, from the
repository root:

```bash
export DOTNET_ROOT="$PWD/.tools/dotnet"
export PATH="$PWD/.tools/node/bin:$DOTNET_ROOT:$PATH"
export DOTNET_CLI_TELEMETRY_OPTOUT=1
export PLAYWRIGHT_BROWSERS_PATH="$PWD/.tools/playwright"
```

The ignored tool downloads are not present in a fresh clone. Install the pinned
versions with an approved local tool manager or from the official distributions
first. Confirm `dotnet --version`, `node --version` and `npm --version` before
running the commands below.

### Restore and check

Run from the repository root:

```bash
npm run restore
npm run browser:install
npm run verify
```

`restore` runs `dotnet restore VarAI.slnx --locked-mode` and `npm ci`. NuGet
lockfiles and the root npm workspace lockfile are part of the source tree.
`.npmrc` rejects incompatible Node/npm versions during installation.
`browser:install` downloads the pinned Chromium binaries. With the environment
above they stay in the ignored project-local tools directory. It is needed on
first setup and after a Playwright browser-version change. Linux CI also installs
browser OS dependencies with `npm run browser:install -- --with-deps`; that Linux
step has not been executed on this Mac.

`verify` checks generated contract artifacts for drift, then runs C# formatting
checks, ESLint, frontend TypeScript checking, both unit-test suites, both builds
and the isolated Chromium harness checks at 375px and 1280px.
The C# compiler checks server types during tests and builds. Individual commands
are also available:

```bash
npm run lint
npm run typecheck
npm run test:server
npm run test:client
npm run build
```

### Run locally

After restoring, use two terminals with the toolchain activated:

```bash
# Terminal 1: API-only development host at http://127.0.0.1:5074
npm run dev:server
```

```bash
# Terminal 2: UI at http://127.0.0.1:5173
npm run dev:client
```

Vite proxies `/health` and `/api` to the development host. The backend's root
URL intentionally returns 404 in Development; open the Vite URL for the UI.
`GET /health` reports `{"status":"ok","stage":"scaffold-only"}`. This is
process readiness, not evidence that review features or model access work.
Unimplemented API routes return a 404 problem response, never the SPA HTML
or a fabricated explanation.

No model credentials or account access are required. The
[server environment example](./server/.env.example) contains placeholders only
and is not loaded automatically. The documented development command uses the
non-secret HTTP launch profile. Local `.env` files and
`server/appsettings.Local.json` are ignored; the latter is not automatically
loaded by this scaffold. Never put credentials in browser-visible `VITE_*`
variables.

### Publish locally as one application

```bash
npm run publish
cd artifacts/publish
ASPNETCORE_ENVIRONMENT=Production dotnet VarAI.Server.dll --urls http://127.0.0.1:5075
```

Open `http://127.0.0.1:5075`. One .NET process serves the built React assets
and backend; Node.js is build tooling, not a second production server.
This is a local, framework-dependent publish, not cloud deployment.
Publishing directly without a client build fails with an explicit instruction
to build it first.

### Layout and ownership

| Area | T01 responsibility |
| --- | --- |
| [server/](./server/) | ASP.NET Core entry point, readiness route and published static-file hosting |
| [client/](./client/) | Vite/React entry point, labelled placeholder and UI unit tests |
| [tests/VarAI.Server.Tests/](./tests/VarAI.Server.Tests/) | In-memory host/readiness/error tests |
| Root manifests, lockfiles and configuration | One coordinated build owned by the G00 integration owner |

Keep [server/wwwroot/.gitkeep](./server/wwwroot/.gitkeep): ASP.NET Core's
static-web-assets loader needs the physical web-root directory after the
linked frontend assets have been built, including during host tests.
The [v0.2 ownership table](./docs/backlog/contract-v0.2.md#1-sources-of-truth-and-ownership)
maps shared contracts and future feature packages. The T01 production shell still has no feature composition. T03 supplies a
separate test-only harness entry and local CI definition described below.
Current assignments remain in the
[local board](./docs/backlog/board.md).

## T01 verification (2026-10-21)

Observed on macOS ARM64 with the pinned local tools:

| Check actually run | Result |
| --- | --- |
| `npm run restore` | Passed locked NuGet restore and a clean npm reinstall |
| `npm run verify` | Passed lint, type checking, 4 MSTest tests, 3 Vitest tests and both builds |
| `npm run publish` | Passed; React HTML/JS/CSS included in one .NET publish output |
| `npm run test:server` after publishing | All 4 tests passed again |
| HTTP startup/proxy checks | Dev host, Vite proxy and published host returned the expected health and GET/POST API error responses |
| Published asset checks | HTML, JavaScript and CSS served successfully; a missing asset returned 404 |
| Missing-client publish check | Expected failure with an actionable build-client message; temporary generated-file move restored |
| Development browser check | No horizontal overflow at 375px and 1280px; health link reached with Tab and a visible 3px focus outline |
| Published browser check | React shell rendered; additional keyboard automation was inconclusive when the integrated browser became hidden/unavailable |
| Ignore rules | Local environment files, local settings, downloaded tools and generated outputs excluded |

An initial post-build host-test failure exposed the missing physical web root.
That was fixed, development hosting was made explicitly API-only, and all
required checks were rerun successfully, including tests after publication.
The first browser probes also required an explicit start URL/focus state;
the successful development checks above are not a full accessibility audit.

`npm ci` emitted an `fsevents` install-script notice.
`npm install-scripts ls` subsequently reported no unreviewed scripts; no extra
script approvals were granted. Package installation and the final checks passed.

Temporary development/published servers used for verification were stopped.
Not run at the T01 handoff: two isolated-checkout checks, CI, the T02/T03 contract/stub/feature
harness checks, full review-journey acceptance or any live-model request.
G00 is not complete; no commit or cloud resource was created.

## Shared GraphQL contracts (T02)

The user approved GraphQL **v0.2**, replacing the earlier REST proposal while
retaining the synthetic scenario family and its uncertainty rules. See the
[contract](./docs/backlog/contract-v0.2.md) for the explicit wire changes,
including uppercase enums, typed nullable fact values and typed error unions.

| Area | Purpose |
| --- | --- |
| [server/Contracts/](./server/Contracts/) | Isolated C# model/interface library, strict JSON/domain validation and route-independent GraphQL schema |
| [contracts/schema.graphql](./contracts/schema.graphql) | Generated schema snapshot; C# is the source of truth |
| [contracts/operations.graphql](./contracts/operations.graphql) | Complete scenario queries and explicit explanation mutation used for generation/tests |
| [client/src/contracts/](./client/src/contracts/) | Generated operation types/shape guards, domain validation and injected panel/client/repository interfaces |
| [tests/contract-stubs/](./tests/contract-stubs/) | Shared JSON fixtures, C#/TypeScript adapters and generated GraphQL responses; test-only |
| [tools/VarAI.ContractTool/](./tools/VarAI.ContractTool/) | Exports the schema, shared rule constants and actual in-memory GraphQL fixture results |
| [scripts/generate-graphql.mjs](./scripts/generate-graphql.mjs) | Local-file TypeScript operation/response-shape generation; no remote schema loading |

Pinned additions: Hot Chocolate `16.6.9` for the C# schema; GraphQL.js `17.0.2`,
GraphQL Code Generator core `6.2.2` and its TypeScript operations plugin
`6.1.10`. The standalone operations plugin generates the required input/enums
and operation types; no separate base-type plugin or full generator CLI is
needed. No Apollo client, live-provider SDK, database or hosted service was added.

After restoring the pinned dependencies, run from the root with the local
toolchain activated:

```bash
npm run contracts:generate  # Deliberately update generated artifacts after approved source changes.
npm run contracts:check     # Compare without rewriting; fails on drift.
npm run test:contracts     # Targeted C# and TypeScript contract checks.
npm run verify             # Contract drift checks plus the scaffold's full validation.
```

The in-memory test service covers 3 scenarios x 2 audiences x 2 source modes
and all seven error codes. `LIVE_AI` success fixtures prominently identify
themselves as **SIMULATED LIVE-AI TEST STUBS** using authored fixture content.
They do not call a model. The fixture content version is `stub-0.2.0`; rule
metadata remains `DRAFT`, with edition `2026/27` and `checkedOn: null`.

No `/graphql` HTTP endpoint or real client transport adapter is implemented
yet. A development-host POST returns 404; the published SPA's unmatched
POST returns 405. Neither is a GraphQL response. Real HTTP/mutation wiring is
G01 work. The published shell remains the labelled T01 placeholder.

## T02 verification (2026-10-21)

| Check actually run | Result |
| --- | --- |
| `npm run test:contracts` | 108 C# and 89 TypeScript contract tests passed |
| Shared rejection corpus | All 63 malformed-scenario cases rejected by both runtimes, without omitted/null/default coercion |
| In-memory GraphQL operations | Three scenarios, all 12 scenario/audience/mode combinations, seven error unions, malformed inputs and version failures exercised |
| Bounds and uncertainty | Exact 90/220 explanation-word and 40-word recap limits plus one-word-over failures; explicit missing evidence; citation integrity and request metadata checked |
| Deliberate drift probes | Both C# schema drift and generated TypeScript drift failed as expected; generation restored the temporary probes |
| `npm run restore` | Locked NuGet restore and clean npm reinstall passed |
| `npm run verify` | Drift, lint, type checks, all **112 C# tests + 92 TypeScript/UI tests**, and both builds passed; no build warnings/errors |
| `npm run publish` | Passed; no stub/export-tool assembly in the published application |
| Published local smoke check | Ephemeral-port startup, health, unchanged HTML/JS shell and unwired GraphQL POST verified; temporary process stopped |
| `npm audit` | Reported zero vulnerabilities in the resolved npm dependency tree; not a complete security assessment |
| `python3 -B -m unittest discover -s scripts/tests -p 'test_board_dispatch.py' -v` | All 30 existing dispatcher fixture tests passed after the separately approved reference-only v0.2 alignment |

The full codegen CLI initially introduced dependency audit findings. It was
removed in favour of the smaller local-only programmatic API; no forced
dependency downgrade, audit suppression or additional script approval was used.
`npm ci` still emitted the optional `fsevents` notice; `npm install-scripts ls`
reported no unreviewed scripts.

Selected community guidance:
[C# instructions at revision 613efc8c21d9b3ce642dff361d17006cd9967e28](https://github.com/github/awesome-copilot/blob/613efc8c21d9b3ce642dff361d17006cd9967e28/instructions/csharp.instructions.md).
Applied naming/file-scoped namespace conventions and critical-path testing;
did not adopt its database, authentication, telemetry or comment-per-function
suggestions. Version-sensitive behavior was checked against installed packages,
[Hot Chocolate union documentation](https://chillicream.com/docs/hotchocolate/defining-a-schema/unions),
the [programmatic codegen API](https://the-guild.dev/graphql/codegen/docs/advanced/programmatic-usage)
and actual compilation/execution.

The user separately approved aligning the paused dispatcher's baseline,
requirements-fingerprint and checkpoint references, its fixture tests and the
handoff skill link to v0.2. Its tests retain an archived v0.1 file to verify that
the old contract cannot substitute for the required current one. No scheduling,
model, claim or human-gate behavior was changed. Test commits occurred only in
temporary fixture repositories, not this checkout.

Not verified: semantic correctness of every sentence, source interpretation or
expert review; actual provider access or its 15-second deadline; real HTTP
GraphQL integration; T03 composition/CI; two isolated checkouts; full viewer
acceptance. The UI was not redesigned and no new browser accessibility claim is
made. No workspace commits, worker dispatch, automation activation or cloud resources were
created. T02 is complete; G00 remains open.

## Isolated feature harness and CI (T03)

The harness uses the same React/Vite project, contracts, fixtures and test
runners. It is not a second deployable application or a completed review room.
The production HTML entry is unchanged.

With the toolchain activated:

```bash
npm run dev:harness
```

Open `http://127.0.0.1:4173/harness.html`. No backend server, model credentials or
cloud account is needed. The page starts with **placeholders only** and a
permanent test-stub warning. Choose a fixture scenario/stage and one optional
test probe. Stage controls select fixture inputs, not elapsed replay time.
Explanation probes require an explicit action; `LIVE_AI` remains a simulation,
and injected failures never become successful authored responses.

| Entry | Purpose |
| --- | --- |
| [FeatureHarness.tsx](./client/src/harness/FeatureHarness.tsx) | Independently injectable review-room, scene, evidence, explanation and comparison slots |
| [interfaces.ts](./client/src/contracts/interfaces.ts) | Existing typed collaborator/panel boundaries; no GraphQL wire changes |
| [ui-hooks.ts](./client/src/contracts/ui-hooks.ts) | All 23 previously reserved common UI hooks; unused feature hooks are not fake implementations |
| [fixtures.ts](./client/src/harness/fixtures.ts) | Explicit staged test inputs, masked pre-pass scene and nullable context evidence |
| [probes.tsx](./client/src/harness/probes.tsx) | Small test-only collaborator/callback probes; not production feature components |
| [FeatureHarnessTests.cs](./tests/VarAI.Server.Tests/FeatureHarnessTests.cs) | Backend repository/service/provider seams exercised without other features |
| [playwright.config.ts](./client/playwright.config.ts) | Owned loopback test server, one Chromium worker, no retries and two exact viewport widths |
| [isolation.spec.ts](./client/tests/harness/isolation.spec.ts) | Browser checks for isolation, keyboard focus, overflow, missing evidence, explicit requests/errors and callbacks |
| [ci.yml](./.github/workflows/ci.yml) | SHA-pinned, read-only GitHub Actions definition using the same model-free commands |

To mount a real candidate in isolation, pass it through the corresponding typed
`FeatureHarness` slot (an adapter is appropriate for a shell with its own state).
Inject the approved repository/client stubs and explicit test inputs. Omitted
slots remain visible placeholders. The supplied probes demonstrate the seams,
not a reference implementation of replay, evidence navigation or explanations.

Package-scoped **baseline** commands:

| Package | Command | What is checked now |
| --- | --- | --- |
| VAR-101 | `npm run test:package:101` | Repository stub seam |
| VAR-102 | `npm run test:package:102` | Shell slot and injected repository |
| VAR-103 | `npm run test:package:103` | Scene slot and supplied/missing snapshot inputs |
| VAR-104 | `npm run test:package:104` | Evidence slot, staged context and explicit nulls |
| VAR-105 | `npm run test:package:105` | Explanation service and raw-provider seams |
| VAR-106 | `npm run test:package:106` | Client injection, explicit requests/errors, IDs and source callbacks |
| VAR-107 | `npm run test:package:107` | Comparison callback and unavailable S3 input |
| VAR-108 | `npm run test:package:108` | Stub-backed browser checks at both widths |

These commands deliberately work while production feature directories are
absent. They **cannot establish that a feature package is complete**. Add the
candidate's own acceptance tests and extend its selector with coordinator
approval when that package is implemented. Other probes are intentionally
non-selected in scoped Vitest runs; the full suite runs all of them.

`npm run test:harness` runs all local harness unit checks.
`npm run test:browser` runs all browser checks and owns/stops its Vite server.
It refuses to reuse an existing server on port 4173. Stop a manually started
harness first. During automated runs only, file watching and HMR are disabled
to prevent edits/reloads from replacing test state. Normal development retains
HMR. Failure traces go to the ignored client test-results directory.

The CI definition is for future push/PR checks on Ubuntu 24.04. It installs the
pinned SDK/Node versions, restores lockfiles, installs Chromium with Linux
dependencies, runs `npm run verify` and publishes locally with `npm run publish`.
It references no provider secrets, makes no live-model call and deploys nothing.
It has not been published or executed on GitHub; native board scheduling is a
separate mechanism and remains disabled.

## T03 local evidence and remaining gate (2026-10-22)

| Check actually run | Result |
| --- | --- |
| All eight `test:package:*` commands | Passed with every production feature area absent |
| `npm run verify` with `CI=true` | Passed contract drift, lint, type checks, **114 C# tests + 108 Vitest tests + 22 Chromium checks**, and both builds; no build warnings/errors |
| Browser widths and input checks | Exact 375px/1280px, visible keyboard focus, no horizontal overflow, independently mounted probes, missing evidence and typed error/callback behavior passed |
| Browser network/error guard | Covers page startup and interactions; no backend/provider/external-origin request or page error observed |
| Locked restore | .NET locked restore passed; the first npm reinstall hit `ENOTEMPTY` in an existing dependency directory, and an explicit `npm ci` retry passed |
| `npm run publish` and bounded HTTP smoke check | Passed; production health/shell unchanged, harness paths returned 404, no harness HTML/fixture text or stub/export assembly was shipped |
| CI YAML checks | Syntax, three pinned action SHAs, read-only permissions and existing model-free command references checked with the available Ruby YAML parser |
| `npm audit` / `npm install-scripts ls` | Zero reported npm vulnerabilities; no unreviewed scripts reported; not a complete security assessment |
| Two isolated clean checkouts | Initially deferred; local baseline commit and two sequential clean-checkout runs now authorised on 2026-10-22; results pending |
| Remote GitHub Actions / Linux browser dependency installation | **Not run** |

The initial browser attempt identified the missing Chromium binary; it was
installed project-locally. A subsequent concurrent run had four pointer-action
timeouts and logged development-server reloads. An isolated native click check
passed; automated runs were changed to one worker with watching/HMR disabled.
The complete suite then passed repeatedly, without forced clicks, test retries
or increased action timeouts. No diagnostics remain in the tests.

The pinned [Playwright guidance](https://github.com/github/awesome-copilot/blob/613efc8c21d9b3ce642dff361d17006cd9967e28/instructions/playwright-typescript.instructions.md)
informed role-based locators, auto-waiting assertions and meaningful browser
checks. Local test paths/tooling were retained. Action SHAs/inputs were checked
against their official release tags/action definitions; browser setup and
server lifecycle were checked against [Playwright CI](https://playwright.dev/docs/ci-intro)
and [web-server documentation](https://playwright.dev/docs/test-webserver).

Temporary test servers were stopped. At the initial local-only checkpoint, no source snapshot commit, clone,
workspace commit, remote workflow run, worker dispatch or cloud resource was
created. These results are from this working checkout, **not** a substitute for
the required clean-checkout evidence or full product/accessibility acceptance.

**T03 verification has resumed; it is not Done yet.** The user separately
authorised a local baseline commit on `main`, two isolated clean-checkout runs
and an evidence/status commit on 2026-10-22. The isolated-harness criterion is
supported; the clean-checkout criterion awaits those results. G00 sign-off,
dispatch, pushing and remote CI remain separate approvals; see the
[canonical board](./docs/backlog/board.md).

## Prototype planning

- [Local status board](./docs/backlog/board.md): current status, ownership and
  blockers for all 33 work items.
- [Board-driven delivery workflow](./docs/backlog/delivery-workflow.md): hourly
  scheduling saved disabled, two Astra development/two Sol QA slots, guarded
  context handoffs and human batch approval gates.
- [Product epic and task backlog](./docs/backlog/README.md): offside-review
  prototype scope, acceptance criteria, parallel work packages and delivery gates.
- [Technical work breakdown](./docs/backlog/technical-tasks.md): 22 engineering
  Tasks with implementation checks, parent traceability and explicit prerequisites.
- [Shared GraphQL contract v0.2](./docs/backlog/contract-v0.2.md): approved inputs,
  outputs, uncertainty rules and ownership boundaries; v0.1 is historical.
- [Optional Azure Boards import](./docs/backlog/azure-boards.csv): one Epic, ten Issues
  and 22 technical Tasks for the Basic process. Follow the backlog's import
  instructions before use.

Tracking remains in the repository. Azure Boards publishing is paused because
organisation policy blocks access; no remote work items have been created.

These documents remain planning artifacts and acceptance requirements.
The T01 scaffold, isolated T02 contracts/stubs and local T03 harness/CI
configuration have been checked within the limits above; the
review prototype, live-model access and Azure Boards import have not been
implemented or verified.

The approved technology direction is an ASP.NET Core/C# backend on .NET 10
with a React/TypeScript frontend, targeting one deployable application.
The original scenario/domain behavior is retained. The subsequently approved
GraphQL v0.2 transport and contract/package mapping replace the REST proposal.
The optional CSV was not regenerated by this work and must
be reconciled before any separately authorised import. See the
[G00 decision record](./docs/backlog/board.md#g00-decisions-and-readiness).

## Copilot reliability guardrails

The repository includes guidance to reduce unsupported claims,
unverified implementation assumptions, and misleading completion reports:

- [Repository instructions](./.github/copilot-instructions.md): shared engineering,
  evidence, uncertainty, scope, and data-safety rules.
- [agent-context-handoff](./.github/skills/agent-context-handoff/SKILL.md):
  compact checkpoints and coordinator-managed recovery through the claim helper.
  Real worker launch/shutdown integration remains unverified; scheduling is paused.
- [awesome-copilot-guidance](./.github/skills/awesome-copilot-guidance/SKILL.md):
  on-demand, revision-pinned references for development, QA and tool selection.
  Agents select relevant sections rather than loading or installing the catalog.
- [verify-claims](./.github/skills/verify-claims/SKILL.md): an on-demand workflow for
  checking research, APIs, capabilities, pricing, limits, and citations.
- [verify-changes](./.github/skills/verify-changes/SKILL.md): an on-demand workflow
  for selecting meaningful validation and reporting only observed results.

### Using these customizations

1. Open the repository root as your workspace in VS Code.
2. Run **Chat: Open Customizations** and check that the repository instructions
   and the repository skills are discovered by the selected agent harness.
3. Request a relevant task. You can explicitly invoke a skill where slash commands
   are supported, for example:

   ```text
   /agent-context-handoff Prepare a compact checkpoint for this card; do not launch a replacement or resume the scheduler.
   /awesome-copilot-guidance Select relevant references for the assigned story without changing its scope or installing tools.
   /verify-claims Check whether the proposed API exists for our selected dependency version. Cite evidence and identify unknowns.
   /verify-changes Validate this task's changes and distinguish passed, failed, and not-run checks.
   ```

4. Inspect the response's **References**, diagnostics, and tool activity where
   available to confirm what was actually loaded and checked.

Discovery and invocation depend on the Copilot version and selected harness.
Making a skill available does not guarantee automatic invocation. These
customization files remain stack-neutral. Application-specific commands and
their verification results are documented above.

### Limits

Instructions and skills guide behavior; they do not guarantee factual accuracy
or enforce a security boundary. Use human review, executable tests, schema
validation, access controls, and appropriate spending controls for constraints
that need enforcement. No global Copilot settings are changed by these files.

### References

- [GitHub repository custom instructions](https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/add-custom-instructions/add-repository-instructions)
- [VS Code custom instructions](https://code.visualstudio.com/docs/agent-customization/custom-instructions)
- [VS Code agent skills](https://code.visualstudio.com/docs/agent-customization/agent-skills)
- [Agent Skills format specification](https://agentskills.io/specification)
- [GitHub Copilot Chat capabilities and limitations](https://docs.github.com/en/copilot/responsible-use/chat)
