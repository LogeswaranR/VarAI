using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using VarAI.Server.Feeds;
using VarAI.Server.Gate;

namespace VarAI.Server.Tests.Integration;

[TestClass]
public sealed class GateHttpTests
{
    private const int From = 5_280;

    private sealed record SseMessage(int Id, string Type, string SchemaVersion, JsonElement Payload);

    public required TestContext TestContext { get; set; }

    private static WebApplicationFactory<Program> Application(Dictionary<string, string?>? extra = null) =>
        new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
            builder.UseEnvironment("Development").ConfigureAppConfiguration((_, configuration) =>
            {
                var values = new Dictionary<string, string?>
                {
                    ["Explanations:LiveEnabled"] = "false",
                    ["Gate:SlaSeconds"] = "2",
                    ["Gate:NarrationWait"] = "00:00:01",
                    ["Gate:TickInterval"] = "00:00:00.100",
                };
                foreach (var pair in extra ?? [])
                {
                    values[pair.Key] = pair.Value;
                }

                configuration.AddInMemoryCollection(values);
            }));

    private static string Route(string suffix = "") => $"/api/matches/{SyntheticMatchTimeline.MatchId}/sessions{suffix}";

    private async Task<string> CreateSessionAsync(HttpClient client, double speed = 10, int fromSeconds = From)
    {
        using var response = await client.PostAsJsonAsync(Route(), new { speed, fromSeconds }, TestContext.CancellationToken);
        Assert.AreEqual(HttpStatusCode.Created, response.StatusCode);
        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync(TestContext.CancellationToken));
        var root = document.RootElement;
        Assert.AreEqual(2, root.GetProperty("slaSeconds").GetInt32());
        Assert.AreEqual(speed, root.GetProperty("speed").GetDouble());
        CollectionAssert.AreEqual(new[] { "en", "ta" }, root.GetProperty("languages").EnumerateArray().Select(item => item.GetString()).ToArray());
        Assert.IsFalse(root.GetProperty("narration").GetProperty("enabled").GetBoolean());
        return root.GetProperty("sessionId").GetString()!;
    }

    private async Task<SseClient> OpenAsync(HttpClient client, string url, string? lastEventId = null)
    {
        var request = new HttpRequestMessage(HttpMethod.Get, url);
        if (lastEventId is not null)
        {
            request.Headers.Add("Last-Event-ID", lastEventId);
        }

        var response = await client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, TestContext.CancellationToken);
        Assert.AreEqual(HttpStatusCode.OK, response.StatusCode, url);
        Assert.AreEqual("text/event-stream", response.Content.Headers.ContentType?.MediaType);
        return new SseClient(response, await response.Content.ReadAsStreamAsync(TestContext.CancellationToken));
    }

    [TestMethod]
    public async Task ApprovedCueTravelsFromTheDeskThroughTheProgramFeedAndIntoAVerifiableLog()
    {
        using var application = Application();
        using var client = application.CreateClient();
        var timeline = application.Services.GetRequiredService<SyntheticMatchTimeline>();
        var cue = timeline.Overlays.First(item => item.InMs > From * 1000);
        var sessionId = await CreateSessionAsync(client);

        using var desk = await OpenAsync(client, Route($"/{sessionId}/desk"));
        var session = await desk.UntilAsync(message => message.Type == "session", TestContext.CancellationToken);
        Assert.AreEqual(sessionId, session.Payload.GetProperty("sessionId").GetString());
        var proposed = await desk.UntilAsync(message => message.Type == "proposal", TestContext.CancellationToken);
        var approvalId = proposed.Payload.GetProperty("approvalId").GetString()!;
        var payloadHash = proposed.Payload.GetProperty("payloadHash").GetString()!;
        Assert.AreEqual("APR-001", approvalId);
        Assert.AreEqual("PENDING", proposed.Payload.GetProperty("state").GetString());
        Assert.AreEqual(cue.OverlayId, proposed.Payload.GetProperty("cue").GetProperty("overlayId").GetString());
        Assert.AreEqual("FALLBACK", proposed.Payload.GetProperty("narrations").GetProperty("ta").GetProperty("source").GetString());
        Assert.AreEqual("en", proposed.Payload.GetProperty("narrations").GetProperty("ta").GetProperty("language").GetString());

        using var wrongHash = await client.PostAsJsonAsync(
            Route($"/{sessionId}/decisions"), new { approvalId, payloadHash = new string('0', 64), action = "approve" }, TestContext.CancellationToken);
        Assert.AreEqual(HttpStatusCode.Conflict, wrongHash.StatusCode);
        Assert.AreEqual("STALE_PAYLOAD", await ErrorCodeAsync(wrongHash));
        using var wrongAction = await client.PostAsJsonAsync(
            Route($"/{sessionId}/decisions"), new { approvalId, payloadHash, action = "publish" }, TestContext.CancellationToken);
        Assert.AreEqual(HttpStatusCode.BadRequest, wrongAction.StatusCode);

        using var approved = await client.PostAsJsonAsync(
            Route($"/{sessionId}/decisions"), new { approvalId, payloadHash, action = "approve", note = "looks right" }, TestContext.CancellationToken);
        Assert.AreEqual(HttpStatusCode.OK, approved.StatusCode);
        using var result = JsonDocument.Parse(await approved.Content.ReadAsStringAsync(TestContext.CancellationToken));
        Assert.AreEqual("APPROVED", result.RootElement.GetProperty("state").GetString());
        var decision = await desk.UntilAsync(message => message.Type == "decision", TestContext.CancellationToken);
        Assert.AreEqual("APPROVED", decision.Payload.GetProperty("state").GetString());

        using var again = await client.PostAsJsonAsync(
            Route($"/{sessionId}/decisions"), new { approvalId, payloadHash, action = "hold" }, TestContext.CancellationToken);
        Assert.AreEqual(HttpStatusCode.Conflict, again.StatusCode);
        Assert.AreEqual("ALREADY_DECIDED", await ErrorCodeAsync(again));

        using var program = await OpenAsync(client, Route($"/{sessionId}/program"));
        var match = await program.UntilAsync(message => message.Type == "match", TestContext.CancellationToken);
        Assert.AreEqual(SyntheticMatchTimeline.FeedSchemaVersion, match.SchemaVersion);
        var aired = await program.UntilAsync(message => message.Type == "overlay", TestContext.CancellationToken);
        Assert.AreEqual(cue.OverlayId, aired.Payload.GetProperty("overlayId").GetString());
        var approval = aired.Payload.GetProperty("approval");
        Assert.AreEqual(approvalId, approval.GetProperty("approvalId").GetString());
        Assert.AreEqual(payloadHash, approval.GetProperty("payloadHash").GetString());
        Assert.AreEqual("APPROVED", approval.GetProperty("decision").GetString());
        Assert.AreEqual("FALLBACK", approval.GetProperty("narrations").GetProperty("en").GetProperty("source").GetString());
        Assert.DoesNotContain("usage", aired.Payload.GetRawText(), StringComparison.OrdinalIgnoreCase);
        Assert.AreEqual(timeline.Items.First(item => item.Kind == MatchStreamKinds.Overlay && ((OverlayCue)item.Payload).OverlayId == cue.OverlayId).Index, aired.Id);

        using var log = await client.GetAsync(Route($"/{sessionId}/decision-log.jsonl"), TestContext.CancellationToken);
        Assert.AreEqual(HttpStatusCode.OK, log.StatusCode);
        Assert.AreEqual("application/x-ndjson", log.Content.Headers.ContentType?.MediaType);
        Assert.AreEqual($"varai-decisions-{sessionId}.jsonl", log.Content.Headers.ContentDisposition?.FileName);
        var lines = (await log.Content.ReadAsStringAsync(TestContext.CancellationToken)).TrimEnd('\n').Split('\n');
        Assert.IsGreaterThanOrEqualTo(2, lines.Length);
        var verification = DecisionLog.Verify(sessionId, lines);
        Assert.IsTrue(verification.Valid, verification.Problem);
        Assert.AreEqual(verification.HeadHash, log.Headers.GetValues("X-Decision-Log-Head").Single());
        Assert.AreEqual(lines.Length.ToString(System.Globalization.CultureInfo.InvariantCulture), log.Headers.GetValues("X-Decision-Log-Entries").Single());
        var proposedIndex = Array.FindIndex(lines, line => line.Contains("\"event\":\"PROPOSED\"", StringComparison.Ordinal) && line.Contains("\"approvalId\":\"APR-001\"", StringComparison.Ordinal));
        var approvedIndex = Array.FindIndex(lines, line => line.Contains("\"event\":\"APPROVED\"", StringComparison.Ordinal) && line.Contains("\"approvalId\":\"APR-001\"", StringComparison.Ordinal));
        Assert.IsGreaterThanOrEqualTo(0, proposedIndex);
        Assert.IsGreaterThan(proposedIndex, approvedIndex, "The approval is recorded after the proposal it answers.");
        Assert.Contains("\"note\":\"looks right\"", lines[approvedIndex]);
    }

    [TestMethod]
    public async Task AnUndecidedCueIsHeldAndTheProgramMovesPastItWithoutIt()
    {
        using var application = Application();
        using var client = application.CreateClient();
        var timeline = application.Services.GetRequiredService<SyntheticMatchTimeline>();
        var cue = timeline.Overlays.First(item => item.InMs > From * 1000);
        var sessionId = await CreateSessionAsync(client);
        using var desk = await OpenAsync(client, Route($"/{sessionId}/desk"));
        using var program = await OpenAsync(client, Route($"/{sessionId}/program"));

        var held = await desk.UntilAsync(
            message => message.Type == "decision" && message.Payload.GetProperty("state").GetString() == "AUTO_HELD",
            TestContext.CancellationToken);
        Assert.AreEqual("APR-001", held.Payload.GetProperty("approvalId").GetString());

        var seen = new List<SseMessage>();
        await program.UntilAsync(message =>
        {
            seen.Add(message);
            return message.Type == "event" && message.Payload.GetProperty("matchClockMs").GetInt32() > cue.InMs + 1_500;
        }, TestContext.CancellationToken);

        Assert.IsEmpty(seen.Where(message => message.Type == "overlay"), "The held cue never aired.");
        using var log = await client.GetAsync(Route($"/{sessionId}/decision-log.jsonl"), TestContext.CancellationToken);
        var lines = (await log.Content.ReadAsStringAsync(TestContext.CancellationToken)).TrimEnd('\n').Split('\n');
        Assert.Contains("\"event\":\"AUTO_HELD\"", lines[^1]);
        Assert.Contains("\"reason\":\"SLA_EXPIRED\"", lines[^1]);
        Assert.Contains("\"actor\":\"system\"", lines[^1]);
        Assert.IsTrue(DecisionLog.Verify(sessionId, lines).Valid);
    }

    [TestMethod]
    public async Task AnOperatorOverrideWithTamilTextAirsAsOperatorTextAndIsLoggedVerbatim()
    {
        using var application = Application();
        using var client = application.CreateClient();
        var sessionId = await CreateSessionAsync(client);
        using var desk = await OpenAsync(client, Route($"/{sessionId}/desk"));
        var proposed = await desk.UntilAsync(message => message.Type == "proposal", TestContext.CancellationToken);
        var approvalId = proposed.Payload.GetProperty("approvalId").GetString()!;
        var payloadHash = proposed.Payload.GetProperty("payloadHash").GetString()!;

        using var overridden = await client.PostAsJsonAsync(Route($"/{sessionId}/decisions"), new
        {
            approvalId,
            payloadHash,
            action = "override",
            edits = new Dictionary<string, object>
            {
                ["ta"] = new { headline = "88 நிமிடத்தில் சமன்", fan = "ஆட்டம் சமநிலைக்கு வந்தது.", analyst = "இது ஒரு முக்கிய தருணம்.", why = "முடிவு நெருங்குகிறது." },
            },
            note = "தமிழ் உரை",
        }, TestContext.CancellationToken);
        Assert.AreEqual(HttpStatusCode.OK, overridden.StatusCode, await overridden.Content.ReadAsStringAsync(TestContext.CancellationToken));

        using var program = await OpenAsync(client, Route($"/{sessionId}/program"));
        var aired = await program.UntilAsync(message => message.Type == "overlay", TestContext.CancellationToken);
        var approval = aired.Payload.GetProperty("approval");
        Assert.AreEqual("OVERRIDDEN", approval.GetProperty("decision").GetString());
        var tamil = approval.GetProperty("narrations").GetProperty("ta");
        Assert.AreEqual("OPERATOR", tamil.GetProperty("source").GetString());
        Assert.AreEqual("ta", tamil.GetProperty("language").GetString());
        Assert.AreEqual("88 நிமிடத்தில் சமன்", tamil.GetProperty("text").GetProperty("headline").GetString());
        Assert.AreEqual("FALLBACK", approval.GetProperty("narrations").GetProperty("en").GetProperty("source").GetString());
        Assert.AreNotEqual(payloadHash, approval.GetProperty("payloadHash").GetString());

        using var log = await client.GetAsync(Route($"/{sessionId}/decision-log.jsonl"), TestContext.CancellationToken);
        var lines = (await log.Content.ReadAsStringAsync(TestContext.CancellationToken)).TrimEnd('\n').Split('\n');
        var overrideLine = lines.Single(line => line.Contains("\"event\":\"OVERRIDDEN\"", StringComparison.Ordinal));
        Assert.Contains("தமிழ் உரை", overrideLine);
        Assert.Contains("88 நிமிடத்தில் சமன்", overrideLine);
        Assert.IsTrue(DecisionLog.Verify(sessionId, lines).Valid);
    }

    [TestMethod]
    public async Task ASeriesOfRequestsThatMustBeRejectedAreRejectedWithTheRightStatus()
    {
        using var application = Application(new() { ["Gate:MaxSessions"] = "1" });
        using var client = application.CreateClient();

        using var tooFast = await client.PostAsJsonAsync(Route(), new { speed = 60, fromSeconds = 0 }, TestContext.CancellationToken);
        Assert.AreEqual(HttpStatusCode.BadRequest, tooFast.StatusCode);
        Assert.AreEqual("INVALID_SPEED", await ErrorCodeAsync(tooFast));
        using var tooSlow = await client.PostAsJsonAsync(Route(), new { speed = 0.5, fromSeconds = 0 }, TestContext.CancellationToken);
        Assert.AreEqual("INVALID_SPEED", await ErrorCodeAsync(tooSlow));
        using var badStart = await client.PostAsJsonAsync(Route(), new { speed = 10, fromSeconds = 9_999 }, TestContext.CancellationToken);
        Assert.AreEqual("INVALID_START", await ErrorCodeAsync(badStart));
        using var notJson = await client.PostAsync(Route(), new StringContent("{not json", Encoding.UTF8, "application/json"), TestContext.CancellationToken);
        Assert.AreEqual(HttpStatusCode.BadRequest, notJson.StatusCode);
        using var wrongType = await client.PostAsync(Route(), new StringContent("speed=10", Encoding.UTF8, "text/plain"), TestContext.CancellationToken);
        Assert.AreEqual(HttpStatusCode.UnsupportedMediaType, wrongType.StatusCode);
        using var tooBig = await client.PostAsync(Route(), new StringContent("{\"note\":\"" + new string('x', 20_000) + "\"}", Encoding.UTF8, "application/json"), TestContext.CancellationToken);
        Assert.AreEqual(HttpStatusCode.RequestEntityTooLarge, tooBig.StatusCode);
        using var otherMatch = await client.PostAsJsonAsync("/api/matches/NOT-A-MATCH/sessions", new { speed = 10 }, TestContext.CancellationToken);
        Assert.AreEqual(HttpStatusCode.NotFound, otherMatch.StatusCode);

        var sessionId = await CreateSessionAsync(client, speed: 10, fromSeconds: 5_000);
        using var full = await client.PostAsJsonAsync(Route(), new { speed = 10, fromSeconds = 0 }, TestContext.CancellationToken);
        Assert.AreEqual(HttpStatusCode.ServiceUnavailable, full.StatusCode);
        Assert.AreEqual("30", full.Headers.GetValues("Retry-After").Single());

        foreach (var id in new[] { new string('0', 32), "short", "../etc/passwd", sessionId.ToUpperInvariant() })
        {
            foreach (var suffix in new[] { "/desk", "/program", "/decision-log.jsonl" })
            {
                using var missing = await client.GetAsync(Route($"/{id}{suffix}"), TestContext.CancellationToken);
                Assert.AreEqual(HttpStatusCode.NotFound, missing.StatusCode, $"{id}{suffix}");
            }

            using var decide = await client.PostAsJsonAsync(Route($"/{id}/decisions"), new { approvalId = "APR-001", payloadHash = "x", action = "approve" }, TestContext.CancellationToken);
            Assert.AreEqual(HttpStatusCode.NotFound, decide.StatusCode);
        }

        using var noBody = await client.PostAsync(Route($"/{sessionId}/decisions"), new StringContent(string.Empty, Encoding.UTF8, "application/json"), TestContext.CancellationToken);
        Assert.AreEqual(HttpStatusCode.BadRequest, noBody.StatusCode);
        using var unknown = await client.PostAsJsonAsync(Route($"/{sessionId}/decisions"), new { approvalId = "APR-404", payloadHash = "x", action = "approve" }, TestContext.CancellationToken);
        Assert.AreEqual(HttpStatusCode.NotFound, unknown.StatusCode);
        Assert.AreEqual("UNKNOWN_PROPOSAL", await ErrorCodeAsync(unknown));
        using var badResume = new HttpRequestMessage(HttpMethod.Get, Route($"/{sessionId}/program"));
        badResume.Headers.Add("Last-Event-ID", "not-a-number");
        using var badResumeResponse = await client.SendAsync(badResume, TestContext.CancellationToken);
        Assert.AreEqual(HttpStatusCode.BadRequest, badResumeResponse.StatusCode);
    }

    [TestMethod]
    public async Task NarrationStatusReportsThatNoModelIsConfiguredByDefault()
    {
        using var application = Application();
        using var client = application.CreateClient();

        using var response = await client.GetAsync("/api/narration", TestContext.CancellationToken);

        Assert.AreEqual(HttpStatusCode.OK, response.StatusCode);
        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync(TestContext.CancellationToken));
        Assert.IsFalse(document.RootElement.GetProperty("enabled").GetBoolean());
        Assert.AreEqual(JsonValueKind.Null, document.RootElement.GetProperty("deployment").ValueKind);
        Assert.AreEqual(0, document.RootElement.GetProperty("callsUsed").GetInt32());
    }

    [TestMethod]
    public async Task TheUngatedStreamsAreUnchangedByTheGate()
    {
        using var application = Application();
        using var client = application.CreateClient();

        using var response = await client.GetAsync(
            $"/api/matches/{SyntheticMatchTimeline.MatchId}/overlays?speed=1000&fromSeconds=5000", TestContext.CancellationToken);

        Assert.AreEqual(HttpStatusCode.OK, response.StatusCode);
        var text = await response.Content.ReadAsStringAsync(TestContext.CancellationToken);
        Assert.DoesNotContain("\"approval\"", text, "The preview stream carries no approval and is labelled as not operator-approved in the UI.");
        Assert.Contains("\"type\":\"overlay\"", text);
    }

    [TestMethod]
    public async Task ADeskReconnectWithLastEventIdReplaysOnlyWhatWasMissed()
    {
        using var application = Application();
        using var client = application.CreateClient();
        var sessionId = await CreateSessionAsync(client);
        using (var first = await OpenAsync(client, Route($"/{sessionId}/desk")))
        {
            await first.UntilAsync(message => message.Type == "proposal", TestContext.CancellationToken);
        }

        using var resumed = await OpenAsync(client, Route($"/{sessionId}/desk"), lastEventId: "1");
        var received = new List<SseMessage>();
        await resumed.UntilAsync(message =>
        {
            received.Add(message);
            return message.Type == "decision";
        }, TestContext.CancellationToken);

        Assert.AreEqual("session", received[0].Type);
        Assert.IsTrue(received.Skip(1).All(message => message.Id >= 2), "Message 1 was already received, so it is not replayed.");
        Assert.IsTrue(received.Skip(1).Any(message => message.Type == "proposal"), "Later proposals are still delivered.");
    }

    private async Task<string> ErrorCodeAsync(HttpResponseMessage response)
    {
        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync(TestContext.CancellationToken));
        return document.RootElement.GetProperty("code").GetString()!;
    }

    private sealed class SseClient(HttpResponseMessage response, Stream stream) : IDisposable
    {
        private readonly StreamReader reader = new(stream, Encoding.UTF8);

        public async Task<SseMessage> UntilAsync(Func<SseMessage, bool> predicate, CancellationToken testToken)
        {
            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(testToken);
            timeout.CancelAfter(TimeSpan.FromSeconds(20));
            while (true)
            {
                var message = await NextAsync(timeout.Token);
                if (predicate(message))
                {
                    return message;
                }
            }
        }

        private async Task<SseMessage> NextAsync(CancellationToken cancellationToken)
        {
            int? id = null;
            string? data = null;
            while (true)
            {
                var line = await reader.ReadLineAsync(cancellationToken) ?? throw new EndOfStreamException("The stream ended.");
                if (line.Length == 0)
                {
                    if (data is null)
                    {
                        continue;
                    }

                    using var document = JsonDocument.Parse(data);
                    var root = document.RootElement;
                    return new SseMessage(
                        id ?? -1, root.GetProperty("type").GetString()!, root.GetProperty("schemaVersion").GetString()!,
                        root.GetProperty("payload").Clone());
                }

                if (line.StartsWith("id: ", StringComparison.Ordinal))
                {
                    id = int.Parse(line[4..], System.Globalization.CultureInfo.InvariantCulture);
                }
                else if (line.StartsWith("data: ", StringComparison.Ordinal))
                {
                    data = line[6..];
                }
            }
        }

        public void Dispose()
        {
            reader.Dispose();
            response.Dispose();
        }
    }
}
