using System.Globalization;
using System.Text.Json;

namespace VarAI.Server.Feeds;

public static class SyntheticMatchEndpoints
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public static void Map(IEndpointRouteBuilder routes)
    {
        routes.MapGet("/api/matches/{matchId}", GetMetadata);
        routes.MapGet("/api/matches/{matchId}/events",
            (string matchId, HttpContext context, SyntheticMatchTimeline timeline, TimeProvider time) =>
                StreamAsync(matchId, context, timeline, time, events: true, momentum: false, overlays: false));
        routes.MapGet("/api/matches/{matchId}/overlays",
            (string matchId, HttpContext context, SyntheticMatchTimeline timeline, TimeProvider time) =>
                StreamAsync(matchId, context, timeline, time, events: false, momentum: false, overlays: true));
        routes.MapGet("/api/matches/{matchId}/stream",
            (string matchId, HttpContext context, SyntheticMatchTimeline timeline, TimeProvider time) =>
                StreamAsync(matchId, context, timeline, time, events: true, momentum: true, overlays: true));
        routes.MapGet("/api/matches/{matchId}/live",
            (string matchId, HttpContext context, TimeProvider time) =>
                StreamAsync(matchId, context, null, time, events: true, momentum: true, overlays: true));
    }

    private static IResult GetMetadata(string matchId, SyntheticMatchTimeline timeline) =>
        StringComparer.Ordinal.Equals(matchId, SyntheticMatchTimeline.MatchId)
            ? Results.Json(timeline.Metadata, JsonOptions)
            : Results.NotFound();

    private static async Task StreamAsync(
        string matchId, HttpContext context, SyntheticMatchTimeline? timeline, TimeProvider time,
        bool events, bool momentum, bool overlays)
    {
        if (!StringComparer.Ordinal.Equals(matchId, SyntheticMatchTimeline.MatchId))
        {
            context.Response.StatusCode = StatusCodes.Status404NotFound;
            return;
        }

        var query = context.Request.Query;
        var speed = SyntheticMatchTimeline.DefaultSpeed;
        if (query.TryGetValue("speed", out var speedText) &&
            (!double.TryParse(speedText.ToString(), NumberStyles.Float, CultureInfo.InvariantCulture, out speed) ||
             double.IsNaN(speed) || speed < SyntheticMatchTimeline.MinimumSpeed || speed > SyntheticMatchTimeline.MaximumSpeed))
        {
            await RejectAsync(context, $"speed must be between {SyntheticMatchTimeline.MinimumSpeed} and {SyntheticMatchTimeline.MaximumSpeed}.");
            return;
        }

        var fromSeconds = 0;
        if (query.TryGetValue("fromSeconds", out var fromText) &&
            (!int.TryParse(fromText.ToString(), NumberStyles.None, CultureInfo.InvariantCulture, out fromSeconds) ||
             fromSeconds > SyntheticMatchGenerator.MatchEndMs / 1000))
        {
            await RejectAsync(context, "fromSeconds must be a match-clock second within the match.");
            return;
        }

        var lastEventId = context.Request.Headers["Last-Event-ID"].ToString();
        var afterIndex = 0;
        if (lastEventId.Length > 0 &&
            (!int.TryParse(lastEventId, NumberStyles.None, CultureInfo.InvariantCulture, out afterIndex) ||
             (timeline is not null && !timeline.CanResumeFrom(afterIndex))))
        {
            await RejectAsync(context, "Last-Event-ID must be an item ID from this synthetic stream.");
            return;
        }

        var cancellationToken = context.RequestAborted;
        using var liveItems = timeline is null
            ? IncrementalMatchProcessor.Process(SyntheticMatchGenerator.Generate().Events).GetEnumerator()
            : null;
        var resumeMs = fromSeconds * 1000;
        if (liveItems is not null)
        {
            for (var skipped = 0; skipped < afterIndex; skipped++)
            {
                cancellationToken.ThrowIfCancellationRequested();
                if (!liveItems.MoveNext())
                {
                    await RejectAsync(context, "Last-Event-ID must be an item ID from this live synthetic stream.");
                    return;
                }

                resumeMs = Math.Max(resumeMs, liveItems.Current.TimeMs);
            }
        }

        context.Response.StatusCode = StatusCodes.Status200OK;
        context.Response.ContentType = "text/event-stream";
        context.Response.Headers.CacheControl = "no-cache, no-transform";
        context.Response.Headers["X-Accel-Buffering"] = "no";
        context.Response.Headers["X-VarAI-Processing"] = timeline is null ? "incremental" : "precomputed-replay";

        try
        {
            await context.Response.StartAsync(cancellationToken);
            await WriteAsync(context, afterIndex, MatchStreamKinds.Match, timeline?.Metadata ?? SyntheticMatchGenerator.Describe(), cancellationToken);
            if (liveItems is not null)
            {
                var started = time.GetTimestamp();
                while (liveItems.MoveNext())
                {
                    cancellationToken.ThrowIfCancellationRequested();
                    var item = liveItems.Current;
                    var due = TimeSpan.FromMilliseconds(Math.Max(0, item.TimeMs - resumeMs) / speed);
                    while (due - time.GetElapsedTime(started) is { } wait && wait > TimeSpan.Zero)
                    {
                        await Task.Delay(wait, time, cancellationToken);
                    }

                    await WriteAsync(context, item.Index, item.Kind, item.Payload, cancellationToken);
                }
            }
            else if (timeline is not null)
            {
                var options = new StreamOptions(speed, fromSeconds * 1000, afterIndex, events, momentum, overlays);
                await foreach (var item in timeline.StreamAsync(options, time, cancellationToken))
                {
                    await WriteAsync(context, item.Index, item.Kind, item.Payload, cancellationToken);
                }
            }
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
        }
    }

    private static async Task RejectAsync(HttpContext context, string message)
    {
        context.Response.StatusCode = StatusCodes.Status400BadRequest;
        await context.Response.WriteAsJsonAsync(new { error = message }, context.RequestAborted);
    }

    private static async Task WriteAsync(
        HttpContext context, int id, string type, object payload, CancellationToken cancellationToken)
    {
        var data = JsonSerializer.Serialize(
            new FeedMessage(SyntheticMatchTimeline.FeedSchemaVersion, type, payload), JsonOptions);
        await context.Response.WriteAsync($"id: {id}\ndata: {data}\n\n", cancellationToken);
        await context.Response.Body.FlushAsync(cancellationToken);
    }

    private sealed record FeedMessage(string SchemaVersion, string Type, object Payload);
}
