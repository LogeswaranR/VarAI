# Board-driven multi-agent delivery

Version: 2.0 | User decisions: 2026-10-21 | Native hourly scheduling: disabled

The [local board](./board.md) drives a native hourly coordinator automation.
The user selected hourly scheduling instead of the initially proposed 10-minute
local timer and asked to save it paused. This is not an always-running agent
pool: eligible cards receive fresh, bounded worker contexts.

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
The saved definition has no previous run and no next scheduled run. Refresh
the native automation listing before any future update rather than creating
another definition or assuming this saved status is still current.

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
- Keep native scheduling disabled and board Dispatch Paused for now.
- Enabling scheduling, G00 completion, approved baseline commit and explicit
  queueing are separate actions; this setup does none of them automatically.
- Runtime worker/model invocation, shutdown, context-transfer integration and
  scheduled execution still need an authorised smoke test after the baseline
  is ready. Local fixture tests do not establish those runtime capabilities.
- All blocking findings must be resolved or explicitly escalated before the
  user reviews the batch. Ready for Review is not Done.
- Preserve the application's factual uncertainty and rule-review limitations.
  A different reviewer model does not prove football expertise, learning impact
  or complete security.
