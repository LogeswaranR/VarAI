using VarAI.Contracts;
using VarAI.Scenarios;
using VarAI.Server.Explanations;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddSingleton<IScenarioRepository>(_ => new SyntheticScenarioRepository());
builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddSingleton<IExplanationOutputValidator, ExplanationOutputValidator>();
builder.Services.AddSingleton<IExplanationProvider>(_ =>
{
    // Local authored use is the default. Disabled live access never reads provider settings.
    var configuration = builder.Configuration.GetValue<bool>("Explanations:LiveEnabled")
        ? new AzureOpenAiConfiguration(
            builder.Configuration["Explanations:AzureOpenAi:Endpoint"],
            builder.Configuration["Explanations:AzureOpenAi:DeploymentName"],
            builder.Configuration["Explanations:AzureOpenAi:ApiKey"])
        : new AzureOpenAiConfiguration(null, null, null);
    return new AzureOpenAiExplanationProvider(configuration);
});
builder.Services.AddSingleton<IExplanationService, ExplanationService>();
builder.Services.AddVarAiContract().AddGraphQLServer();
var app = builder.Build();

if (!app.Environment.IsDevelopment())
{
    app.UseDefaultFiles();
    app.UseStaticFiles();
}

// Static files must run before routing; the missing-asset fallback must not shadow existing files.
app.UseRouting();

app.MapGet("/health", () => Results.Ok(new
{
    status = "ok",
    stage = "local-review",
    schemaVersion = ContractRules.SchemaVersion
}));

app.MapGraphQL("/graphql").WithOptions(options =>
{
    options.Tool.Enable = false;
    options.EnableGetRequests = false;
    options.EnableMultipartRequests = false;
    options.EnableSchemaRequests = false;
});

app.MapFallback("/api/{**path}", () => Results.Problem(
    statusCode: StatusCodes.Status404NotFound,
    title: "API route not implemented",
    detail: "Use the approved /graphql endpoint; there is no /api/explanations compatibility API."));

app.MapFallback("/graphql/{**path}", () => Results.NotFound());
app.MapFallback("/assets/{**path}", () => Results.NotFound());

if (!app.Environment.IsDevelopment())
{
    app.MapFallbackToFile("index.html");
}

app.Run();

public partial class Program;
