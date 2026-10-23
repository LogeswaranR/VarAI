using System.Net;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using VarAI.Server.Feeds;

namespace VarAI.Server.Tests.Integration;

[TestClass]
public sealed class SyntheticMatchStreamHttpTests
{
    private sealed record Message(int Id, string Type, string SchemaVersion, JsonElement Payload);

    public required TestContext TestContext { get; set; }

    private static WebApplicationFactory<Program> Application() =>
        new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
            builder.UseEnvironment("Development").ConfigureAppConfiguration((_, configuration) =>
                configuration.AddInMemoryCollection(new Dictionary<string, string?>
                {
                    ["Explanations:LiveEnabled"] = "false"
                })));

    private static string Url(string route, string query = "") => $"/api/matches/{SyntheticMatchTimeline.MatchId}/{route}{query}";

    private static async Task<List<Message>> ReadMessagesAsync(HttpResponseMessage response, CancellationToken cancellationToken)
    {
        var messages = new List<Message>();
        var text = await response.Content.ReadAsStringAsync(cancellationToken);
        foreach (var block in text.Split("\n\n", StringSplitOptions.RemoveEmptyEntries))
        {
            int? id = null;
            string? data = null;
            foreach (var line in block.Split('\n'))
            {
                if (line.StartsWith("id: ", StringComparison.Ordinal))
                {
                    id = int.Parse(line[4..], System.Globalization.CultureInfo.InvariantCulture);
                }
                else if (line.StartsWith("data: ", StringComparison.Ordinal))
                {
                    data = line[6..];
                }
            }

            using var document = JsonDocument.Parse(data ?? throw new InvalidDataException("Missing SSE data."));
            var root = document.RootElement;
            messages.Add(new Message(
                id ?? throw new InvalidDataException("Missing SSE id."), root.GetProperty("type").GetString()!,
                root.GetProperty("schemaVersion").GetString()!, root.GetProperty("payload").Clone()));
        }

        return messages;
    }

    [TestMethod]
    public async Task MetadataDescribesTheSyntheticMatchTeamsRostersAndHighlights()
    {
        using var application = Application();
        using var client = application.CreateClient();

        using var response = await client.GetAsync($"/api/matches/{SyntheticMatchTimeline.MatchId}", TestContext.CancellationToken);
        Assert.AreEqual(HttpStatusCode.OK, response.StatusCode);
        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync(TestContext.CancellationToken));
        var root = document.RootElement;

        Assert.AreEqual("SYN-MATCH-01", root.GetProperty("matchId").GetString());
        Assert.IsTrue(root.GetProperty("synthetic").GetBoolean());
        Assert.AreEqual(5_520_000, root.GetProperty("durationMs").GetInt32());
        Assert.AreEqual(105, root.GetProperty("pitch").GetProperty("lengthM").GetDouble());
        Assert.AreEqual("Alder Vale Comets", root.GetProperty("homeTeam").GetProperty("name").GetString());
        Assert.AreEqual(11, root.GetProperty("awayTeam").GetProperty("players").GetArrayLength());
        Assert.AreEqual(3, root.GetProperty("highlights").GetArrayLength());
    }

    [TestMethod]
    public async Task OverlayStreamEmitsVersionedCuesAndCompletesWithMatchingTotals()
    {
        using var application = Application();
        using var client = application.CreateClient();

        using var response = await client.GetAsync(Url("overlays", "?speed=1000&fromSeconds=5000"), TestContext.CancellationToken);
        Assert.AreEqual(HttpStatusCode.OK, response.StatusCode);
        Assert.AreEqual("text/event-stream", response.Content.Headers.ContentType?.MediaType);
        Assert.IsTrue(response.Headers.CacheControl?.NoCache);
        var messages = await ReadMessagesAsync(response, TestContext.CancellationToken);
        var timeline = application.Services.GetRequiredService<SyntheticMatchTimeline>();

        Assert.AreEqual("match", messages[0].Type);
        Assert.AreEqual(0, messages[0].Id);
        Assert.AreEqual("complete", messages[^1].Type);
        Assert.IsTrue(messages.Skip(1).Take(messages.Count - 2).All(message => message.Type == "overlay"));
        Assert.HasCount(timeline.Overlays.Count, messages.Where(message => message.Type == "overlay"));
        Assert.IsTrue(messages.All(message => message.SchemaVersion == SyntheticMatchTimeline.FeedSchemaVersion));
        var first = messages.First(message => message.Type == "overlay").Payload;
        Assert.AreEqual("1.0", first.GetProperty("schemaVersion").GetString());
        Assert.IsTrue(first.GetProperty("synthetic").GetBoolean());
        Assert.IsGreaterThan(0, first.GetProperty("sourceEventIds").GetArrayLength());
        Assert.AreEqual(timeline.Overlays.Count, messages[^1].Payload.GetProperty("overlayCount").GetInt32());
    }

    [TestMethod]
    public async Task EventsStreamIsRawAndCombinedStreamAddsMomentumAndCuesInOrder()
    {
        using var application = Application();
        using var client = application.CreateClient();
        var timeline = application.Services.GetRequiredService<SyntheticMatchTimeline>();

        using var rawResponse = await client.GetAsync(Url("events", "?speed=1000&fromSeconds=5400"), TestContext.CancellationToken);
        var raw = await ReadMessagesAsync(rawResponse, TestContext.CancellationToken);
        Assert.IsTrue(raw.Skip(1).Take(raw.Count - 2).All(message => message.Type == "event"));
        Assert.HasCount(timeline.Events.Count, raw.Where(message => message.Type == "event"));
        var firstEvent = raw[1].Payload;
        Assert.AreEqual("PERIOD_START", firstEvent.GetProperty("eventType").GetString());
        Assert.AreEqual(1, firstEvent.GetProperty("sequence").GetInt32());

        using var combinedResponse = await client.GetAsync(Url("stream", "?speed=1000&fromSeconds=5400"), TestContext.CancellationToken);
        var combined = await ReadMessagesAsync(combinedResponse, TestContext.CancellationToken);
        var ids = combined.Skip(1).Select(message => message.Id).ToList();
        CollectionAssert.AreEqual(Enumerable.Range(1, timeline.Items.Count).ToArray(), ids.ToArray());
        Assert.HasCount(timeline.Momentum.Count, combined.Where(message => message.Type == "momentum"));
        Assert.HasCount(timeline.Overlays.Count, combined.Where(message => message.Type == "overlay"));
        var withMetrics = combined.First(message => message.Type == "event" &&
            message.Payload.GetProperty("eventType").GetString() == "PASS").Payload.GetProperty("metrics");
        Assert.IsGreaterThan(0, withMetrics.GetProperty("distanceM").GetDouble());
        Assert.IsGreaterThan(0, withMetrics.GetProperty("difficulty").GetInt32());
    }

    [TestMethod]
    public async Task ResumeFromLastEventIdReplaysOnlyTheRemainingItems()
    {
        using var application = Application();
        using var client = application.CreateClient();
        var timeline = application.Services.GetRequiredService<SyntheticMatchTimeline>();
        var afterIndex = timeline.Items.Count - 3;

        using var request = new HttpRequestMessage(HttpMethod.Get, Url("stream", "?speed=1000&fromSeconds=5500"));
        request.Headers.TryAddWithoutValidation("Last-Event-ID", afterIndex.ToString(System.Globalization.CultureInfo.InvariantCulture));
        using var response = await client.SendAsync(request, TestContext.CancellationToken);
        var messages = await ReadMessagesAsync(response, TestContext.CancellationToken);

        Assert.AreEqual("match", messages[0].Type);
        Assert.AreEqual(afterIndex, messages[0].Id);
        CollectionAssert.AreEqual(
            new[] { afterIndex + 1, afterIndex + 2, afterIndex + 3 }, messages.Skip(1).Select(message => message.Id).ToArray());
        Assert.AreEqual("complete", messages[^1].Type);
    }

    [TestMethod]
    [DataRow("events", "?speed=0")]
    [DataRow("events", "?speed=fast")]
    [DataRow("overlays", "?speed=1001")]
    [DataRow("stream", "?speed=NaN")]
    [DataRow("stream", "?fromSeconds=-1")]
    [DataRow("stream", "?fromSeconds=abc")]
    [DataRow("stream", "?fromSeconds=6000")]
    public async Task RejectsInvalidPlaybackParametersWithoutStreaming(string route, string query)
    {
        using var application = Application();
        using var client = application.CreateClient();

        using var response = await client.GetAsync(Url(route, query), TestContext.CancellationToken);

        Assert.AreEqual(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.AreEqual("application/json", response.Content.Headers.ContentType?.MediaType);
    }

    [TestMethod]
    public async Task RejectsUnknownMatchesAndInvalidResumeIdsWithoutFallbackContent()
    {
        using var application = Application();
        using var client = application.CreateClient();

        foreach (var route in new[] { "", "/events", "/overlays", "/stream" })
        {
            using var unknown = await client.GetAsync($"/api/matches/OTHER{route}", TestContext.CancellationToken);
            Assert.AreEqual(HttpStatusCode.NotFound, unknown.StatusCode, route);
            Assert.DoesNotContain("<html", await unknown.Content.ReadAsStringAsync(TestContext.CancellationToken), StringComparison.OrdinalIgnoreCase);
        }

        foreach (var lastEventId in new[] { "not-a-sequence", "-1", "999999" })
        {
            using var request = new HttpRequestMessage(HttpMethod.Get, Url("stream"));
            request.Headers.TryAddWithoutValidation("Last-Event-ID", lastEventId);
            using var invalid = await client.SendAsync(request, TestContext.CancellationToken);
            Assert.AreEqual(HttpStatusCode.BadRequest, invalid.StatusCode, lastEventId);
        }

        using var unimplemented = await client.GetAsync("/api/not-implemented", TestContext.CancellationToken);
        Assert.AreEqual(HttpStatusCode.NotFound, unimplemented.StatusCode);
    }
}
