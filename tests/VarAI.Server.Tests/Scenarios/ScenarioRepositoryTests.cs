using VarAI.Contracts;
using VarAI.Scenarios;

namespace VarAI.Server.Tests.Scenarios;

[TestClass]
public sealed class ScenarioRepositoryTests
{
    public required TestContext TestContext { get; set; }

    [TestMethod]
    public async Task InterfaceListsAndFindsTheDeliveredRecordsInStableOrder()
    {
        var input = await ScenarioTestData.MutableCopyAsync(TestContext.CancellationToken);
        IScenarioRepository repository = new SyntheticScenarioRepository(input.Reverse());
        var summaries = await repository.ListAsync(TestContext.CancellationToken);
        CollectionAssert.AreEqual(Enum.GetValues<ScenarioId>(), summaries.Select(summary => summary.Id).ToArray());
        foreach (var summary in summaries)
        {
            var result = await repository.FindAsync(summary.Id, TestContext.CancellationToken);
            Assert.IsNotNull(result);
            Assert.AreEqual(summary.Id, result.Id);
            Assert.AreEqual(summary.ContentVersion, result.ContentVersion);
            Assert.AreEqual(summary.Synthetic, result.Synthetic);
            Assert.AreEqual(summary.Label, result.Label);
            Assert.AreEqual(ContractJson.Write(input.Single(scenario => scenario.Id == summary.Id)), ContractJson.Write(result));
        }
    }

    [TestMethod]
    [DataRow(-1)]
    [DataRow(3)]
    [DataRow(int.MaxValue)]
    public async Task UnknownIdsReturnNullOrAnExplicitVersionedLookupError(int value)
    {
        var repository = new SyntheticScenarioRepository();
        Assert.IsNull(await repository.FindAsync((ScenarioId)value, TestContext.CancellationToken));
        var result = await repository.FindAsync((ScenarioId)value, SyntheticScenarioLibrary.ContentVersion,
            "unknown-scenario", TestContext.CancellationToken);
        var error = Assert.IsInstanceOfType<ContractError>(result);
        ContractRules.Error(error);
        Assert.AreEqual(ErrorCode.ScenarioNotFound, error.Code);
        Assert.AreEqual("unknown-scenario", error.RequestId);
        Assert.IsFalse(error.Retryable);
    }

    [TestMethod]
    [DataRow(ScenarioId.S1)]
    [DataRow(ScenarioId.S2)]
    [DataRow(ScenarioId.S3)]
    public async Task VersionedLookupReturnsTheExactRequestedRecord(ScenarioId id)
    {
        var repository = new SyntheticScenarioRepository();
        var result = await repository.FindAsync(id, SyntheticScenarioLibrary.ContentVersion,
            "exact-version", TestContext.CancellationToken);
        var scenario = Assert.IsInstanceOfType<Scenario>(result);
        Assert.AreEqual(id, scenario.Id);
        Assert.AreEqual(SyntheticScenarioLibrary.ContentVersion, scenario.ContentVersion);
        Assert.AreEqual(ContractJson.Write(await repository.FindAsync(id, TestContext.CancellationToken)),
            ContractJson.Write(scenario));
    }

    [TestMethod]
    [DataRow("stub-0.2.0")]
    [DataRow("synthetic-1.0.1")]
    [DataRow("SYNTHETIC-1.0.0")]
    [DataRow("synthetic-1.0.0 ")]
    [DataRow("0.1")]
    public async Task ContentVersionMismatchIsExplicitAndNeverCoerced(string version)
    {
        var repository = new SyntheticScenarioRepository();
        var result = await repository.FindAsync(ScenarioId.S1, version, "stale-content", TestContext.CancellationToken);
        var error = Assert.IsInstanceOfType<ContractError>(result);
        ContractRules.Error(error);
        Assert.AreEqual(ErrorCode.ContentVersionMismatch, error.Code);
        Assert.AreEqual("stale-content", error.RequestId);
        Assert.IsFalse(error.Retryable);
    }

    [TestMethod]
    [DataRow(null)]
    [DataRow("")]
    [DataRow(" \t")]
    public async Task BlankVersionsAreInvalidRequestsNotVersionFallbacks(string? version)
    {
        var repository = new SyntheticScenarioRepository();
        var result = await repository.FindAsync(ScenarioId.S1, version!, "invalid-version", TestContext.CancellationToken);
        var error = Assert.IsInstanceOfType<ContractError>(result);
        ContractRules.Error(error);
        Assert.AreEqual(ErrorCode.InvalidRequest, error.Code);
        Assert.AreEqual("invalid-version", error.RequestId);
    }

