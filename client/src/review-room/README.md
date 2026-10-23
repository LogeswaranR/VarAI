# VAR-102 review-room replay

**Local integration note (2026-10-23):** the normal app now injects all four
real panels and fetch adapters. Slot order places the reader beside the scene,
and S3's unavailable-comparison message explains the missing evidence.
The standalone package history below is preserved; current app checks and run
commands are in the [local delivery guide](../../../docs/local-delivery.md).

Functional React/CSS replay shell for VAR-102, T01 and T02. This package is
independent of VAR-101 and the other feature implementations. It does not
implement a pitch scene, evidence navigator, explanation reader, recap or
comparison feature. No new dependency, HTTP adapter or model integration is
included.

## Component API

```tsx
import { ReviewRoom } from './review-room'
import type { ReviewRoomProps, ReviewRoomSlots } from './review-room'
```

`ReviewRoomProps`:

| Input | Contract |
| --- | --- |
| `repository` | Required injected GraphQL v0.2 `ScenarioRepository` (`list`, `get`). |
| `client` | Required injected `ExplanationClient`, passed unchanged to the explanation slot. The shell never calls it. |
| `initialScenarioId` | Optional explicit ID; omitted/null means no selection. Invalid IDs are errors, not defaults. |
| `slots` | Optional `Partial<ReviewRoomSlots>` containing React component types for `scene`, `evidence`, `explanation`, `comparison`. Omitted children have labelled placeholders. |

The slots use the existing `SceneInput`, `EvidenceExplorerInput`,
`ExplanationReaderInput` and `ComparisonInput` from
[`../contracts/interfaces.ts`](../contracts/interfaces.ts), without additions
or schema changes. Supply stable repository/component identities. Replacing
the repository or initial-ID prop creates a new controller and cancels the old
context; these are not a controlled selection API.

The shell owns the existing scenario/play/pause/reset/review-ready/synthetic
UI hooks. Slot regions also have `review-room-<name>-slot` test IDs.
Child-feature hooks remain the injected child's responsibility; placeholders
do not pretend to implement feature interactions.

### State and event bindings

| Action / boundary | Effect |
| --- | --- |
| Mount | Load and validate the three scenario summaries. Select only an explicitly provided initial ID. Never autoplay. |
| Select / retry / reload choices | Abort old loads, clear the old replay and panels, obtain a fresh run ID, and validate the new response and summary version. |
| Play | Process events due at time zero; schedule the next supplied event offset. |
| Pause | Process any event due at that exact instant, cancel the timer, and retain precise elapsed time. |
| Resume | Continue from the retained elapsed time, without replaying released events. |
| Restart | Fresh run ID, before-pass state, no source selection, remounted child state. Keep the same immutable scenario record. |
| Explanation `inspectSources` | Validate that IDs belong to released evidence/rules; route selection to the evidence slot and focus that region. Stale-run callbacks are ignored. |
| Comparison `selectScenario` | Use the same validated scenario-selection/reset path. Stale-run callbacks are ignored. |
| Unmount | Abort repository requests and remove replay timers. Ignore subsequent completions. |

`controller.ts` is independent of React and child features. It uses a monotonic
clock and event-relative timeouts, not a hard-coded six-step timer. Delayed
callbacks process due events in source order. Progress is rendered at event
boundaries and on pause. Zero-offset events remain unrevealed until Play.

Scenario records are validated, cloned and deeply frozen; replay, selection and
projections never edit the repository's records. Abort signals and independent
attempt counters prevent out-of-order successes **and** failures from replacing
newer state, including repeated requests for the same ID.

### Disclosure and child lifecycle

- Before playback: supplied before-score and match metadata, no event facts.
- Each event: cumulative `revealFactIds` only.
- Goal event: original-decision context.
- Review-ready: supplied review-outcome and after-score context. Explicit
  `MISSING`/`null` values remain missing; they are not interpreted as a result.
