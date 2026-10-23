# Azure deployment (Container Apps, managed identity, Application Insights)

This page records how the operator-gated Match Centre is deployed to Azure, what it costs, how to tear it down, and what was
and was not verified. It covers only what exists in `Dockerfile`, `azure.yaml` and `infra/`. Everything served is synthetic.
Nothing here uses Event Hubs, Foundry agents, Cosmos DB, Logic Apps or Content Safety.

## What is deployed

One resource group (`rg-<environment>`, here `rg-varai-demo`) in **Central India**, created by `azd` from Bicep:

| Resource | Setting | Why |
| --- | --- | --- |
| Container Apps environment | Consumption profile only | No standing charge; a private endpoint, planned maintenance or a Dedicated profile would add one, so none is configured |
| Container App `web` | 0.5 vCPU, 1 GiB, **0 to 1 replicas**, external HTTPS ingress on port 8080 | Gated sessions live in one process's memory, so a second replica would split a session; zero replicas costs nothing when idle |
| Container Registry | **Basic** | The cheapest tier. It is the only standing cost |
| User-assigned managed identity | `AcrPull` on the registry, `Cognitive Services OpenAI User` on the Foundry account | Keyless: no API key, registry password or admin user exists |
| Log Analytics workspace | PerGB2018, 30 days, **daily cap 0.1 GB** | Cost guard: ingestion pauses at the cap |
| Application Insights | Workspace-based | Receives the OpenTelemetry export |

The model is **not** deployed by this template. It calls an existing Foundry (Azure OpenAI) account, in this prototype one in
East US with the deployment `gpt-6-luna`. The template adds exactly one role assignment on that account (plus an optional one for a
person) and changes nothing else in it. Because the account lives in another region, each call crosses regions; the payloads
are a few kilobytes. The account still allows key authentication (`disableLocalAuth` is not set); this app never uses a key and
that setting was not changed.

The image is built by **Azure Container Registry Tasks** (`remoteBuild: true`), so the local machine's architecture does not
matter: all three builds ran on `amd64`. The Dockerfile has three stages (Node 24.22.1 builds the client with Vite, the .NET 10.0.402
SDK restores in locked mode and publishes the server, a small ASP.NET runtime image runs it as a non-root user). The image build
only bundles the client; type checking is `npm run typecheck`, because the browser-test project it would also check is not in the image.

### Settings the Container App receives

| Setting | Value |
| --- | --- |
| `Explanations__LiveEnabled` | `false`: the public app never enables the live offside explainer |
| `Narration__Enabled`, `Narration__MaxModelCalls` | `true`, 160 per process lifetime |
| `Narration__MaxConcurrency`, `Narration__ReasoningEffort` | 4, `low` |
| `Gate__SlaSeconds`, `Gate__NarrationWait` | 20, 10 s (half the window, the most the app accepts) |
| `Explanations__AzureOpenAi__AuthMode` | `ManagedIdentity`, with the identity's client ID |
| `Explanations__AzureOpenAi__Endpoint`, `…__DeploymentName` | The Foundry endpoint and `gpt-6-luna` |
| `APPLICATIONINSIGHTS_CONNECTION_STRING` | A Container App secret, not a plain value |

See [ai-narration-and-approval.md](./ai-narration-and-approval.md) for what each does.

## Deploy, update and tear down

Prerequisites: `az` and `azd` signed in to the subscription, Owner (or User Access Administrator) on it so the role assignments
can be created, and a Foundry account with a chat deployment. `docker` is not needed.

```sh
# once per subscription (free; takes a few minutes)
az provider register --namespace Microsoft.App
az provider register --namespace Microsoft.ContainerRegistry

azd env new varai-demo --subscription <subscription-id> --location centralindia
# the Foundry account is required and deliberately has no default in the template (this repository is public)
azd env set AZURE_FOUNDRY_RESOURCE_GROUP <resource-group>
azd env set AZURE_FOUNDRY_ACCOUNT <account-name>
azd env set AZURE_OPENAI_ENDPOINT https://<account-name>.openai.azure.com/
azd env set AZURE_OPENAI_DEPLOYMENT <deployment-name>      # optional; the template's default is gpt-6-luna
azd env set AZURE_OPERATOR_PRINCIPAL_ID <your object id>   # optional: lets you run live tests locally with `az login`

azd provision --preview   # read-only what-if; shows what would be created
azd up                    # provisions, builds remotely, deploys (about 3.5 minutes)
```

