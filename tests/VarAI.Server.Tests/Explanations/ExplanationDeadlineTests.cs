using VarAI.Contracts;
using static VarAI.Server.Tests.Explanations.ExplanationFixtures;

namespace VarAI.Server.Tests.Explanations;

[TestClass]
public sealed class ExplanationDeadlineTests
{
    public required TestContext TestContext { get; set; }

    [TestMethod]
    public async Task ExplainAsync_DeadlineIsExactlyFifteenSecondsAndCancelsProvider()
    {
        var clock = new ManualTimeProvider();
        var provider = new Provider
        {
            Generate = async (_, token) =>
            {
                await Task.Delay(Timeout.InfiniteTimeSpan, token);
                return "must never be returned";
            }
        };
        var pending = Service(provider: provider, clock: clock).ExplainAsync(Request(), TestContext.CancellationToken);
        Assert.AreEqual(1, provider.Calls);
        clock.Advance(TimeSpan.FromMilliseconds(14_999));
        Assert.IsFalse(pending.IsCompleted);
        clock.Advance(TimeSpan.FromMilliseconds(1));
        Error(await pending, ErrorCode.Timeout);
        Assert.IsTrue(provider.LastToken.IsCancellationRequested);
        Assert.AreEqual(1, provider.Calls);
    }

    [TestMethod]
    public async Task ExplainAsync_RepositoryTimeCountsAgainstTheSameDeadline()
    {
        var clock = new ManualTimeProvider();
        var repository = new Repository
        {
            Find = (_, _) =>
            {
                clock.Advance(TimeSpan.FromSeconds(10));
                return Task.FromResult<Scenario?>(Scenario());
            }
        };
        var completion = new TaskCompletionSource<string>(TaskCreationOptions.RunContinuationsAsynchronously);
        var provider = new Provider { Generate = (_, _) => completion.Task };
        var pending = Service(repository, provider, clock: clock).ExplainAsync(Request(), TestContext.CancellationToken);
        Assert.AreEqual(1, provider.Calls);
        clock.Advance(TimeSpan.FromSeconds(5));
        Error(await pending, ErrorCode.Timeout);
        completion.SetResult(Raw(Scenario(), Audience.Casual));
        await completion.Task;
    }

    [TestMethod]
    public async Task ExplainAsync_NonCooperativeRepositoryCannotStartALateProviderCall()
    {
        var clock = new ManualTimeProvider();
        var completion = new TaskCompletionSource<Scenario?>(TaskCreationOptions.RunContinuationsAsynchronously);
        var repository = new Repository { Find = (_, _) => completion.Task };
        var provider = new Provider();
        var pending = Service(repository, provider, clock: clock).ExplainAsync(Request(), TestContext.CancellationToken);
        clock.Advance(TimeSpan.FromSeconds(15));
        Error(await pending, ErrorCode.Timeout);
        completion.SetResult(Scenario());
        await completion.Task;
        Assert.AreEqual(0, provider.Calls);
    }

    [TestMethod]
    [DataRow(false)]
    [DataRow(true)]
    public async Task ExplainAsync_NonCooperativeProviderCannotValidateOrPublishLateOutput(bool fault)
    {
        var clock = new ManualTimeProvider();
        var completion = new TaskCompletionSource<string>(TaskCreationOptions.RunContinuationsAsynchronously);
        var provider = new Provider { Generate = (_, _) => completion.Task };
        var validator = new Validator();
        var pending = Service(provider: provider, validator: validator, clock: clock)
            .ExplainAsync(Request(), TestContext.CancellationToken);
        clock.Advance(TimeSpan.FromSeconds(15));
        var error = Error(await pending, ErrorCode.Timeout);
        if (fault)
        {
            completion.SetException(new InvalidOperationException("FICTITIOUS_LATE_PROVIDER_FAILURE"));
            await Assert.ThrowsExactlyAsync<InvalidOperationException>(() => completion.Task);
        }
        else
        {
            completion.SetResult(Raw(Scenario(), Audience.Casual));
            await completion.Task;
        }
        Assert.AreEqual(0, validator.Calls);
        Assert.AreSame(error, await pending);
        Assert.AreEqual(1, provider.Calls);
    }

