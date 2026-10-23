using System.Text.Json;
using VarAI.Server.Feeds;
using VarAI.Server.Narration;

namespace VarAI.Server.Gate;

internal static class SseWriter
{
    public static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    public static async Task StartAsync(HttpContext context, CancellationToken cancellationToken)
    {
        context.Response.StatusCode = StatusCodes.Status200OK;
        context.Response.ContentType = "text/event-stream";
        context.Response.Headers.CacheControl = "no-cache, no-transform";
        context.Response.Headers["X-Accel-Buffering"] = "no";
        await context.Response.StartAsync(cancellationToken);
    }

    public static async Task WriteAsync(
        HttpContext context, string schemaVersion, int id, string type, object payload, CancellationToken cancellationToken)
    {
        var data = JsonSerializer.Serialize(new Envelope(schemaVersion, type, payload), Json);
        await context.Response.WriteAsync($"id: {id}\ndata: {data}\n\n", cancellationToken);
        await context.Response.Body.FlushAsync(cancellationToken);
    }

    private sealed record Envelope(string SchemaVersion, string Type, object Payload);
}

/// <summary>
/// The operator-gated routes. A session is a capability held by whoever created it (an unguessable id); there is no
/// operator login in this demo, and the decision log says so.
/// </summary>
public static class GateEndpoints
{
    public const string DeskSchemaVersion = "1.0";
    private const int MaximumBodyBytes = 16 * 1024;

    private sealed record CreateSessionRequest(double? Speed, int? FromSeconds);

    public static void Map(IEndpointRouteBuilder routes)
    {
        routes.MapGet("/api/narration", (NarrationService narration) => Results.Json(narration.Status, SseWriter.Json));
        routes.MapPost("/api/matches/{matchId}/sessions", CreateSessionAsync);
        routes.MapGet("/api/matches/{matchId}/sessions/{sessionId}/program", ProgramAsync);
        routes.MapGet("/api/matches/{matchId}/sessions/{sessionId}/desk", DeskAsync);
        routes.MapPost("/api/matches/{matchId}/sessions/{sessionId}/decisions", DecideAsync);
        routes.MapGet("/api/matches/{matchId}/sessions/{sessionId}/decision-log.jsonl", DecisionLog);
    }

    private static async Task<IResult> CreateSessionAsync(string matchId, HttpContext context, GateSessionStore store)
    {
        if (!IsMatch(matchId))
        {
            return Results.NotFound();
        }

        var (request, problem) = await ReadBodyAsync<CreateSessionRequest>(context, allowEmpty: true);
        if (problem is not null)
        {
            return problem;
        }

        var speed = request?.Speed ?? store.Options.MaximumSpeed;
        var from = request?.FromSeconds ?? 0;
        var result = store.Create(speed, from);
        if (result.Session is not { } session)
        {
            if (result.Failure == SessionCreateFailure.Full)
            {
                context.Response.Headers.RetryAfter = "30";
                return Error(StatusCodes.Status503ServiceUnavailable, "SESSIONS_FULL", result.Detail!);
            }

            return Error(
                StatusCodes.Status400BadRequest,
                result.Failure == SessionCreateFailure.InvalidSpeed ? "INVALID_SPEED" : "INVALID_START", result.Detail!);
        }

        return Results.Json(
            session.View(), SseWriter.Json, statusCode: StatusCodes.Status201Created,
            contentType: "application/json; charset=utf-8");
    }

    private static async Task ProgramAsync(
        string matchId, string sessionId, HttpContext context, GateSessionStore store, SyntheticMatchTimeline timeline)
    {
        var session = Resolve(matchId, sessionId, store);
        if (session is null)
        {
            context.Response.StatusCode = StatusCodes.Status404NotFound;
            return;
        }

        if (!TryReadLastEventId(context, timeline.Items.Count, out var afterIndex))
        {
            await RejectAsync(context, "Last-Event-ID must be an item ID from this synthetic stream.");
            return;
        }

        var cancellationToken = context.RequestAborted;
        try
        {
            await SseWriter.StartAsync(context, cancellationToken);
            await SseWriter.WriteAsync(
                context, SyntheticMatchTimeline.FeedSchemaVersion, afterIndex, MatchStreamKinds.Match, timeline.Metadata,
                cancellationToken);
            await foreach (var item in session.ProgramAsync(afterIndex, cancellationToken))
            {
                await SseWriter.WriteAsync(
                    context, SyntheticMatchTimeline.FeedSchemaVersion, item.Index, item.Kind, item.Payload, cancellationToken);
            }
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
        }
    }

    private static async Task DeskAsync(string matchId, string sessionId, HttpContext context, GateSessionStore store)
    {
        var session = Resolve(matchId, sessionId, store);
        if (session is null)
        {
            context.Response.StatusCode = StatusCodes.Status404NotFound;
            return;
        }

        if (!TryReadLastEventId(context, int.MaxValue, out var afterSeq))
        {
            await RejectAsync(context, "Last-Event-ID must be a desk message number.");
            return;
        }

        var cancellationToken = context.RequestAborted;
        try
        {
            await SseWriter.StartAsync(context, cancellationToken);
            await foreach (var message in session.DeskAsync(afterSeq, cancellationToken))
            {
                await SseWriter.WriteAsync(context, DeskSchemaVersion, message.Seq, message.Type, message.Payload, cancellationToken);
            }
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
        }
    }

