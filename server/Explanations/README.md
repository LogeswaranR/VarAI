# VAR-105 explanation module

**Local integration note (2026-10-23):** startup now registers this real service
and provider behind `/graphql`. Live access is explicitly disabled by default.
The provider's `System.Collections.Generic.KeyNotFoundException` is now fully
qualified to avoid the transport dependency's generated GreenDonut namespace
ambiguity; request-ID semantics are unchanged. Historical module-only evidence
below is preserved. See [current local checks](../../docs/local-delivery.md).

**Shared transport (2026-10-23):** this provider's HTTP transport now lives in `AzureOpenAiChatClient`, which the Match Centre
narrator (`server/Narration/`) shares. Besides the original API-key mode it adds keyless modes selected by
`Explanations:AzureOpenAi:AuthMode` (`ManagedIdentity` or `AzureCli`, a Microsoft Entra bearer token through `Azure.Identity`).
The provider's behaviour, limits and tests are unchanged. See
[AI narration and approval](../../docs/ai-narration-and-approval.md) and
[Azure deployment](../../docs/azure-deployment.md).

Originally a standalone backend implementation for the approved
**GraphQL contract v0.2**, developed at
`a7d9f82983f4fc35c5a4703dfd69ffde79554240`.
The historical package handoff was confined to this directory and
`tests/VarAI.Server.Tests/Explanations/`; current startup/HTTP/UI composition
is included in the consolidated checkout.

## Composition

`ExplanationService` implements the existing `IExplanationService`. Its typed
dependencies are `IScenarioRepository`, `IExplanationProvider`,
`IExplanationOutputValidator`, and .NET's `TimeProvider`. The tests inject
repository fixtures, deterministic providers, a manual clock, and fake
`HttpMessageHandler` implementations. Production code does not reference test
stubs or another feature's implementation.

The original module-only registration example, given an approved repository
instance and **server-owned** `IConfiguration`, was:

```csharp
services.AddSingleton<IScenarioRepository>(approvedRepository);
services.AddSingleton<TimeProvider>(TimeProvider.System);
services.AddSingleton<IExplanationOutputValidator, ExplanationOutputValidator>();
services.AddSingleton<IExplanationProvider>(_ =>
    new AzureOpenAiExplanationProvider(new AzureOpenAiConfiguration(
        serverConfiguration["Explanations:AzureOpenAi:Endpoint"],
        serverConfiguration["Explanations:AzureOpenAi:DeploymentName"],
        serverConfiguration["Explanations:AzureOpenAi:ApiKey"])));
services.AddSingleton<IExplanationService, ExplanationService>();
```

Current startup additionally gates provider configuration on
`Explanations:LiveEnabled`, which defaults to false; see `server/Program.cs`.
The composition root supplies the repository and disposes its provider/container. The provider
owns its `HttpClient` and any injected handler. No configuration file, environment
variable, machine credential, Azure resource or deployment was created or read
during the original module-only implementation.
Never bind provider settings from an explanation request, model output, or browser.

`AzureOpenAiConfiguration` accepts:

- `Endpoint`: a public Azure OpenAI resource **root**, for example
  `https://YOUR-RESOURCE-NAME.openai.azure.com/`; not a full API path.
  HTTPS, the default port, a single resource-name host label, and no user info,
  query, fragment or additional path are required. Gateway, sovereign-cloud and
  other endpoint families are intentionally unsupported by this bounded adapter.
- `DeploymentName`: the server-approved deployed model name, not the coding
  worker's model identifier. It is sent as the request's `model`.
- `ApiKey`: server-only configuration. It is not a public serializable property;
  configuration `ToString()` redacts credentials. Tests use an explicitly
  fictitious key, never machine credentials.
- Optional `maximumCompletionTokens`: defaults to 2,048; accepts 1–8,192.
  This bounds the requested completion tokens, **not monetary spending**.

Missing or invalid settings yield `MODEL_NOT_CONFIGURED` before transport use.
Format validation does not establish that a resource, deployment, key, quota or
permission exists. Authored mode works without configured live access and never
calls the provider.

## Request, repository and deadline behavior