    [TestMethod]
    [DataRow(null)]
    [DataRow("")]
    [DataRow(" \t")]
    public async Task MalformedCorrelationGetsAFreshSafeIdForEachError(string? requestId)
    {
        var repository = new SyntheticScenarioRepository();
        var first = Assert.IsInstanceOfType<ContractError>(await repository.FindAsync(
            ScenarioId.S1, SyntheticScenarioLibrary.ContentVersion, requestId!, TestContext.CancellationToken));
        var second = Assert.IsInstanceOfType<ContractError>(await repository.FindAsync(
            ScenarioId.S1, SyntheticScenarioLibrary.ContentVersion, requestId!, TestContext.CancellationToken));
        ContractRules.Error(first);
        ContractRules.Error(second);
        Assert.AreEqual(ErrorCode.InvalidRequest, first.Code);
        Assert.IsTrue(Guid.TryParseExact(first.RequestId, "N", out _));
        Assert.AreNotEqual(first.RequestId, second.RequestId);
    }

    [TestMethod]
    public async Task NewReleasePreservesItsVersionWithoutMutatingTheDefaultLibrary()
    {
        const string updatedVersion = "synthetic-1.0.1";
        var records = await ScenarioTestData.MutableCopyAsync(TestContext.CancellationToken);
        var updated = new SyntheticScenarioRepository(records.Select(scenario => scenario with
        {
            ContentVersion = updatedVersion,
            Label = scenario.Label.Replace(scenario.ContentVersion, updatedVersion, StringComparison.Ordinal)
        }));
        Assert.IsTrue((await updated.ListAsync(TestContext.CancellationToken)).All(summary => summary.ContentVersion == updatedVersion));
        foreach (var id in Enum.GetValues<ScenarioId>())
        {
            var result = Assert.IsInstanceOfType<Scenario>(
                await updated.FindAsync(id, updatedVersion, "updated-release", TestContext.CancellationToken));
            Assert.AreEqual(updatedVersion, result.ContentVersion);
            var mismatch = Assert.IsInstanceOfType<ContractError>(
                await updated.FindAsync(id, SyntheticScenarioLibrary.ContentVersion, "old-release", TestContext.CancellationToken));
            Assert.AreEqual(ErrorCode.ContentVersionMismatch, mismatch.Code);
        }
        var original = await new SyntheticScenarioRepository().FindAsync(ScenarioId.S1, TestContext.CancellationToken);
        Assert.IsNotNull(original);
        Assert.AreEqual(SyntheticScenarioLibrary.ContentVersion, original.ContentVersion);
    }

    [TestMethod]
    public async Task UnpairedS3CanHaveItsOwnExplicitContentRevision()
    {
        const string revisedVersion = "synthetic-1.0.1";
        var records = await ScenarioTestData.MutableCopyAsync(TestContext.CancellationToken);
        records[2] = records[2] with
        {
            ContentVersion = revisedVersion,
            Label = records[2].Label.Replace(records[2].ContentVersion, revisedVersion, StringComparison.Ordinal)
        };
        var repository = new SyntheticScenarioRepository(records);
        var summaries = await repository.ListAsync(TestContext.CancellationToken);
        Assert.AreEqual(SyntheticScenarioLibrary.ContentVersion, summaries[0].ContentVersion);
        Assert.AreEqual(SyntheticScenarioLibrary.ContentVersion, summaries[1].ContentVersion);
        Assert.AreEqual(revisedVersion, summaries[2].ContentVersion);
        var current = Assert.IsInstanceOfType<Scenario>(
            await repository.FindAsync(ScenarioId.S3, revisedVersion, "revised-s3", TestContext.CancellationToken));
        Assert.AreEqual(revisedVersion, current.ContentVersion);
        var stale = Assert.IsInstanceOfType<ContractError>(await repository.FindAsync(
            ScenarioId.S3, SyntheticScenarioLibrary.ContentVersion, "stale-s3", TestContext.CancellationToken));
        Assert.AreEqual(ErrorCode.ContentVersionMismatch, stale.Code);
    }

    [TestMethod]
    [DataRow("S4")]
    [DataRow("s1")]
    [DataRow("0")]
    [DataRow("")]
    [DataRow(" S1")]
    public async Task ExistingQueryBoundaryRejectsUnknownStringIdsWithTheRealRepository(string id)
    {
        var query = new ContractQuery();
        var result = await query.GetScenarioAsync(id, "query-unknown", new SyntheticScenarioRepository(), TestContext.CancellationToken);
        var error = Assert.IsInstanceOfType<ContractError>(result);
        Assert.AreEqual(ErrorCode.ScenarioNotFound, error.Code);
        Assert.AreEqual("query-unknown", error.RequestId);
    }

    [TestMethod]
    public async Task ExistingQueryBoundaryReturnsRealAuthoredDataWithoutApplicationWiring()
    {
        var query = new ContractQuery();
        var repository = new SyntheticScenarioRepository();
        foreach (var id in Enum.GetValues<ScenarioId>())
        {
            var result = await query.GetScenarioAsync(id.ToString(), "query-authored", repository, TestContext.CancellationToken);
            var scenario = Assert.IsInstanceOfType<Scenario>(result);
            Assert.AreEqual(id, scenario.Id);
            Assert.AreEqual(SyntheticScenarioLibrary.ContentVersion, scenario.ContentVersion);
            ContractRules.Scenario(scenario);
        }
    }

