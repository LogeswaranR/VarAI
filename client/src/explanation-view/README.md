# VAR-106 explanation reader

`ExplanationReader` uses the unchanged `ExplanationReaderInput` and injected
`ExplanationClient`. No provider, fetch implementation or fixture is imported
by the component. The application adapter validates full scenario/citation
context; the reader additionally rejects incomplete shapes and mismatched
request/scenario/version/audience/mode metadata.

Generation requires review-ready and an explicit action. Source/audience changes
never generate. Context-keyed sessions clear result and recap on scenario,
content version, replay run, audience, mode or readiness changes. Each attempt
has a fresh ID and abort signal; stale successes and failures are ignored even
when a collaborator ignores cancellation. Use a stable client identity.

Loading, typed errors, limited/complete results and provenance are distinct.
Only retryable errors offer explicit retry; no live-to-authored fallback occurs.
Claims and recap render as text. Source buttons emit the supplied validated IDs.
Only the returned supplied consequence is displayed; S3 explicitly leaves the
outcome and after-score unavailable.

Run `npm run test:package:106`. `tests/acceptance/application-reader.test.tsx`
also runs the reusable VAR-108 freshness checks with this real reader and
explicit fixture clients. Browser fault injection and genuine unconfigured
live failure remain distinct. See the [local guide](../../../docs/local-delivery.md).
