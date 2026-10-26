using VarAI.Contracts;
using VarAI.Scenarios;
using VarAI.Server.Feeds;
using VarAI.Server.Explanations;
using VarAI.Server.Gate;
using VarAI.Server.Narration;
using VarAI.Server.Telemetry;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddSingleton<IScenarioRepository>(_ => new SyntheticScenarioRepository());
builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddSingleton<SyntheticMatchTimeline>();
builder.Services.AddSingleton<IExplanationOutputValidator, ExplanationOutputValidator>();
builder.Services.AddSingleton<IExplanationProvider>(_ =>
{
    // Local authored use is the default. Disabled live access never reads provider settings.
    var configuration = builder.Configuration.GetValue<bool>("Explanations:LiveEnabled")
        ? AzureOpenAiConfigurationFactory.FromConfiguration(builder.Configuration)
        : new AzureOpenAiConfiguration(null, null, null);
    return new AzureOpenAiExplanationProvider(configuration);
});
builder.Services.AddSingleton<IExplanationService, ExplanationService>();
builder.Services.AddVarAiNarration(builder.Configuration);
builder.Services.AddVarAiGate(builder.Configuration);
var telemetryEnabled = builder.Services.AddVarAiTelemetry(builder.Configuration);
builder.Services.AddVarAiContract().AddGraphQLServer();
var app = builder.Build();
app.Logger.LogInformation("Application Insights telemetry export is {State}.", telemetryEnabled ? "enabled" : "disabled");

// Misconfigured limits should stop the server at startup, not on the first request.
_ = app.Services.GetRequiredService<NarrationService>();
_ = app.Services.GetRequiredService<GateSessionStore>();

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

SyntheticMatchEndpoints.Map(app);
GateEndpoints.Map(app);

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
    detail: "Use /graphql for scenarios and explanations. The only /api routes are the synthetic match metadata, event, overlay and combined stream endpoints, the narration status route and the operator-gated session routes."));

app.MapFallback("/graphql/{**path}", () => Results.NotFound());
app.MapFallback("/assets/{**path}", () => Results.NotFound());

if (!app.Environment.IsDevelopment())
{
    app.MapFallbackToFile("index.html");
}

app.Run();

public partial class Program;