- `ContractRules.Request` validates the actual v0.2 fields/enums. Null requests
  fail explicitly. Request IDs follow shared `ContractRules.Text`: any
  nonempty, non-whitespace string is accepted without additional length or
  character restrictions. Valid IDs are echoed exactly on success and every
  domain error, including leading/trailing whitespace; they are never trimmed
  or coerced. Only missing/null, empty or whitespace-only IDs yield `INVALID_REQUEST`
  with a fresh `attempt-<32 hex digits>` correlation ID.
  The caller remains responsible for a fresh ID on each explicit retry.
- Only `FindAsync(request.ScenarioId, token)` is called. Null means
  `SCENARIO_NOT_FOUND`; no list/search/fallback scenario is selected.
- A private repository snapshot passes `ContractJson` and
  `ContractRules.Scenario`. Null/malformed data, a different returned scenario,
  or repository failure yields safe `INVALID_OUTPUT`. A valid scenario with
  a different exact content version yields `CONTENT_VERSION_MISMATCH`.
- Authored mode preserves the selected approved body's content and `AUTHORED`
  provenance, adding only the current request identity. Returned collections
  are defensive read-only copies.
- Live input is exactly the existing `GenerationInput`: supplied facts/rules,
  audience, independent original decision and supplied review outcome, scores,
  interpretation and version identity. No diagram, markers, authored answers,
  team labels, arbitrary user prompt, API key or request ID is added.
- One monotonic 15-second deadline covers repository resolution, generation,
  response-body reading and validation. A linked cancellation token reaches
  every asynchronous dependency; a final elapsed-time check rejects late
  success even when a dependency returns synchronously.
- Caller cancellation propagates as cancellation, not a fabricated contract
  error. A provider's unrelated cancellation/failure before the service deadline
  is `MODEL_UNAVAILABLE`, not a claimed 15-second timeout.
- There are no application retries, prompt repair, truncation, authored
  fallback or post-timeout validation/publication. A non-cooperative injected
  dependency cannot be forcibly terminated by .NET cancellation; the service
  stops awaiting it, observes eventual faults, and does not continue its attempt
  or expose mutable output to that task. Trusted collaborators must honor
  cancellation and must not block synchronously.

All errors use `ContractErrors.Create`, its existing seven codes, safe messages
and retryability. No exception message, raw provider response or key is logged
or returned on failure. Expert-reviewed repository records are rejected without
external trusted review evidence; this module does not invent such evidence or
change the known G00-REVIEW-001 `Pair` review-record limitation.

## Approved Azure OpenAI v1 adapter

The user approved dependency-free .NET `HttpClient`, Chat Completions v1 and a
server-configured API key. The adapter sends one:

```text
POST https://<configured-resource>.openai.azure.com/openai/v1/chat/completions
Content-Type: application/json
api-key: <server-only value>
```

The JSON body contains `model`, two `messages` (fixed system policy, then only
serialized `GenerationInput`), `n: 1`, `stream: false`, `store: false`, and
`max_completion_tokens`. It sends no dated `api-version`, tools, caller-supplied
messages, temperature or assumed structured-output capability.

`response_format` is deliberately omitted: no deployed model's JSON-mode or
JSON-schema capability has been verified. The prompt requests strict JSON, but
the prompt is **not** a guarantee; local parsing/validation is authoritative.
An unsupported deployment/parameter HTTP response yields `MODEL_UNAVAILABLE`;
unusable returned content yields `INVALID_OUTPUT`. G01 must separately validate
the configured deployment's chat roles and completion-token support.

Production handlers disable redirects and cookies, including built-in handlers
under a delegating handler. HTTP 3xx/4xx/5xx responses are rejected without
following `Location` or honoring `Retry-After` automatically. The injectable
handler is a trusted server/test boundary: arbitrary custom handler code must
not introduce its own redirects, retries or credential logging. Production
composition can use the constructor that creates the guarded handler.

The adapter requires HTTP 200 JSON, exactly one choice with index 0,
`finish_reason: "stop"`, an assistant message and nonempty string content.
Truncation, refusal, tool/function calls, filtering signals, duplicate properties,
contradictory error envelopes, and malformed content are rejected. Unused
response metadata is permitted, per the v1 evolution guidance. Body reads are
bounded to 128 KiB, including unknown-content-length streams; extracted output
is bounded to 32,768 characters. Cancellation also covers body reads.

