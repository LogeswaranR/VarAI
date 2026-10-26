# VAR-108 acceptance and learning evaluation

**Consolidated local integration note (2026-10-23):** an explicit real-application
adapter and real-reader checks are now supplied. The published app uses the
reusable browser checks through `client/tests/integration/**`; the original
fixture browser report remains separate. `tests/acceptance/package.json` defines
an ESM boundary so Playwright can import these checks from the ESM client without
misloading TypeScript as CommonJS; it adds no dependencies. See the
[local guide](../local-delivery.md) for current commands/reports. This package's
independent QA subsequently passed as part of the combined review, and the user
accepted the scoped local prototype. Expert review and the viewer study remain
unperformed. The standalone package history below is preserved, not a claim that
application integration is still absent.

This package owns only `tests/acceptance/**` and `docs/evaluation/**`. Its
approved starting revision is `a7d9f82983f4fc35c5a4703dfd69ffde79554240`.
It imports published v0.2 contracts, validators, stubs and G00 harness slots;
it imports no unmerged feature package and changes no shared configuration.

**Three distinct kinds of evidence**

1. **Executed contract fixtures:** data assertions and explicitly staged G00
   probe inputs. `LIVE_AI` here means **SIMULATED LIVE-AI TEST STUB**, never a
   model request. Probe browser checks are not integrated feature acceptance.
2. **Real application:** an explicit G01 adapter is required. None was supplied
   for this package. Its data report is **BLOCKED** and its browser tests are
   **SKIPPED / NOT RUN**, with reasons. No fallback to fixtures is allowed.
3. **Human work:** semantic/rules reviews and five-viewer observations are
   **NOT RUN**. Structural validation, draft answers and a small study protocol
   cannot establish prose correctness, official approval or demand.

The planned transport is **`/graphql`**, supplied by G01, not the superseded
REST proposal. This package does not mount a GraphQL endpoint.

## Run the owned checks

Run from the repository root for the consolidated checkout.
Use the pinned Node **24.22.1** / npm **11.19.1**. No .NET is needed here.

```bash
export PATH="$PWD/.tools/node/bin:$PATH"
mkdir -p tests/acceptance/.cache
export TMPDIR="$PWD/tests/acceptance/.cache"
export PLAYWRIGHT_BROWSERS_PATH="$PWD/.tools/playwright"
node --version
npm --version

# First try the smallest owned check. Do not resolve an ancestor installation.
node ./node_modules/vitest/vitest.mjs run --config tests/acceptance/vitest.config.mts tests/acceptance/harness.test.ts
# ONLY if that fails because local dependencies are missing:
# npm ci --cache tests/acceptance/.cache/npm --no-audit --no-fund

node ./node_modules/typescript/bin/tsc -p tests/acceptance/tsconfig.json
node ./node_modules/eslint/bin/eslint.js --config tests/acceptance/eslint.config.mjs tests/acceptance
node ./node_modules/vite/bin/vite.js build --config tests/acceptance/runner.config.mts
node ./node_modules/vitest/vitest.mjs run --config tests/acceptance/vitest.config.mts --reporter=default --reporter=json --outputFile=tests/acceptance/artifacts/unit-report.json
node ./node_modules/vite/bin/vite.js build --config tests/acceptance/browser/vite.config.mts
node tests/acceptance/artifacts/runner/cli.mjs --target contract-stub
```

The runner build is a prerequisite for `cli.test.ts`; a missing build fails,
not skips, those executable tests. This uses the existing workspace lockfile
and tools, not another dependency stack. In the consolidated checkout,
`npm run test:package:108` builds the runner/application adapter and runs this
package's acceptance unit checks.

### Browser isolation

Choose and verify a free port every run. Never use `4173` or another worker's
server. The config rejects `4173`, binds only `127.0.0.1`, sets strict port
handling and `reuseExistingServer: false`, and retains Vite filesystem guards.

```bash
export VAR108_PORT=43108
node --input-type=module -e "import { createServer } from 'node:net'; const s = createServer(); s.on('error', e => { console.error(e.code); process.exitCode = 1 }); s.listen(Number(process.env.VAR108_PORT), '127.0.0.1', () => { console.log('Port is free'); s.close() })"
# Proceed only if the port check succeeds. A later port race fails strictly.
node ./node_modules/@playwright/test/cli.js test --config tests/acceptance/playwright.config.mts
node tests/acceptance/verify-browser.mjs
```

Playwright starts its own server, waits for its HTTP page, and stops it with
SIGTERM after the suite. Re-run the free-port check to confirm shutdown.
Fixture browser routing aborts backend and external requests. Watching/HMR
are disabled; no provider requests or browser downloads are required when the
approved Chromium cache is available. Do not install/download on speculation.

There are **48 required fixture browser executions** and **36 explicitly
unexecuted application cases** across 375px/1280px. `verify-browser.mjs`
validates each expected title/project, single attempt, status, skip reason,
and aggregate counts; it rejects omitted tests and manufactured green output.
Its successful exit establishes only the fixture browser scope.

## Explicit adapter contract