    private static async Task<IResult> DecideAsync(string matchId, string sessionId, HttpContext context, GateSessionStore store)
    {
        var session = Resolve(matchId, sessionId, store);
        if (session is null)
        {
            return Results.NotFound();
        }

        var (request, problem) = await ReadBodyAsync<DecisionRequest>(context, allowEmpty: false);
        if (problem is not null)
        {
            return problem;
        }

        var outcome = session.Decide(request!);
        if (outcome.Result is { } result)
        {
            return Results.Json(result, SseWriter.Json);
        }

        return outcome.Failure switch
        {
            DecisionFailure.UnknownProposal => Error(StatusCodes.Status404NotFound, "UNKNOWN_PROPOSAL", outcome.Detail!),
            DecisionFailure.AlreadyDecided => Error(StatusCodes.Status409Conflict, "ALREADY_DECIDED", outcome.Detail!),
            DecisionFailure.SlaExpired => Error(StatusCodes.Status409Conflict, "SLA_EXPIRED", outcome.Detail!),
            DecisionFailure.StalePayload => Error(StatusCodes.Status409Conflict, "STALE_PAYLOAD", outcome.Detail!),
            _ => Error(StatusCodes.Status400BadRequest, "INVALID_DECISION", outcome.Detail!),
        };
    }

    private static IResult DecisionLog(string matchId, string sessionId, HttpContext context, GateSessionStore store)
    {
        var session = Resolve(matchId, sessionId, store);
        if (session is null)
        {
            return Results.NotFound();
        }

        context.Response.Headers.CacheControl = "no-store";
        context.Response.Headers["X-Decision-Log-Head"] = session.Log.HeadHash;
        context.Response.Headers["X-Decision-Log-Entries"] = session.Log.Count.ToString(System.Globalization.CultureInfo.InvariantCulture);
        return Results.File(
            System.Text.Encoding.UTF8.GetBytes(session.Log.ToJsonl()), "application/x-ndjson; charset=utf-8",
            $"varai-decisions-{session.SessionId}.jsonl");
    }

    private static GateSession? Resolve(string matchId, string sessionId, GateSessionStore store) =>
        IsMatch(matchId) ? store.Get(sessionId) : null;

    private static bool IsMatch(string matchId) =>
        StringComparer.Ordinal.Equals(matchId, SyntheticMatchTimeline.MatchId);

    private static bool TryReadLastEventId(HttpContext context, int maximum, out int value)
    {
        value = 0;
        var header = context.Request.Headers["Last-Event-ID"].ToString();
        return header.Length == 0 ||
            (int.TryParse(header, System.Globalization.NumberStyles.None, System.Globalization.CultureInfo.InvariantCulture, out value) &&
             value <= maximum);
    }

    private static async Task<(T? Value, IResult? Problem)> ReadBodyAsync<T>(HttpContext context, bool allowEmpty)
        where T : class
    {
        var contentLength = context.Request.ContentLength;
        if (contentLength is null or 0 && allowEmpty && !context.Request.HasJsonContentType())
        {
            return (null, null);
        }

        if (!context.Request.HasJsonContentType())
        {
            return (null, Error(StatusCodes.Status415UnsupportedMediaType, "UNSUPPORTED_MEDIA_TYPE", "Send application/json."));
        }

        if (contentLength > MaximumBodyBytes)
        {
            return (null, Error(StatusCodes.Status413PayloadTooLarge, "BODY_TOO_LARGE", "The request body is too large."));
        }

        using var buffer = new MemoryStream();
        var chunk = new byte[4_096];
        int read;
        while ((read = await context.Request.Body.ReadAsync(chunk, context.RequestAborted)) > 0)
        {
            if (buffer.Length + read > MaximumBodyBytes)
            {
                return (null, Error(StatusCodes.Status413PayloadTooLarge, "BODY_TOO_LARGE", "The request body is too large."));
            }

            buffer.Write(chunk, 0, read);
        }

        if (buffer.Length == 0)
        {
            return allowEmpty
                ? (null, null)
                : (null, Error(StatusCodes.Status400BadRequest, "INVALID_BODY", "A JSON body is required."));
        }

        try
        {
            var value = JsonSerializer.Deserialize<T>(buffer.ToArray(), SseWriter.Json);
            return value is null
                ? (null, Error(StatusCodes.Status400BadRequest, "INVALID_BODY", "A JSON object is required."))
                : (value, null);
        }
        catch (JsonException)
        {
            return (null, Error(StatusCodes.Status400BadRequest, "INVALID_BODY", "The body is not valid JSON for this request."));
        }
    }

    private static IResult Error(int status, string code, string message) =>
        Results.Json(new { error = message, code }, SseWriter.Json, statusCode: status);

    private static async Task RejectAsync(HttpContext context, string message)
    {
        context.Response.StatusCode = StatusCodes.Status400BadRequest;
        await context.Response.WriteAsJsonAsync(new { error = message }, context.RequestAborted);
    }
}
