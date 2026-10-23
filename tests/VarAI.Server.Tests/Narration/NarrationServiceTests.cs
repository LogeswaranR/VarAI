using System.Collections.Concurrent;
using System.Diagnostics;
using System.Net;
using System.Text;
using System.Text.Json;
using Azure.Core;
using Microsoft.Extensions.Logging.Abstractions;
using VarAI.Server.Explanations;
using VarAI.Server.Feeds;
using VarAI.Server.Narration;
using VarAI.Server.Telemetry;
using VarAI.Server.Tests.Explanations;
using static VarAI.Server.Tests.Narration.NarrationTestData;

namespace VarAI.Server.Tests.Narration;

[TestClass]
public sealed class NarrationServiceTests
{
    public required TestContext TestContext { get; set; }

    [TestMethod]
    public async Task Disabled_NeverCallsAModelAndReturnsLabelledEnglish()
    {
        var model = new FakeModel((_, _, _) => throw new InvalidOperationException("Must not be called."));
        using var withModel = Create(model, new NarrationOptions { Enabled = false }, out _);
        using var withoutModel = Create(null, new NarrationOptions { Enabled = true }, out _);

        foreach (var service in new[] { withModel, withoutModel })
        {
            var narration = await service.GetAsync(Sprint, NarrationLanguage.Tamil, TestContext.CancellationToken);

            Assert.AreEqual(NarrationSources.Fallback, narration.Source);
            Assert.AreEqual(FallbackReasons.Disabled, narration.FallbackReason);
            Assert.AreEqual("ta", narration.RequestedLanguage);
            Assert.AreEqual("en", narration.Language, "A failed Tamil request is delivered as English and says so.");
            Assert.AreEqual(Sprint.Headline, narration.Text.Headline);
            Assert.AreEqual(Sprint.Detail, narration.Text.Fan);
            Assert.AreEqual(Sprint.WhyItMatters, narration.Text.Why);
            Assert.IsNull(narration.Usage);
            Assert.IsFalse(service.Status.Enabled);
        }

        Assert.AreEqual(0, model.Calls);
    }

    [TestMethod]
    public async Task Success_ReturnsVerifiedNarrationWithUsageAndRemembersIt()
    {
        var model = new FakeModel((_, _, _) => Task.FromResult(Ok(FaithfulEnglishSprint())));
        using var service = Create(model, new NarrationOptions { Enabled = true }, out _);

        var first = await service.GetAsync(Sprint, NarrationLanguage.English, TestContext.CancellationToken);
        var second = await service.GetAsync(Sprint, NarrationLanguage.English, TestContext.CancellationToken);

        Assert.AreEqual(NarrationSources.Ai, first.Source);
        Assert.IsNull(first.FallbackReason);
        Assert.AreEqual("en", first.Language);
        Assert.IsTrue(first.Verification!.Passed);
        Assert.AreEqual("Lorcan Vale powers forward with the ball", first.Text.Headline);
        Assert.AreEqual(new NarrationUsage("fictional-deployment", "fictional-model-2026", 1200, 300, 120, 1000, first.Usage!.LatencyMs), first.Usage);
        Assert.AreSame(first, second);
        Assert.AreEqual(1, model.Calls);
        Assert.AreEqual(1, service.Status.CallsUsed);
        Assert.AreEqual("fictional-deployment", service.Status.Deployment);
    }

    [TestMethod]
    public async Task TamilSuccessIsDeliveredAsTamil()
    {
        var model = new FakeModel((_, language, _) => Task.FromResult(Ok(language == NarrationLanguage.Tamil ? FaithfulTamilSprint() : FaithfulEnglishSprint())));
        using var service = Create(model, new NarrationOptions { Enabled = true }, out _);

        var tamil = await service.GetAsync(Sprint, NarrationLanguage.Tamil, TestContext.CancellationToken);
        var english = await service.GetAsync(Sprint, NarrationLanguage.English, TestContext.CancellationToken);

        Assert.AreEqual(NarrationSources.Ai, tamil.Source);
        Assert.AreEqual("ta", tamil.Language);
        Assert.AreEqual("en", english.Language);
        Assert.AreEqual(2, model.Calls, "One call per cue and language.");
    }

