using System.Net;
using System.Text;
using System.Text.Json;
using Azure.Core;
using VarAI.Server.Explanations;

namespace VarAI.Server.Tests.Explanations;

[TestClass]
public sealed class AzureOpenAiChatClientTests
{
    private const string Endpoint = "https://fictional-narration-test.openai.azure.com";
    private const string Deployment = "fictional-deployment";
    private const string ClientId = "11111111-2222-3333-4444-555555555555";
    public required TestContext TestContext { get; set; }

    [TestMethod]
    [DataRow(AzureOpenAiCredentialKind.ManagedIdentity, null, null, null, true)]
    [DataRow(AzureOpenAiCredentialKind.ManagedIdentity, null, ClientId, null, true)]
    [DataRow(AzureOpenAiCredentialKind.ManagedIdentity, null, ClientId, AzureOpenAiConfiguration.LegacyTokenScope, true)]
    [DataRow(AzureOpenAiCredentialKind.AzureCli, null, null, null, true)]
    [DataRow(AzureOpenAiCredentialKind.ManagedIdentity, "FICTITIOUS_TEST_KEY", null, null, false)]
    [DataRow(AzureOpenAiCredentialKind.AzureCli, "FICTITIOUS_TEST_KEY", null, null, false)]
    [DataRow(AzureOpenAiCredentialKind.ManagedIdentity, null, "not-a-guid", null, false)]
    [DataRow(AzureOpenAiCredentialKind.ManagedIdentity, null, ClientId + "\n", null, false)]
    [DataRow(AzureOpenAiCredentialKind.AzureCli, null, ClientId, null, false)]
    [DataRow(AzureOpenAiCredentialKind.ManagedIdentity, null, null, "https://attacker.example.invalid/.default", false)]
    [DataRow(AzureOpenAiCredentialKind.ApiKey, "FICTITIOUS_TEST_KEY", null, AzureOpenAiConfiguration.DefaultTokenScope, false)]
    [DataRow(AzureOpenAiCredentialKind.ApiKey, "FICTITIOUS_TEST_KEY", ClientId, null, false)]
    [DataRow(AzureOpenAiCredentialKind.ApiKey, null, null, null, false)]
    public void Configuration_ValidatesEachCredentialKindStrictly(
        AzureOpenAiCredentialKind kind, string? key, string? clientId, string? scope, bool valid)
    {
        var configuration = new AzureOpenAiConfiguration(Endpoint, Deployment, key)
        {
            Credential = kind,
            ManagedIdentityClientId = clientId,
            TokenScope = scope,
        };
        using var client = new AzureOpenAiChatClient(
            configuration, new Handler(), AzureOpenAiAuthorizers.Create(configuration, TimeProvider.System));
        Assert.AreEqual(valid, client.IsConfigured);
    }

    [TestMethod]
    public async Task CompleteAsync_BearerAuthorizerSendsEntraTokenAndNoKeyHeader()
    {
        var credential = new FakeCredential("FICTITIOUS_ENTRA_TOKEN");
        var time = new ManualTimeProvider();
        using var authorizer = new BearerTokenAuthorizer(credential, AzureOpenAiConfiguration.DefaultTokenScope, time);
        var handler = new Handler
        {
            Respond = async (request, token) =>
            {
                Assert.AreEqual("Bearer", request.Headers.Authorization!.Scheme);
                Assert.AreEqual("FICTITIOUS_ENTRA_TOKEN", request.Headers.Authorization.Parameter);
                Assert.IsFalse(request.Headers.Contains("api-key"));
                var body = await request.Content!.ReadAsStringAsync(token);
                Assert.DoesNotContain("FICTITIOUS_ENTRA_TOKEN", body);
                Assert.AreEqual(Endpoint + "/openai/v1/chat/completions", request.RequestUri!.AbsoluteUri);
                return Json(Envelope("{}"));
            }
        };
        var configuration = new AzureOpenAiConfiguration(Endpoint, Deployment, null)
        {
            Credential = AzureOpenAiCredentialKind.ManagedIdentity,
        };
        using var client = new AzureOpenAiChatClient(configuration, handler, authorizer);

        var completion = await client.CompleteAsync([new ChatMessage("user", "hello")], 100, TestContext.CancellationToken);

        Assert.AreEqual("{}", completion.Content);
        Assert.AreEqual(1, handler.Calls);
        CollectionAssert.AreEqual(new[] { AzureOpenAiConfiguration.DefaultTokenScope }, credential.Scopes.Single().ToArray());
    }

