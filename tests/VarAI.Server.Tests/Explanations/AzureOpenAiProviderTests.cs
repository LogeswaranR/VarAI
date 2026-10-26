using System.Net;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using VarAI.Contracts;
using VarAI.Server.Explanations;
using static VarAI.Server.Tests.Explanations.ExplanationFixtures;

namespace VarAI.Server.Tests.Explanations;

[TestClass]
public sealed class AzureOpenAiProviderTests
{
    private const string Endpoint = "https://fictional-var105-test.openai.azure.com";
    private const string Deployment = "fictional-deployment-not-a-coding-worker-model";
    private const string ApiKey = "FICTITIOUS_TEST_KEY_NOT_A_REAL_SECRET";
    public required TestContext TestContext { get; set; }

    public static IEnumerable<object[]> Matrix =>
        from id in Enum.GetValues<ScenarioId>()
        from audience in Enum.GetValues<Audience>()
        select new object[] { id, audience };

    [TestMethod]
    [DynamicData(nameof(Matrix))]
    public async Task GenerateAsync_UsesApprovedV1ShapeAndRealServiceValidation(ScenarioId id, Audience audience)
    {
        var scenario = Scenario(id);
        var handler = new Handler
        {
            Respond = async (request, token) =>
            {
                Assert.AreEqual(HttpMethod.Post, request.Method);
                Assert.AreEqual(Endpoint + "/openai/v1/chat/completions", request.RequestUri!.AbsoluteUri);
                Assert.AreEqual("application/json", request.Content!.Headers.ContentType!.MediaType);
                Assert.AreEqual(ApiKey, request.Headers.GetValues("api-key").Single());
                Assert.IsFalse(request.Headers.Contains("authorization"));
                var text = await request.Content.ReadAsStringAsync(token);
                Assert.DoesNotContain(ApiKey, text);
                using var document = JsonDocument.Parse(text);
                var body = document.RootElement;
                Assert.AreEqual(Deployment, body.GetProperty("model").GetString());
                Assert.AreEqual(1, body.GetProperty("n").GetInt32());
                Assert.IsFalse(body.GetProperty("stream").GetBoolean());
                Assert.IsFalse(body.GetProperty("store").GetBoolean());
                Assert.AreEqual(2_048, body.GetProperty("max_completion_tokens").GetInt32());
                Assert.IsFalse(body.TryGetProperty("response_format", out _));
                Assert.IsFalse(body.TryGetProperty("tools", out _));
                Assert.IsFalse(body.TryGetProperty("temperature", out _));
                var messages = body.GetProperty("messages");
                Assert.AreEqual(2, messages.GetArrayLength());
                Assert.AreEqual("system", messages[0].GetProperty("role").GetString());
                var instructions = messages[0].GetProperty("content").GetString()!;
                Assert.Contains(ContractRules.ExplanationWordLimit(audience).ToString(), instructions);
                Assert.Contains(ExplanationOutputValidator.SyntheticLimitation, instructions);
                Assert.AreEqual("user", messages[1].GetProperty("role").GetString());
                var supplied = ContractJson.Read<GenerationInput>(messages[1].GetProperty("content").GetString()!);
                Assert.AreEqual(id, supplied.ScenarioId);
                Assert.AreEqual(audience, supplied.Audience);
                Assert.AreEqual(OriginalDecision.GoalAwarded, supplied.OriginalDecision);
                Assert.AreEqual(scenario.SuppliedReviewOutcome, supplied.SuppliedReviewOutcome);
                Assert.AreEqual(scenario.ScoreAfterReview, supplied.ScoreAfterReview);
                CollectionAssert.AreEqual(scenario.Facts.ToArray(), supplied.Facts.ToArray());
                CollectionAssert.AreEqual(scenario.Rules.ToArray(), supplied.Rules.ToArray());
                return Response(Raw(scenario, audience));
            }
        };
        using var adapter = new AzureOpenAiExplanationProvider(Configuration(), handler);
        var request = Request(id, audience);
        var result = Assert.IsInstanceOfType<ExplanationSuccess>(
            await Service(provider: adapter).ExplainAsync(request, TestContext.CancellationToken));
        ContractRules.Success(result, request, scenario);
        Assert.AreEqual(1, handler.Calls);
    }