    [TestMethod]
    public async Task VerifierFailure_FallsBackWithEvidenceAndRetriesAtMostOnce()
    {
        var model = new FakeModel((_, _, _) => Task.FromResult(Ok(Json("Lorcan Vale powers forward", "He covers 22 m.", "21.6 m at 7.3 m/s.", "Above the 7 m/s threshold."))));
        using var service = Create(model, new NarrationOptions { Enabled = true }, out var time);

        var first = await service.GetAsync(Sprint, NarrationLanguage.English, TestContext.CancellationToken);
        Assert.AreEqual(NarrationSources.Fallback, first.Source);
        Assert.AreEqual(FallbackReasons.VerifierFailed, first.FallbackReason);
        Assert.IsFalse(first.Verification!.Passed);
        Assert.IsTrue(first.Verification.Failures.Any(failure => failure.Check == NarrationVerifier.Numbers));
        Assert.AreEqual(1200, first.Usage!.PromptTokens, "A rejected call still reports what it cost.");
        Assert.AreEqual(Sprint.Headline, first.Text.Headline, "The fallback text is the deterministic cue text.");

        Assert.AreSame(first, await service.GetAsync(Sprint, NarrationLanguage.English, TestContext.CancellationToken));
        Assert.AreEqual(1, model.Calls, "Failures are remembered, not retried immediately.");

        time.Advance(TimeSpan.FromSeconds(61));
        var retry = await service.GetAsync(Sprint, NarrationLanguage.English, TestContext.CancellationToken);
        Assert.AreEqual(FallbackReasons.VerifierFailed, retry.FallbackReason);
        Assert.AreEqual(2, model.Calls);

        time.Advance(TimeSpan.FromSeconds(61));
        await service.GetAsync(Sprint, NarrationLanguage.English, TestContext.CancellationToken);
        Assert.AreEqual(2, model.Calls, "No third attempt for the same cue and language.");
    }

    [TestMethod]
    public async Task ARetryThatSucceedsReplacesTheFallback()
    {
        var attempt = 0;
        var model = new FakeModel((_, _, _) => Task.FromResult(Ok(
            Interlocked.Increment(ref attempt) == 1 ? "not json" : FaithfulEnglishSprint())));
        using var service = Create(model, new NarrationOptions { Enabled = true }, out var time);

        var first = await service.GetAsync(Sprint, NarrationLanguage.English, TestContext.CancellationToken);
        Assert.AreEqual(FallbackReasons.InvalidOutput, first.FallbackReason);

        time.Advance(TimeSpan.FromSeconds(61));
        var second = await service.GetAsync(Sprint, NarrationLanguage.English, TestContext.CancellationToken);
        Assert.AreEqual(NarrationSources.Ai, second.Source);
    }

    [TestMethod]
    public async Task TransportFailuresFallBackAndThreeInARowStartACooldown()
    {
        var model = new FakeModel((_, _, _) => throw new AzureOpenAiChatException(AzureOpenAiChatFailure.Unavailable));
        using var service = Create(model, new NarrationOptions { Enabled = true }, out var time);
        var cues = Timeline.Overlays.Take(6).ToArray();

        for (var index = 0; index < 3; index++)
        {
            var narration = await service.GetAsync(cues[index], NarrationLanguage.English, TestContext.CancellationToken);
            Assert.AreEqual(FallbackReasons.Unavailable, narration.FallbackReason);
        }

        Assert.AreEqual(3, model.Calls);
        Assert.IsTrue(service.Status.CoolingDown);

        var cooled = await service.GetAsync(cues[3], NarrationLanguage.English, TestContext.CancellationToken);
        Assert.AreEqual(FallbackReasons.Cooldown, cooled.FallbackReason);
        Assert.AreEqual(3, model.Calls, "No model call is made during the cool-down.");

        time.Advance(TimeSpan.FromSeconds(61));
        Assert.IsFalse(service.Status.CoolingDown);
        await service.GetAsync(cues[4], NarrationLanguage.English, TestContext.CancellationToken);
        Assert.AreEqual(4, model.Calls);
    }

