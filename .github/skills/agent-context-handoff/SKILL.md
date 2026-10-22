---
name: agent-context-handoff
description: "Use when a VarAI worker reports context pressure, repeatedly loses requirements or makes no progress, or when a coordinator prepares a compact checkpoint and a fresh worker context for the remaining work. Preserve ownership, approved models, evidence, retry limits and human gates."
---

# Guarded agent context handoff

Policy approved: 2026-10-21. The local claim helper supports guarded checkpoint
transfer; context detection, actual worker shutdown and model launch remain
coordinator/runtime responsibilities, not an automatic quality detector.

The [local board](../../../docs/backlog/board.md), assigned acceptance criteria,
[shared contract](../../../docs/backlog/contract-v0.2.md) and current repository
state are authoritative. A checkpoint is a dated summary, not permission to
override any of them.

## Keep context small before recovery is needed

- Start each new independent assignment in a fresh, bounded context. For the
  proposed card-driven workflow, this means one card and role per worker.
  Do not reuse a worker as a pool for unrelated cards.
- For the same assignment, reuse healthy context for corrections rather than
  restarting after every failure. Keep the approved dispatch/review boundaries.
- Load the assigned criteria, relevant source and a small selection of guidance,
  not the full conversation, catalog or repository.
- Link long logs and inspect only the needed sections. Maintain concise facts,
  decisions and remaining steps in the normal handoff.
- A fresh worker context need not be a new visible VS Code chat. Use only a
  supported runtime mechanism; creating a chat alone does not prove isolation,
  correct model selection or control over the worker's checkout.

## When to request a checkpoint

Use observable signals, not an assumed "dumb zone" or fixed token percentage:

- The runtime reports context pressure, compaction or approaching a limit.
  Record the actual signal if available; otherwise usage is unknown.
- Two consecutive attempts repeat a failed approach or reread the same material
  without new evidence or meaningful progress.
- The worker repeatedly loses an accepted requirement, contradicts a recorded
  decision or cannot reliably state the current worktree and remaining task.
- The user or coordinator requests a smaller-context continuation.

These signals request assessment, not automatic diagnosis. First distinguish
context loss from unclear requirements, a reproducible implementation bug,
missing access, missing dependencies or an external service failure. Resolve
or escalate those causes; a fresh chat is not a substitute.

Normal test failures and runtime compaction alone do not require replacement.
Do not invent context telemetry, claim that quality improves at a particular
threshold or copy this entire conversation to the new worker.

## Checkpoint content

