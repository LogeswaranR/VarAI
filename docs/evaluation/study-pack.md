# Five-viewer exploratory learning study

**DRAFT materials. Study NOT RUN. Source-interpretation review NOT RUN.
Qualified review NOT RUN. No participant feedback or market validation exists.**
Do not run against G00 probes as if they were the integrated experience.
G01 must provide a usable authored-mode application, reviewed content and
consent before execution. No live-model request is needed for this study.

## Hypothesis and limits

Predeclare the exploratory target: **at least four of five viewers** correctly
explain the decisive distinction on unseen transfer item C1 after the sessions.
Record written-versus-interactive performance, misconceptions and preferences
even if the interactive presentation does worse. Five convenience-sampled
viewers cannot statistically establish demand, broad learning effectiveness,
product-market fit or official rules accuracy. Repeated exposure and carryover
are limitations, not effects to hide. Do not turn the target into an observed result.

Recruit five viewers with varied self-described football familiarity, including
casual and rules-aware participants. Record only pseudonyms P01–P05; no names,
contact details, recordings or team allegiances are necessary. Explain voluntary
participation and allow withdrawal. Avoid revealing the answer key. Record
assistance and interruptions; do not replace unsuccessful participants.

## Short written baseline (read verbatim; original draft)

> These invented reviews are not real matches or official decisions. In this
> limited family, other complete observations stay fixed: open play, receiver
> in the opponents' half and ahead of the ball at the pass, later receiver
> touch, and no intervening opponent touch. A supplied nearer-than-second-last
> observation supports offside here; changing only that observation to level
> supports no offside. Later touch is separate evidence from pass-time position.
> Team names and explanation detail do not change these facts. An original
> goal award differs from a supplied review outcome and its explanation. If
> the pass-time picture is missing, keep decisive positions, review outcome
> and after-score unknown. Inspect draft sources and limitations; an
> illustration is not a measurement.

