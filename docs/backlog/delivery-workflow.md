# Board-driven multi-agent delivery

## Lean usage mode (approved 2026-10-22)

**2026-10-23 sequencing approval:** the user selected consolidated local delivery:
one Astra assignment may implement VAR-103/104/106/107 and early local G01 wiring
using the preserved candidates. Pending VAR-108 QA is included in one final
combined Sol review. This supersedes the earlier requirement to finish the
separate Batch 1 review before implementing those components; it does not
approve Batch 1/Done, remove acceptance criteria, or authorise commits, pushes,
deployment or live application-model spending. Use one isolated integration
worktree, track these cards manually as Doing, and keep native automation and
automatic Dispatch paused. Do not modify the claim helper to build a new
orchestration mechanism for this exception.

The user reported 71% of their Copilot allowance used and approved keeping the
current prototype requirements while reducing orchestration overhead. The
remaining percentage is not a verified token/currency budget or completion
guarantee.

- Finish and collect existing assignments; do not request new model turns only
  to reformat an otherwise usable review.
- Prefer one bounded implementation pass for the remaining UI and one combined
  integration review over separate agent/reviewer cycles for each small panel.
  Keep the approved Astra development and Sol review models.
- Reuse recorded evidence and run only checks relevant to actual changes.
  Do not replace required tests with a model's approval or claim unrun checks.
- Keep native scheduling off. No new automation, 3D, visual-polish, storage or
  other optional work. Keep handoffs and status messages concise.
- Preserve all work-item criteria, current claims and human gates. Review
  consolidation does not waive pending VAR-108 QA, Batch 1 sign-off, integration
  permission or the required live-model verification.

The detailed lifecycle rules below still govern ownership and safety. Any
combined implementation assignment must be explicitly bounded at the next
human gate, not dispatched as unrelated cards through a reused worker pool.

Version: 2.1 | Activation approved: 2026-10-22 | Native cadence: hourly

The [local board](./board.md) drives a native hourly coordinator automation.
The user selected hourly scheduling instead of the initially proposed 10-minute
local timer and initially asked to save it paused. On 2026-10-22, after G00
sign-off, the user separately approved board dispatch, the Batch 1 queue,
resuming hourly scans and one immediate scan. This is not an always-running
agent pool: eligible cards receive fresh, bounded worker contexts.

The [product backlog](./README.md), [technical Tasks](./technical-tasks.md) and
[shared contract](./contract-v0.2.md) retain their requirements. The 33 work items
and their acceptance criteria are unchanged by this workflow. The recorded T01
completion is preserved; G00, T02 and T03 are not completed by configuring it.

## Roles, models and capacity

| Role | Model | Concurrent capacity | Responsibility |
| --- | --- | --- | --- |
| Development | `gpt-6-astra` | 2 claims, including reserved replacements | One parent package and its technical Tasks |
| QA | `gpt-6.1-sol` | 2 claims, including reserved replacements | Independent review of a frozen candidate; no source edits |
| Coordinator | The native host's configured default | Scheduled scans | Claims, evidence, worktree isolation and handoffs |
| User | Not an agent | Human gate | Approvals, final review and Done decisions |

Use the exact requested worker models. Do not silently substitute another model
or reuse a developer as its own QA reviewer. Model availability and the native
host's delegation/stop capabilities must be checked before an actual launch.
If those capabilities are unavailable, report the blocker; do not simulate a
worker or a successful model response.

The helper is not a model runner or a permission sandbox. It validates declared
model identifiers, lifecycle state and evidence shape. The coordinator must
also verify the actual runtime assignment and its tool restrictions.

## Lanes and automatic transitions

```text
To Do -- user/coordinator explicitly queues --> Development
                                                    |
                                           claim development slot
                                                    |
                                             In Development
                                                    |
                                       checks pass + worker stopped
                                                    |
                                               Ready for QA
                                                    |
                                              claim QA slot
                                                    |
                                                  In QA
                          +-------------------------+------------------+
                          |                                            |
                  blocking findings                                  pass
                          |                                            |
            Development (up to two corrections)                 Ready for Review
                          |                                            |
               third failed QA -> Blocked                  integration + user sign-off
                                                                       |
                                                                      Done
```

