# Completion checks and remaining approvals

Updated: 2026-10-23. This supplements the
[local delivery record](./local-delivery.md); it does not replace raw test results
or turn unexecuted checks into passes.

**Human acceptance recorded:** on 2026-10-23 the user selected
`accept-local-prototype`, accepting the implemented local prototype and the
coverage disposition and limitations below. This is local prototype acceptance,
not production certification, completed expert/user research or permission for
further paid calls, commits, merging, pushing or deployment.

## Acceptance-coverage disposition

The original application-adapter report remains **8 PASS / 7 BLOCKED /
12 SKIPPED**. Its generic fault cases required a fault-injection adapter, which
the published application intentionally does not expose. These are missing
coverage at that adapter boundary, not seven observed production failures.

The following supplemental checks use the real ASP.NET Core host, `/graphql`,
registered explanation service and validators. Test-only service registrations
provide deterministic missing repositories, provider faults or renamed records.
No fault switches, arbitrary data mutation endpoints or mock provider have been
added to production.

| Raw case | Supplemental evidence | Scope and disposition |
| --- | --- | --- |
| `failure/INVALID_REQUEST` | Unsupported schema version through the real Explain operation | Typed error, original correlation, retry policy and no successful payload verified |
| `failure/SCENARIO_NOT_FOUND` | Test-only repository returns no selected scenario | Real service/resolver/HTTP error handling verified; no false claim of an observed Azure failure |
| `failure/CONTENT_VERSION_MISMATCH` | Obsolete content version against the actual repository | Typed mismatch and no substitution verified |
| `failure/MODEL_NOT_CONFIGURED` | Real provider with live access disabled | No model request; non-retryable error and no authored fallback verified |
| `failure/MODEL_UNAVAILABLE` | Test-only provider throws the defined unavailable failure | Real error pipeline verified, not a real service outage |
| `failure/TIMEOUT` | Injected clock reaches the existing 15-second deadline and cancels the provider | Exact deadline/cancellation and HTTP response verified deterministically, not a wall-clock Azure measurement |
| `failure/INVALID_OUTPUT` | Injected provider returns malformed output | Real parser/service/HTTP rejection verified; no repaired successful response |
| `team-labels/S1`, `S2`, `S3` | Original and renamed copies of actual authored records, both audiences and source modes | Six HTTP cases compare results and model input. Live-mode content is a labelled simulated provider, not proof of model-level invariance |
| Live matrix and live audience/label comparisons | Deterministic checks plus the separately approved successful S1/Casual smoke below | One real scenario/audience was exercised; all twelve historical live-matrix paths remain unexecuted |

Supplemental cases are in
[GraphQlHttpTests.cs](../tests/VarAI.Server.Tests/Integration/GraphQlHttpTests.cs).
All seven fault cases validate the exact error code, message, correlation,
retry flag, absence of success fields and expected provider-call count.
Label tests preserve the original repository and compare both the responses
and the supplied provider input.

Do not relabel the old adapter report as all-green. These additional checks
account for deterministic HTTP failure/label behavior at a different test
boundary. Actual Azure failure behavior and stochastic model consistency remain
unverified and are not necessary to manufacture by inducing paid outages.

## Defects found while closing coverage

The first new HTTP run passed 25 of 27 tests and failed the S2/S3 simulated-live
label cases. This exposed two false rejections in the existing conservative
prose validator:

- It matched `support offside` inside `does not support offside`.
- It interpreted a supplied `starting score` as an after-review score.

The correction preserves explicit negation for that narrow phrase and recognises
starting/initial scores as before-score references. Added regressions still
reject incorrect starting scores, invented final scores and a later affirmative
offside claim after a negated one. The validator remains a conservative lexical
screen, not a general semantic classifier or proof that generated prose is true.

Changed production file:
[ExplanationOutputValidator.cs](../server/Explanations/ExplanationOutputValidator.cs).
Related regressions:
[ExplanationOutputTests.cs](../tests/VarAI.Server.Tests/Explanations/ExplanationOutputTests.cs).
Shared contracts, output word limits, request shape and model-call limits were
not changed.

## Checks actually run

From this integration worktree, using the pinned .NET SDK and existing
worktree-local CLI/NuGet/TMP directories documented in the delivery record:

| Command | Result |
| --- | --- |
| `dotnet test tests/VarAI.Server.Tests/VarAI.Server.Tests.csproj --no-restore --filter FullyQualifiedName~GraphQlHttpTests ...` before the fix | 25 passed / 2 failed; preserved in `artifacts/local/test-results/acceptance-gaps-http.trx` |
| `dotnet test tests/VarAI.Server.Tests/VarAI.Server.Tests.csproj --no-restore --filter 'FullyQualifiedName~GraphQlHttpTests\|FullyQualifiedName~VarAI.Server.Tests.Explanations' --disable-build-servers -p:UseSharedCompilation=false -nodeReuse:false --logger 'console;verbosity=minimal' --logger 'trx;LogFileName=acceptance-gaps-and-explanations.trx' --results-directory artifacts/local/test-results` | **357 passed / 0 failed / 0 skipped**, including all seven new HTTP fault cases and six label cases |
| `dotnet format VarAI.slnx --verify-no-changes --no-restore --include tests/VarAI.Server.Tests/Integration/GraphQlHttpTests.cs tests/VarAI.Server.Tests/Explanations/ExplanationOutputTests.cs server/Explanations/ExplanationOutputValidator.cs --verbosity minimal` | Passed |
| `dotnet publish server/VarAI.Server.csproj --no-restore --configuration Release --disable-build-servers -p:UseSharedCompilation=false -nodeReuse:false --output artifacts/completion/publish --verbosity minimal` | Passed; separate output, existing preview not replaced |
| `dotnet build-server shutdown` with isolated CLI/TMP state | Passed |