    [TestMethod]
    public async Task BearerTokenAuthorizer_CachesUntilFiveMinutesBeforeExpiryThenRefreshes()
    {
        var time = new ManualTimeProvider();
        var credential = new FakeCredential("FICTITIOUS_ENTRA_TOKEN", lifetime: TimeSpan.FromMinutes(60), time);
        using var authorizer = new BearerTokenAuthorizer(credential, AzureOpenAiConfiguration.DefaultTokenScope, time);

        for (var index = 0; index < 5; index++)
        {
            using var request = new HttpRequestMessage(HttpMethod.Post, Endpoint);
            await authorizer.AuthorizeAsync(request, TestContext.CancellationToken);
        }
        Assert.AreEqual(1, credential.Calls);

        time.Advance(TimeSpan.FromMinutes(54));
        using (var request = new HttpRequestMessage(HttpMethod.Post, Endpoint))
        {
            await authorizer.AuthorizeAsync(request, TestContext.CancellationToken);
        }
        Assert.AreEqual(1, credential.Calls, "Still inside the cached window.");

        time.Advance(TimeSpan.FromMinutes(2));
        using (var request = new HttpRequestMessage(HttpMethod.Post, Endpoint))
        {
            await authorizer.AuthorizeAsync(request, TestContext.CancellationToken);
        }
        Assert.AreEqual(2, credential.Calls, "Refreshed inside the five-minute margin.");
    }

    [TestMethod]
    public async Task BearerTokenAuthorizer_SharesOneRefreshAcrossConcurrentCallers()
    {
        var time = new ManualTimeProvider();
        var credential = new FakeCredential("FICTITIOUS_ENTRA_TOKEN", lifetime: TimeSpan.FromMinutes(60), time)
        {
            Delay = TimeSpan.FromMilliseconds(100),
        };
        using var authorizer = new BearerTokenAuthorizer(credential, AzureOpenAiConfiguration.DefaultTokenScope, time);

        await Task.WhenAll(Enumerable.Range(0, 8).Select(async _ =>
        {
            using var request = new HttpRequestMessage(HttpMethod.Post, Endpoint);
            await authorizer.AuthorizeAsync(request, TestContext.CancellationToken);
        }));

        Assert.AreEqual(1, credential.Calls);
    }

    [TestMethod]
    public async Task CompleteAsync_CredentialFailureIsSanitisedUnavailableAndNeverSends()
    {
        var credential = new FakeCredential("unused") { Failure = new InvalidOperationException("secret-looking detail from az") };
        var time = new ManualTimeProvider();
        using var authorizer = new BearerTokenAuthorizer(credential, AzureOpenAiConfiguration.DefaultTokenScope, time);
        var handler = new Handler();
        var configuration = new AzureOpenAiConfiguration(Endpoint, Deployment, null) { Credential = AzureOpenAiCredentialKind.AzureCli };
        using var client = new AzureOpenAiChatClient(configuration, handler, authorizer);

        var exception = await Assert.ThrowsAsync<AzureOpenAiChatException>(
            () => client.CompleteAsync([new ChatMessage("user", "hello")], 100, TestContext.CancellationToken));

        Assert.AreEqual(AzureOpenAiChatFailure.Unavailable, exception.Failure);
        Assert.DoesNotContain("secret-looking", exception.Message);
        Assert.IsNull(exception.InnerException);
        Assert.AreEqual(0, handler.Calls);
    }