    [TestMethod]
    [DataRow("endpoint-null")]
    [DataRow("deployment-null")]
    [DataRow("key-null")]
    [DataRow("endpoint-http")]
    [DataRow("endpoint-foreign")]
    [DataRow("endpoint-suffix-attack")]
    [DataRow("endpoint-userinfo")]
    [DataRow("endpoint-query")]
    [DataRow("endpoint-fragment")]
    [DataRow("endpoint-v1-path")]
    [DataRow("endpoint-port")]
    [DataRow("endpoint-nested-host")]
    [DataRow("key-newline")]
    [DataRow("key-whitespace")]
    [DataRow("deployment-newline")]
    [DataRow("token-limit")]
    public async Task GenerateAsync_InvalidOrMissingServerConfigurationDoesNotSend(string invalid)
    {
        var endpoint = invalid switch
        {
            "endpoint-null" => null,
            "endpoint-http" => Endpoint.Replace("https:", "http:", StringComparison.Ordinal),
            "endpoint-foreign" => "https://fictional.example.invalid",
            "endpoint-suffix-attack" => Endpoint + ".example.invalid",
            "endpoint-userinfo" => "https://user:fictional@fictional-var105-test.openai.azure.com",
            "endpoint-query" => Endpoint + "?credential=fictional",
            "endpoint-fragment" => Endpoint + "#fragment",
            "endpoint-v1-path" => Endpoint + "/openai/v1/",
            "endpoint-port" => Endpoint + ":8443",
            "endpoint-nested-host" => "https://nested.fictional-var105-test.openai.azure.com",
            _ => Endpoint
        };
        var deployment = invalid switch
        {
            "deployment-null" => null,
            "deployment-newline" => "fictional\r\ndeployment",
            _ => Deployment
        };
        var key = invalid switch
        {
            "key-null" => null,
            "key-newline" => "fictional\r\ninjected-header:value",
            "key-whitespace" => " ",
            _ => ApiKey
        };
        var handler = new Handler();
        using var adapter = new AzureOpenAiExplanationProvider(
            new(endpoint, deployment, key, invalid == "token-limit" ? 0 : 2_048), handler);
        Error(await Service(provider: adapter).ExplainAsync(Request(), TestContext.CancellationToken), ErrorCode.ModelNotConfigured);
        Assert.AreEqual(0, handler.Calls);
    }

    [TestMethod]
    [DataRow(301)]
    [DataRow(302)]
    [DataRow(303)]
    [DataRow(307)]
    [DataRow(308)]
    [DataRow(400)]
    [DataRow(401)]
    [DataRow(403)]
    [DataRow(404)]
    [DataRow(408)]
    [DataRow(429)]
    [DataRow(500)]
    [DataRow(503)]
    public async Task GenerateAsync_ProviderErrorsAndRedirectsNeverRetryLeakOrFallBack(int status)
    {
        var handler = new Handler
        {
            Respond = (_, _) =>
            {
                var response = new HttpResponseMessage((HttpStatusCode)status)
                {
                    Content = new StringContent("FICTITIOUS_PROVIDER_ERROR_BODY_AND_SECRET", Encoding.UTF8, "application/json")
                };
                response.Headers.Location = new Uri("https://redirect-target.example.invalid");
                response.Headers.RetryAfter = new System.Net.Http.Headers.RetryConditionHeaderValue(TimeSpan.FromSeconds(1));
                return Task.FromResult(response);
            }
        };
        using var adapter = new AzureOpenAiExplanationProvider(Configuration(), handler);
        Error(await Service(provider: adapter).ExplainAsync(Request(), TestContext.CancellationToken), ErrorCode.ModelUnavailable);
        Assert.AreEqual(1, handler.Calls);
    }