    [TestMethod]
    public async Task ASuccessfulCallResetsTheConsecutiveFailureCount()
    {
        var fail = true;
        var model = new FakeModel((_, _, _) => fail
            ? throw new AzureOpenAiChatException(AzureOpenAiChatFailure.Unavailable)
            : Task.FromResult(Ok("{}")));
        using var service = Create(model, new NarrationOptions { Enabled = true }, out _);
        var cues = Timeline.Overlays.Take(8).ToArray();

        await service.GetAsync(cues[0], NarrationLanguage.English, TestContext.CancellationToken);
        await service.GetAsync(cues[1], NarrationLanguage.English, TestContext.CancellationToken);
        fail = false;
        await service.GetAsync(cues[2], NarrationLanguage.English, TestContext.CancellationToken);
        fail = true;
        await service.GetAsync(cues[3], NarrationLanguage.English, TestContext.CancellationToken);
        await service.GetAsync(cues[4], NarrationLanguage.English, TestContext.CancellationToken);

        Assert.IsFalse(service.Status.CoolingDown, "Failures were never three in a row.");
    }

    [TestMethod]
    public async Task TheProcessWideCallBudgetIsEnforced()
    {
        var model = new FakeModel((_, _, _) => Task.FromResult(Ok(FaithfulEnglishSprint())));
        using var service = Create(model, new NarrationOptions { Enabled = true, MaxModelCalls = 2 }, out _);
        var cues = Timeline.Overlays.Take(3).ToArray();

        var results = new List<CueNarration>();
        foreach (var cue in cues)
        {
            results.Add(await service.GetAsync(cue, NarrationLanguage.English, TestContext.CancellationToken));
        }

        Assert.AreEqual(2, model.Calls);
        Assert.AreEqual(FallbackReasons.BudgetExhausted, results[2].FallbackReason);
        Assert.AreEqual(2, service.Status.CallsUsed);
        Assert.AreEqual(2, service.Status.CallLimit);

        var again = await service.GetAsync(cues[2], NarrationLanguage.English, TestContext.CancellationToken);
        Assert.AreSame(results[2], again, "An exhausted budget is final, not retried.");
        Assert.AreEqual(2, model.Calls);
    }

    [TestMethod]
    public async Task ModelConcurrencyIsBounded()
    {
        var release = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var model = new FakeModel(async (facts, _, _) =>
        {
            await release.Task;
            return Ok(Json("x", "y", "z", "w"));
        });
        using var service = Create(model, new NarrationOptions { Enabled = true, MaxConcurrency = 2 }, out _);
        var pending = Timeline.Overlays.Take(6).Select(cue => service.GetAsync(cue, NarrationLanguage.English, TestContext.CancellationToken)).ToArray();

        await WaitUntil(() => model.Running == 2);
        await Task.Delay(100, TestContext.CancellationToken);
        Assert.AreEqual(2, model.Running, "Only two model calls run at once.");

        release.SetResult();
        await Task.WhenAll(pending);
        Assert.AreEqual(6, model.Calls);
        Assert.AreEqual(2, model.Peak);
    }

    [TestMethod]
    public async Task CallTimeoutFallsBackAndCountsAsAFailure()
    {
        var started = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var model = new FakeModel(async (_, _, token) =>
        {
            started.TrySetResult();
            await Task.Delay(Timeout.InfiniteTimeSpan, token);
            return Ok("{}");
        });
        using var service = Create(model, new NarrationOptions { Enabled = true, CallTimeout = TimeSpan.FromSeconds(30) }, out var time);

        var pending = service.GetAsync(Sprint, NarrationLanguage.English, TestContext.CancellationToken);
        await started.Task.WaitAsync(TimeSpan.FromSeconds(10), TestContext.CancellationToken);
        Assert.IsFalse(pending.IsCompleted);
        time.Advance(TimeSpan.FromSeconds(31));
        var narration = await pending.WaitAsync(TimeSpan.FromSeconds(10), TestContext.CancellationToken);

        Assert.AreEqual(FallbackReasons.Timeout, narration.FallbackReason);
        Assert.AreEqual(Sprint.Headline, narration.Text.Headline);
    }