    [TestMethod]
    public async Task ExplainAsync_OutputValidationCannotReturnSuccessAfterDeadline()
    {
        var clock = new ManualTimeProvider();
        var validator = new Validator { OnParse = () => clock.Advance(TimeSpan.FromSeconds(15)) };
        Error(await Service(validator: validator, clock: clock).ExplainAsync(Request(), TestContext.CancellationToken),
            ErrorCode.Timeout);
        Assert.AreEqual(1, validator.Calls);
    }

    [TestMethod]
    [DataRow(14_999, false)]
    [DataRow(15_000, true)]
    public async Task ExplainAsync_SynchronouslyCompletedProviderCannotBypassDeadline(int elapsedMs, bool timeout)
    {
        var clock = new ManualTimeProvider();
        var provider = new Provider
        {
            Generate = (input, _) =>
            {
                clock.Advance(TimeSpan.FromMilliseconds(elapsedMs));
                return Task.FromResult(Raw(Scenario(input.ScenarioId), input.Audience));
            }
        };
        var result = await Service(provider: provider, clock: clock).ExplainAsync(Request(), TestContext.CancellationToken);
        if (timeout)
        {
            Error(result, ErrorCode.Timeout);
        }
        else
        {
            Assert.IsInstanceOfType<ExplanationSuccess>(result);
        }
    }

    [TestMethod]
    public async Task ExplainAsync_PreCancelledCallerDoesNoWork()
    {
        using var caller = CancellationTokenSource.CreateLinkedTokenSource(TestContext.CancellationToken);
        caller.Cancel();
        var repository = new Repository();
        var provider = new Provider();
        await Assert.ThrowsAsync<OperationCanceledException>(() =>
            Service(repository, provider).ExplainAsync(Request(), caller.Token));
        Assert.AreEqual(0, repository.Calls);
        Assert.AreEqual(0, provider.Calls);
    }

    [TestMethod]
    [DataRow(false)]
    [DataRow(true)]
    public async Task ExplainAsync_CallerCancellationIsPropagatedInsteadOfAContractError(bool deadlineAlsoExpires)
    {
        using var caller = CancellationTokenSource.CreateLinkedTokenSource(TestContext.CancellationToken);
        var clock = new ManualTimeProvider();
        var completion = new TaskCompletionSource<string>(TaskCreationOptions.RunContinuationsAsynchronously);
        var provider = new Provider { Generate = (_, _) => completion.Task };
        var pending = Service(provider: provider, clock: clock).ExplainAsync(Request(), caller.Token);
        caller.Cancel();
        if (deadlineAlsoExpires)
        {
            clock.Advance(TimeSpan.FromSeconds(15));
        }
        var exception = await Assert.ThrowsAsync<OperationCanceledException>(() => pending);
        Assert.AreEqual(caller.Token, exception.CancellationToken);
        Assert.IsTrue(provider.LastToken.IsCancellationRequested);
        completion.SetResult(Raw(Scenario(), Audience.Casual));
        await completion.Task;
    }

    [TestMethod]
    public async Task ExplainAsync_AuthoredRepositoryResolutionAlsoHonoursDeadline()
    {
        var clock = new ManualTimeProvider();
        var repository = new Repository
        {
            Find = (_, _) =>
            {
                clock.Advance(TimeSpan.FromSeconds(15));
                return Task.FromResult<Scenario?>(Scenario());
            }
        };
        var provider = new Provider();
        Error(await Service(repository, provider, clock: clock).ExplainAsync(
            Request(mode: SourceMode.Authored), TestContext.CancellationToken), ErrorCode.Timeout);
        Assert.AreEqual(0, provider.Calls);
    }
}