The owned [types](../../tests/acceptance/model.ts) use the published
`ScenarioRepository` / `ExplanationClient` interfaces. The
[stub adapter](../../tests/acceptance/adapters.ts) only wraps approved G00
stubs. Team-label checks modify an isolated repository projection, never the
GraphQL request shape. Fixture prose is not regenerated or semantically certified.

For G01, supply a reviewed local ESM module exporting
`createAdapter(): AcceptanceAdapter | Promise<AcceptanceAdapter>`:

- `kind: "real-application"` and a truthful `name`;
- `application` and `live`: `{available: true}` or
  `{available: false, reason: "specific non-secret reason"}`;
- `repository` / `client`: actual G01 collaborators. Its transport adapter must
  reject HTTP/media-type/top-level GraphQL errors before returning typed unions;
- `failureClient(code)`: explicit model-free fault injection, not a claimed
  observed provider outage;
- `withTeamLabels(id, labels)`: explicitly isolated server/repository test-data
  injection returning collaborators. Never put arbitrary facts in `explain`
  input. If the seam is unavailable, report **BLOCKED**, not invariance success.

```bash
# Today: produces 27 BLOCKED records and exits 2; no fixture fallback.
node tests/acceptance/artifacts/runner/cli.mjs --target real-application

# G01 only, after a real adapter is explicitly supplied and approved:
node tests/acceptance/artifacts/runner/cli.mjs --target real-application --adapter ./approved-g01-adapter.mjs
# --allow-live additionally requires separate live authorization AND adapter
# live availability. Do not use it for this VAR-108 delivery.
```

For UI packages, reuse `registerReaderChecks(label, slots)` from
[reader-checks.tsx](../../tests/acceptance/reader-checks.tsx) with explicit
`HarnessSlots`. Its current six executions exercise the **baseline probe**,
not candidate implementation or autonomous replay.

For the integrated browser, call
`registerApplicationChecks(explicitAdapter)` from
[application-checks.ts](../../tests/acceptance/browser/application-checks.ts)
inside G01's owned, strictly isolated Playwright configuration. The current
`application.spec.ts` intentionally calls it without an adapter, reporting skips.
The adapter must operate real UI hooks, never replace the page with fixtures:

- `open(page, scenario)` starts a fresh, authored, pre-pass application context;
- `advanceToReady(page)` drives the actual replay, not a fabricated result;
- `explanationRequestCount(page)` counts actual `explain` attempts;
- `deferNextExplanation(page)` holds an injected response;
  `releaseAndSettle()` resolves only after delivery and client processing;
- `selectedSource(page)` locates the actual source-inspection focus target;
- `live` records authorized access, not just the presence of a credential.

No adapter is imported implicitly, and no current probe is called an application.
The adapter's provenance itself needs G01 review; a type or self-declared
`kind` is not independent proof of real provider access.

## Report and exit contract

`tests/acceptance/artifacts/contract-stub.json` and `real-application.json`
use the strict schema validated by
[report.ts](../../tests/acceptance/report.ts):

| Field | Meaning |
| --- | --- |
| `schemaVersion`, `runId`, `startedAt`, `finishedAt` | `var108.acceptance/1`, unique run and execution timestamps |
| `target`, `adapter`, `scope`, `evidenceLabel` | Explicit provenance; scope is `contract-data-and-injected-faults` |
| `results[]` | Exactly 27 unique required IDs, requirements, expected outcome, kind, status, reason and observed values |
| `counts` | Status totals recalculated from results; exactly 12 matrix and 7 injected-failure records |
| `outcome` | `PASS`, `FAIL`, or `INCOMPLETE` **within that scope** |
| `productAcceptance` | Always `NOT_ESTABLISHED`; this package cannot authorize Done |
| `unexecuted[]` | Explicit NOT RUN browser, authorized-provider-smoke, semantic, qualified-review and study scopes; also real application for fixture runs |

Non-passes require reasons; passes require actual observations. The core
report's browser scope stays NOT RUN because browser evidence is a **separate**
`browser-report.json`, not inferred from data tests.

CLI stdout is one JSON summary with exactly `report`, `target`, `outcome`,
`counts`, `productAcceptance`, and `evidenceLabel`. Exit codes: **0** means all
required cases in the selected automated scope passed; **1** means failed
assertion, invalid output/report, invalid invocation or adapter startup failure;
**2** means required checks were blocked/skipped/not run. Missing live paths
never imply complete product acceptance. Raw adapter exceptions are not logged.

Generated builds, logs, reports and caches stay under ignored owned
`artifacts/` / `.cache/`. The reusable documentation and recorded observations
are in this directory; see [verification](./verification.md),
[traceability](./traceability.md), [semantic rubric](./semantic-rubric.md),
[study pack](./study-pack.md) and [qualified review](./qualified-review.md).

## Guidance applied

Read only `instructions/playwright-typescript.instructions.md` and relevant
semantic/keyboard/focus sections of `instructions/a11y.instructions.md` at
`github/awesome-copilot@613efc8c21d9b3ce642dff361d17006cd9967e28`.
Applied role/label locators, observable web-first assertions, keyboard/focus
checks and no arbitrary sleeps/retries. Rejected catalog-wide setup, new
dependencies, example-site execution, and claims of full accessibility compliance.
Local requirements and pinned installed types take precedence.