    [TestMethod]
    public async Task WaitingTooLongForAModelSlotFallsBack()
    {
        var release = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var model = new FakeModel(async (_, _, _) =>
        {
            await release.Task;
            return Ok(FaithfulEnglishSprint());
        });
        using var service = Create(model, new NarrationOptions { Enabled = true, MaxConcurrency = 1, QueueTimeout = TimeSpan.FromSeconds(10) }, out var time);
        var first = service.GetAsync(Sprint, NarrationLanguage.English, TestContext.CancellationToken);
        await WaitUntil(() => model.Running == 1);

        var queued = service.GetAsync(Shot, NarrationLanguage.English, TestContext.CancellationToken);
        await Task.Delay(50, TestContext.CancellationToken);
        time.Advance(TimeSpan.FromSeconds(11));
        var narration = await queued.WaitAsync(TimeSpan.FromSeconds(10), TestContext.CancellationToken);

        Assert.AreEqual(FallbackReasons.Timeout, narration.FallbackReason);
        Assert.AreEqual(1, model.Calls, "The queued request never reached the model.");
        release.SetResult();
        await first;
    }

    [TestMethod]
    public async Task ACallerThatStopsWaitingDoesNotCancelTheSharedGeneration()
    {
        var release = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var model = new FakeModel(async (_, _, _) =>
        {
            await release.Task;
            return Ok(FaithfulEnglishSprint());
        });
        using var service = Create(model, new NarrationOptions { Enabled = true }, out _);
        using var impatient = new CancellationTokenSource();

        var cancelled = service.GetAsync(Sprint, NarrationLanguage.English, impatient.Token);
        await WaitUntil(() => model.Running == 1);
        impatient.Cancel();
        await Assert.ThrowsAsync<OperationCanceledException>(() => cancelled);

        var patient = service.GetAsync(Sprint, NarrationLanguage.English, TestContext.CancellationToken);
        release.SetResult();
        var narration = await patient;

        Assert.AreEqual(NarrationSources.Ai, narration.Source);
        Assert.AreEqual(1, model.Calls, "Both callers shared one model call.");
    }

    [TestMethod]
    public async Task ConcurrentRequestsForTheSameNarrationShareOneModelCall()
    {
        var model = new FakeModel(async (_, _, _) =>
        {
            await Task.Delay(50);
            return Ok(FaithfulEnglishSprint());
        });
        using var service = Create(model, new NarrationOptions { Enabled = true }, out _);

        var results = await Task.WhenAll(Enumerable.Range(0, 20)
            .Select(_ => service.GetAsync(Sprint, NarrationLanguage.English, TestContext.CancellationToken)));

        Assert.AreEqual(1, model.Calls);
        Assert.IsTrue(results.All(result => ReferenceEquals(result, results[0])));
    }

