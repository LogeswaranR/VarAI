using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;

namespace VarAI.Server.Tests;

[TestClass]
public sealed class ScaffoldTests
{
    public required TestContext TestContext { get; set; }

    [TestMethod]
    public async Task DevelopmentHostLeavesUiServingToVite()
    {
        using var factory = new WebApplicationFactory<Program>();
        using var application = factory.WithWebHostBuilder(builder => builder.UseEnvironment("Development"));
        using var client = application.CreateClient();
        using var response = await client.GetAsync("/", TestContext.CancellationToken);

        Assert.AreEqual(HttpStatusCode.NotFound, response.StatusCode);
    }

    [TestMethod]
    public async Task HealthReportsLocalReviewAndContractVersionNotLiveReadiness()
    {
        using var application = new WebApplicationFactory<Program>();
        using var client = application.CreateClient();
        using var response = await client.GetAsync("/health", TestContext.CancellationToken);

        Assert.AreEqual(HttpStatusCode.OK, response.StatusCode);
        Assert.AreEqual("application/json", response.Content.Headers.ContentType?.MediaType);

        var body = await response.Content.ReadFromJsonAsync<JsonElement>(TestContext.CancellationToken);
        Assert.AreEqual("ok", body.GetProperty("status").GetString());
        Assert.AreEqual("local-review", body.GetProperty("stage").GetString());
        Assert.AreEqual("0.2", body.GetProperty("schemaVersion").GetString());
        Assert.HasCount(3, body.EnumerateObject().ToArray());
    }

    [TestMethod]
    [DataRow("GET")]
    [DataRow("POST")]
    public async Task UnimplementedApiReturnsAnErrorNotTheSpa(string method)
    {
        using var application = new WebApplicationFactory<Program>();
        using var client = application.CreateClient();
        using var request = new HttpRequestMessage(new HttpMethod(method), "/api/explanations");
        using var response = await client.SendAsync(request, TestContext.CancellationToken);

        Assert.AreEqual(HttpStatusCode.NotFound, response.StatusCode);
        Assert.AreEqual("application/problem+json", response.Content.Headers.ContentType?.MediaType);

        var body = await response.Content.ReadFromJsonAsync<JsonElement>(TestContext.CancellationToken);
        Assert.AreEqual(404, body.GetProperty("status").GetInt32());
        Assert.AreEqual("API route not implemented", body.GetProperty("title").GetString());
        Assert.IsFalse(body.TryGetProperty("interpretation", out _));
    }
}
