using System.Text.Json;
using HotChocolate;
using HotChocolate.Execution;
using Microsoft.Extensions.DependencyInjection;
using VarAI.Contracts;

namespace VarAI.ContractStubs;

public sealed class StubExecutor : IAsyncDisposable
{
    private readonly ServiceProvider services;
    public IRequestExecutor Executor { get; }

    private StubExecutor(ServiceProvider services, IRequestExecutor executor)
    {
        this.services = services;
        Executor = executor;
    }

    public static async Task<StubExecutor> CreateAsync(ErrorCode? forcedError = null)
    {
        var collection = new ServiceCollection();
        collection.AddSingleton<IScenarioRepository, StubScenarioRepository>();
        collection.AddSingleton<IExplanationService>(services =>
            new StubExplanationService(services.GetRequiredService<IScenarioRepository>(), forcedError));
        collection.AddVarAiContract();
        var services = collection.BuildServiceProvider();
        var created = false;
        try
        {
            var executor = new StubExecutor(services, await services.GetRequestExecutorAsync());
            created = true;
            return executor;
        }
        finally
        {
            if (!created)
            {
                await services.DisposeAsync();
            }
        }
    }

    public async Task<JsonElement> ExecuteAsync(
        string document, string operationName, string variables = "{}", CancellationToken cancellationToken = default)
    {
        var request = OperationRequestBuilder.New()
            .SetDocument(document)
            .SetOperationName(operationName)
            .SetVariableValues(variables)
            .Build();
        await using var result = await Executor.ExecuteAsync(request, cancellationToken);
        using var json = JsonDocument.Parse(result.ToJson());
        return json.RootElement.Clone();
    }

    public ValueTask DisposeAsync() => services.DisposeAsync();
}