    [TestMethod]
    public void CancelledOperationsDoNotReturnDataOrConvertCancellationToDomainErrors()
    {
        var repository = new SyntheticScenarioRepository();
        var cancellationToken = new CancellationToken(canceled: true);
        Assert.ThrowsExactly<OperationCanceledException>(() => repository.ListAsync(cancellationToken));
        Assert.ThrowsExactly<OperationCanceledException>(() => repository.FindAsync(ScenarioId.S1, cancellationToken));
        Assert.ThrowsExactly<OperationCanceledException>(() => repository.FindAsync((ScenarioId)999, cancellationToken));
        Assert.ThrowsExactly<OperationCanceledException>(() =>
            repository.FindAsync(ScenarioId.S1, SyntheticScenarioLibrary.ContentVersion, "cancelled", cancellationToken));
    }

    [TestMethod]
    public async Task EveryExposedCollectionRejectsMutationAndFutureLookupsStayUnchanged()
    {
        var repository = new SyntheticScenarioRepository();
        var summaries = await repository.ListAsync(TestContext.CancellationToken);
        AssertFrozen(summaries, summaries[0]);
        foreach (var id in Enum.GetValues<ScenarioId>())
        {
            var scenario = await repository.FindAsync(id, TestContext.CancellationToken);
            Assert.IsNotNull(scenario);
            var before = ContractJson.Write(scenario);
            AssertFrozen(scenario.Facts, scenario.Facts[0]);
            AssertFrozen(scenario.Rules, scenario.Rules[0]);
            AssertFrozen(scenario.Events, scenario.Events[0]);
            AssertFrozen(scenario.Diagram.Markers, new Marker("added", MarkerRole.Ball, "added", 1, 1));
            foreach (var item in scenario.Events)
            {
                AssertFrozen(item.RevealFactIds, "added");
            }
            foreach (var body in new[] { scenario.AuthoredExplanations.Casual, scenario.AuthoredExplanations.Analyst })
            {
                AssertFrozen(body.Points, body.Headline);
                AssertFrozen(body.Limitations, "added");
                foreach (var claim in ScenarioTestData.Claims(body))
                {
                    AssertFrozen(claim.EvidenceIds, "added");
                    AssertFrozen(claim.RuleIds, "added");
                }
            }
            var editedCopy = scenario with
            {
                ContentVersion = "caller-edit",
                Match = scenario.Match with { HomeTeam = "Caller team" },
                Facts = []
            };
            Assert.AreEqual("caller-edit", editedCopy.ContentVersion);
            Assert.AreEqual(before, ContractJson.Write(await repository.FindAsync(id, TestContext.CancellationToken)));
        }
    }

    [TestMethod]
    public async Task MutatingAllCallerOwnedNestedCollectionsCannotAlterTheRepository()
    {
        var records = await ScenarioTestData.MutableCopyAsync(TestContext.CancellationToken);
        var repository = new SyntheticScenarioRepository(records);
        var first = records[0];
        var before = ContractJson.Write(await repository.FindAsync(first.Id, TestContext.CancellationToken));
        ((IList<Fact>)first.Facts)[0] = first.Facts[0] with { Value = new BooleanFactValue(false) };
        ((IList<RuleReference>)first.Rules)[0] = first.Rules[0] with { Summary = "Caller edit" };
        ((IList<string>)first.Events[0].RevealFactIds)[0] = "Caller edit";
        ((IList<ReplayEvent>)first.Events)[0] = first.Events[0] with { OffsetMs = 99 };
        ((IList<Marker>)first.Diagram.Markers)[0] = first.Diagram.Markers[0] with { X = 99 };
        foreach (var body in new[] { first.AuthoredExplanations.Casual, first.AuthoredExplanations.Analyst })
        {
            foreach (var claim in ScenarioTestData.Claims(body))
            {
                ((IList<string>)claim.EvidenceIds)[0] = "Caller edit";
                if (claim.RuleIds.Count > 0)
                {
                    ((IList<string>)claim.RuleIds)[0] = "Caller edit";
                }
            }
            ((IList<Claim>)body.Points)[0] = body.Points[0] with { Text = "Caller edit" };
            ((IList<string>)body.Limitations)[0] = "Caller edit";
        }
        records[0] = first with { Label = "Caller edit", Match = first.Match with { HomeTeam = "Caller edit" } };
        var after = await repository.FindAsync(ScenarioId.S1, TestContext.CancellationToken);
        Assert.IsNotNull(after);
        Assert.AreEqual(before, ContractJson.Write(after));
        ContractRules.Scenario(after);
    }

    private static void AssertFrozen<T>(IReadOnlyList<T> items, T replacement)
    {
        var list = Assert.IsInstanceOfType<IList<T>>(items);
        Assert.IsTrue(list.IsReadOnly);
        Assert.ThrowsExactly<NotSupportedException>(() => list.Add(replacement));
        Assert.ThrowsExactly<NotSupportedException>(list.Clear);
        if (items.Count > 0)
        {
            Assert.ThrowsExactly<NotSupportedException>(() => list[0] = replacement);
            Assert.ThrowsExactly<NotSupportedException>(() => list.RemoveAt(0));
        }
    }
}