    [TestMethod]
    public async Task EachCallEmitsASpanWithModelTokensLatencyAndVerifierVerdict()
    {
        var spans = new ConcurrentBag<Activity>();
        using var testSource = new ActivitySource("VarAI.Tests.Narration");
        using var listener = new ActivityListener
        {
            ShouldListenTo = source => source.Name == VarAiTelemetry.SourceName || source.Name == testSource.Name,
            Sample = (ref ActivityCreationOptions<ActivityContext> _) => ActivitySamplingResult.AllDataAndRecorded,
            ActivityStopped = spans.Add,
        };
        ActivitySource.AddActivityListener(listener);
        using var root = testSource.StartActivity("test-root")!;
        var model = new FakeModel((facts, _, _) => Task.FromResult(Ok(
            facts.CueId == Sprint.OverlayId ? FaithfulEnglishSprint() : Json("x", "He covers 99 m.", "y", "z"))));
        using var service = Create(model, new NarrationOptions { Enabled = true }, out _);

        await service.GetAsync(Sprint, NarrationLanguage.English, TestContext.CancellationToken);
        await service.GetAsync(Shot, NarrationLanguage.English, TestContext.CancellationToken);

        var mine = spans.Where(span => span.TraceId == root.TraceId).ToArray();
        var accepted = mine.Single(span => span.GetTagItem("varai.cue.id") as string == Sprint.OverlayId);
        Assert.AreEqual("narration.generate", accepted.OperationName);
        Assert.AreEqual("fictional-deployment", accepted.GetTagItem("gen_ai.request.model"));
        Assert.AreEqual("fictional-model-2026", accepted.GetTagItem("gen_ai.response.model"));
        Assert.AreEqual(1200, accepted.GetTagItem("gen_ai.usage.input_tokens"));
        Assert.AreEqual(300, accepted.GetTagItem("gen_ai.usage.output_tokens"));
        Assert.AreEqual(120, accepted.GetTagItem("varai.usage.reasoning_tokens"));
        Assert.IsTrue((bool?)accepted.GetTagItem("varai.verifier.passed"));
        Assert.AreEqual("AI", accepted.GetTagItem("varai.narration.source"));
        Assert.AreEqual("en", accepted.GetTagItem("varai.language"));
        Assert.IsNotNull(accepted.GetTagItem("varai.latency_ms"));

        var rejected = mine.Single(span => span.GetTagItem("varai.cue.id") as string == Shot.OverlayId);
        Assert.IsFalse((bool?)rejected.GetTagItem("varai.verifier.passed"));
        Assert.AreEqual("numbers", rejected.GetTagItem("varai.verifier.failed_checks"));
        Assert.AreEqual("FALLBACK", rejected.GetTagItem("varai.narration.source"));
        Assert.AreEqual("VERIFIER_FAILED", rejected.GetTagItem("varai.narration.fallback_reason"));
    }

    [TestMethod]
    public async Task EndToEndThroughTheHttpTransportSendsOnlyFactsAndABearerToken()
    {
        const string endpoint = "https://fictional-narration-test.openai.azure.com";
        var handler = new RecordingHandler(async (request, token) =>
        {
            Assert.AreEqual(HttpMethod.Post, request.Method);
            Assert.AreEqual(endpoint + "/openai/v1/chat/completions", request.RequestUri!.AbsoluteUri);
            Assert.AreEqual("Bearer", request.Headers.Authorization!.Scheme);
            Assert.AreEqual("FICTITIOUS_ENTRA_TOKEN", request.Headers.Authorization.Parameter);
            Assert.IsFalse(request.Headers.Contains("api-key"));
            var text = await request.Content!.ReadAsStringAsync(token);
            Assert.DoesNotContain("FICTITIOUS_ENTRA_TOKEN", text);
            using var document = JsonDocument.Parse(text);
            var body = document.RootElement;
            Assert.AreEqual("fictional-deployment", body.GetProperty("model").GetString());
            Assert.AreEqual(2_048, body.GetProperty("max_completion_tokens").GetInt32());
            Assert.IsFalse(body.GetProperty("store").GetBoolean());
            Assert.IsFalse(body.TryGetProperty("response_format", out _));
            Assert.IsFalse(body.TryGetProperty("reasoning_effort", out _));
            var messages = body.GetProperty("messages");
            Assert.AreEqual(2, messages.GetArrayLength());
            var system = messages[0].GetProperty("content").GetString()!;
            Assert.Contains("SYNTHETIC", system);
            Assert.Contains("Write in Tamil", system);
            Assert.Contains("Keep person names", system);
            var user = JsonDocument.Parse(messages[1].GetProperty("content").GetString()!).RootElement;
            Assert.AreEqual("Tamil", user.GetProperty("targetLanguage").GetString());
            var facts = user.GetProperty("facts");
            Assert.AreEqual(Sprint.OverlayId, facts.GetProperty("cue").GetProperty("id").GetString());
            Assert.AreEqual(Sprint.Headline, facts.GetProperty("reference").GetProperty("headline").GetString());
            Assert.AreEqual("Lorcan Vale", facts.GetProperty("players")[0].GetProperty("name").GetString());
            return new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent(JsonSerializer.Serialize(new
                {
                    model = "fictional-model-2026",
                    choices = new[] { new { index = 0, finish_reason = "stop", message = new { role = "assistant", content = FaithfulTamilSprint() } } },
                    usage = new { prompt_tokens = 900, completion_tokens = 640, total_tokens = 1540, completion_tokens_details = new { reasoning_tokens = 0 } },
                }), Encoding.UTF8, "application/json"),
            };
        });
        var configuration = new AzureOpenAiConfiguration(endpoint, "fictional-deployment", null)
        {
            Credential = AzureOpenAiCredentialKind.ManagedIdentity,
        };
        var time = new ManualTimeProvider();
        using var authorizer = new BearerTokenAuthorizer(new StaticCredential("FICTITIOUS_ENTRA_TOKEN"), AzureOpenAiConfiguration.DefaultTokenScope, time);
        var model = new AzureOpenAiNarrationModel(new AzureOpenAiChatClient(configuration, handler, authorizer));
        using var service = new NarrationService(Factory, model, new NarrationOptions { Enabled = true }, time, NullLogger<NarrationService>.Instance);

