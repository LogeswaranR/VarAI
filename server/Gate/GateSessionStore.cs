using System.Collections.Concurrent;
using System.Security.Cryptography;
using System.Text.RegularExpressions;
using VarAI.Server.Feeds;
using VarAI.Server.Narration;

namespace VarAI.Server.Gate;

public enum SessionCreateFailure
{
    InvalidSpeed,
    InvalidStart,
    Full,
}

public sealed record SessionCreateResult(GateSession? Session, SessionCreateFailure? Failure, string? Detail);

/// <summary>Holds live gated sessions in memory, bounded in number and in lifetime. A restart or scale-to-zero loses them.</summary>
public sealed partial class GateSessionStore(
    SyntheticMatchTimeline timeline, NarrationService narration, GateOptions options, TimeProvider time,
    ILoggerFactory loggers, bool autoRun = true) : IDisposable
{
    private readonly ConcurrentDictionary<string, GateSession> sessions = new(StringComparer.Ordinal);
    private readonly object gate = new();
    private readonly ILogger logger = loggers.CreateLogger<GateSession>();

    public GateOptions Options { get; } = options;

    public int Count => sessions.Count;

    [GeneratedRegex("^[0-9a-f]{32}$", RegexOptions.CultureInvariant)]
    private static partial Regex SessionIdPattern();

    public static bool IsValidId(string? id) => id is not null && SessionIdPattern().IsMatch(id);

    public SessionCreateResult Create(double speed, int fromSeconds)
    {
        if (!(speed >= Options.MinimumSpeed && speed <= Options.MaximumSpeed))
        {
            return Fail(SessionCreateFailure.InvalidSpeed,
                $"speed must be between {Options.MinimumSpeed:0.#} and {Options.MaximumSpeed:0.#} so an operator can keep up.");
        }

        if (fromSeconds < 0 || fromSeconds > timeline.Metadata.DurationMs / 1000)
        {
            return Fail(SessionCreateFailure.InvalidStart, "fromSeconds must be a match-clock second within the match.");
        }

        lock (gate)
        {
            EvictExpired();
            if (sessions.Count >= Options.MaxSessions)
            {
                return Fail(SessionCreateFailure.Full, "The demo already has the maximum number of live sessions. Try again shortly.");
            }

            var id = Convert.ToHexStringLower(RandomNumberGenerator.GetBytes(16));
            var session = new GateSession(id, timeline, narration, Options, speed, fromSeconds, time, logger, autoRun);
            sessions[id] = session;
            return new SessionCreateResult(session, null, null);
        }
    }

    public GateSession? Get(string? id)
    {
        if (!IsValidId(id) || !sessions.TryGetValue(id!, out var session))
        {
            return null;
        }

        if (session.ExpiresAt <= time.GetUtcNow())
        {
            lock (gate)
            {
                EvictExpired();
            }

            return null;
        }

        return session;
    }

    private void EvictExpired()
    {
        var now = time.GetUtcNow();
        foreach (var (id, session) in sessions)
        {
            if (session.ExpiresAt <= now && sessions.TryRemove(id, out var removed))
            {
                removed.Dispose();
            }
        }
    }

    private static SessionCreateResult Fail(SessionCreateFailure failure, string detail) => new(null, failure, detail);

    public void Dispose()
    {
        foreach (var session in sessions.Values)
        {
            session.Dispose();
        }

        sessions.Clear();
    }
}