    [TestMethod]
    [DataRow("json")]
    [DataRow("null")]
    [DataRow("empty-choices")]
    [DataRow("multiple-choices")]
    [DataRow("wrong-index")]
    [DataRow("length")]
    [DataRow("content-filter")]
    [DataRow("missing-finish")]
    [DataRow("wrong-role")]
    [DataRow("null-content")]
    [DataRow("empty-content")]
    [DataRow("array-content")]
    [DataRow("refusal")]
    [DataRow("tool-calls")]
    [DataRow("function-call")]
    [DataRow("filtered")]
    [DataRow("duplicate")]
    [DataRow("error-with-choices")]
    [DataRow("too-many-characters")]
    [DataRow("malformed-inner-json")]
    [DataRow("wrong-provenance")]
    public async Task GenerateAsync_MalformedTruncatedOrRefusedResponseIsInvalidOutput(string invalid)
    {
        var node = JsonNode.Parse(Envelope(Raw(Scenario(), Audience.Casual)))!;
        var choice = node["choices"]![0]!;
        var message = choice["message"]!;
        switch (invalid)
        {
            case "empty-choices": node["choices"] = new JsonArray(); break;
            case "multiple-choices": node["choices"]!.AsArray().Add(choice.DeepClone()); break;
            case "wrong-index": choice["index"] = 1; break;
            case "length": choice["finish_reason"] = "length"; break;
            case "content-filter": choice["finish_reason"] = "content_filter"; break;
            case "missing-finish": choice.AsObject().Remove("finish_reason"); break;
            case "wrong-role": message["role"] = "user"; break;
            case "null-content": message["content"] = null; break;
            case "empty-content": message["content"] = " "; break;
            case "array-content": message["content"] = new JsonArray(); break;
            case "refusal": message["refusal"] = "Cannot provide a response."; break;
            case "tool-calls": message["tool_calls"] = new JsonArray(new JsonObject { ["id"] = "unrequested-tool" }); break;
            case "function-call": message["function_call"] = new JsonObject { ["name"] = "unrequested-function" }; break;
            case "filtered": choice["content_filter_results"] = new JsonObject { ["hate"] = new JsonObject { ["filtered"] = true } }; break;
            case "error-with-choices": node["error"] = new JsonObject { ["message"] = "FICTITIOUS_ERROR" }; break;
            case "too-many-characters": message["content"] = new string('x', ExplanationOutputValidator.MaximumOutputCharacters + 1); break;
            case "malformed-inner-json": message["content"] = "{FICTITIOUS_MALFORMED_PAYLOAD"; break;
            case "wrong-provenance":
                message["content"] = ContractJson.Write(Output(Scenario(), Audience.Casual) with { SourceMode = SourceMode.Authored });
                break;
        }
        var envelope = invalid switch
        {
            "json" => "{FICTITIOUS_MALFORMED_ENVELOPE",
            "null" => "null",
            "duplicate" => node.ToJsonString().Replace("\"index\":0", "\"index\":0,\"index\":0", StringComparison.Ordinal),
            _ => node.ToJsonString()
        };
        var handler = new Handler { Respond = (_, _) => Task.FromResult(JsonResponse(envelope)) };
        using var adapter = new AzureOpenAiExplanationProvider(Configuration(), handler);
        Error(await Service(provider: adapter).ExplainAsync(Request(), TestContext.CancellationToken), ErrorCode.InvalidOutput);
        Assert.AreEqual(1, handler.Calls);
    }