- Before release, context says **Not yet revealed**, not **Missing**.
- Scene input contains no original diagram markers, reference line or text
  until all relevant pass-time position facts are released. The existing
  `UNAVAILABLE` shape carries an explicit **Not yet revealed** text alternative
  while masked. The missing-snapshot hook appears only for a released,
  genuinely unavailable snapshot.
- Comparison is mounted only after review-ready and after a checked S1/S2 pair
  has loaded. Pair context/version/rules must agree; no full pair is passed if
  any current fact remains unreleased. S3 has no comparison request.
- Explanation receives only its agreed metadata, run ID, readiness, client and
  source callback. The shell does not pass authored answers or request one.
- The panel subtree is keyed by scenario/content version/run. Restart and
  selection remount the explanation reader and its recap, even for the same
  scenario. An injected reader still owns its own request cancellation and
  audience/mode behavior.

Repository throws, malformed results, incorrect IDs/versions/correlation and
typed contract errors are visible errors. Domain retry policy is preserved.
Recovery is explicit retry, another selection or reload of choices; no
success-shaped fallback, silent S1 selection or live-to-authored switch exists.

## Isolated development preview

The preview explicitly injects the approved **T02 TEST FIXTURES**, initially S1.
All four child panels are placeholders. Core feature modules import neither
the harness nor fixture implementations. Only tests/test support and the
development preview import stubs.

From the consolidated repository root (the original worktree command used the
same pinned canonical tool installation):

```bash
export PATH="$PWD/.tools/node/bin:$PATH"
npm run dev --workspace @varai/client -- \
  --config src/review-room/validation.config.ts \
  --host 127.0.0.1 --port 4182 --strictPort
```

Open <http://127.0.0.1:4182/src/review-room/preview/index.html>.
Stop this process with Ctrl-C when finished. Strict binding refuses an occupied
port; choose another verified-free loopback port if needed, **never 4173**.
This isolated fixture preview does not replace the normal application entry.

This HTML/entry is development-only (`import.meta.env.DEV` guard). It is not a
production build input. The normal client build now builds the integrated
review product; see the root local-delivery guide. No production deployment
is claimed.

### Why the explicit validation configuration exists

The original assigned worktree was nested inside the canonical repository's `.git`
directory. Vite 8.3.4's default `**/.git/**` filesystem denial therefore also
rejects this worktree's ordinary source files. The default candidate test
command and the unchanged baseline `App.test.tsx` both failed to collect
`/src/test-setup.ts`.

The coordinator approved **test/preview-only** `validation.config.ts`. It
reuses the shared Vite/Vitest config, keeps filesystem `strict: true`, and
allows only the root derived from this exact worktree-local configuration.
Environment, npm/Yarn credential configuration and certificate/key patterns
remain denied. Worktree-local `.git` files, directories and nested Git metadata
are denied with worktree-rooted patterns rather than rejecting an ancestor's
name. No parent repository, enclosing Git directory or sibling worktree is
allowed. Shared config is unchanged, and feature code never imports this file.

Use `--config` explicitly for these scoped tests/preview. Do not replace the
shared configuration or relax its general protections.

## Validation commands

Use the pinned Node 24.22.1/npm 11.19.1 and worktree-local dependencies.
The first dependency check rejected accidental ancestor resolution. Only then
was the unchanged lockfile restored using:

```bash
npm ci --cache ./client/src/review-room/.validation/npm-cache --no-audit --no-fund
```

Local resolution was rechecked for React, React DOM, Vite, Vitest, TypeScript
and Playwright. `npm install-scripts ls` reported no unreviewed scripts; no
script approvals or dependency updates were made.

```bash
# Unchanged baseline control plus the initial controller tests.
npm run test --workspace @varai/client -- \
  --config src/review-room/validation.config.ts \
  src/App.test.tsx src/review-room/controller.test.ts

# Actual package tests, not the historical stub-only test:package:102 selector.
npm run test --workspace @varai/client -- \
  --config src/review-room/validation.config.ts src/review-room

# All client regressions, type checking, lint and the existing client build.
npm run test --workspace @varai/client -- --config src/review-room/validation.config.ts
npm run typecheck
npm run lint:client
npm run build:client
```