## Generated-output contract and semantic limits

`GeneratedExplanation` is a **package-local provider format**, not a GraphQL
schema change. It has the success fields except `requestId`. The model must
echo schema/scenario/content version/audience, return `LIVE_AI` provenance,
and supply status, interpretation, headline, points, limitations and recap.
The service alone adds correlation. A model-supplied `requestId` is an unknown
property and is rejected rather than trusted or normalized.

`ExplanationOutputValidator` reuses `ContractJson.Read` and
`ContractRules.Success`/`Body`: duplicate/unknown/omitted fields, coercible enum
spellings, null list entries, malformed/unknown citations, mismatched identity,
wrong provenance, unsupported structured interpretations and word overflow
are errors. S3 remains `LIMITED` / `INSUFFICIENT_EVIDENCE`.

Live output must include these exact limitation strings, without the validator
silently inserting or rewriting them:

- `Synthetic teaching example; not an official referee decision.`
- `Rule interpretation is provisional and requires human review.`
- For S3: `Pass-time position evidence is missing; no review outcome or final score can be inferred.`

All limitation entries must also be nonempty. Narrow deterministic prose checks
reject obvious percentages, unsupported approval, denied limitations, diagram
measurements, contradictory original/review decisions, position assertions,
and explicit score assertions inconsistent with supplied context. These are
conservative English-language screens, **not a complete semantic classifier**.
They can reject some wording and miss other contradictory paraphrases.

Reference existence, required disclaimers, word bounds, and these screens
**cannot prove arbitrary prose true**. A test deliberately demonstrates that
an unrelated sentence can have valid citations. Semantic evaluation and human
content review remain necessary; neither authored fixtures nor generated text
is represented as an official/expert-approved referee interpretation.

The shared Unicode-whitespace counter remains authoritative: headline plus
points ≤90 casual / ≤220 analyst words; recap ≤40. Zero-width space is not a
word separator. No invalid output is repaired into success.

## Acceptance evidence — all eleven criteria

Observed on 2026-10-22, using .NET SDK 10.0.402 and MSTest 4.0.2.
Tests in this table exercise this implementation, not only the G00 feature seam.
This is a coverage map, not independent QA approval. The correlation correction
below remains subject to independent re-review.

| Criterion | Implementation and concrete deterministic checks |
| --- | --- |
| VAR-105-AC1 | `ExplanationServiceTests`: invalid fields/null/blank IDs, exact valid-ID correlation on success and all seven errors, missing scenario, exact version mismatch, wrong/malformed repository records; shared request/success/error rules. |
| VAR-105-AC2 | `ExplanationOutputTests`: citation integrity, S3 limits/interpretation, missing limitations, structured and obvious prose contradictions; explicit test/documentation that citations do not prove semantics. |
| VAR-105-AC3 | Authored selection matches the approved body and makes zero provider calls. `AzureOpenAiProviderTests` validates server-only configuration, sanitized errors, guarded redirects and no retries/fallback. |
| VAR-105-AC4 | All seven real error paths; `ExplanationDeadlineTests` and HTTP send/body fake-clock tests; exact and one-over output limits; rejected output remains `ContractError`. |
| VAR-105-AC5 | Twelve service scenario/audience/mode rows, twelve team/diagram-swap rows, six service-through-real-adapter fake-HTTP rows. Real inference remains **not run**. |
| VAR-105-T01-AC1 | Request validation, unknown scenario/version cases, full authored matrix and unconfigured-provider authored case. |
| VAR-105-T01-AC2 | Full injected matrix, unchanged nonblank correlation, fresh safe correlation only for missing/blank IDs, fixed error messages, repository/provider failure tests; no credential/raw-payload logging path. |
| VAR-105-T02-AC1 | Approved v1 adapter; missing configuration sends nothing; unavailable/redirect/rate-limit cases send once; one end-to-end 15-second deadline with no fallback. |
| VAR-105-T02-AC2 | Fake handler and manual-clock success/failure/cancellation tests, late success/fault tests, body-read timeout; fictitious test key only. Live account access **not run**. |
| VAR-105-T03-AC1 | Real strict raw-output parser plus shared rules; malformed/null/duplicate/unknown fields, references, identity/provenance, interpretation/status and mandatory limitation rejection; S3 uncertainty retained. |
| VAR-105-T03-AC2 | Exact 90/220 +40 boundaries across all twelve combinations; 24 one-over rows; all 25 Unicode whitespace separators; audience consistency and team-label swaps; errors are not truncated/rewritten. |

