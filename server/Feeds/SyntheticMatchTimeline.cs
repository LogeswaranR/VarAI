using System.Runtime.CompilerServices;
using VarAI.Contracts;

namespace VarAI.Server.Feeds;

public sealed record StreamOptions(double Speed, int FromMs, int AfterIndex, bool Events, bool Momentum, bool Overlays)
{
    public bool Includes(string kind) => kind switch
    {
        MatchStreamKinds.Event => Events,
        MatchStreamKinds.Momentum => Momentum,
        MatchStreamKinds.Overlay => Overlays,
        _ => true,
    };
}

public sealed record ScheduledItem(TimeSpan Offset, StreamItem Item);

/// <summary>
/// Builds the synthetic match once and exposes it as one time-ordered sequence (events, momentum samples, overlay
/// cues, completion). Playback pacing is a pure schedule so it can be tested without a clock.
/// </summary>
public sealed class SyntheticMatchTimeline
{
    public const string MatchId = SyntheticMatchGenerator.MatchId;
    public const string FeedSchemaVersion = "2.0";
    public const double MinimumSpeed = 1.0;
    public const double MaximumSpeed = 1000.0;
    public const double DefaultSpeed = 120.0;

    public SyntheticMatchTimeline()
    {
        var generated = SyntheticMatchGenerator.Generate();
        Events = MatchMetrics.Compute(generated.Events);
        var analysis = MatchInsightEngine.Analyze(Events);
        Momentum = analysis.Momentum;
        Overlays = analysis.Cues;
        Metadata = new SyntheticMatchMetadata(
            MatchId,
            new PitchSpec(SyntheticMatchGenerator.PitchLength, SyntheticMatchGenerator.PitchWidth),
            [
                new PeriodSpec(1, 0, SyntheticMatchGenerator.FirstPeriodEndMs),
                new PeriodSpec(2, SyntheticMatchGenerator.FirstPeriodEndMs, SyntheticMatchGenerator.MatchEndMs),
            ],
            SyntheticMatchGenerator.MatchEndMs, new Score(0, 0), generated.HomeTeam, generated.AwayTeam,
            analysis.Highlights, SyntheticMatchGenerator.DefaultSeed, true);
        FinalScore = Events.Last(item => item.ScoreAfter is not null).ScoreAfter!;
        Complete = new MatchComplete(MatchId, Events.Count, Momentum.Count, Overlays.Count, FinalScore);
        Items = BuildItems();
    }

    public SyntheticMatchMetadata Metadata { get; }

    public IReadOnlyList<SyntheticMatchEvent> Events { get; }

    public IReadOnlyList<MomentumSample> Momentum { get; }

    public IReadOnlyList<OverlayCue> Overlays { get; }

    public Score FinalScore { get; }

    public MatchComplete Complete { get; }

    public IReadOnlyList<StreamItem> Items { get; }

    public bool CanResumeFrom(int index) => index >= 0 && index <= Items.Count;

    public IEnumerable<ScheduledItem> Schedule(StreamOptions options)
    {
        foreach (var item in Items)
        {
            if (item.Index <= options.AfterIndex || !options.Includes(item.Kind))
            {
                continue;
            }

            var offset = item.TimeMs <= options.FromMs
                ? TimeSpan.Zero
                : TimeSpan.FromSeconds((item.TimeMs - options.FromMs) / 1000.0 / options.Speed);
            yield return new ScheduledItem(offset, item);
        }
    }

    public async IAsyncEnumerable<StreamItem> StreamAsync(
        StreamOptions options,
        TimeProvider timeProvider,
        [EnumeratorCancellation] CancellationToken cancellationToken = default)
    {
        var started = timeProvider.GetTimestamp();
        foreach (var scheduled in Schedule(options))
        {
            cancellationToken.ThrowIfCancellationRequested();
            while (true)
            {
                var wait = scheduled.Offset - timeProvider.GetElapsedTime(started);
                if (wait <= TimeSpan.Zero)
                {
                    break;
                }

                await Task.Delay(wait, timeProvider, cancellationToken);
            }

            yield return scheduled.Item;
        }
    }

    private IReadOnlyList<StreamItem> BuildItems()
    {
        var entries = new List<(int TimeMs, int KindOrder, int Position, string Kind, object Payload)>();
        var position = 0;
        foreach (var item in Events)
        {
            entries.Add((item.MatchClockMs, 0, position++, MatchStreamKinds.Event, item));
        }

        foreach (var sample in Momentum)
        {
            entries.Add((sample.MatchClockMs, 1, position++, MatchStreamKinds.Momentum, sample));
        }

        foreach (var cue in Overlays)
        {
            entries.Add((cue.InMs, 2, position++, MatchStreamKinds.Overlay, cue));
        }

        var completeAt = Math.Max(SyntheticMatchGenerator.MatchEndMs, entries.Max(entry => entry.TimeMs));
        entries.Add((completeAt, 3, position, MatchStreamKinds.Complete, Complete));
        return [.. entries
            .OrderBy(entry => entry.TimeMs).ThenBy(entry => entry.KindOrder).ThenBy(entry => entry.Position)
            .Select((entry, index) => new StreamItem(index + 1, entry.TimeMs, entry.Kind, entry.Payload))];
    }
}
