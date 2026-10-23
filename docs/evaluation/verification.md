# VAR-108 development handoff and observed verification

Date: **2026-10-22**. Package: VAR-108 including T01/T02.
Claim: `2da6e1869c9647a2a4c656b26d508ae6`.

Worktree: isolated VAR-108 development checkout. The machine-specific path
is retained in owner-local workflow evidence, not this public record.

Approved detached HEAD: `a7d9f82983f4fc35c5a4703dfd69ffde79554240`, unchanged.
`git diff --quiet HEAD` passed; all new source paths are exclusively owned.
No shared tracked source, manifest, lockfile, generated contract, entrypoint,
board or claim was edited. No commit, push, merge, deployment, scheduler action,
Azure/PAT access or real model request occurred. Other worktrees and the user
preview at `127.0.0.1:4173` were not inspected or used.

**Development deliverables and fixture verification only — not independent QA,
integrated application acceptance, qualified review, user-study completion or Done.**
See [all nine criterion mappings and BR matrix](./traceability.md).

## Exact validation environment

Commands ran from that worktree using the canonical checkout's pinned tools.
The tool paths below are normalised for the current consolidated repository root:

```bash
export PATH="$PWD/.tools/node/bin:$PATH"
export TMPDIR="$PWD/tests/acceptance/.cache"
export PLAYWRIGHT_BROWSERS_PATH="$PWD/.tools/playwright"
export VAR108_PORT=43108
```

`node --version` returned `v24.22.1`; `npm --version` returned `11.19.1`.
The first owned Vitest command failed with **MODULE_NOT_FOUND** for the
worktree-local `node_modules/vitest/vitest.mjs`. Only then was
`npm ci --cache tests/acceptance/.cache/npm --no-audit --no-fund` run:
**276 existing locked packages restored**, without changing locks or installing
new dependencies. The initial `fsevents` script notice was not bypassed;
`npm install-scripts ls --cache tests/acceptance/.cache/npm` subsequently returned
“No packages with unreviewed install scripts.” No extra approval was granted.
.NET and browser installation were unnecessary and **not run**.

## Commands actually executed and final results

| Command (from the worktree root) | Observed result and scope |
| --- | --- |
| `node ./node_modules/typescript/bin/tsc -p tests/acceptance/tsconfig.json` | PASS; strict owned TypeScript and imported types |
| `node ./node_modules/eslint/bin/eslint.js --config tests/acceptance/eslint.config.mjs tests/acceptance` | PASS; no lint errors |
| `node ./node_modules/vite/bin/vite.js build --config tests/acceptance/runner.config.mts` | PASS; 13 modules, executable `artifacts/runner/cli.mjs` |
| `node ./node_modules/vitest/vitest.mjs run --config tests/acceptance/vitest.config.mts --reporter=default --reporter=json --outputFile=tests/acceptance/artifacts/unit-report.json` | **57 passed, 0 failed, 0 skipped, 5 files** |
| `node ./node_modules/vite/bin/vite.js build --config tests/acceptance/browser/vite.config.mts` | PASS; 26 modules, isolated test HTML/JS/CSS only |
| `npm run test --workspace @varai/client -- src/contracts src/harness` | **105 baseline tests passed, 2 files**; imported G00 contract/harness behavior, not VAR-108 implementation acceptance |
| `node tests/acceptance/artifacts/runner/cli.mjs --target contract-stub` | Exit **0**; **27 PASS**: 12 scenario/audience/mode, 7 injected failures, 1 missing-evidence, 1 controlled-comparison, 3 audience and 3 team-label cases |
| `node tests/acceptance/artifacts/runner/cli.mjs --target real-application` | Exit **2**, explicitly checked as the expected incomplete outcome: **27 BLOCKED, 0 PASS**, because no G01 adapter was supplied |
| `node ./node_modules/@playwright/test/cli.js test --config tests/acceptance/playwright.config.mts` | **48 fixture checks passed; 36 application cases skipped with reasons**, across exact 375px/1280px projects; 0 failures/retries |
| `node tests/acceptance/verify-browser.mjs` | PASS; validated all **84** title/project/result records, counts and explicit application skip reasons; `applicationExecuted: 0`, `productAcceptance: NOT_ESTABLISHED` |
| `node ./node_modules/vitest/vitest.mjs run --config tests/acceptance/vitest.config.mts tests/acceptance/evaluation.test.ts` | Final documentation-only recheck: **3 passed**; planned study rows remain NOT_RUN |
| `git diff --quiet HEAD`, `git status --short`, `git rev-parse HEAD`, and an owned-prefix assertion over `git ls-files --others --exclude-standard` | Unchanged approved baseline; only new `tests/acceptance/**` and `docs/evaluation/**` source |
| `git check-ignore tests/acceptance/artifacts/contract-stub.json tests/acceptance/artifacts/browser-report.json tests/acceptance/.cache/npm/_logs` | All generated report/cache locations ignored |

Vitest's 57 assertions comprise **33 contract/report tests, 5 subprocess/CLI
tests, 6 reader-input lifecycle tests, 10 browser-report integrity tests and
3 draft study/traceability integrity tests**. Template integrity is not
participant research.

The CLI tests executed, parsed stdout and validated persisted report contents:

| Controlled executable case | Actual child exit | Actual report |
| --- | --- | --- |
| Approved fixture adapter | 0 | 27 PASS |
| Deliberately incomplete `ExplanationSuccess` output | **1** | **16 FAIL**, 11 unaffected checks PASS |
| Explicit adapter module missing | **1** | **27 FAIL**, no fallback |
| Real application requested without adapter | **2** | **27 BLOCKED**, 0 PASS |
| Missing required target argument | **1** | No success report/stdout; usage error |