### Initial implementation commands (historical)

Before the QA correction, commands ran from the exclusive VAR-105 worktree
with this environment (all dependency/build outputs are worktree-local; the
pinned tool installation is only used to execute tools):

```bash
export VARAI_TOOLS="$PWD/.tools"
cd .git/varai-workflow/worktrees/var-105-development
mkdir -p .tools/var-105/cli .tools/var-105/runtime .tools/var-105/packages \
  .tools/var-105/http-cache .tools/var-105/plugin-cache
export DOTNET_ROOT="$VARAI_TOOLS/dotnet"
export PATH="$DOTNET_ROOT:$VARAI_TOOLS/node/bin:$PATH"
export DOTNET_CLI_TELEMETRY_OPTOUT=1 DOTNET_SKIP_FIRST_TIME_EXPERIENCE=1 \
  DOTNET_GENERATE_ASPNET_CERTIFICATE=false DOTNET_NOLOGO=1 \
  DOTNET_CLI_USE_MSBUILD_SERVER=0 MSBUILDDISABLENODEREUSE=1
export DOTNET_CLI_HOME="$PWD/.tools/var-105/cli" TMPDIR="$PWD/.tools/var-105/runtime/" \
  NUGET_PACKAGES="$PWD/.tools/var-105/packages" \
  NUGET_HTTP_CACHE_PATH="$PWD/.tools/var-105/http-cache" \
  NUGET_PLUGINS_CACHE_PATH="$PWD/.tools/var-105/plugin-cache"

dotnet --version
dotnet restore VarAI.slnx --locked-mode --disable-build-servers \
  -p:UseSharedCompilation=false -nodeReuse:false --verbosity minimal
dotnet test tests/VarAI.Server.Tests/VarAI.Server.Tests.csproj --no-restore \
  --filter FullyQualifiedName~VarAI.Server.Tests.Explanations --disable-build-servers \
  -p:UseSharedCompilation=false -nodeReuse:false --logger 'console;verbosity=minimal' \
  --logger 'trx;LogFileName=var-105-targeted.trx' --results-directory artifacts/var-105/tests
dotnet test tests/VarAI.Server.Tests/VarAI.Server.Tests.csproj --no-restore \
  --disable-build-servers -p:UseSharedCompilation=false -nodeReuse:false \
  --logger 'console;verbosity=minimal' \
  --logger 'trx;LogFileName=var-105-server-regression.trx' --results-directory artifacts/var-105/tests
dotnet format VarAI.slnx --verify-no-changes --no-restore --verbosity minimal
dotnet build VarAI.slnx --no-restore --configuration Release --disable-build-servers \
  -p:UseSharedCompilation=false -nodeReuse:false --verbosity minimal
```

Historical results: targeted **233 passed / 0 failed / 0 skipped**; complete server
regression **347 passed / 0 failed / 0 skipped**, including **114 unchanged
baseline tests**. Format verification passed. Release solution build passed
with **0 warnings / 0 errors**. TRX discovery/count evidence is in the ignored
worktree-local `artifacts/var-105/tests/` directory.

Failures were not hidden: the initial no-restore test command exited 0 with no
discovered tests and was not counted as evidence. The next explicit no-restore
test-project build failed with `NETSDK1004` (missing assets), authorizing the
unchanged-lockfile restore above. An adapter-test compilation then caught a fake
handler member named `Send` hiding the inherited method (`CS0108`); it was
renamed `Respond`, not suppressed. Subsequent actual runs passed: 155 core tests,
222 with the adapter, then the final 233 with additional semantic/transport checks.

### VAR105-QA-001 correction — independent re-review pending

Correction round **1** addresses only the unapproved request-ID restriction.
`qaFailures=1` and all workflow/human gates are unchanged. Only
`ExplanationService.cs`, `ExplanationServiceTests.cs` and this README changed
from the twelve-file candidate; the other nine candidate files are unchanged.
The approved baseline and the uncommitted candidate remain in place.