This is a baseline for the **approved synthetic model**, not copied law text
or independently reviewed rules guidance. The full rule contains cases excluded
from this prototype; see [contract scope](../backlog/contract-v0.2.md#3-synthetic-scenario-family).

## Protocol and counterbalancing

Allow roughly 15–20 minutes per viewer; record actual timings, not estimates
as observations. Use the same device/viewport and same time allowance in both
arms. Record the build/content version, viewport, accessibility accommodations,
facilitator and deviations. A keyboard user may use the keyboard throughout.

1. Obtain consent and record familiarity (self-described; optional).
2. Give neutral instructions and a brief control-only orientation without
   revealing test answers. “We are testing the explanation, not you.”
3. First arm: read the baseline **or** explore the integrated authored
   presentation; then answer the assigned three-item form without help.
4. Second arm: use the other presentation, then answer the other new form.
   No correctness feedback between arms; keep answer keys concealed.
5. Give unseen transfer C1 and C2 without either presentation. Ask the viewer
   to explain reasoning aloud or in writing. Record exact errors, not invented
   quotes. Ask preference and reason **after** comprehension scoring.
6. Debrief with reviewed answers only; store pseudonymous measurements locally
   and agree deletion timing before recruitment.

| Planned viewer | Presentation order | First / second form | Execution |
| --- | --- | --- | --- |
| P01 | Text → interactive | A / B | NOT_RUN |
| P02 | Interactive → text | B / A | NOT_RUN |
| P03 | Text → interactive | B / A | NOT_RUN |
| P04 | Interactive → text | A / B | NOT_RUN |
| P05 | Text → interactive | A / B | NOT_RUN |

This is **approximate counterbalancing**, not perfect balance: odd n gives a
3/2 order split. Assignment is prespecified rather than adjusted after outcomes.
Forms are proposed matched examples, **not validated equivalent instruments**.
Counterbalancing reduces neither all practice effects nor facilitator bias.

## New comprehension examples (original draft; all answers proposed)

For A/B only, shared supplied context: synthetic open play, receiver in the
opponents' half, receiver later touches the pass, no intervening opponent touch,
and original goal awarded. A pass-time view, when present, places the receiver
ahead of the ball. No other exception or incident family is being tested.

For each item ask: **(1)** What interpretation is supported in this controlled
model, and which observation matters? **(2)** What was originally decided,
what review outcome is supplied, and what score can honestly be reported?

| Item | New supplied record | Proposed answer / rationale |
| --- | --- | --- |
| A1 | Juniper v Quarry, minute 31, score 2-2. Pass-time view present; receiver nearer the goal line than second-last opponent. Supplied review disallows goal. | OFFSIDE_SUPPORTED: position plus separate touch support the modeled interpretation. Original goal award is not the review outcome; score stays 2-2. |
| A2 | Same Juniper/Quarry context, changing only that receiver position to LEVEL. Supplied review confirms goal. | NO_OFFSIDE_SUPPORTED: LEVEL is the independent changed fact. Confirmation is supplied; score becomes 3-2. Text, derived outcome and after-score are not additional independent evidence edits. |
| A3 | Moss v Vale, minute 54, score 1-1. Pass-time picture absent; ahead-of-ball and opponent-relative positions unknown. No review outcome supplied. | INSUFFICIENT_EVIDENCE/LIMITED. The later touch does not fill in the missing positions. Keep outcome and after-score unknown; do not infer confirmation or disallowance from the original award. |
| B1 | Lantern v Ridge, minute 72, score 0-1. Pass-time view present; receiver LEVEL. Supplied review confirms goal. | NO_OFFSIDE_SUPPORTED; the home score becomes 1-1 from the supplied confirmation, not an AI decision. |
| B2 | Same Lantern/Ridge context, changing only that receiver position to NEARER. Supplied review disallows goal. | OFFSIDE_SUPPORTED; separate touch remains supplied. Score stays 0-1. Only the independent opponent-relative fact changes. |
| B3 | Rowan v Creek, minute 18, score 3-0. Pass-time picture absent; the two decisive positions and review outcome unknown. | INSUFFICIENT_EVIDENCE/LIMITED; preserve the known original award and before-score, but do not supply an after-score or definitive review result. |

### Unseen transfer prompts

- **C1:** In an invented Alder/Flint review, both variants share a clear pass-time
  view, opponents' half, ahead-of-ball observation, later receiver touch, open
  play and no intervening touch. One says NEARER to the goal line than the
  second-last opponent; the other says LEVEL. Team names are then exchanged,
  and one explanation becomes more detailed. What is the decisive changed
  evidence, and which changes must not change the interpretation?
  **Proposed key:** identify opponent-relative position and its modeled
  NEARER/LEVEL distinction; touch is separate supplied involvement. Swapped
  names and extra explanation detail are not evidence changes.
- **C2:** A later image shows a touch but no pass-time position picture exists.
  A confident paragraph cites genuine evidence IDs and announces a confirmed
  goal. Does the citation prove the conclusion?
  **Proposed key:** no. IDs may exist while their values do not support the
  prose. Missing decisive positions require uncertainty and no invented review
  outcome/after-score. The image does not fill the missing pass-time facts.

## Scoring and measurement form

Use [measurements.csv](./measurements.csv). Five rows are **planned slots**, not
participants already recruited. Blank numeric cells mean **unobserved**, never
zero, failure or success. All execution/consent/review states start NOT_RUN.

Session metadata form (blank until execution): date ___; facilitator ___;
application build ___; scenario/content version ___; viewport/device ___;
optional familiarity ___; accommodations ___; deviations/interruptions ___;
agreed local retention/deletion date ___. Do not replace blanks with estimates.

- Each A/B item: 0–2 (one point for correct supported interpretation plus
  decisive/missing evidence; one for distinguishing original/review decisions
  and honest score). Arm totals 0–6. Record item-level notes and help.
- C1: 0–2 (one point for decisive position and its distinction; one for both
  team-label and audience invariance). **Primary success** requires 2/2 without
  facilitator help; report the actual numerator/5, not a percentage implying
  precision. C2: 0–2 for evidence-versus-citation and honest uncertainty.
- Record per-arm time, comprehension errors, preference (`text`, `interactive`,
  `neither`, `no_preference`) and explanation, dropouts/missing data and any help.
  Secondary results must not silently redefine the primary threshold.
- Have a second reviewer inspect ambiguous scoring where practical; record
  disagreements, do not fabricate inter-rater reliability.

**Results today:** recruited NOT RUN; observations NOT RUN; arm scores NOT RUN;
transfer success NOT RUN; preferences NOT RUN. Separately obtain the
[qualified rules/content review](./qualified-review.md); viewer preference
cannot substitute for it.
