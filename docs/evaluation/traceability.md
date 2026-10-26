# Requirement and criterion evidence map

Authoritative requirements remain in
[BR-01–BR-10 and VAR-108](../backlog/README.md#business-requirements) and
[VAR-108-T01/T02](../backlog/technical-tasks.md#var-108-t01-build-the-requirement-mapped-acceptance-harness).
This matrix maps checks, **not replacement requirements or Done decisions**.
`matrix/*` expands to S1/S2/S3 × CASUAL/ANALYST × AUTHORED/LIVE_AI (12).
All fixture LIVE_AI output is explicitly simulated.

Evidence locations below are worktree-relative:

- **DATA:** `tests/acceptance/artifacts/contract-stub.json`, strict 27-case report.
- **UNIT:** `tests/acceptance/artifacts/unit-report.json`, actual Vitest assertions,
  including invalid output/report and process-exit self-tests.
- **BROWSER:** `tests/acceptance/artifacts/browser-report.json`, 375px/1280px
  fixture results **separate from** skipped application cases; validated by
  `tests/acceptance/verify-browser.mjs`.
- **APP:** `tests/acceptance/artifacts/real-application.json`; no G01 adapter,
  so required data checks are BLOCKED, not accepted.
- **HUMAN:** the draft records in this directory; all actual semantic, source,
  qualified-rule and viewer-study results remain NOT RUN.

Generated evidence is ignored and reproducible; persistent executed-command
observations and corrected failures are in [verification.md](./verification.md).

## Business requirements

| ID | Check / expected outcome | Evidence location and scope |
| --- | --- | --- |
| BR-01 | `matrix/*` validates synthetic provenance and draft source metadata; browser `fixture: visible provenance…` shows an explicit test-stub badge. Human review checks wording does not imply real/official approval. | DATA observations; BROWSER fixture titles; HUMAN semantic/qualified review NOT RUN; APP BLOCKED |
| BR-02 | `matrix/*` preserves original award separately from supplied review outcome; score recap references resolve. Human reviewer checks the prose does not conflate them. | DATA originalDecision/suppliedReviewOutcome/scoreAfter; UNIT invalid-output cases; HUMAN recap review NOT RUN |
| BR-03 | All 12 matrix cases, `evidence/missing`, `comparison/one-fact`; S3 nulls stay null, S1/S2 change exactly the permitted independent fact. | DATA corresponding IDs; UNIT invented-S3-outcome failure; BROWSER missing snapshot/context |
| BR-04 | Scenario validator checks facts, explicit unknowns and versioned IFAB references; staged browser context gates unrevealed outcomes. Actual source navigation/focus requires a real candidate. | DATA sourceReviewStatuses; BROWSER fixture context and skipped `application: keyboard source navigation…`; HUMAN source review NOT RUN |
| BR-05 | `matrix/*` validates reference existence and structured interpretation; UNIT deliberately corrupts evidence/rule IDs and demonstrates unsupported prose can still be structurally valid. Claim entailment is a separate human judgment. | DATA claimCount; UNIT bad citations/contradiction/prose tests; semantic-rubric.md, HUMAN NOT RUN |
| BR-06 | `audience/S1..S3`, `team-labels/S1..S3` compare four structured outputs each; preserve interpretation, facts and limitations across depth/labels. No claim of provider reasoning or prose invariance. | DATA invariance IDs; UNIT wrong audience/broken label adapter; HUMAN golden/rubric review NOT RUN |
| BR-07 | `comparison/one-fact` plus reversible S1→S2→S1 fixture callback and unavailable S3; actual comparison uses the shared reset path only when a real candidate is supplied. | DATA pair/differences; BROWSER fixture callback and skipped application comparison; APP BLOCKED |
| BR-08 | Seven `failure/*` cases validate typed errors/retry policy and no successful fallback. Missing access is BLOCKED/SKIPPED, malformed results FAIL and exit 1; missing evidence remains LIMITED. | DATA failure/evidence IDs; UNIT CLI/report corruption tests; BROWSER seven fixture errors; APP BLOCKED with reasons |
| BR-09 | Fixture context resets and late-response filtering; exact 375px/1280px, keyboard focus, status role, no overflow, supplied score. Actual replay/recap/source focus and context round-trip checks remain unexecuted. | UNIT six reader-context cases; BROWSER fixture checks and 36 skipped application executions; DATA scoreAfter; HUMAN semantic recap review NOT RUN |
| BR-10 | Strict case counts/status/reasons and negative reporter self-tests; five-viewer written baseline, counterbalanced forms, unobserved measurement rows and separate qualified review. | DATA/UNIT/BROWSER; study-pack.md, measurements.csv and qualified-review.md; no performed-study or value claim |

## All five parent and four technical criteria

| Criterion | Implementation / observable check | Execution boundary |
| --- | --- | --- |
| VAR-108-AC1 | 12 matrix cases, seven faults, missing evidence, replay-run/context invalidation, target browser widths; reusable application checks include reset/recap, deferred response and audience/mode round-trips. | Executed fixture scopes; actual application paths BLOCKED/SKIPPED |
| VAR-108-AC2 | Explicit adapter kind/target; no implicit real-to-stub fallback; missing adapter/live access produces reasons and incomplete exit status. | Positive/negative executable reports tested; no provider request |
| VAR-108-AC3 | Unknown evidence/rule IDs, contradictory structured interpretations, team-label and audience checks; structurally valid unsupported prose is explicitly referred to human review. | Automated fixture checks executed; semantic human review NOT RUN |
| VAR-108-AC4 | Original written baseline, matched-form drafts A1–B3, unseen C1/C2, proposed keys, five planned orders, measurements and independent qualified checklist. | Pack supplied; content/expert/user reviews NOT RUN |
| VAR-108-AC5 | Ten-row BR matrix maps check, expectation and evidence; reports preserve missing/unexecuted results and scope. | Actual commands recorded separately from plans |
| VAR-108-T01-AC1 | `model.ts` defines data IDs; fixture and application browser suites plus reader checks cover matrix, faults, reference/interpretation failures, reset/stale and both widths. | 12 matrix and 7 fault records checked by runtime schema; candidate browser cases unexecuted |
| VAR-108-T01-AC2 | Stub and real-app report files/labels are distinct; CLI exit 2 for unavailable app, explicit skip reasons for browser; no credential probe or synthetic success substituted. | Executed stub/self-test evidence only |
| VAR-108-T02-AC1 | Golden S1/S2/S3, missing evidence, audience/team invariance; two-layer structural-versus-semantic rubric and proposed unsupported/ambiguous examples. | Structural checks executed; actual claim-review status NOT_RUN |
| VAR-108-T02-AC2 | Prespecified approximate counterbalancing (3/2 for odd n), new examples/keys, primary transfer target and honest small-study limitations; separate qualified review. | Five blank planned measurement slots; all actual study/review outcomes NOT_RUN |

G01 must integrate actual `/graphql` and UI adapters, execute authored journeys,
obtain authorized live-smoke evidence and record human acceptance. This package
does not authenticate an adapter's claimed provenance, prove prose universally
correct, run a real 15-second provider timeout, establish full accessibility,
or validate user value.
