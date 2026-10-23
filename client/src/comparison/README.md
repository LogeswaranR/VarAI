# VAR-107 curated comparison

`Comparison` consumes the unchanged `ComparisonInput`. It accepts only the
validated S1/S2 family with matching version, match context and rule records.
The sole independent fact is receiver versus second-last opponent; supplied
outcomes, after-scores, wording and layout are labelled derived differences.

The hypothetical selector emits the other scenario ID without editing either
record. The actual host uses its normal selection/reset path. Re-rendering with
S2 offers restoration to S1. S3, not-ready input and invalid pairs have no enabled
selector and explain why comparison is unavailable.

Run `npm run test:package:107`; keyboard callbacks and actual replay-reset
integration are covered separately at 375px/1280px in the browser suite.
See the [local guide](../../../docs/local-delivery.md).
