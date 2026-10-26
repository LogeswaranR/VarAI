# Semantic expectations and human review

**DRAFT — source-interpretation review NOT RUN; qualified review NOT RUN;
human semantic review NOT RUN.** These expectations derive from the approved
[v0.2 synthetic contract](../backlog/contract-v0.2.md), not an independent
adjudication of football. They do not revise the product requirements.
Baseline content version: `stub-0.2.0`; scenario rules remain `DRAFT`,
edition `2026/27`, `checkedOn: null`. New illustrative prose below is original.

## Golden structured expectations

Apply each row to CASUAL/ANALYST × AUTHORED/LIVE_AI; fixture live is simulated.

| Scenario | Decisive supplied evidence | Structured interpretation / status | Supplied consequence, distinct from explanation |
| --- | --- | --- | --- |
| S1 | Pass-time view, nearer than second-last opponent, ahead of ball, opponents' half, separate receiver touch | `OFFSIDE_SUPPORTED` / `COMPLETE` | Original goal award; supplied disallowance; 0-0 stays 0-0 |
| S2 | Same independent facts as S1 except `RECEIVER_VS_SECOND_LAST: LEVEL` | `NO_OFFSIDE_SUPPORTED` / `COMPLETE` | Original goal award; supplied confirmation; 0-0 becomes 1-0 |
| S3 | Pass-time view absent; ball-relative and opponent-relative positions explicitly unknown; touch alone remains supplied | `INSUFFICIENT_EVIDENCE` / `LIMITED` | Original goal award remains distinct; review outcome and after-score are null, not a guessed confirmation/disallowance |

- Team-label swap: same facts, scores, sources and interpretation. Correctly
  adjust any team-specific prose; fixture structural invariance does not prove
  the prose adjusts or that a provider reasons without team bias.
- Audience change: depth/wording may differ; interpretation, evidence status,
  provenance and supplied consequences must not. Casual ≤90 and analyst ≤220
  headline-plus-point words; recap ≤40, using the contract's word counter.
- Reset/context change: stale explanation/recap must not be restored by a late
  response. Same-scenario resets still create a new replay run.
- Every substantive claim needs applicable support; valid ID strings alone
  are not proof that the cited evidence supports the sentence.

## Two separate review layers

| Layer | Check | Outcome/evidence |
| --- | --- | --- |
| Structural, automated | Selected shape, correlation, nulls, IDs, limits and structured interpretation | Actual harness case / negative-test result; fail malformed output |
| Semantic, human | Whether each sentence follows from the **values and availability** of its supplied facts and applicable source | `SUPPORTED`, `UNSUPPORTED`, or `AMBIGUOUS / REVISE`, with reviewer rationale; untouched rows stay `NOT_RUN` |

Review headline, each point, limitations and recap separately. For each, record
scenario/content version, audience/mode, exact claim ID/text, cited IDs, actual
fact values/statuses, source edition/review status, reviewer/date, judgment,
reason and required correction. Do not grade by eloquence, confidence, team
preference, or matching expected vocabulary. Preserve original and revised text.

### Challenge examples (proposed judgments, not performed reviews)

| Original illustrative output | Structural check | Proposed human judgment |
| --- | --- | --- |
| An unknown evidence or rule ID | FAIL | No resolvable support; correct/reject output |
| S1 output says `NO_OFFSIDE_SUPPORTED` structurally | FAIL | Contradicts supplied structured interpretation |
| “An independent tracking system measured the receiver to millimetre precision,” with existing fact IDs | May PASS | UNSUPPORTED: inputs are synthetic, with no tracking measurement |
| “The missing pass-time picture proves the goal must be disallowed,” citing valid S3 IDs | May PASS if structured fields remain LIMITED | UNSUPPORTED: unknown decisive evidence is not affirmative proof |
| “They were beyond the line, so it was decided” | May PASS | AMBIGUOUS: which supplied observation, which decision, and what is inferred? |
| S1 recap says “The score is now 1-0,” using valid score IDs | May PASS | UNSUPPORTED: reference existence does not make an incorrect score sentence true |
| Swapped-label output attributes a supplied event to the old team | May PASS | UNSUPPORTED/REVISE: naming consistency needs content review |
| Casual prose declares certainty while analyst prose admits missing S3 evidence | May PASS | UNSUPPORTED: audience changes must not change the underlying uncertainty |

`harness.test.ts` deliberately demonstrates structurally valid unsupported
prose and requires semantic review to remain NOT RUN. It is **not** a universal
LLM correctness classifier, a completed semantic review, or a pass for that prose.
No model-generated critique is treated as independent human evidence.

## Blank review record

| Claim / content version / mode / audience | Resolved reference IDs and actual values | Semantic judgment | Reviewer / date / rationale |
| --- | --- | --- | --- |
| NOT RUN | NOT RUN | NOT_RUN | Not assigned; no review performed |

Escalate unsupported or ambiguous decisive claims for revision and re-review;
do not mark a run semantically accepted while any are unresolved. Keep
[qualified rule review](./qualified-review.md) separate from prose review,
and both separate from [viewer learning observations](./study-pack.md).