`azd up` prints the public URL (also stored as `SERVICE_WEB_URI` in `.azure/<env>/.env`, which is git-ignored). Run it again to
redeploy; the Bicep also applies setting changes.

**Tear down** (stops every charge this template creates):

```sh
azd down --force --purge
```

`azd down` deletes only its own resource group. The role assignments on the Foundry account live outside it, so the `predown`
hook (`infra/hooks/predown.sh`) removes them first and prints a warning if one could not be removed. The provider registrations
stay (they are free). Delete `.azure/<env>` locally if you no longer need it.

### Cold start, and keeping the app warm for a demo

With 0 minimum replicas the app costs nothing when idle, and it scaled to zero about 8 minutes after the last request. The first
request after that took **26.4 s** (later ones 0.14 s); one measurement, so treat it as indicative. A request that times out at
20 s can look like a failure, and every in-memory gated session is gone after a scale-to-zero. For a live demo you can keep one
replica running, then undo it afterwards:

```sh
az containerapp update -g rg-varai-demo -n <app> --min-replicas 1    # warm: no cold start, sessions survive idle gaps
az containerapp update -g rg-varai-demo -n <app> --min-replicas 0    # back to scale-to-zero
```

An idle replica is still billed: 0.000003 USD per vCPU-second and per GiB-second, about 0.39 USD (37 INR) a day for 0.5 vCPU and
1 GiB, before the monthly free grants (about 4 days of one warm replica, if the grants cover idle time, which was not checked).
That is on top of the registry's 16 INR a day. The next `azd up` re-applies `minReplicas: 0`.

## Cost

Retail prices read from the Azure Retail Prices API on 2026-10-23, at about 96 INR per USD. These are estimates, not caps.
Azure's own usage data was not available yet when this was written, so **actual spend was not verified**.

| Item | Price | Observed here |
| --- | --- | --- |
| Container Registry Basic | 0.1666 USD/day = about **16 INR/day**, whether used or not | The only standing cost. 3 days is about 48 INR, 7 days about 112, 30 days about 480 |
| ACR Tasks builds | The first 6,000 vCPU-seconds a month are free, then 0.0001 USD per vCPU-second | 3 builds, 284 s in total: inside the free amount |
| Container Apps (Consumption) | Free each month: 180,000 vCPU-s, 360,000 GiB-s, 2 million requests | A few minutes of a 0.5 vCPU replica per test: far inside the free grants; 0 replicas when idle |
| Log Analytics and Application Insights | First 5 GB a month priced at zero; the workspace is capped at about 3 GB a month | 0.6 MB ingested in the first day |
| `gpt-6-luna` (Global Standard) | 0.10 USD (9.60 INR) per million input tokens, 0.50 USD (47.99 INR) per million output tokens | About 30,200 input and 24,500 output tokens for the 50 calls made while building this: about **1.5 INR** |

The 5 GB free allowance is shared with any other workspaces on the same billing account, so it may not be fully available.
At the `low` reasoning effort a full match (58 calls) is about 1.1 INR of model spend; the per-process cap of 160 calls bounds
it at a few rupees at the measured token use (about 3 to 5 INR), and at about 17 INR if every call used the whole 2,048-token completion budget.

At 16:00 UTC on 2026-10-23, about 2.4 hours after the registry was created, that was roughly 1.6 INR of registry charge plus
about 1.5 INR of model spend, against a target of 500 INR. The 16 INR/day registry charge continues until `azd down`.

An earlier estimate in the planning notes put each image build at 3 to 6 INR; the free ACR Tasks allowance makes it about 0.

## Verification record

All on 2026-10-23, from the repository root, on an Apple-silicon Mac. "Live" means the deployed app on Azure.