Browser checks use the already approved Chromium installation, no downloads.
The browser config owns a strict, separate Vite server and shuts it down.
It does not reuse or stop the canonical server on 4173.

```bash
mkdir -p ./client/src/review-room/.validation/runtime
export PLAYWRIGHT_BROWSERS_PATH="$PWD/.tools/playwright"
export TMPDIR="$PWD/client/src/review-room/.validation/runtime"
export npm_config_cache="$PWD/client/src/review-room/.validation/npm-cache"
export VAR102_PORT=4182
npm exec --workspace @varai/client -- playwright test \
  --config src/review-room/browser/playwright.config.ts
```

The port was checked with an exclusive loopback bind before use. The browser
suite checks genuine keyboard typeahead/Tab/Enter/Space interactions, visible
focus, live-region attributes/text, exact event boundaries, pause/resume/reset,
all three fixture outcomes, and overflow at 375px and 1280px. It also checks
for page errors and disallows browser requests to backend/provider paths or
external origins.

Negative HTTP probes create only non-secret sentinels under the owned
`.validation` directory, then delete them. They require HTTP 403 and absence
of sentinel/content markers for `.env`-style files, PEM, npm/Yarn config,
worktree `.git`, nested Git metadata, the parent README and enclosing Git
metadata. No real secret file is read or printed.

### All nine acceptance criteria

| Criterion | Candidate evidence |
| --- | --- |
| VAR-102-AC1 | `controller.test.ts`: S1/S2/S3 exact-offset ordering; pause/resume; restart from playing/paused/complete; additional uneven events. `replay.browser.ts`: three complete replays at both widths. |
| VAR-102-AC2 | Controller disclosure-boundary and immutable-source tests; shell staged-context tests; stateful injected reader/recap reset test. |
| VAR-102-AC3 | `ReviewRoom.test.tsx`: all four typed injected slots, delayed comparison mount, stub repository and client identity, placeholder-only shell. |
| VAR-102-AC4 | Controller/shell tests for invalid IDs, failed/malformed lists and scenario results, domain errors, summary mismatch, correlation, retries and out-of-order loads. |
| VAR-102-AC5 | Browser keyboard flow, 3px visible focus, polite atomic status, and no horizontal overflow at 375px/1280px across initial, paused, goal, ready, restart and selection states. |
| VAR-102-T01-AC1 | Fake-clock tests for exact offsets, remaining resume time, due-at-pause events, delayed callbacks, fresh restart/selection IDs and unchanged input records. |
| VAR-102-T01-AC2 | Before-score initially; original decision at 3000ms and outcome/after-score at 5000ms in the fixture; pass-fact diagram gating; genuine S3 nulls; reader/recap remount and stale callback rejection. |
| VAR-102-T02-AC1 | Placeholder preview plus typed injection tests; source routing/focus; comparison normal-reset path; visible loading/error/recovery; ignored stale results. |
| VAR-102-T02-AC2 | Browser keyboard/focus/status/layout checks, shell `ExplanationClient` spies showing zero automatic calls, browser no-backend/external-request guard. |

### Guidance applied

Consulted two `github/awesome-copilot` references at revision
`613efc8c21d9b3ce642dff361d17006cd9967e28`:

- [`instructions/a11y.instructions.md`](https://github.com/github/awesome-copilot/blob/613efc8c21d9b3ce642dff361d17006cd9967e28/instructions/a11y.instructions.md):
  semantic controls, keyboard operation, visible focus, reflow and status feedback.
- [`instructions/nodejs-javascript-vitest.instructions.md`](https://github.com/github/awesome-copilot/blob/613efc8c21d9b3ce642dff361d17006cd9967e28/instructions/nodejs-javascript-vitest.instructions.md):
  behavior, edge-case and error tests. Its JavaScript/`undefined` preferences
  were not adopted; local TypeScript and explicit-null contracts take priority.

Reading guidance or passing these checks is not full accessibility
certification, content/expert review, human acceptance or production readiness.

## Development handoff — 2026-10-22

- Assigned developer: GPT-6 Astra.
- Claim: `a38c5455b955410a871c00720e468c5a`.
- Worktree, relative to the original canonical checkout:
  `.git/varai-workflow/worktrees/var-102-development`.
- HEAD remains `a7d9f82983f4fc35c5a4703dfd69ffde79554240` (detached).
- All changes are uncommitted and confined to this owned package. Shared
  contracts, generated artifacts, application entries, manifests, lockfile,
  board and automation are unchanged.

### Exact changed files

All 16 files are new, relative to `client/src/review-room/`:

```text
.gitignore
README.md
ReviewRoom.test.tsx
ReviewRoom.tsx
browser/playwright.config.ts
browser/replay.browser.ts
controller.test.ts
controller.ts
index.ts
preview/index.html
preview/main.tsx
preview/preview.css
replay.ts
review-room.css
test-support.ts
validation.config.ts
```

### Observed verification results

The exact commands and environment are above.

| Check actually executed | Result |
| --- | --- |
| Initial strictly local dependency check | Failed: all six checked dependencies resolved from the ancestor, not this worktree. |
| Unchanged-lockfile `npm ci`, followed by local-resolution and install-script checks | Passed; all six dependencies resolved inside this worktree; no unreviewed scripts. |
| Unchanged `App.test.tsx` plus initial controller suite with the scoped config | 45 tests passed, confirming the nested-worktree loading diagnosis. |
| Final candidate-only selector | **61 tests passed**, including pause/resume for S1, S2 and S3. |
| Final full client selector | **169 tests passed** across five files, including unchanged baseline, contract and harness tests. |
| `npm run typecheck` | Passed. |
| `npm run lint:client` | Passed. |
| `npm run build:client` | Passed; unchanged shared application build, not a feature-integration claim. |
| Owned Playwright command | **10 Chromium checks passed**: five at 375px and five at 1280px. |
| Filesystem-denial probes | Nine denied paths at each width returned **403**; no sentinel, Git-content or parent-README marker was returned. |
| Full-page preview screenshots | Inspected at both widths; readable stacked/mobile and two-column/desktop layout, labelled placeholders and supplied context. |
| Core import inspection | No harness/stub implementation or explanation call in core modules. |
| Baseline/ownership diff | HEAD unchanged; no tracked shared changes; all 16 new files are inside the assigned package. |
| Process cleanup | Port 4182 released; no owned Vite or Chromium runtime process remained. Canonical 4173 was not used or stopped. |

Failures were not hidden:

1. The original
   `npm run test --workspace @varai/client -- src/review-room/controller.test.ts`
   and unchanged `src/App.test.tsx` control both failed before collection.
   The coordinator-approved scoped configuration fixed the enclosing-`.git`
   denial; no general/shared filesystem protection was disabled.
2. The first full browser run had two passing filesystem checks and eight
   failures. The layout checks exposed padding outside the shell's declared
   width. Adding `box-sizing: border-box` to the shell itself fixed the overflow,
   without clipping or hiding content.
3. The initial native select ArrowDown/Enter test sequence did not change the
   value in this Chromium/macOS environment. A bounded real-browser diagnostic,
   without fake clocks, observed native typeahead working. The final keyboard
   test uses actual `s`/`2`, Tab, Enter and Space presses, not `selectOption` as
   a substitute for keyboard proof. The diagnostic test was deleted. The
   focused rerun passed both checks, then the full ten-check rerun passed.

Not run: .NET/server suites, contract generation/check commands, CI, the root
`verify` aggregate or the canonical 4173 browser harness. This package changes
no server or generated/shared contract files. The full client regression
includes the existing unit harness. No live model, real HTTP GraphQL adapter,
VAR-101 candidate, child-feature integration, actual assistive-technology
audit or human acceptance was exercised.

The server is intentionally stopped at handoff; reopen the isolated preview
with the command above. Runtime/cache/diagnostic scratch files are not part of
the deliverable. Independent QA and the existing human gates remain required.