The shell uses a literal `|` inside the quoted test filter; Markdown escapes it
in the table only. Results and command logs are in `artifacts/local/`.
The two earlier failures are retained as evidence, not overwritten by the passing
report. No full UI rerun or new model review was needed for this backend-only
change; the earlier combined QA applies to the earlier candidate, while these
new changes have coordinator inspection and targeted executable evidence.

## Read-only Azure verification

The user authorised **read-only checks only** and selected local credential
configuration. The supplied Foundry URL identifies an agent-building screen;
the app uses its resource's model deployment directly, not that agent's prompt
or agent runtime.

Observed using the existing authorised Azure CLI login:

| Item | Observed value |
| --- | --- |
| Resource / group | Existing authorised resource; environment-specific identifiers retained only in local evidence |
| Resource kind and location | `AIServices`, `eastus` |
| Provisioning state | `Succeeded` |
| Azure OpenAI endpoint advertised by the resource | Public Azure OpenAI resource endpoint; environment-specific hostname omitted |
| Model deployment | `gpt-6-luna` |
| Model version / deployment SKU | `2026-09-22` / `GlobalStandard` |
| Deployment state | `Succeeded` |
| Resource model capability metadata | `chatCompletion: true` |
| Credential access during the read-only phase | **Not performed** |
| Inference during the read-only phase | **Not performed**; one separately approved smoke followed below |

Read operations used `az account show`, `az cognitiveservices account show`,
`account deployment list`, `account list-models` and `account deployment show`.
No resource, deployment, policy, subscription setting or key was modified.
The login tenant matched the supplied Foundry URL.

These observations establish the existing deployment and advertised capability,
not data-plane authentication, quota at call time, output validity, latency or
compatibility of every request parameter.

## Separately authorised live smoke

After initially selecting `not-yet`, the user corrected the local credential
and explicitly authorised the test on 2026-10-23. One real S1/Casual request
was sent through the published app's `/graphql` operation to the selected
`gpt-6-luna` deployment. No direct bypass of the application validator or
authored-response substitution was used.

| Observation | Result |
| --- | --- |
| Application Explain POSTs / retries | **1 / 0** |
| Request identity | `live-smoke-c39de970eab64f0a90bedf3374e055e2` |
| Scenario / audience / version | `S1` / `CASUAL` / `synthetic-1.0.0` |
| Returned union / provenance | `ExplanationSuccess` / `LIVE_AI` |
| Status / interpretation | `COMPLETE` / `OFFSIDE_SUPPORTED` |
| Measured application attempt | **8.171 seconds**; existing 15-second deadline unchanged |
| Requested maximum completion tokens | **2,048**; not a monetary spending cap |
| Explanation / recap words | **48 / 23**, below the 90/40 bounds |
| Claim references | All five claims reference existing facts/context/rules |
| Limitations | Required synthetic/provisional disclaimers preserved |
| Temporary live process | Exited; PID absence independently checked |
| Normal preview | Live generation remains disabled |
| Actual token usage / monetary charge | Not exposed by the app / not verified |

The live explanation distinguished the original goal award from the supplied
goal-disallowed review and preserved the supplied 0-0 after-score. The
coordinator compared its structured identity, interpretation, reference IDs,
word limits and required limitations with the actual scenario. This is not
qualified rules review or proof of correctness across all generated wording.

Secret-free evidence is stored in the canonical checkout at
`.git/varai-workflow/evidence/live-smoke-2026-10-23-attempt1.json`.
The tested `artifacts/completion/publish/VarAI.Server.dll` SHA-256 is
`4f942f0911cbfe28cb3c11a40530f8effadb4ec610f0e7c4c4b8f7bb23b1ad36`.
No key appears in the evidence, command arguments, source or output; it was
loaded from the user's owner-only local file into the short-lived child process.
The file remains local and was not deleted or uploaded.

This satisfies the bounded live-smoke requirement for this request only.
The six live scenario/audience combinations and six live invariance comparisons
in the historical data runner remain unexecuted. Do not turn one smoke into
full-matrix, availability, spending-cap or latency guarantees.

## Acceptance and continuing boundaries

1. **Further live usage:** the one-call permission is consumed. Another paid
   test, enabling live mode in the normal preview or provisioning needs separate
   approval. No further request has been sent.
2. **Final acceptance:** the user accepted the local prototype, coverage
   disposition and smoke outcome on 2026-10-23. The canonical board can now
   record the completed scope as Done. The approval record is
   `.git/varai-workflow/evidence/human-acceptance-2026-10-23.json` in the
   canonical checkout. It does not authorise a commit, merge, push or deployment.
3. **Known limits:** the separate expert-review-record forwarding issue remains
   open for future expert-reviewed pairs. Current content is SourceChecked.
   Human expertise review and the five-viewer learning study are not performed.
   The prototype must not be presented as an official referee or a validated business.

The statements above describe the acceptance checkpoint. The user subsequently
authorised committing and pushing the changes on 2026-10-23. The accepted
application source is now consolidated into the normal checkout on
`prototype/accepted-local-delivery`; the original candidates and running preview
are preserved. The root README and local run guide describe the normal checkout.
Keys, local evidence records, dependency caches and generated reports/builds
are excluded from publication. This adds no model-call, deployment, merge-to-main
or scheduler permission.