    [TestMethod]
    [DataRow(false)]
    [DataRow(true)]
    public async Task GenerateAsync_BoundedResponseReadsRejectKnownAndUnknownOversizeBodies(bool knownLength)
    {
        var bytes = Encoding.UTF8.GetBytes(new string(' ', AzureOpenAiExplanationProvider.MaximumResponseBytes + 1));
        var handler = new Handler
        {
            Respond = (_, _) =>
            {
                HttpContent content = knownLength ? new ByteArrayContent(bytes) : new StreamContent(new NonSeekableStream(bytes));
                content.Headers.ContentType = new("application/json");
                return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = content });
            }
        };
        using var adapter = new AzureOpenAiExplanationProvider(Configuration(), handler);
        Error(await Service(provider: adapter).ExplainAsync(Request(), TestContext.CancellationToken), ErrorCode.InvalidOutput);
        Assert.AreEqual(1, handler.Calls);
    }

    [TestMethod]
    [DataRow(204, "application/json")]
    [DataRow(200, "text/html")]
    [DataRow(200, "text/event-stream")]
    public async Task GenerateAsync_UnexpectedSuccessfulTransportShapeIsInvalidOutput(int status, string mediaType)
    {
        var handler = new Handler
        {
            Respond = (_, _) => Task.FromResult(new HttpResponseMessage((HttpStatusCode)status)
            {
                Content = new StringContent(Envelope(Raw(Scenario(), Audience.Casual)), Encoding.UTF8, mediaType)
            })
        };
        using var adapter = new AzureOpenAiExplanationProvider(Configuration(), handler);
        Error(await Service(provider: adapter).ExplainAsync(Request(), TestContext.CancellationToken), ErrorCode.InvalidOutput);
    }

    [TestMethod]
    public async Task GenerateAsync_TransportExceptionsAreSanitized()
    {
        var handler = new Handler
        {
            Respond = (_, _) => throw new HttpRequestException("FICTITIOUS_URI_AND_SECRET_DO_NOT_RETURN")
        };
        using var adapter = new AzureOpenAiExplanationProvider(Configuration(), handler);
        Error(await Service(provider: adapter).ExplainAsync(Request(), TestContext.CancellationToken), ErrorCode.ModelUnavailable);
        Assert.AreEqual(1, handler.Calls);
    }

    [TestMethod]
    public async Task GenerateAsync_ServiceDeadlineCancelsHttpSendWithoutRetries()
    {
        var clock = new ManualTimeProvider();
        var exited = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var handler = new Handler
        {
            Respond = async (_, token) =>
            {
                try
                {
                    await Task.Delay(Timeout.InfiniteTimeSpan, token);
                    return Response("unreachable");
                }
                finally
                {
                    exited.TrySetResult();
                }
            }
        };
        using var adapter = new AzureOpenAiExplanationProvider(Configuration(), handler);
        var pending = Service(provider: adapter, clock: clock).ExplainAsync(Request(), TestContext.CancellationToken);
        Assert.AreEqual(1, handler.Calls);
        clock.Advance(TimeSpan.FromSeconds(15));
        Error(await pending, ErrorCode.Timeout);
        await exited.Task.WaitAsync(TestContext.CancellationToken);
        Assert.IsTrue(handler.LastToken.IsCancellationRequested);
        Assert.AreEqual(1, handler.Calls);
    }

    [TestMethod]
    public async Task GenerateAsync_ServiceDeadlineIncludesResponseBodyRead()
    {
        var clock = new ManualTimeProvider();
        using var stream = new CancellationReadStream();
        var handler = new Handler
        {
            Respond = (_, _) =>
            {
                var content = new StreamContent(stream);
                content.Headers.ContentType = new("application/json");
                return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = content });
            }
        };
        using var adapter = new AzureOpenAiExplanationProvider(Configuration(), handler);
        var pending = Service(provider: adapter, clock: clock).ExplainAsync(Request(), TestContext.CancellationToken);
        await stream.Started.Task.WaitAsync(TestContext.CancellationToken);
        clock.Advance(TimeSpan.FromSeconds(15));
        Error(await pending, ErrorCode.Timeout);
        await stream.Exited.Task.WaitAsync(TestContext.CancellationToken);
        Assert.IsTrue(stream.LastToken.IsCancellationRequested);
        Assert.AreEqual(1, handler.Calls);
    }

    [TestMethod]
    public async Task GenerateAsync_AdapterAndServicePropagateCallerCancellation()
    {
        using var caller = CancellationTokenSource.CreateLinkedTokenSource(TestContext.CancellationToken);
        var handler = new Handler
        {
            Respond = async (_, token) =>
            {
                await Task.Delay(Timeout.InfiniteTimeSpan, token);
                return Response("unreachable");
            }
        };
        using var adapter = new AzureOpenAiExplanationProvider(Configuration(), handler);
        var pending = Service(provider: adapter).ExplainAsync(Request(), caller.Token);
        caller.Cancel();
        var exception = await Assert.ThrowsAsync<OperationCanceledException>(() => pending);
        Assert.AreEqual(caller.Token, exception.CancellationToken);
        Assert.AreEqual(1, handler.Calls);
    }

    [TestMethod]
    public void Configuration_DoesNotExposeKeyInSerializationOrToString()
    {
        var configuration = Configuration();
        Assert.DoesNotContain(ApiKey, configuration.ToString());
        Assert.DoesNotContain(ApiKey, JsonSerializer.Serialize(configuration));
    }

    [TestMethod]
    public void Transport_DisablesRedirectsAndCookiesBeforeItCanSendCredentials()
    {
        using var production = AzureOpenAiExplanationProvider.CreateHttpMessageHandler();
        Assert.IsFalse(production.AllowAutoRedirect);
        Assert.IsFalse(production.UseCookies);
        using var supplied = new HttpClientHandler { AllowAutoRedirect = true, UseCookies = true };
        using var adapter = new AzureOpenAiExplanationProvider(Configuration(), supplied);
        Assert.IsFalse(supplied.AllowAutoRedirect);
        Assert.IsFalse(supplied.UseCookies);
        using var sockets = new SocketsHttpHandler { AllowAutoRedirect = true, UseCookies = true };
        using var other = new AzureOpenAiExplanationProvider(Configuration(), sockets);
        Assert.IsFalse(sockets.AllowAutoRedirect);
        Assert.IsFalse(sockets.UseCookies);
        using var inner = new HttpClientHandler { AllowAutoRedirect = true, UseCookies = true };
        using var wrapped = new Passthrough { InnerHandler = inner };
        using var wrappedAdapter = new AzureOpenAiExplanationProvider(Configuration(), wrapped);
        Assert.IsFalse(inner.AllowAutoRedirect);
        Assert.IsFalse(inner.UseCookies);
    }

    private static AzureOpenAiConfiguration Configuration() => new(Endpoint, Deployment, ApiKey);

    private static string Envelope(string content) => JsonSerializer.Serialize(new
    {
        id = "fictional-chat-completion",
        choices = new[] { new { index = 0, finish_reason = "stop", message = new { role = "assistant", content, refusal = (string?)null } } },
        usage = new { prompt_tokens = 1, completion_tokens = 1, total_tokens = 2 }
    });

    private static HttpResponseMessage Response(string raw) => JsonResponse(Envelope(raw));
    private static HttpResponseMessage JsonResponse(string json) => new(HttpStatusCode.OK)
    {
        Content = new StringContent(json, Encoding.UTF8, "application/json")
    };

    private sealed class Handler : HttpMessageHandler
    {
        internal Func<HttpRequestMessage, CancellationToken, Task<HttpResponseMessage>> Respond { get; init; } =
            (_, _) => throw new InvalidOperationException("Unexpected transport call.");
        internal int Calls { get; private set; }
        internal CancellationToken LastToken { get; private set; }

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Calls++;
            LastToken = cancellationToken;
            return Respond(request, cancellationToken);
        }
    }

    private sealed class NonSeekableStream(byte[] bytes) : MemoryStream(bytes)
    {
        public override bool CanSeek => false;
    }

    private sealed class Passthrough : DelegatingHandler;

    private sealed class CancellationReadStream : Stream
    {
        internal TaskCompletionSource Started { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
        internal TaskCompletionSource Exited { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
        internal CancellationToken LastToken { get; private set; }
        public override bool CanRead => true;
        public override bool CanSeek => false;
        public override bool CanWrite => false;
        public override long Length => throw new NotSupportedException();
        public override long Position { get => throw new NotSupportedException(); set => throw new NotSupportedException(); }
        public override void Flush() => throw new NotSupportedException();
        public override int Read(byte[] buffer, int offset, int count) => throw new NotSupportedException();
        public override long Seek(long offset, SeekOrigin origin) => throw new NotSupportedException();
        public override void SetLength(long value) => throw new NotSupportedException();
        public override void Write(byte[] buffer, int offset, int count) => throw new NotSupportedException();

        public override async ValueTask<int> ReadAsync(Memory<byte> buffer, CancellationToken cancellationToken = default)
        {
            LastToken = cancellationToken;
            Started.TrySetResult();
            try
            {
                await Task.Delay(Timeout.InfiniteTimeSpan, cancellationToken);
                return 0;
            }
            finally
            {
                Exited.TrySetResult();
            }
        }
    }
}
