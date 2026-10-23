# AI narration (English and Tamil), operator approval and telemetry

This page documents what the server does for the **operator-gated** Match Centre mode. It describes
behaviour that is implemented and tested in this repository; anything not verified is listed under
[Limits and what is not verified](#limits-and-what-is-not-verified). Everything is synthetic: fictional teams,
players and events, no real match data.

## What was added, in one paragraph

For every cue (a "moment" such as a goal or a sprint) the server can ask an Azure OpenAI model to write the words in
English and Tamil, mechanically check the answer against the facts the code already holds, and fall back to the cue's
deterministic English text when anything fails. A person (the **operator**) must approve, hold or override each cue within a
decision window before it can air. An undecided cue is held, never approved. Every proposal and decision is written to a
hash-chained log that can be downloaded. OpenTelemetry spans, metrics and logs go to Application Insights when a connection
string is configured.

```
cue facts (code) ──► prompt ──► model ──► strict JSON ──► mechanical checks ──► narration (AI or labelled fallback)
                                                                                       │
operator desk ◄── proposal (frozen text + hash, one decision window before airing) ◄───┘
      │ approve / hold / override (bound to the payload hash)
      ▼
program feed: events + momentum + only the approved cues, delayed by the decision window ──► Fan / Analyst / Studio views
      │
      └──► append-only, hash-chained decision log (JSONL download)
```

## Narration

**Facts come from code; the model writes only words.** For each cue the server builds a fact sheet from the cue's own
deterministic text and metrics, the roster and the running score. The model receives that JSON as data and must return one JSON
object with `headline`, `fan`, `analyst` and `why`. It is told to use only the supplied facts, to keep names, team codes
and units in Latin script, and to write numbers as digits exactly as supplied.

**One call per cue and language**, remembered for the life of the process. Concurrent requests share one call. A caller that
stops waiting does not cancel the shared call.

### Mechanical checks

The verifier is deliberately *mechanical*. It reduces the ways a model can drift from the facts, and it does not understand
meaning, so a passing narration can still be wrong, awkward or badly worded.

| Check | What it enforces | What it cannot catch |
| --- | --- | --- |
| `schema` | Exactly the four string properties, no duplicates or extras, no empty values, per-field length limits; bare JSON only (no fences or prose) | – |
| `markup` | No HTML or Markdown markers, links, control characters or hidden bidirectional text | – |
| `script` | English text has no Tamil letters; Tamil text has enough Tamil letters; no other scripts | Mixed-quality or unnatural Tamil |
| `numbers` | Every digit string and every `m:ss` clock time must be one the facts contain; exact equality, no rounding | Swapping two *true* numbers (for example calling the 7 m/s limit the player's speed) |
| `scoreboard` | Every `a–b` score must be a scoreline the facts contain (the score at the cue and just before it) | A correct scoreline attached to the wrong moment |
| `names` | Tamil text may contain Latin words only for supplied names, team codes and units; English proper nouns and player IDs must come from the facts | Two supplied players swapped with each other |
| `events` | Words for goal, penalty, cards, injury, offside, foul, corner, substitution, review and save are allowed only if the reference text already uses that concept (English and Tamil word lists) | Events described in words that are not on the lists |
| `claims` | Records, seasons, history, superlatives and number words (two, third…) are rejected unless the facts use the same word | Other unsupported claims |

Tamil digits are normalised to ASCII before comparison. The English and Tamil word lists are small, hand-written
heuristics. **The Tamil output has not been reviewed by a native speaker.**

### Fallback

If the model is off, unreachable, slow, returns something unusable or fails a check, the narration is the cue's
deterministic English text with `source: "FALLBACK"` and a `fallbackReason`
(`DISABLED`, `NOT_CONFIGURED`, `UNAVAILABLE`, `TIMEOUT`, `INVALID_OUTPUT`, `VERIFIER_FAILED`, `BUDGET_EXHAUSTED`,
`COOLDOWN`, `NOT_READY`). A Tamil request that falls back is **delivered in English and labelled**: no hand-written or
machine-translated Tamil is ever substituted.

### Spend and abuse controls (enforced in code)

| Control | Default | Setting |
| --- | --- | --- |
| Model calls per process lifetime | 160 (one match needs at most 2 per cue and language) | `Narration__MaxModelCalls` |
| Concurrent model calls | 2 (the Azure deployment sets 4 so the first cues of a session finish inside the narration wait) | `Narration__MaxConcurrency` |
| Per-call and queue timeouts | 30 s | `Narration__CallTimeout`, `Narration__QueueTimeout` |
| Calls for one cue and language | 2 including a retry after 60 s | `Narration__MaxAttemptsPerNarration` |
| Cool-down after consecutive transport failures | 3 failures → 60 s without calls | `Narration__FailureThreshold`, `Narration__Cooldown` |
| Completion tokens per call (reasoning tokens count) | 2,048 | `Narration__MaxCompletionTokens` |
| Reasoning effort | not sent (the model's default); the Azure deployment sets `low` | `Narration__ReasoningEffort` (`none`, `low`, `medium`, `high`, `xhigh`) |

Model calls are keyed by cues the server already knows, never by client text, so an anonymous caller cannot make the
server spend more than these limits allow. The offside explainer's live mode stays off in the deployed app. A session keeps
running on the server, and keeps narrating ahead of its cues, until it ends or expires, even after the browser is closed;
at 1× that is about 90 minutes. The per-process cap and the one-call-per-cue-and-language memo bound what that can cost, but
there is no idle timeout.

Each call logs token usage (input, output, reasoning, cached) and latency, and the desk shows them to the operator.
They are token counts from the service, not an invoice.

### What the live model did (measured on 2026-10-23)

Everything here is a small, hand-checked sample against the `gpt-6-luna` deployment (version 2026-09-22), not an evaluation.

| Measure | Result |
| --- | --- |
| Calls made through the app | 50 (36 from a laptop with `az login`, 14 from the deployed app with its managed identity), over 12 of the 29 cues and 9 of the 10 cue kinds (no `SPRINT_CARRY`) |
| Rejected by the mechanical checks | 7 of 50: two `names` (a Title Case English headline whose verb looked like a proper noun, and English words left in Latin letters inside Tamil) and five `numbers`, all on `MOMENTUM_SWING` (the model added "out of 100" for the control index, a number that is not in the facts). The prompt was changed after each of these three causes. One Tamil `MOMENTUM_SWING` was still rejected afterwards (1 of the 4 calls on that cue kind since the change) |
| What happens to a rejection | The labelled deterministic English text is shown (`VERIFIER_FAILED`), and the cue is retried once after 60 s |
| Tokens per call at the model's default effort | Output 222–1,360 (up to 1,180 of them reasoning); latency 2.1–14.9 s. The slowest call made the first Tamil text of a cold session miss the 10 s narration wait (`NOT_READY`) |
| Tokens per call at `low` effort | Output about 200–360; latency 4.0–5.0 s in the 8 local calls. The same four narrations used 1,050 output tokens at `low` against 2,873 at the default |
| Estimated model spend for all 50 calls | About 1.5 INR, from the reported tokens (about 30,200 in, 24,500 out) at retail prices of 9.60 and 47.99 INR per million. Azure's own billing data was not checked |
| Expected cost of one full match | 58 calls: about 1.1 INR at `low` effort, about 2 INR at the default (extrapolated, not measured end to end) |

What the checks caught was real: invented numbers and untranslated words. What they cannot catch is listed under
[Mechanical checks](#mechanical-checks). In the passing texts I read closely (about half of them), every factual claim traced
back to the supplied reference text. The English was natural, with the occasional flourish that the facts do not state, such
as "a sharp pass"; the Tamil had the same, for example "அருமையான" ("wonderful") for a pass. The Tamil was fluent to a
non-native reader, keeps names and units in Latin letters and uses Western digits, but it has **not** been reviewed by a native
speaker, and some football terms (for example "high-level ball recoveries") are literal.

## Operator approval gate

- **Timing.** The session clock starts at creation. A cue is *proposed* when its match time arrives (at the chosen speed) and
  *airs* one decision window later (default 20 s of real time). The whole program (events, momentum, cues) is delayed by that
  window, like a broadcast delay, so cues stay in step with events. Cues at or before the jump point are history: they are
  never proposed and never air. The operator's real window is the time from the proposal to the airing moment: slightly less
  than the setting (a proposal is created on the next 250 ms tick), and shorter for the first cues of a session, which have to
  wait for the model (up to `Gate__NarrationWait`, 8 s by default, 10 s on Azure). Narration starts `Gate__PrefetchLead` (40 s)
  before a cue is proposed, so later cues are ready in time. On the deployed app the first cues had windows of 10–17 s; the desk
  shows the real countdown.
- **Speed is capped at 10×.** A real-time decision window cannot work when match time runs 60× faster, so gated sessions run
  at 1×–10×.
- **Decisions.** `approve`, `hold` or `override` (edited text per language). A decision is final. It must quote the payload
  hash of the proposal the operator saw, so text that changed in between cannot be approved by mistake.
- **No auto-approve.** A pending proposal is held at the moment it would have aired (`AUTO_HELD`, reason `SLA_EXPIRED`); a
  decision at or after that moment is refused. Tests assert that a session with no decisions airs no cue at all.
- **Override.** Size, empty-field, markup, link and control-character problems block the override. Content findings (numbers,
  names…) do not block it, because the person is accountable, but they are recorded with the proposal and in the log.
- **Program feed.** Only approved or overridden cues appear, each carrying its `approvalId`, payload hash and the approved
  narration per language. It never contains usage figures or verifier internals. Its final `complete` message reports the
  match's totals (29 cues), not the number that aired, so a run with no approvals delivers none and still reports 29.

### HTTP interface

| Route | Purpose |
| --- | --- |
| `POST /api/matches/SYN-MATCH-01/sessions` | Create a session `{ speed 1–10, fromSeconds }` → 201 with the session description |
| `GET …/sessions/{id}/program` | Server-Sent Events: the delayed program feed (same envelope as `/stream`, overlays carry `approval`) |
| `GET …/sessions/{id}/desk` | Server-Sent Events for the operator: `session`, `proposal`, `decision`, `heartbeat`; resumes by `Last-Event-ID` |
| `POST …/sessions/{id}/decisions` | `{ approvalId, payloadHash, action, edits?, note? }` → 200, or 400/404/409 with a `code` |
| `GET …/sessions/{id}/decision-log.jsonl` | Download of the decision log (`X-Decision-Log-Head`, `X-Decision-Log-Entries` headers) |
| `GET /api/narration` | `{ enabled, deployment, callsUsed, callLimit, coolingDown }` |

The earlier `/stream`, `/events` and `/overlays` routes are unchanged. They carry no narration or approval and the UI labels
them *Preview, not operator-approved*.

Sessions are an unguessable 128-bit identifier held in server memory (at most 16 live, each living until a few minutes after the
program would end). **There is no operator login in this demo**: whoever holds the session ID can decide, and the log records
`actorAuthenticated: false`. A restart or scale-to-zero ends every session.

### Decision log

One JSON object per line, in order, each carrying `seq`, UTC time, the event (`PROPOSED`, `APPROVED`, `HELD`,
`OVERRIDDEN`, `AUTO_HELD`), the approval and cue IDs, the payload hash, who acted (`operator` or `system`),
per-language provenance (`AI`/`FALLBACK`/`OPERATOR`, fallback reason, whether the mechanical checks passed), the operator's
edits and note, and `prevHash`/`hash`. It records provenance and hashes, not a second copy of AI text.

The hash of a line is SHA-256 of `prevHash + "\n" + <the line with its hash value replaced by an empty string>`, starting from
SHA-256 of `VARAI-DECISION-LOG-v1:<sessionId>`. Anyone can recompute it without this codebase:

```python
import hashlib, json, re, sys
session, path = sys.argv[1], sys.argv[2]
previous = hashlib.sha256(f"VARAI-DECISION-LOG-v1:{session}".encode()).hexdigest()
for number, line in enumerate(open(path, encoding="utf-8"), 1):
    line = line.rstrip("\n")
    match = re.search(r'"hash":"([0-9a-f]{64})"\}$', line)
    entry = json.loads(line)
    assert match and entry["seq"] == number and entry["prevHash"] == previous, f"line {number}: chain broken"
    blanked = line[:match.start()] + '"hash":""}'
    assert hashlib.sha256((previous + "\n" + blanked).encode()).hexdigest() == match.group(1), f"line {number}: content changed"
    previous = match.group(1)
print("chain intact; head hash", previous)
```

**What the chain proves and does not prove.** It detects edited, deleted, inserted or reordered lines. It cannot detect
removal of the *last* entries unless you also kept the head hash that the download advertises. It is not signed, anyone
can recompute a whole chain after changing a file, and it does not identify the operator. It is held in memory and is lost when
the process stops, so download it before then.

## Configuration

| Setting | Purpose |
| --- | --- |
| `Narration__Enabled` | `true` turns AI narration on; default off (deterministic English, no model calls) |
| `Explanations__AzureOpenAi__Endpoint`, `…__DeploymentName` | The Azure OpenAI account and deployment (shared with the offside explainer) |
| `Explanations__AzureOpenAi__AuthMode` | `ManagedIdentity` (Container Apps), `AzureCli` (your `az login`) or the original key mode when omitted |
| `Explanations__AzureOpenAi__ManagedIdentityClientId`, `…__TokenScope` | Optional user-assigned identity; scope `https://ai.azure.com/.default` (documented for the v1 API, and accepted by this deployment for both `az login` and the managed identity) or `https://cognitiveservices.azure.com/.default` (allowed, not tried) |
| `Narration__ReasoningEffort` | Optional `reasoning_effort` for narration calls only (`none`, `low`, `medium`, `high`, `xhigh`); this deployment rejects `minimal` |
| `Gate__SlaSeconds` | Decision window and program delay (default 20; 1–120) |
| `Gate__NarrationWait`, `Gate__PrefetchLead` | Longest a proposal waits for narration (default 8 s, at most half the window) and how early narration starts (default 40 s) |
| `Gate__MaxSessions` | Live sessions (default 16) |
| `APPLICATIONINSIGHTS_CONNECTION_STRING` | Enables OpenTelemetry export; nothing is exported without it |

Keyless modes accept no API key, reject an unknown scope and validate the client ID. A key is never required, printed or
stored by this code. Invalid limits stop the server at startup.

## Telemetry

When `APPLICATIONINSIGHTS_CONNECTION_STRING` is set the server uses `Azure.Monitor.OpenTelemetry.AspNetCore` 1.6.0 to export:

- **Spans:** `narration.generate` (cue, language, deployment, input/output/reasoning tokens, latency, mechanical-check result and
  failed checks, source and fallback reason) and `gate.decide` (the first 8 characters of the session ID, approval ID, action,
  result), plus the standard request and outgoing HTTP spans. Operator notes, narration text and full session IDs are never
  span attributes or log values.
- **Metrics:** `varai.narration.model_calls`, `.tokens`, `.latency`, `.results`, and `varai.gate.decisions`.
- **Logs:** application logs, which contain IDs, counts and verdicts but no model text, keys or connection strings.

On the deployed app these arrived in Application Insights (see [azure-deployment.md](./azure-deployment.md#verification-record)).

Microsoft's current guidance for *new* applications names the `Microsoft.OpenTelemetry` package. This project uses the
Azure Monitor distribution instead because it remains documented as supported, is generally available, and has 5 dependencies
against 12 (the newer package also brings Agent 365, SQL client and console exporters this app does not use). The two
distributions must not be initialised together. The automatic request telemetry records the URL path, and for the session routes
that path contains the full session ID, so treat the telemetry resource as sensitive for the life of a demo session.

## Match Centre UI

The page opens in **Preview**, which is the unchanged deterministic stream, labelled "Preview - deterministic rules only,
not operator-approved". The **Operator-gated** mode switch uses the routes above:

- **Session.** *Start gated run* creates a session at the chosen speed (1, 2, 5 or 10×; default 10×); *Jump to 66:00* starts a new
  session at that match time; *Stop* closes both streams (the session stays on the server until it expires). A person must start
  every session.
- **Language.** English or தமிழ் (Tamil text is marked `lang="ta"`). The choice is available only in gated mode, because Preview
  has no Tamil. A narration that fell back is shown with its reason, for example "Tamil unavailable - showing English (reason: the
  AI text failed the mechanical checks)".
- **Operator desk.** The Studio view shows the full desk, including the model's token use and each mechanical check. Fan and
  Analyst views show a compact, collapsible desk above the moment feed, so one person can act as operator from any persona.
  Each pending cue has a countdown from the server's clock, both languages with their source, the rule facts behind the cue, an
  optional note, and **Approve**, **Hold** and **Override** (an editor with the server's per-field limits). Controls switch off
  when the desk feed is closed or the window has ended. A decided cue moves to a list; the log download link and the "no operator
  login" and "mechanical checks only" notes sit under it.
- **Audience views.** The broadcast frame, on-air panel, moment feed and Studio list show only approved cues, each with a chip
  for where the words came from: "AI-written - operator-approved", "Operator-edited" or "Deterministic text".
- **Validation.** Every message from the server is parsed by a strict validator; anything unexpected is rejected, not rendered.
  Text is rendered as text, never as HTML.

Checks: 547 client unit tests, and `client/tests/integration/match-centre-gated.spec.ts`, which starts the real published
server with a short decision window and approves one cue, overrides another in Tamil, leaves the rest undecided, downloads the log
and checks the hash chain. It needs its own server, so it is not part of `npm run test:integration`; run it with
`cd client && VARAI_APP_PORT=<free port> npx playwright test --config playwright.gated.config.ts` after `npm run publish`.
It runs with narration off, so it does not exercise the model.

## Limits and what is not verified

- **Mechanical checks are not proof of truth** (see the table above). The Tamil has not been reviewed by a native speaker.
- **The sample is small.** 50 live calls over 12 of the 29 cues (see [measured](#what-the-live-model-did-measured-on-2026-10-23)).
  No full match has been narrated live end to end, and `SPRINT_CARRY` cues have not been narrated by the live model.
  7 of the 50 calls were rejected by the checks; with the final prompt wording, 1 of 8. The steady-state rate is not established.
- **No operator login.** Anyone with a session ID can decide for that session, and the log records `actorAuthenticated: false`.
  The decision log is hash-chained, not signed, and lives in memory: it is lost on restart or scale-to-zero, and sessions are
  capped at 16 on a single replica.
- **Sessions outlive the browser.** A session keeps narrating until it ends or expires, with no idle timeout; spend is bounded
  by the call cap and the per-cue memo, not by attention.
- **The deployed URL is public** and the server sets no security headers (no CSP, HSTS or `X-Content-Type-Options`). That was
  not part of this work and is a gap for anything beyond a demo.
- **Streams through Container Apps ingress** were observed for about 285–290 s without a disconnect. Runs that last the full
  9–10 minutes, and the browser's reconnect-and-resume after an ingress cut, were not exercised in Azure (resume is covered by
  server and client tests).
- **Windows for the first cues of a session are shorter** than the setting, as described under Timing.
- **Accessibility and browsers.** The UI uses native controls, accessible names and `lang` attributes, but no screen-reader or axe
  audit was run, and the browser tests use Chromium only. Optional keyboard shortcuts were not built.
- **Telemetry.** The request telemetry records session IDs in URL paths (see above). Arrival in Application Insights was checked by
  querying its Log Analytics workspace, not in the portal, and no sampling or alerting was tuned.
