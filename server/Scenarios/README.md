# Synthetic scenario library — VAR-101

**Local integration note (2026-10-23):** the normal server now registers this
repository at `/graphql`. Content is unchanged. The standalone candidate
description and historical checks below are preserved; current wiring and
execution evidence are in the [local delivery guide](../../docs/local-delivery.md).

This is an in-memory authored library, not a referee, live-model service,
test-stub fallback or integrated review UI. Its default content release is
`synthetic-1.0.0`, using the approved [GraphQL v0.2 contract](../../docs/backlog/contract-v0.2.md).
No application registration, HTTP route, contract, generated artifact, dependency
manifest, board or scheduler is changed.

## Content and provenance

The fictional **Alder Vale Comets** and **Brindle Reach Lanterns** start at 0-0
in minute 67. A teammate's open-play foot pass, receiver touch, shot, originally
awarded goal and review sequence are authored demonstration events. The 0–6,000 ms
timeline is compressed, not a claim about real review duration.

| Scenario | Pass-time relations | Supplied review / after-review score | Authored interpretation |
| --- | --- | --- | --- |
| S1 | In opponents' half, ahead of ball, nearer goal line than second-last opponent | Goal disallowed / 0-0 | Offside supported |
| S2 | Same, except level with second-last opponent | Goal confirmed / 1-0 | No offside supported |
| S3 | Observation absent; ball and second-last relations explicitly missing | Both explicitly `null` | Insufficient evidence |

S1/S2 share `PAIR-01`; only `RECEIVER_VS_SECOND_LAST` changes as an independent
football fact. Their outcomes, wording and receiver illustration are authored
consequences, not extra observations. S3 has no comparison, markers or reference
line. Its independently supplied opponents'-half fact and receiver touch do not
reconstruct the missing relations. An authored pass event is not a pass-time
position observation.

All six explanations are `AUTHORED`. Both audiences retain the scenario's
interpretation; S3 is `LIMITED`, not a disguised successful verdict. Original
decision, supplied review outcome and score consequence occupy separate fields.
Every claim resolves its evidence/rule IDs within its scenario. No confidence
percentage or expert approval is claimed. Coordinates illustrate supplied facts;
the repository never calculates a fact, interpretation or outcome from them.

Observed whitespace-separated word counts from the scenario tests:

| Scenario | Casual explanation / recap | Analyst explanation / recap |
| --- | --- | --- |
| S1 | 60 / 17 | 113 / 25 |
| S2 | 67 / 21 | 125 / 27 |
| S3 | 61 / 28 | 113 / 25 |

The limits are 90 casual, 220 analyst and 40 recap words. The explanation count
includes the headline and points, as specified by the contract.

## Repository behavior

```csharp
IScenarioRepository repository = new SyntheticScenarioRepository();
var summaries = await repository.ListAsync(cancellationToken);
var scenario = await repository.FindAsync(ScenarioId.S1, cancellationToken);
```

- The existing interface is unchanged. Lists are ordered S1, S2, S3; lookup
  returns the requested immutable record with its exact content version.
  Unknown enum IDs return `null`, as expected by the existing GraphQL resolver.
- A concrete, package-local overload adds an explicit version guard:
  `FindAsync(ScenarioId, string contentVersion, string requestId, CancellationToken)`.
  It returns the existing `IScenarioResult` union: the exact `Scenario`, or a
  non-retryable `SCENARIO_NOT_FOUND`, `CONTENT_VERSION_MISMATCH` or
  `INVALID_REQUEST` error. Versions are case-sensitive and never trimmed,
  coerced or silently replaced. Blank versions are invalid requests.
- A missing/blank correlation ID yields `INVALID_REQUEST` with a fresh safe
  ID, not the test service's fixed ID. Cancellation propagates as
  `OperationCanceledException`, including for unavailable IDs.
- The version guard is **not a new GraphQL operation or shared-interface
  requirement**. The current interface has no version argument; explanation
  request/version handling still belongs to VAR-105/G01.