    [TestMethod]
    public async Task CompleteAsync_ReadsUsageReasoningCachedTokensAndModel()
    {
        var handler = new Handler
        {
            Respond = (_, _) => Task.FromResult(Json(JsonSerializer.Serialize(new
            {
                model = "fictional-model-2026",
                choices = new[] { new { index = 0, finish_reason = "stop", message = new { role = "assistant", content = "ok" } } },
                usage = new
                {
                    prompt_tokens = 1200,
                    completion_tokens = 450,
                    total_tokens = 1650,
                    prompt_tokens_details = new { cached_tokens = 1000 },
                    completion_tokens_details = new { reasoning_tokens = 300 },
                }
            })))
        };
        using var client = ApiKeyClient(handler);

        var completion = await client.CompleteAsync([new ChatMessage("user", "hi")], 100, TestContext.CancellationToken);

        Assert.AreEqual("ok", completion.Content);
        Assert.AreEqual("fictional-model-2026", completion.Model);
        Assert.AreEqual(new ChatUsage(1200, 450, 300, 1000), completion.Usage);
    }

    [TestMethod]
    [DataRow("low")]
    [DataRow("none")]
    public async Task CompleteAsync_SendsReasoningEffortOnlyWhenAsked(string effort)
    {
        var bodies = new List<string>();
        var handler = new Handler
        {
            Respond = async (request, token) =>
            {
                bodies.Add(await request.Content!.ReadAsStringAsync(token));
                return Json("""{"choices":[{"index":0,"finish_reason":"stop","message":{"role":"assistant","content":"ok"}}]}""");
            }
        };
        using var client = ApiKeyClient(handler);

        await client.CompleteAsync([new ChatMessage("user", "hi")], 100, TestContext.CancellationToken);
        await client.CompleteAsync([new ChatMessage("user", "hi")], 100, TestContext.CancellationToken, effort);

        Assert.HasCount(2, bodies);
        using var plain = JsonDocument.Parse(bodies[0]);
        Assert.IsFalse(plain.RootElement.TryGetProperty("reasoning_effort", out _));
        using var withEffort = JsonDocument.Parse(bodies[1]);
        Assert.AreEqual(effort, withEffort.RootElement.GetProperty("reasoning_effort").GetString());
        Assert.IsFalse(withEffort.RootElement.GetProperty("stream").GetBoolean());
        Assert.IsFalse(withEffort.RootElement.GetProperty("store").GetBoolean());
    }

    [TestMethod]
    [DataRow("""{"choices":[{"index":0,"finish_reason":"stop","message":{"role":"assistant","content":"ok"}}]}""")]
    [DataRow("""{"choices":[{"index":0,"finish_reason":"stop","message":{"role":"assistant","content":"ok"}}],"usage":{"prompt_tokens":"many"}}""")]
    [DataRow("""{"choices":[{"index":0,"finish_reason":"stop","message":{"role":"assistant","content":"ok"}}],"usage":{"prompt_tokens":-1,"completion_tokens":2}}""")]
    public async Task CompleteAsync_MissingOrOddUsageNeverFailsTheCall(string json)
    {
        var handler = new Handler { Respond = (_, _) => Task.FromResult(Json(json)) };
        using var client = ApiKeyClient(handler);

        var completion = await client.CompleteAsync([new ChatMessage("user", "hi")], 100, TestContext.CancellationToken);

        Assert.AreEqual("ok", completion.Content);
        Assert.IsNull(completion.Usage);
    }

    [TestMethod]
    public async Task CompleteAsync_LengthFinishAndOversizeContentAreInvalidOutput()
    {
        var truncated = new Handler
        {
            Respond = (_, _) => Task.FromResult(Json(JsonSerializer.Serialize(new
            {
                choices = new[] { new { index = 0, finish_reason = "length", message = new { role = "assistant", content = "cut" } } }
            })))
        };
        using var first = ApiKeyClient(truncated);
        var exception = await Assert.ThrowsAsync<AzureOpenAiChatException>(
            () => first.CompleteAsync([new ChatMessage("user", "hi")], 100, TestContext.CancellationToken));
        Assert.AreEqual(AzureOpenAiChatFailure.InvalidOutput, exception.Failure);

        var oversize = new Handler { Respond = (_, _) => Task.FromResult(Json(Envelope(new string('x', 101)))) };
        using var second = ApiKeyClient(oversize);
        exception = await Assert.ThrowsAsync<AzureOpenAiChatException>(
            () => second.CompleteAsync([new ChatMessage("user", "hi")], 100, TestContext.CancellationToken));
        Assert.AreEqual(AzureOpenAiChatFailure.InvalidOutput, exception.Failure);
    }