Failures, missing access and uncertain runtime state are never successful
handoffs. Only the coordinator publishes verified worker results to the board.
The helper cannot mark a card Done or complete its children. QA corrections
are bounded per card; changing chats or scheduler runs does not reset them.

To Do is not a dispatch queue. Automatic jobs apply only to VAR-101 through
VAR-108. G00/G01 and their technical Tasks remain manually coordinated.

## Prerequisites and batch gates

Before dispatch:

1. G00 and G00-T01/T02/T03 must all be Done with actual acceptance evidence.
2. Obtain approval for a complete baseline commit. Record the full commit ID in
   the board controls; uncommitted files do not enter a new worktree automatically.
3. Confirm ownership paths from the approved .NET/React contract mapping and
   the real repository validation commands. Do not use obsolete path proposals.
4. Explicitly enable board Dispatch and the native automation after user approval.
5. Queue approved parent cards in Development. No queued cards means no workers.

| Active batch | Packages | Human review milestone |
| --- | --- | --- |
| 1 - Core behavior | VAR-101, VAR-102, VAR-105, VAR-108 | Scenarios, replay shell, explanation service and acceptance harness |
| 2 - Viewer experience | VAR-103, VAR-104, VAR-106, VAR-107 | Scene, evidence, explanation reader and comparison |

Only two packages can be in development at once; QA can run alongside
development on other cards. A batch still contains four packages. Batch 2
requires recorded Batch 1 human sign-off and all Batch 1 packages and children
Done. No automation may self-approve that transition.

The coordinator assembles reviewed candidates and runs combined checks before
requesting sign-off. Batch 1's missing panels remain explicitly labelled
placeholders. Full integration and an authorised live application-model smoke
test remain G01 work; coding/QA model invocations do not satisfy that test.

No automatic commits, main-branch merges, pushes, provisioning or deployment
are authorised. Azure Boards/PAT access remains unauthorised and unnecessary.

## Native hourly coordinator runbook

The saved automation targets the canonical repository folder, not an isolated
copy of the board. An enabled native local-host schedule depends on that host
being available; it is not a cloud uptime guarantee. Each scan starts a
coordinator model run and can consume usage even when no card is eligible.
Do not create an additional local timer or four independent schedules.

Saved automation ID:
`local-agent-host:ahp-automation:/32eb42a7-0656-4a6c-9037-f88fb2099923`.
Creation and read-back on 2026-10-21 confirmed the Local Agent Host provider,
the current repository folder target, hourly cadence and `enabled: false`.
At creation the definition had no previous run and no next scheduled run.
On 2026-10-22 the native listing showed it enabled, with earlier scans stopping
at the board's pause gate. The user then authorised enabling board Dispatch,
queueing Batch 1 and requesting one immediate scan. Refresh the native listing
before future updates rather than creating another definition or assuming
historical schedule metadata is current.

On every scheduled run:

1. Read local instructions and run the canonical helper's `scan` command.
   Use the returned claims and capacity; do not infer eligibility from prose.
   If dispatch is paused or a gate is incomplete, report the blockers and stop.
   Do not search the external guidance catalog on idle scans.
2. Reconcile any already-recorded workers using known runtime IDs. If their
   outcome is unknown or inaccessible from this run, leave their claims intact,
   report the condition and do not launch replacements for them.