Prepare a concise, secret-free JSON checkpoint in the canonical repository's
private `.git/varai-workflow/checkpoints/` directory so later coordinator runs
can find it. Follow the exact record fields in the
[delivery workflow](../../../docs/backlog/delivery-workflow.md#context-recovery).
Do not create another requirements/status database or commit it automatically.

The helper limits the complete JSON record to 800 whitespace-separated words.
This is a local context-budget limit, not a model threshold: link supporting
evidence instead of omitting a critical constraint.

| Field | Include |
| --- | --- |
| Identity | Card, role, approved model, old worker ID, coordinator/run ID and existing claim identity where present |
| Source of truth | Board, contract/content version and exact acceptance-criterion references |
| Checkout | Absolute worktree path, branch, baseline revision and candidate revision or recorded diff/file fingerprint |
| Current work | Changed tracked and untracked files, completed behavior, unfinished behavior and ownership boundaries |
| Decisions | Approved choices and rejected alternatives with brief reasons; label assumptions |
| Evidence | Exact commands already run, outcomes and log/artifact locations; distinguish passed, failed, skipped and not run |
| Attempts | Failed approaches and what they established; do not repeat them without new evidence |
| Blockers | Unresolved questions, external failures and decisions needed from the user |
| Recovery state | Existing QA correction count, context-replacement count, pending approvals and owned processes still running |
| Next step | One concrete, bounded remaining subtask and the smallest check that would verify it |

Do not include credentials, tokens, private transcript dumps, hidden reasoning
or copied external instructions. Preserve conclusions, evidence and decisions.
If a worker cannot produce a reliable checkpoint, the coordinator reconstructs
only observed facts and marks everything else unknown.

## Safe coordinator-managed replacement

1. **Assess and freeze.** Decide whether a fresh context is justified. Stop
   issuing new edits for the card and save the checkpoint. A worker reports
   its need for a handoff; it must not independently spawn its replacement.
2. **Confirm the old worker is stopped.** End the old assignment and verify
   that neither it nor an owned child process can still write to the checkout.
   Use known runtime/process IDs, not broad name-based termination. If status
   is unknown or shutdown cannot be confirmed, keep the card reserved and
   report it blocked; do not launch a second writer.
3. **Preserve ownership.** The helper's `checkpoint` operation invalidates the
   old claim token and reserves a new token in the same card/lane/role slot.
   Record shutdown evidence and keep the worktree and counters. Do not briefly
   requeue the card, create duplicate ownership or edit claim JSON to bypass
   the guarded transfer.
4. **Create a fresh context for remaining work.** Pass the compact checkpoint
   and source references, not the old transcript. Preserve the approved role,
   model, worktree and permissions. A developer remains a developer; a QA
   replacement remains independent and cannot edit the implementation.
5. **Verify before continuing.** The new worker reads current local guidance,
   the card and its criteria; confirms the worktree/baseline and saved changes;
   then checks the smallest relevant test or previous failure. It must not
   assume a summary's test result applies to a changed candidate.
6. **Resume or stop.** Continue only the bounded unfinished subtask after the
   coordinator confirms the handoff. Report stale evidence, unexpected changes
   or incompatible contract versions instead of overwriting them.

Use a fresh independent reviewer for new review assignments. Do not let a
developer become its own QA reviewer after a context reset. If a QA candidate
changed during the handoff, its previous review cannot be treated as approval
of the new candidate.

## Recovery budget and approvals

- Allow at most **one context replacement per card per role** before escalating
  to the user. This count spans scans, sessions, correction rounds and batches;
  it is not reset by creating a new chat.
- Preserve existing QA failure/correction counters. The one-replacement limit
  is separate from the existing two-correction-round limit.
- Preserve the two development/two QA capacity limits in the proposed
  lane-driven workflow. Replacement is a transfer, not an additional slot.
- A second replacement, model substitution, new scope or changed permissions
  needs a user decision. Do not loop through new agents until one approves.
- A checkpoint, compaction or restart never marks a card Done, approves G00,
  waives a failed criterion, signs off a batch or authorises a commit, deployment,
  cloud spend, Azure DevOps access or credential use.

## Runtime implementation boundary

The [dispatch helper](../../../scripts/board_dispatch.py) validates local claim
transfer, frozen checkpoints, capacity and persistent counters. Its
[fixture tests](../../../scripts/tests/test_board_dispatch.py) do not invoke real
agents. It does not detect context pressure, stop a worker or verify the truth
of supplied runtime evidence. The paused schedule must not be resumed by this skill.

Actual native worker launch/shutdown and cross-context continuation remain
unverified until an authorised runtime smoke test. If the host cannot safely
stop/reassign a claimed worker or honour its model/checkout, report the limitation
and wait; never advertise an unknown worker state as safe.

Runtime validation must demonstrate:

- The old worker is quiescent before any replacement can edit.
- A scan cannot create duplicate ownership during a handoff.
- Recovery and QA correction counts survive scheduler/session restarts.
- Wrong models, stale candidates and unknown worker outcomes fail closed.
- Missing context telemetry does not become a fabricated threshold.
- The replacement resumes the intended worktree from the checkpoint without
  importing the full previous transcript or silently changing permissions.

Use [verify-changes](../verify-changes/SKILL.md) for implementation checks.
File presence, metadata validation and a successful chat-creation call are not
evidence that this lifecycle works end to end.