Additional negative tests corrupt citations, structured interpretation,
correlation, selected fields, provenance, word limits, unknown outcome, adapter
identity, counts, IDs, pass evidence and human statuses. A deliberately
unsupported sentence with valid IDs demonstrates the structural validator's
semantic limit, **not** acceptance of that sentence.

An additional Node assertion read the actual saved contract/app/negative and
Vitest JSON: exact report schemas, 27/0 passed fixture/application counts,
27 blocked app records, 16 deliberately failing output records, and **57
individual passed Vitest assertion records** matched the aggregate results.
This was not a file-existence check.
Final local documentation assertions also confirmed the exact **32 owned files**
in this handoff and resolved all **21 local Markdown links**; external source
URLs were not treated as independently reviewed.

## Browser ownership and actual evidence

Before each browser run, a Node `net.createServer().listen(43108, "127.0.0.1")`
probe successfully bound and closed the port. Playwright then launched a
strict-port Vite instance, checked its owned HTTP entry for readiness, and
loaded the fixture page. Its route guard observed no external/backend request
and no page error. No existing server was reused.

The final browser run (tool session **428**) reported **48 passed / 36 skipped**
in **16.1 seconds**. Playwright shut down its owned server using its configured
SIGTERM lifecycle. A new successful bind/close on `127.0.0.1:43108` after the
run confirmed that the port was released. No owned test/preview server remains.
No name-based process shutdown was used.

Reports/logs are under ignored `tests/acceptance/artifacts/`:
`contract-stub.json`, `real-application.json`, `unit-report.json`,
`browser-report.json`, `browser-run.log`, and `self-test/*.json`.
The injected subprocess adapter scratch file was removed. These reports are
reproducible execution artifacts, not committed baseline requirements.

## Corrected failures and refinements

- The first check correctly failed for missing local dependencies; restored
  the unchanged lockfile only after that observed failure.
- Strict checking caught an attempted assignment to readonly scenario data,
  an erasable-syntax-incompatible parameter property, the wrong Vitest option
  (`forbidOnly` versus `allowOnly: false`), and omitted jest-dom augmentation.
  Corrected only owned code/config and reran checks successfully.
- Converted owned configuration to ESM `.mts` rather than changing a shared
  package manifest or hiding Vite's module-format warning.
- A CLI test initially used a browser/jsdom-transformed URL for a filesystem
  path. Gave the filesystem/subprocess test a Node environment and explicit
  worktree paths; all five subprocess tests then passed.
- Playwright's relative JSON output path initially landed in a nested owned
  directory. The evidence reader failed with ENOENT rather than claiming a
  report existed. Changed the reporter to an absolute owned path, removed the
  misplaced generated file/directories, reran the browser suite and validated
  the actual JSON contents.
- Self-review removed sensitivity to JSON property/fact ordering in semantic
  value comparisons; a regression test now checks equivalent reordered inputs.
  The unavailable-app evidence label describes a target, not an adapter that
  was never supplied.

## Limits and next owner

No development shared-boundary blocker remains. G01 must explicitly supply and
review actual application adapters, transport and UI composition; the reusable
invocations, adapter methods and exact output shape are documented in
[README.md](./README.md). Nothing imports an unfinished feature package.

The fixture page still uses G00 **probes**, not production replay, a reader,
source navigation or recap. Six reader tests exercise staged inputs and deferred
responses. Actual replay/reset/recap, keyboard source focus and audience/mode
round-trip invalidation have executable candidate checks but remain among the
**36 skipped real-application browser executions**.

Actual `/graphql` HTTP/media-type behavior, provider execution/deadline and
authorized live smoke, integrated application acceptance, full accessibility,
source interpretation, qualified rules review, semantic claim review and all
five viewer observations are **NOT RUN / unverified**. Five draft measurement
rows are planned slots, not five people tested. No market or statistical
validation is claimed. A declared adapter `kind` cannot authenticate provenance;
G01 review and independent execution evidence remain necessary.

## Exact owned source files (32 new files)

```text
docs/evaluation/README.md
docs/evaluation/measurements.csv
docs/evaluation/qualified-review.md
docs/evaluation/semantic-rubric.md
docs/evaluation/study-pack.md
docs/evaluation/traceability.md
docs/evaluation/verification.md
tests/acceptance/.gitignore
tests/acceptance/adapters.ts
tests/acceptance/browser-report.test.ts
tests/acceptance/browser-report.ts
tests/acceptance/browser/application-checks.ts
tests/acceptance/browser/application.spec.ts
tests/acceptance/browser/fixtures.spec.ts
tests/acceptance/browser/index.html
tests/acceptance/browser/main.tsx
tests/acceptance/browser/vite.config.mts
tests/acceptance/cli.test.ts
tests/acceptance/cli.ts
tests/acceptance/eslint.config.mjs
tests/acceptance/evaluation.test.ts
tests/acceptance/harness.test.ts
tests/acceptance/harness.ts
tests/acceptance/model.ts
tests/acceptance/playwright.config.mts
tests/acceptance/reader-checks.tsx
tests/acceptance/reader.test.tsx
tests/acceptance/report.ts
tests/acceptance/runner.config.mts
tests/acceptance/tsconfig.json
tests/acceptance/verify-browser.mjs
tests/acceptance/vitest.config.mts
```