        var narration = await service.GetAsync(Sprint, NarrationLanguage.Tamil, TestContext.CancellationToken);

        Assert.AreEqual(NarrationSources.Ai, narration.Source);
        Assert.AreEqual("ta", narration.Language);
        Assert.AreEqual(900, narration.Usage!.PromptTokens);
        Assert.AreEqual(640, narration.Usage.CompletionTokens);
        Assert.AreEqual(1, handler.Calls);
        Assert.AreEqual("fictional-deployment", service.Status.Deployment);
    }

    [TestMethod]
    public async Task ConfiguredReasoningEffortReachesTheRequest()
    {
        const string endpoint = "https://fictional-narration-test.openai.azure.com";
        string? seen = null;
        var handler = new RecordingHandler(async (request, token) =>
        {
            using var document = JsonDocument.Parse(await request.Content!.ReadAsStringAsync(token));
            seen = document.RootElement.GetProperty("reasoning_effort").GetString();
            return new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent(JsonSerializer.Serialize(new
                {
                    choices = new[] { new { index = 0, finish_reason = "stop", message = new { role = "assistant", content = FaithfulEnglishSprint() } } },
                }), Encoding.UTF8, "application/json"),
            };
        });
        var configuration = new AzureOpenAiConfiguration(endpoint, "fictional-deployment", null)
        {
            Credential = AzureOpenAiCredentialKind.ManagedIdentity,
        };
        var time = new ManualTimeProvider();
        using var authorizer = new BearerTokenAuthorizer(new StaticCredential("FICTITIOUS_ENTRA_TOKEN"), AzureOpenAiConfiguration.DefaultTokenScope, time);
        var model = new AzureOpenAiNarrationModel(new AzureOpenAiChatClient(configuration, handler, authorizer), "low");
        using var service = new NarrationService(Factory, model, new NarrationOptions { Enabled = true }, time, NullLogger<NarrationService>.Instance);

        var narration = await service.GetAsync(Sprint, NarrationLanguage.English, TestContext.CancellationToken);

        Assert.AreEqual(NarrationSources.Ai, narration.Source);
        Assert.AreEqual("low", seen);
    }

    [TestMethod]
    public void OptionsRejectValuesThatWouldRemoveTheSafetyLimits()
    {
        Assert.Throws<ArgumentOutOfRangeException>(() => new NarrationOptions { MaxConcurrency = 0 }.Validate());
        Assert.Throws<ArgumentOutOfRangeException>(() => new NarrationOptions { MaxModelCalls = -1 }.Validate());
        Assert.Throws<ArgumentOutOfRangeException>(() => new NarrationOptions { CallTimeout = TimeSpan.Zero }.Validate());
        Assert.Throws<ArgumentOutOfRangeException>(() => new NarrationOptions { MaxAttemptsPerNarration = 0 }.Validate());
        Assert.Throws<ArgumentOutOfRangeException>(() => new NarrationOptions { ReasoningEffort = "turbo" }.Validate());
        new NarrationOptions().Validate();
    }

    [TestMethod]
    public void ReasoningEffortIsOptionalTrimmedAndLowerCase()
    {
        var padded = new NarrationOptions { ReasoningEffort = " Low " };
        padded.Validate();

        Assert.AreEqual("low", padded.NormalisedReasoningEffort);
        Assert.IsNull(new NarrationOptions().NormalisedReasoningEffort);
        Assert.IsNull(new NarrationOptions { ReasoningEffort = "  " }.NormalisedReasoningEffort);
    }

    [TestMethod]
    public void PublicNarrationNeverCarriesUsageOrVerifierDetails()
    {
        var narration = new CueNarration("c", "ta", "ta", NarrationSources.Ai, null, new NarrationText("h", "f", "a", "w"),
            new NarrationVerdict(true, [], []), new NarrationUsage("d", "m", 1, 2, 3, 4, 5));

        var json = JsonSerializer.Serialize(narration.ToPublic());

        Assert.DoesNotContain("usage", json, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("verification", json, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("promptTokens", json, StringComparison.OrdinalIgnoreCase);
    }

    private static NarrationService Create(INarrationModel? model, NarrationOptions options, out ManualTimeProvider time)
    {
        time = new ManualTimeProvider();
        return new NarrationService(Factory, model, options, time, NullLogger<NarrationService>.Instance);
    }

    private static NarrationModelResult Ok(string json) =>
        new(json, new ChatUsage(1200, 300, 120, 1000), "fictional-model-2026");

    private static async Task WaitUntil(Func<bool> condition)
    {
        var deadline = Stopwatch.StartNew();
        while (!condition())
        {
            Assert.IsLessThan(10_000, deadline.ElapsedMilliseconds, "Timed out waiting for a condition.");
            await Task.Delay(5);
        }
    }

    private sealed class FakeModel(Func<NarrationFacts, NarrationLanguage, CancellationToken, Task<NarrationModelResult>> respond) : INarrationModel
    {
        private int calls;
        private int running;
        private int peak;

        public string Deployment => "fictional-deployment";
        public int Calls => Volatile.Read(ref calls);
        public int Running => Volatile.Read(ref running);
        public int Peak => Volatile.Read(ref peak);

        public async Task<NarrationModelResult> GenerateAsync(NarrationFacts facts, NarrationLanguage language, CancellationToken cancellationToken)
        {
            Interlocked.Increment(ref calls);
            var now = Interlocked.Increment(ref running);
            int seen;
            while (now > (seen = Volatile.Read(ref peak)) && Interlocked.CompareExchange(ref peak, now, seen) != seen)
            {
            }

            try
            {
                return await respond(facts, language, cancellationToken);
            }
            finally
            {
                Interlocked.Decrement(ref running);
            }
        }
    }

    private sealed class RecordingHandler(Func<HttpRequestMessage, CancellationToken, Task<HttpResponseMessage>> respond) : HttpMessageHandler
    {
        private int calls;
        public int Calls => Volatile.Read(ref calls);

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Interlocked.Increment(ref calls);
            return respond(request, cancellationToken);
        }
    }

    private sealed class StaticCredential(string token) : TokenCredential
    {
        public override AccessToken GetToken(TokenRequestContext requestContext, CancellationToken cancellationToken) =>
            throw new NotSupportedException();

        public override ValueTask<AccessToken> GetTokenAsync(TokenRequestContext requestContext, CancellationToken cancellationToken) =>
            ValueTask.FromResult(new AccessToken(token, DateTimeOffset.UnixEpoch.AddYears(80)));
    }
}