| What | Result |
| --- | --- |
| `dotnet format --verify-no-changes`, ESLint, `npm run typecheck` | Passed |
| `npm test` | 803 server tests and 547 client tests passed |
| `npm run publish`, `npm run contracts:check`, `git diff --check` | Passed |
| `npm run test:integration` (ports 43170/43171) | 98 passed, 12 skipped. An earlier run of the same suite had 1 failure in an existing real-time replay test (`application.spec.ts:122`, which allows 8 s for a replay that takes about 7 s) while the machine was heavily loaded; the immediate rerun passed, and so did 5 of 6 isolated repeats (the sixth failed on a page-load timeout at the first start). Not investigated further |
| Gated browser spec (port 43170) | 4 passed |
| `npm run test:acceptance`, `test:browser` (port 43174) | 63 and 22 passed |
| Local container (arm64) run read-only, all capabilities dropped, `no-new-privileges`, user 1654 | `/health` 200, the client bundle served, a gated session created, desk and program streams delivered, decision log downloaded, unknown session 404 |
| `azd provision --preview` and an ARM what-if | 8 resources to create and 1 role assignment the what-if could not evaluate (its name depends on the new identity's ID); nothing existing modified |
| `azd provision` | Succeeded in 3 min 27 s; both role assignments (app identity, operator) present on the Foundry account |
| Live `/health`, `/`, `/api/narration`, HTTP to HTTPS | 200, 200 (HTML), narration enabled with `gpt-6-luna`, 301 |
| Scale to zero and cold start | Replicas fell to 0 about 8 minutes after the last request; the first request then took 26.4 s and the next 0.14 s |
| Live gated session, first deployment | Approve, override and hold each returned the right state; an undecided cue became `AUTO_HELD` (`SLA_EXPIRED`); only the approved and overridden cues aired; the 8-entry decision log passed an independent re-computation of the hash chain and its head matched `X-Decision-Log-Head` |
| Live gated session, final model settings | 4 of 4 narrations passed the checks; approve and override worked; 4-entry log verified the same way |
| Live streams through ingress | Program and desk streams stayed open for about 285 s with no disconnect; program ids were contiguous (0–130) |
| Managed-identity model access | 14 calls from the deployed app succeeded with the default scope (`https://ai.azure.com/.default`); the first token fetch took about 4 s |
| Application Insights | Queried through the Log Analytics workspace: requests (26), dependencies (37), traces (45) and metrics (533) arrived, including the `narration.generate` and `gate.decide` spans, the managed-identity token fetch, the model call dependency and the `varai.*` metrics; the role name was the Container App's name |
| Live resource settings | Read back from Azure: workspace cap 0.1 GB a day and enforced, registry Basic with no admin user, and the identity holds exactly two role assignments (`AcrPull` on the registry, `Cognitive Services OpenAI User` on the Foundry account) |
| Rollout | The final revision was the only one with traffic and was healthy; its startup log shows managed identity and `low` reasoning effort |

## Not verified

- **Actual spend.** Only estimates; Azure Cost Management returned nothing yet. The registry charge accrues daily.
- **Cold starts beyond one measurement.** The first request after scale-to-zero took 26.4 s once; the spread is unknown. The app
  loses every session when it scales to zero, and its first model call afterwards also pays a managed-identity token fetch
  (about 4 s on its own).
- **Streams longer than about 290 s** through the ingress, and the browser's reconnect-and-resume after a cut, in Azure.
- **A full match narrated live end to end** (58 calls) and any load or abuse test. Model calls are bounded by the 160-call cap and
  the per-cue memo, not by authentication.
- **Security hardening.** The public URL has no login and the server sets no security headers (CSP, HSTS, `X-Content-Type-Options`).
  The request telemetry records the session ID in URL paths. Anyone who has a session's URL can act as its operator.
- **`azd down`.** Not run, because the environment is still in use; the `predown` hook and the purge have not been exercised.
- **Other regions, a second environment, or a different Foundry account.**

## Querying telemetry without the portal

`az monitor app-insights query` needs an Azure CLI extension that did not install here (the install hung), so the check used the
Log Analytics API with `az rest`, which handles the token itself:

```sh
WS=$(grep '^AZURE_LOG_ANALYTICS_CUSTOMER_ID=' .azure/varai-demo/.env | cut -d= -f2 | tr -d '"')
az rest --method post --url "https://api.loganalytics.io/v1/workspaces/$WS/query" --resource https://api.loganalytics.io \
  --headers Content-Type=application/json \
  --body '{"query": "AppDependencies | where TimeGenerated > ago(3h) | summarize n=count() by Name"}'
```

Container logs: `az containerapp logs show -g rg-varai-demo -n <app> --type console --tail 50`.
To end every in-memory session (and stop their narration) without redeploying, restart the revision:
`az containerapp revision restart -g rg-varai-demo -n <app> --revision <name>`.