`ExplanationService` now delegates request acceptance to `ContractRules.Request`
and uses the same `string.IsNullOrWhiteSpace` predicate as `ContractRules.Text`
only to decide whether a replacement correlation ID is needed. There is no
additional character/length policy and no normalization. The provider adapter,
timeouts, output validation, error messages and retry/fallback behavior did not
change.

Ten nonblank request-ID cases cover 129 and 256 ASCII letters, a slash,
Unicode/emoji, internal spaces/punctuation, CR/LF, angle brackets, quotes and
backslash, and ASCII/Unicode leading/trailing whitespace. Each case exercises
both authored/live successes and all seven domain-error codes: **20 success
rows + 70 error rows**. Tests assert shared acceptance, exact echoed identity,
JSON round-trip preservation, expected repository/provider call counts, safe
fixed error messages and no returned fictitious provider secret/raw payload.
Five null/empty/whitespace ID rows and a separate null-request test retain
`INVALID_REQUEST`, fresh safe IDs and zero repository/provider calls.

Compatibility evidence uses the unchanged
[`assertError` predicate](../../client/src/contracts/validation.ts#L41-L42):
`error.requestId === requestId`, with replacement permitted only for
`INVALID_REQUEST` when the original is blank. All nonblank error cases satisfy
the equality branch exactly; success metadata likewise retains exact identity.
This is precise contract/predicate evidence, not a claim that frontend tests
or browser integration were rerun. Shared contracts and client files were not
changed, and no frontend install was needed.

The following commands actually ran using the exact pinned tool/cache
environment above and the existing restored dependencies. **No restore or
install ran in this correction round.** The red test command ran against the
original service after adding the regressions; the other tests, formatting
check and build ran after its fix.

```bash
dotnet --version
dotnet test tests/VarAI.Server.Tests/VarAI.Server.Tests.csproj --no-restore \
  --filter FullyQualifiedName~RequestIdCorrelation --disable-build-servers \
  -p:UseSharedCompilation=false -nodeReuse:false --logger 'console;verbosity=minimal' \
  --logger 'trx;LogFileName=var-105-qa-round1-correlation-red.trx' \
  --results-directory artifacts/var-105/tests \
  > artifacts/var-105/tests/var-105-qa-round1-correlation-red.log 2>&1
dotnet test tests/VarAI.Server.Tests/VarAI.Server.Tests.csproj --no-restore \
  --filter FullyQualifiedName~RequestIdCorrelation --disable-build-servers \
  -p:UseSharedCompilation=false -nodeReuse:false --logger 'console;verbosity=minimal' \
  --logger 'trx;LogFileName=var-105-qa-round1-correlation.trx' --results-directory artifacts/var-105/tests
dotnet test tests/VarAI.Server.Tests/VarAI.Server.Tests.csproj --no-restore \
  --filter FullyQualifiedName~VarAI.Server.Tests.Explanations --disable-build-servers \
  -p:UseSharedCompilation=false -nodeReuse:false --logger 'console;verbosity=minimal' \
  --logger 'trx;LogFileName=var-105-qa-round1-explanations.trx' --results-directory artifacts/var-105/tests
dotnet test tests/VarAI.Server.Tests/VarAI.Server.Tests.csproj --no-restore \
  --disable-build-servers -p:UseSharedCompilation=false -nodeReuse:false \
  --logger 'console;verbosity=minimal' \
  --logger 'trx;LogFileName=var-105-qa-round1-server.trx' --results-directory artifacts/var-105/tests
dotnet format VarAI.slnx --verify-no-changes --no-restore --verbosity minimal
dotnet build VarAI.slnx --no-restore --configuration Release --disable-build-servers \
  -p:UseSharedCompilation=false -nodeReuse:false --verbosity minimal
```

| Actual correction-round check | Result |
| --- | --- |
| Pinned SDK | `10.0.402` |
| Focused regressions before service fix | **96 executed: 6 passed, 90 failed, 0 skipped; exit 1**, reproducing the defect |
| Same focused cases after fix | **96 passed / 0 failed / 0 skipped** |
| All actual explanation tests | **323 passed / 0 failed / 0 skipped** |
| Complete server/contract regression | **437 passed / 0 failed / 0 skipped**, including 114 unchanged baseline cases |
| Format verification | Passed, exit 0; no formatting changes applied |
| Release solution build | Passed, **0 warnings / 0 errors** |

The four fresh `var-105-qa-round1-*.trx` files in
`artifacts/var-105/tests/` were parsed to verify discovered/executed/result-row
counts, no skipped tests, identical red/green case names, and inclusion of every
focused case in both larger runs. Historical 233/347-test reports do not certify
this corrected candidate. The regression tests use only existing local fakes
and a manual clock; no actual Azure account, credential or paid call was used.
G00-REVIEW-001, live deployment/inference, semantic review and G01 integration
remain outside this correction. No independent approval or Done status is claimed.
After validation, a process check found no remaining newly owned `dotnet`
process with the isolated `.tools/var-105` `DOTNET_CLI_HOME` and `TMPDIR`.
No pre-existing or other-worker/user process was signalled.

### Source/API choices inspected

- [Official v1 Chat REST reference](https://learn.microsoft.com/en-us/rest/api/microsoft-foundry/azureopenai/chat?view=rest-microsoft-foundry-v1&preserve-view=true),
  documentation revision `6462e3bdaa191c85756377a92350c4cdf6768346`:
  POST path, `api-key`, required messages/model, optional controls, single-choice
  assistant response shape. The canonical v1 URI/parameter table was used,
  **not** the page's example containing older `latest`/preview query parameters.
- [v1 lifecycle](https://learn.microsoft.com/en-us/azure/foundry/openai/api-version-lifecycle?view=foundry-classic),
  revision `777f84fbedeb0995f4fdea6c65bee2f2a4af1657`: `/openai/v1/`,
  deployment-name selection, no required dated API version, additive metadata.
- [Structured output guidance](https://learn.microsoft.com/en-us/azure/foundry/openai/how-to/structured-outputs?view=foundry-classic),
  revision `5dd9185398b477a05880250bf9fec4dd30fe1107`, plus the v1 REST
  `response_format` compatibility note: capabilities vary by model/deployment;
  neither JSON mode nor schema mode is presumed enabled here.
- .NET 10 primary references:
  [CancellationTokenSource(TimeSpan, TimeProvider)](https://learn.microsoft.com/en-us/dotnet/api/system.threading.cancellationtokensource.-ctor?view=net-10.0),
  [Task.WaitAsync](https://learn.microsoft.com/en-us/dotnet/api/system.threading.tasks.task.waitasync?view=net-10.0),
  [TimeProvider](https://learn.microsoft.com/en-us/dotnet/api/system.timeprovider?view=net-10.0),
  [AllowAutoRedirect](https://learn.microsoft.com/en-us/dotnet/api/system.net.http.httpclienthandler.allowautoredirect?view=net-10.0).
  The latter documents that non-Authorization headers are not cleared on
  redirects, motivating explicit redirect disabling for `api-key`.
- Awesome Copilot revision `613efc8c21d9b3ce642dff361d17006cd9967e28`,
  `skills/csharp-async/SKILL.md` and `skills/csharp-mstest/SKILL.md`:
  applied async cancellation, Task-returning tests and data-driven modern
  assertions. Did not import tools, replace MSTest, add a clock/SDK package,
  or adopt blanket exception wrapping that exposes provider details.

### Changed files and remaining gates

- Server: `ExplanationService.cs`, `ExplanationOutputValidator.cs`,
  `ExplanationProviderException.cs`, `AzureOpenAiConfiguration.cs`,
  `AzureOpenAiExplanationProvider.cs`, and this README.
- Tests: `ExplanationFixtures.cs`, `ManualTimeProvider.cs`,
  `ExplanationServiceTests.cs`, `ExplanationDeadlineTests.cs`,
  `ExplanationOutputTests.cs`, `AzureOpenAiProviderTests.cs`.
- Shared contracts/helpers, generated artifacts, GraphQL schema/resolvers,
  startup, manifests/lockfiles, contract stubs, board and automation are unchanged.
- No real provider access/inference, cloud/PAT access, UI integration,
  frontend/browser acceptance, human semantic review, human story acceptance
  or completed product is established. G01 wiring and explicitly authorized
  live-deployment validation remain separate. No services were started.