3. Select eligible cards from the active batch, at most the available slots per
   role. Claim each card before creating a worker. Overlapping coordinator scans
   use the same lock; a failed claim means no worker should be launched for it.
   With the [local runner](#local-worker-runner), `prepare` performs that helper
   claim after its host preflight. Do not separately claim the same assignment.
4. Assign a separate linked Git worktree for each card from the approved
   baseline. A correction or context replacement continues in that card's
   recorded worktree, never in the canonical checkout or another card's tree.
5. Create a fresh worker with the requested role/model. Its first turn is
   readiness-only: read the assignment, verify its worktree and constraints,
   return its runtime identity, and make no edits or start long-running commands.
   Attach the verified identity/model/worktree with the helper, then explicitly
   authorise execution in a same-task follow-up.
6. Give the worker its story and technical criteria, approved ownership paths,
   contract version, baseline and check commands. Include
   [reference selection](../../.github/skills/awesome-copilot-guidance/SKILL.md)
   and [context handoff](../../.github/skills/agent-context-handoff/SKILL.md).
   Developer tools are bounded to its package; QA tools are read-only for source.
   If the host cannot isolate/restrict the worker, stop rather than waive this.
7. Await worker completion notifications; do not poll continuously or duplicate
   the assigned work. The coordinator runs or confirms the necessary checks.
   Save the bounded evidence record, confirm the worker and its owned writers
   are stopped, and complete the claim through the helper.
8. Successful development queues QA; successful QA queues human review.
   Blocking QA findings requeue development within the correction budget.
   New eligible work may fill a freed slot in this run, always through a new
   claim and fresh independent assignment, not a fixed worker pool.
9. Report claimed cards, transitions, checks, blockers and pending human reviews.
   Do not describe an idle/paused scan as development progress.

If worker launch returns an ambiguous result, do not retry it. Keep the claim
reserved until the actual runtime outcome can be established. Stale timestamps
never release a claim or justify another writer.

## Claim helper and local checks

The [helper](../../scripts/board_dispatch.py) uses Python 3.9+ standard-library
features and POSIX file locking (the current macOS host is supported). Windows
locking has not been implemented. It performs no network/model calls and never
executes commands found in reports or checkpoints.

Run from the canonical repository:

```bash
python3 -B scripts/board_dispatch.py scan
python3 -B -m unittest discover -s scripts/tests -p 'test_board_dispatch.py' -v
```

For a dispatcher operating from another directory, use `--repo` before the
subcommand to identify the canonical checkout. The worker copy is never the
status authority.

```text
claim --role development|qa --card CARD --run-id RUN
attach --claim CLAIM --agent-id WORKER --model MODEL --workspace ABSOLUTE_WORKTREE
inspect --claim CLAIM
complete --claim CLAIM --report RECORD --worker-stopped --stop-evidence EVIDENCE
checkpoint --claim CLAIM --checkpoint RECORD --worker-stopped --stop-evidence EVIDENCE
block --claim CLAIM --reason REASON --worker-stopped --stop-evidence EVIDENCE
```

These are command shapes, not instructions to run fabricated IDs. `claim`
returns the real claim token. `inspect` returns the currently bound identity,
fingerprint, criteria and recovery counts for preparing evidence.

The board's embedded JSON is provenance/claim state, not another ticket database.
The helper locks in the common Git directory, validates state and atomically
replaces the board. All automated board writes must use it. It detects edits
seen before replacement, but cannot make an unrelated editor honour its lock:
pause scheduling and reconcile workers before manual edits to active rows.

Tests use temporary repositories/worktrees and synthetic worker evidence. They
do not call real models, provision Azure or certify the native host lifecycle.

## Local worker runner

The [Python coordinator adapter](../../scripts/board_runner.py) and
[SDK bridge](../../scripts/board_worker.mjs) provide a local execution path.
They do not replace the coordinator model or the canonical claim helper.
The coordinator still verifies source, checks and criterion evidence before
calling `complete`; a worker's final response never automatically becomes a
passing report. No new timer, automation activation, commit or deployment is
part of this runner.

### One-time host configuration

Use an **already installed** Copilot SDK entrypoint and runtime. These command
arguments are placeholders, not discovered executable paths:

```bash
python3 -B scripts/board_runner.py configure \
  --sdk /absolute/path/to/installed/copilot-sdk/index.js \
  --runtime /absolute/path/to/installed/copilot-runtime \
  --flavor sdk-runtime
python3 -B scripts/board_runner.py preflight
```

Use `--flavor cli` for a standalone Copilot CLI, not the SDK-only executable.
Configuration is saved only in `.git/varai-workflow/host.json`. No packages,
skills or tools are installed, credentials copied, global approval settings
changed, or automatic updates enabled. The bridge uses existing Copilot
authentication from the normal CLI profile (`COPILOT_HOME` when set, otherwise
the SDK's default profile). It does not replace that authentication home with a
fresh per-run directory or copy stored credentials. Worker policy/state remain
in a separate session `configDir`, with discovery, hooks, IDE auto-connection,
remote export and model substitution disabled.

If authentication falls back to `gh-cli` and no required models are returned,
first verify the standalone Copilot CLI's signed-in account and model access.
The documented OAuth route is `copilot login` (browser/device flow), followed
by `/model` in the interactive CLI. Do not export or paste PATs or copy credential
files. Being authenticated to GitHub alone does not establish access to a
particular Copilot model; the account's plan, product and organisation policy
also apply. Use a supported CLI/SDK connection whose actual catalogue exposes
both required IDs. A CLI update or sign-in is not, by itself, proof that this
gate passed. The model list and a real bounded handoff still need verification.

This implementation requires macOS `sandbox-exec`, `lsof`, the repository's
pinned Node installation and an SDK supporting the inspected protocol-3 APIs.
Host preflight checks authentication and both exact model IDs before claiming.
It does not create a session, invoke a model or prove live worker enforcement.
An empty catalogue, `auto` alone, a disabled model, failed process cleanup or
missing host capability is a blocker, not a reason to fabricate a catalogue or
use a different model.

### Per-card coordinator sequence

Run the canonical helper's `scan` first. On an idle/closed-gate scan, stop.
For an eligible card, use its actual role and the current coordinator run ID:

```text
board_runner.py prepare --card CARD --role development|qa --run-id RUN
board_runner.py check --claim RETURNED_CLAIM --name package
board_runner.py start --claim RETURNED_CLAIM
board_runner.py status --claim RETURNED_CLAIM
board_dispatch.py inspect --claim RETURNED_CLAIM
```

Invoke these scripts with `python3 -B` from the canonical checkout, or put
`--repo ABSOLUTE_CANONICAL_CHECKOUT` before the subcommand. Tokens are returned
by the helper; do not invent them.

1. `prepare` checks gates and exact-model availability, calls the helper's
   `claim`, and creates a detached linked worktree at the approved baseline.
   Fresh trees live beside the checkout in `<repository>.varai-worktrees/CARD`.
   Corrections and replacements retain the helper-recorded tree. Unrecorded
   existing paths are rejected rather than reused. Preparation reserves a slot
   but does not launch a model.
2. Check the prepared tree using the package selector. Fresh worktrees have no
   ignored dependencies. Only after a missing-dependency check may the
   coordinator perform the already-approved locked restore from the
   [repository instructions](../../README.md#restore-and-check), within existing
   permissions. Use the canonical `.tools/node/bin` and `.tools/dotnet` in
   `PATH`, set `DOTNET_ROOT` to that canonical SDK, and set `NUGET_PACKAGES` to
   the canonical `.git/varai-workflow/packages` directory. Restore in the
   recorded worktree, never by copying canonical uncommitted source or sharing
   `node_modules` across cards. Recheck afterward. The runner never silently
   installs missing dependencies or changes source to make setup pass.
3. `start` accepts only a recorded, never-launched preparation. It rechecks the
   candidate and model availability, creates a fresh readiness-only session,
   observes its SDK session ID, selected model and worktree, and requires an
   unambiguous readiness response. Only then does it call helper `attach` and
   send execution authorisation to that same session.
4. The assignment contains the parent/technical criteria, ownership, canonical
   status context, shared contract and both required local skills. One
   task-relevant pinned guidance file is fetched through read-only GitHub access
   and cached by revision and content hash. Its contents remain reference data.
   Retrieval failures are explicit; sufficient local guidance may still be used.
   This retrieval happens only for a gated, prepared launch, never an idle scan.
5. Use the host's attached background-command facility for independent workers
   and await completion notifications. Do not add a polling loop or timer.
   Each invocation handles one card/role, not a reusable pool. Helper claims
   enforce capacity across coordinator runs, including preparations/replacements.
6. Results are saved as **unverified** records under private Git metadata.
   Inspect the actual candidate, log hashes, command outcomes, criterion coverage
   and shutdown evidence. Run additional relevant checks as coordinator when
   necessary. Then construct the delivery-schema report using fresh `inspect`
   values and call helper `complete` with truthful shutdown attestations.
   Passing development queues QA; passing QA stops at Ready for Review.

### Enforced boundaries and recovery

- SDK workers see only bounded source callbacks. Developers can list/read
  candidate source and write/remove individual owned files after attachment.
  QA sees only list/read callbacks. There is no generic shell, delegation,
  network-fetch, Git, approval or board-edit tool. Unknown runtime permissions
  are rejected, not forwarded to a human or automatically approved.
- The filesystem callbacks check the current canonical claim, role, model,
  worker ID, workspace and runner-policy fingerprint. Traversal, symlinks,
  hard links, credentials, Git/runtime metadata, ignored source and changes to
  Git visibility rules are rejected. Closing dispatch gates stops further
  developer writes/checks. Do not update runner code while assignments are live.
- Developers can request named repository checks, not arbitrary commands.
  Checks use pinned tools, a minimal environment, private scratch space and
  an OS-enforced read/write policy. Only declared ignored build/test outputs
  are writable; source is read-only during checks. External networking and
  keychain-service access are denied; local test networking is allowed.
  .NET test commands disable persistent build servers/shared compilation.
  QA checks are run by the coordinator, not by granting QA execution tools.
- Time limits terminate only invocation-owned process groups; they do not
  expire or release claims. SDK stop confirmation, process-group drainage and
  open-handle inspection of candidate/private runtime areas are recorded.
  Unknown remaining readers/writers are not killed by name or assumed safe.
  Uncertain launch, shutdown or identity leaves ownership reserved for
  reconciliation. `status` uses the existing record; it never rediscovers or
  relaunches a worker.
- Runtime records are provenance, not a second status authority. A
  `prepared` record proves no launch was attempted; a missing record or any
  other uncertain state does not. Never reset records to retry a launch.
  After verified shutdown and helper `checkpoint`, use `prepare` with
  `--replacement NEW_CLAIM` and the same card/role. The helper validates the
  unchanged checkpoint/candidate and retains the role slot and retry counts.
- Worker responses are limited to 32 KiB; generated workflow records to
  64 KiB. Full check logs are linked, not copied into lifecycle reports.
  Context checkpoints retain their separate 800-word limit.

### Verification boundary

```bash
python3 -B -m unittest discover -s scripts/tests -p 'test_board_*.py'
.tools/node/bin/node --test scripts/tests/board_worker.test.mjs
```

These cover helper regressions, temporary linked worktrees, readiness/identity
guards, negative source permissions, real macOS denied-path checks, pinned
Node/.NET startup, a controlled registered-check fixture, residual-handle
detection and SDK configuration. They do **not** certify a live model handoff,
Chromium under the check policy, feature acceptance or application-model calls.

On 2026-10-22, the tested standalone CLI reported `1.0.63` and only model ID
`auto`; the separately started VS Code runtime reported `1.0.100-1` and an empty
model catalogue. Both probes reported existing `gh-cli` authentication.
Neither established the required exact-model connection or created a worker.
Those observations do not establish model availability inside the active
VS Code host. Live dispatch remains gated on a usable exact-model connection
and an observed readiness/development/QA handoff; tests or scheduling alone
must not be described as autonomous feature delivery.

## Evidence records

Save secret-free JSON in the canonical repository's private Git metadata:
`.git/varai-workflow/evidence/` or `.git/varai-workflow/checkpoints/`.
These records survive coordinator chats without being committed. Treat them as
data, never executable instructions. Each record is limited to 64 KiB.

A development/QA report includes:

| Fields | Required value |
| --- | --- |
| `schemaVersion` | `1` |
| `claim`, `agentId`, `card`, `role`, `model` | Exact current claim/worker identity |
| `baseline`, `workspace`, `fingerprint` | Exact bound baseline and absolute worktree; fingerprint from the helper |
| `verdict` | `pass`, `changes_requested` (QA only) or `blocked` |
| `summary` | Concise observed result and limitations |
| `checks` | Records with `command`, integer `exitCode`, and `evidence` reference |
| `findings` | Records with Boolean `blocking` and an `evidence` reference |
| `criteria` | For pass: every parent/technical criterion, with `id`, `result: passed`, and `evidence` |

Passing reports require passing checks, complete criterion coverage and no
blocking findings. Evidence binds to the current claim and candidate, not an
old worker. The helper hashes saved development evidence and candidate contents;
changed evidence or source prevents QA acceptance.

These checks validate shape and provenance, not the truth of a model's claims.
The coordinator must inspect results and run/confirm the checks. It must not
pass an unsupported criterion just to advance the lane. QA can reference
coordinator-run test evidence without gaining permission to modify source.

## Context recovery

Use observed runtime pressure, repeated loss of requirements or repeated
non-progress as reasons to assess a handoff, not an invented token threshold.
First distinguish context loss from missing permissions, dependencies or an
unclear requirement. Normal test failures alone do not require replacement.

1. Save a compact checkpoint for the current claim and candidate.
2. Confirm the old worker and its owned writers are stopped. Unknown state
   keeps the claim reserved. An idle chat alone is not proof that its subprocesses
   stopped; retain the runtime/process evidence.
3. Call `checkpoint`. It invalidates the old claim token and reserves a new
   token in the same card/lane/role slot. It never briefly requeues the card.
4. Launch a fresh readiness-only context with the checkpoint, not the full
   transcript. Verify and attach its exact model and original worktree before
   permitting continued work.

In addition to the common identity/snapshot fields above, checkpoints require:

- `reason`: `context_pressure`, `repeated_no_progress`, `requirements_lost` or
  `user_requested`.
- Non-empty `signal`, `summary`, `nextStep`, `permissions`.
- Text arrays `changedFiles`, `decisions`, `checks`, `failedApproaches`,
  `blockers`, `sourceRefs`, `pendingApprovals`.
- `sourceRefs` includes the board, product backlog, technical breakdown and
  shared-contract paths.
- Non-empty `remainingCriteria` drawn from the card's actual criteria.
- Exact `qaFailures` and `contextReplacements` counts from `inspect`.
- `ownedProcesses: []`, after the coordinator has actually verified shutdown.

The checkpoint is capped at 800 whitespace-separated words including its JSON
metadata. Link supporting logs rather than copying the transcript. It is
hash-bound and the replacement cannot attach if it or the candidate changed.

There is at most one context replacement per card/role across chats and QA
corrections. QA failures have a separate two-correction budget. Counters persist
in the board and are never reset by a scan, failed launch or fresh context.
A second replacement needs a user decision. Do not edit the JSON to reset it.

`--worker-stopped` and `--stop-evidence` are explicit coordinator attestations
based on runtime observations, not an automatic process-killing API. The helper
cannot stop a model, detect context pressure or enforce a sandbox itself. If
the host cannot prove a worker is quiescent, do not transfer or release its slot.

## Activation and completion boundaries

- Verification on 2026-10-21: all 30 local lifecycle tests passed. A real-board
  scan returned no eligible work and the expected paused/incomplete-G00/no-
  approved-baseline blockers. The 33 work items and 98 criteria remain intact;
  At that automation-setup check, T01 was Done and T02/T03 were To Do.
  Current implementation status remains in the local board.
- On 2026-10-22 the user approved resuming native scheduling and enabling board
  Dispatch for Batch 1. Consult the live board and native provider for current
  state; this approval is not permission to start Batch 2 or approve Done.
- Enabling scheduling, G00 completion, approved baseline commit and explicit
  queueing remain separate actions; neither a worker nor an idle scan may
  manufacture those approvals.
- Runtime worker/model invocation, shutdown, context-transfer integration and
  scheduled execution still need an authorised smoke test after the baseline
  is ready. Local fixture tests do not establish those runtime capabilities.
- All blocking findings must be resolved or explicitly escalated before the
  user reviews the batch. Ready for Review is not Done.
- Preserve the application's factual uncertainty and rule-review limitations.
  A different reviewer model does not prove football expertise, learning impact
  or complete security.