    [TestMethod]
    public async Task CompleteAsync_InvalidConfigurationNeverCallsTheAuthorizerOrTheNetwork()
    {
        var credential = new FakeCredential("unused");
        var time = new ManualTimeProvider();
        using var authorizer = new BearerTokenAuthorizer(credential, AzureOpenAiConfiguration.DefaultTokenScope, time);
        var handler = new Handler();
        var configuration = new AzureOpenAiConfiguration("https://example.invalid", Deployment, null)
        {
            Credential = AzureOpenAiCredentialKind.ManagedIdentity,
        };
        using var client = new AzureOpenAiChatClient(configuration, handler, authorizer);

        var exception = await Assert.ThrowsAsync<AzureOpenAiChatException>(
            () => client.CompleteAsync([new ChatMessage("user", "hi")], 100, TestContext.CancellationToken));

        Assert.AreEqual(AzureOpenAiChatFailure.NotConfigured, exception.Failure);
        Assert.AreEqual(0, credential.Calls);
        Assert.AreEqual(0, handler.Calls);
    }

    [TestMethod]
    public void Configuration_NeverExposesCredentialDetailsInToString()
    {
        var configuration = new AzureOpenAiConfiguration(Endpoint, Deployment, null)
        {
            Credential = AzureOpenAiCredentialKind.ManagedIdentity,
            ManagedIdentityClientId = ClientId,
        };
        Assert.DoesNotContain(ClientId, configuration.ToString());
    }

    private static AzureOpenAiChatClient ApiKeyClient(Handler handler) =>
        new(new AzureOpenAiConfiguration(Endpoint, Deployment, "FICTITIOUS_TEST_KEY"), handler,
            AzureOpenAiAuthorizers.Create(new AzureOpenAiConfiguration(Endpoint, Deployment, "FICTITIOUS_TEST_KEY"), TimeProvider.System));

    private static string Envelope(string content) => JsonSerializer.Serialize(new
    {
        choices = new[] { new { index = 0, finish_reason = "stop", message = new { role = "assistant", content } } },
        usage = new { prompt_tokens = 1, completion_tokens = 1, total_tokens = 2 }
    });

    private static HttpResponseMessage Json(string json) => new(HttpStatusCode.OK)
    {
        Content = new StringContent(json, Encoding.UTF8, "application/json")
    };

    private sealed class Handler : HttpMessageHandler
    {
        internal Func<HttpRequestMessage, CancellationToken, Task<HttpResponseMessage>> Respond { get; init; } =
            (_, _) => throw new InvalidOperationException("Unexpected transport call.");
        internal int Calls { get; private set; }

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Calls++;
            return Respond(request, cancellationToken);
        }
    }

    private sealed class FakeCredential(string token, TimeSpan? lifetime = null, TimeProvider? time = null) : TokenCredential
    {
        private int calls;
        internal List<string[]> Scopes { get; } = [];
        internal int Calls => Volatile.Read(ref calls);
        internal Exception? Failure { get; init; }
        internal TimeSpan Delay { get; init; }

        public override AccessToken GetToken(TokenRequestContext requestContext, CancellationToken cancellationToken) =>
            throw new NotSupportedException("The authorizer must use the asynchronous API.");

        public override async ValueTask<AccessToken> GetTokenAsync(TokenRequestContext requestContext, CancellationToken cancellationToken)
        {
            Interlocked.Increment(ref calls);
            lock (Scopes)
            {
                Scopes.Add(requestContext.Scopes);
            }
            if (Delay > TimeSpan.Zero)
            {
                await Task.Delay(Delay, cancellationToken);
            }
            if (Failure is not null)
            {
                throw Failure;
            }
            var now = (time ?? TimeProvider.System).GetUtcNow();
            return new AccessToken(token, now + (lifetime ?? TimeSpan.FromMinutes(60)));
        }
    }
}