- The constructor accepting `IEnumerable<Scenario>` supports isolated authoring
  checks and future explicit revisions, not a free-form football simulator.
  It snapshots data through the strict existing contract serializer, validates
  every record and the S1/S2 pair, and rejects a missing/duplicate/unknown
  scenario or noncanonical starting score before exposing any data.
  Malformed content raises `ContractViolationException`; a null dataset raises
  `ArgumentNullException`. It never repairs invalid content or falls back to stubs.
- S1/S2 must share content version, match context and rules. The unpaired S3 can
  carry a distinct explicit revision; lookup checks the selected record's
  version, not a global constant.
- Every exposed collection, including nested event references, markers, claims,
  citations and limitations, is read-only. Constructor input is deeply detached.
  Editing a record with `with` creates a caller-owned copy, not a repository edit.

No storage, service, model, network access or application startup is required
to construct or query the library.

## Primary-source check — 2026-10-22

The following IFAB sources were inspected directly, not inferred from a search
snippet or generated answer:

| Record / purpose | Primary source and checked scope |
| --- | --- |
| Edition availability | [IFAB document library](https://www.theifab.com/laws-of-the-game-documents/) lists the 2026/27 Laws, including its single-page download. |
| `R-L11-POSITION` | [Law 11.1](https://www.theifab.com/laws/latest/offside/#offside-position): eligible body parts, opponents' half, relation to both ball and second-last opponent, level exception and position versus offence. |
| `R-L11-INVOLVEMENT` | [Law 11.2](https://www.theifab.com/laws/latest/offside/#offside-offence): teammate contact timing and subsequent playing/touching of the pass. The foot-pass example does not generalize to the goalkeeper-throw timing exception. |
| `R-VAR-AUTHORITY` | [VAR protocol principles 4–6](https://www.theifab.com/laws/latest/video-assistant-referee-var-protocol/#principles) and [2(a), Goal/no goal](https://www.theifab.com/laws/latest/video-assistant-referee-var-protocol/#reviewable-decisions-incidents): referee authority, review timing and attacking offside within goal review. |

The current-law pages displayed **2026/27** when checked. The simplified Law 11
fetch omitted the article text; certificate-validating `curl` plus an in-memory
HTML parser retrieved its actual sections. Python's initial direct HTTPS attempt
failed local certificate verification; verification was not disabled. The
edition-specific `/laws/2026-27/offside/` candidate returned 404 and is not used.
The PDF's publication link was checked through the official library; the PDF
itself was not parsed.

The stored summaries are original, concise paraphrases limited to this family.
All references are honestly `SOURCE_CHECKED`, with edition `2026/27` and
`checkedOn: 2026-10-22`; they are **not `EXPERT_REVIEWED`**. The `latest` URLs can
change over time, so future edits must recheck edition/content and update the
content version. No competition-specific applicability, expert interpretation,
official approval or complete rules coverage is certified.

The coordinator reported **G00-REVIEW-001**: shared `ContractRules.Pair` does not
forward trusted expert-review records to individual validation. That static
finding was not independently reproduced here. It does not block the delivered
`SOURCE_CHECKED` pair, which passes the real validator in these tests.
Unsubstantiated expert labels are rejected. A future legitimate expert-reviewed
pair requires shared-owner resolution; no shared fix or validation bypass is
included.

## Acceptance evidence

Tests below are in [the owned test directory](../../tests/VarAI.Server.Tests/Scenarios/).
They construct the delivered repository, not the baseline stub repository.

| Criterion | Implementation and observable evidence |
| --- | --- |
| VAR-101-AC1 | `SyntheticScenarioLibrary.Create`; `ScenarioContentTests.DeliveredLibraryContainsCompleteSyntheticRecordsAndOrderedEvents` checks all three IDs, fictional teams, version/provenance, all seven facts and the six-stage timeline. |
| VAR-101-AC2 | `PairChangesOnlyReceiverVersusSecondLastAndHasReciprocalLinks`, `MissingEvidenceRemainsExplicitlyNullIncludingSerializedOutput`; integrity cases reject a second changed fact and invented S3 positions. |
| VAR-101-AC3 | The primary-source check above; `RuleMetadataMatchesTheSourceCheckedEditionWithoutExpertClaims` checks IDs, exact URLs/sections, edition, date and honest status. |
| VAR-101-AC4 | `SuppliedOutcomeIsSeparateFromOriginalAward`, the six-row `AllSixAuthoredBodiesHaveBoundedCitedClaimsAndHonestLimitations` matrix, explicit S3-null test and team-label interpretation invariance test. |
| VAR-101-AC5 | `ScenarioIntegrityTests.InvalidDeliveredContentFailsClosedWithAContractViolation` rejects duplicate scenario/fact/rule/event/marker/claim IDs, event order errors, inconsistent outcomes and unsupported comparisons; pair invariants are tested separately from per-record validity. |
| VAR-101-T01-AC1 | Synthetic/content-version/source metadata and separate fact/decision/outcome/score fields are authored in `SyntheticScenarioLibrary.cs`; complete-record, outcome, source-metadata and serialized-null tests exercise them. |
| VAR-101-T01-AC2 | The exact-one-fact comparison, missing-evidence and six-body tests check reciprocal pairing, explicit nulls, citations, audience interpretation, authored provenance and output limits. |
| VAR-101-T02-AC1 | `ScenarioRepositoryTests` covers interface lookups, unknown IDs, exact and mismatched versions, independent S3 revisions, safe correlation errors, cancellation and two mutation tests. Invalid construction fails explicitly without mutating existing records or repairing the input. |
| VAR-101-T02-AC2 | Negative tests run against copies of the delivered records: duplicate IDs, broken event/claim/rule references, equal/decreasing event times, inconsistent scores/outcomes and `S2-second-independent-fact`. |

These are implementation/test findings, not human acceptance or a completed epic.

## Validation and handoff

Historical assigned worktree, relative to the canonical checkout:
`.git/varai-workflow/worktrees/var-101-development`

Unchanged baseline HEAD:
`a7d9f82983f4fc35c5a4703dfd69ffde79554240`

Changed files, all newly added and uncommitted:

- `server/Scenarios/SyntheticScenarioLibrary.cs`
- `server/Scenarios/ScenarioLibraryValidation.cs`
- `server/Scenarios/SyntheticScenarioRepository.cs`
- `server/Scenarios/README.md`
- `tests/VarAI.Server.Tests/Scenarios/ScenarioContentTests.cs`
- `tests/VarAI.Server.Tests/Scenarios/ScenarioIntegrityTests.cs`
- `tests/VarAI.Server.Tests/Scenarios/ScenarioRepositoryTests.cs`
- `tests/VarAI.Server.Tests/Scenarios/ScenarioTestData.cs`

Pinned tools actually reported .NET SDK `10.0.402`, Node `v24.22.1` and npm
`11.19.1`. Commands were run only after explicitly changing to this worktree.
The final-check environment used the following paths, normalised relative to
the original canonical checkout:

```bash
export VARAI_TOOLS="$PWD/.tools"
cd .git/varai-workflow/worktrees/var-101-development
export DOTNET_ROOT="$VARAI_TOOLS/dotnet"
export PATH="$VARAI_TOOLS/node/bin:$DOTNET_ROOT:$PATH"
export DOTNET_CLI_TELEMETRY_OPTOUT=1
export DOTNET_CLI_HOME=$PWD/.tools/dotnet-home
export NUGET_PACKAGES=$PWD/.tools/nuget-packages
export NUGET_HTTP_CACHE_PATH=$PWD/.tools/nuget-cache
export DOTNET_GENERATE_ASPNET_CERTIFICATE=false
mkdir -p .tools/scratch
export TMPDIR=$PWD/.tools/scratch
```

| Exact validation command after that environment | Observed result |
| --- | --- |
| `dotnet test tests/VarAI.Server.Tests/VarAI.Server.Tests.csproj --no-restore --filter FullyQualifiedName~VarAI.Server.Tests.Scenarios --disable-build-servers --verbosity minimal --logger 'trx;LogFileName=scenario-tests.trx' --results-directory .tools/validation` | **121 passed**, zero failed/skipped. Local TRX includes the word-count observations above. |
| `dotnet test VarAI.slnx --no-restore --disable-build-servers --verbosity minimal` | **235 passed**, zero failed/skipped, including existing contract, GraphQL, scaffold and feature-harness regressions. |
| `dotnet format VarAI.slnx --verify-no-changes --no-restore` | Passed, exit 0. |
| `dotnet build VarAI.slnx --no-restore --configuration Release --disable-build-servers --verbosity minimal` | Passed, zero warnings/errors. |
| `dotnet run --project tools/VarAI.ContractTool --no-build --no-restore --configuration Release -- --check` | Passed existing C# drift check: schema, three baseline stub scenarios, 12 stub explanations and seven errors. This is not a replacement for the actual-library tests. |
| `dotnet build-server shutdown` | MSBuild and C# compiler servers shut down successfully, for both project-local scratch locations used during the task. |

Earlier failures are not hidden:

- The initial existing seam check,
  `dotnet test tests/VarAI.Server.Tests/VarAI.Server.Tests.csproj --no-restore --filter FullyQualifiedName~FeatureHarnessTests.VAR101`,
  returned exit 0 without discovering tests. It was **not** counted as a pass.
- `dotnet build tests/VarAI.Server.Tests/VarAI.Server.Tests.csproj --no-restore --verbosity minimal`
  exposed missing restore assets (`NETSDK1004`). Only then was
  `dotnet restore VarAI.slnx --locked-mode --verbosity minimal` run; it passed.
  The same seam check with `--verbosity minimal` subsequently passed one test.
- The first new-test build reported three `MSTEST0037` assertion-style errors;
  the tests were corrected to the existing MSTest 4 assertion APIs.
- The first full format check reported two whitespace issues in one new
  initializer; those were corrected, then the focused tests, full server suite,
  formatting and Release build were rerun successfully.
- A final invalid-data edge-case check,
  `dotnet test tests/VarAI.Server.Tests/VarAI.Server.Tests.csproj --no-restore --filter FullyQualifiedName~ScenarioIntegrityTests.InvalidDeliveredContentFailsClosedWithAContractViolation --disable-build-servers --verbosity quiet --logger 'trx;LogFileName=invalid-content-tests.trx' --results-directory .tools/validation`,
  passed 70 cases and failed two: non-finite marker/reference-line coordinates
  raised the serializer's `ArgumentException` instead of the documented
  `ContractViolationException`. The package-local boundary now translates that
  rejection consistently. Both regressions are included in the final 121
  passing scenario tests; all final checks above were rerun after the fix.
- The SDK's isolated first-use setup printed development-certificate creation.
  No certificate-trust or application-server startup command was run.

Task-created root scratch/cache directories were removed. Dependency/build
outputs remain isolated in this worktree's ignored directories. No long-running
application process was started; owned build servers were stopped.

Guidance consulted: `github/awesome-copilot` revision
`613efc8c21d9b3ce642dff361d17006cd9967e28`,
`instructions/csharp.instructions.md` and `skills/csharp-mstest/SKILL.md`.
Applied local formatting/file-scoped namespaces, nearby test naming, sealed
test classes, data-driven tests and precise assertions. Did not import blanket
comments, framework/dependency changes, upstream configuration or tools.

Not run or claimed: frontend tests/build, the Node/TypeScript half of
`contracts:check`, browser/UI integration, HTTP feature transport, live-model
calls, deployment, independent VAR-101 QA, expert content review, user research
or human acceptance. No commits, pushes or gate/status changes were made.
No current implementation blocker remains within this assignment's scope.
