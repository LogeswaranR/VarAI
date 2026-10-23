namespace VarAI.Server.Tests.Explanations;

internal sealed class ManualTimeProvider : TimeProvider
{
    private readonly object gate = new();
    private readonly List<ManualTimer> timers = [];
    private long ticks;

    public override long TimestampFrequency => TimeSpan.TicksPerSecond;
    public override long GetTimestamp()
    {
        lock (gate)
        {
            return ticks;
        }
    }

    public override DateTimeOffset GetUtcNow() => DateTimeOffset.UnixEpoch.AddTicks(GetTimestamp());

    public override ITimer CreateTimer(TimerCallback callback, object? state, TimeSpan dueTime, TimeSpan period)
    {
        var timer = new ManualTimer(this, callback, state);
        timer.Change(dueTime, period);
        return timer;
    }

    internal void Advance(TimeSpan amount)
    {
        ArgumentOutOfRangeException.ThrowIfLessThan(amount, TimeSpan.Zero);
        List<ManualTimer> ready;
        lock (gate)
        {
            ticks += amount.Ticks;
            ready = timers.Where(timer => timer.Due <= ticks).ToList();
            foreach (var timer in ready)
            {
                timers.Remove(timer);
            }
        }
        foreach (var timer in ready)
        {
            timer.Fire();
        }
    }

    internal int PendingTimers
    {
        get
        {
            lock (gate)
            {
                return timers.Count;
            }
        }
    }

    /// <summary>Jumps to the earliest pending timer and fires it. Returns false when nothing is scheduled.</summary>
    internal bool AdvanceToNextTimer()
    {
        TimeSpan amount;
        lock (gate)
        {
            if (timers.Count == 0)
            {
                return false;
            }

            amount = TimeSpan.FromTicks(Math.Max(0, timers.Min(timer => timer.Due) - ticks));
        }
        Advance(amount);
        return true;
    }

    private sealed class ManualTimer(ManualTimeProvider owner, TimerCallback callback, object? state) : ITimer
    {
        private bool disposed;
        internal long Due { get; private set; }

        public bool Change(TimeSpan dueTime, TimeSpan period)
        {
            if (period != Timeout.InfiniteTimeSpan)
            {
                throw new NotSupportedException("These deadline tests use only one-shot timers.");
            }
            lock (owner.gate)
            {
                if (disposed)
                {
                    return false;
                }
                owner.timers.Remove(this);
                if (dueTime != Timeout.InfiniteTimeSpan)
                {
                    Due = owner.ticks + dueTime.Ticks;
                    owner.timers.Add(this);
                }
                return true;
            }
        }

        internal void Fire()
        {
            lock (owner.gate)
            {
                if (disposed)
                {
                    return;
                }
            }
            callback(state);
        }

        public void Dispose()
        {
            lock (owner.gate)
            {
                disposed = true;
                owner.timers.Remove(this);
            }
        }

        public ValueTask DisposeAsync()
        {
            Dispose();
            return ValueTask.CompletedTask;
        }
    }
}
