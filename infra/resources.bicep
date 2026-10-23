targetScope = 'resourceGroup'

@description('Azure region for every resource in this group.')
param location string

param tags object

@description('Short unique suffix used in resource names.')
@minLength(8)
param resourceToken string

@description('Public endpoint of the existing Azure OpenAI account, for example https://myaccount.openai.azure.com/')
param azureOpenAiEndpoint string

@description('Model deployment the narrator calls.')
param modelDeploymentName string

@description('true turns AI narration on; anything else leaves the app on deterministic English with no model calls.')
param narrationEnabled string

@description('Seconds an operator has to decide a cue. It is also the program delay.')
param gateSlaSeconds string

@description('Most model calls the app may start during one process lifetime.')
param narrationMaxModelCalls string

@description('Reasoning effort sent with each narration call; empty sends nothing and leaves the model default.')
param narrationReasoningEffort string

@description('Image deployed by azd. Empty on the first provision, when a placeholder that listens on 8080 is used.')
param webImageName string = ''

var narrationOn = toLower(narrationEnabled) == 'true'
// Early cues of a session wait for the model. Half the decision window is the longest wait the app accepts; 10 s is plenty.
var narrationWaitSeconds = max(1, min(10, int(gateSlaSeconds) / 2))
var reasoningEnv = empty(narrationReasoningEffort) ? [] : [
  { name: 'Narration__ReasoningEffort', value: narrationReasoningEffort }
]
var placeholderImage = 'mcr.microsoft.com/dotnet/samples:aspnetapp'
var acrPullRoleId = '7f951dda-4ed3-4680-a7ca-43fe172d538d'

resource identity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: 'id-${resourceToken}'
  location: location
  tags: tags
}

// A daily ingestion cap is the cost guard for logs: when it is reached ingestion pauses until the next day. 0.1 GB a day is
// about 3 GB a month, which stays inside the first 5 GB of pay-as-you-go ingestion that is priced at zero in the retail
// price list (unless other workspaces on the same billing account already use that allowance).
resource logs 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: 'log-${resourceToken}'
  location: location
  tags: tags
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: 30
    workspaceCapping: {
      dailyQuotaGb: json('0.1')
    }
    publicNetworkAccessForIngestion: 'Enabled'
    publicNetworkAccessForQuery: 'Enabled'
  }
}

resource insights 'Microsoft.Insights/components@2020-02-02' = {
  name: 'appi-${resourceToken}'
  location: location
  tags: tags
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: logs.id
    IngestionMode: 'LogAnalytics'
    publicNetworkAccessForIngestion: 'Enabled'
    publicNetworkAccessForQuery: 'Enabled'
  }
}

// Basic is the cheapest tier and has a flat daily price whether or not it is used: tear the environment down when done.
resource registry 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name: 'acr${resourceToken}'
  location: location
  tags: tags
  sku: {
    name: 'Basic'
  }
  properties: {
    adminUserEnabled: false
    publicNetworkAccess: 'Enabled'
  }
}

resource acrPull 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: registry
  name: guid(registry.id, identity.id, acrPullRoleId)
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', acrPullRoleId)
    principalId: identity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

// Consumption plan only. A private endpoint, planned maintenance or a Dedicated workload profile would add the
// environment management charge, so none of them is configured here.
resource environment 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: 'cae-${resourceToken}'
  location: location
  tags: tags
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logs.properties.customerId
        sharedKey: logs.listKeys().primarySharedKey
      }
    }
    workloadProfiles: [
      {
        name: 'Consumption'
        workloadProfileType: 'Consumption'
      }
    ]
    zoneRedundant: false
  }
}

// One replica at most: gated sessions live in that process's memory, so a second replica would split a session.
// Zero replicas when idle means no compute charge, at the price of a cold start and lost sessions.
resource web 'Microsoft.App/containerApps@2024-03-01' = {
  name: 'ca-${resourceToken}'
  location: location
  tags: union(tags, { 'azd-service-name': 'web' })
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${identity.id}': {}
    }
  }
  properties: {
    environmentId: environment.id
    workloadProfileName: 'Consumption'
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: true
        targetPort: 8080
        transport: 'auto'
        allowInsecure: false
        traffic: [
          {
            latestRevision: true
            weight: 100
          }
        ]
      }
      registries: [
        {
          server: registry.properties.loginServer
          identity: identity.id
        }
      ]
      secrets: [
        {
          name: 'appinsights-connection-string'
          value: insights.properties.ConnectionString
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'web'
          image: empty(webImageName) ? placeholderImage : webImageName
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
          env: concat([
            { name: 'ASPNETCORE_HTTP_PORTS', value: '8080' }
            // The public demo never enables the live offside explainer; only the narrator may call the model.
            { name: 'Explanations__LiveEnabled', value: 'false' }
            { name: 'Narration__Enabled', value: string(narrationOn) }
            { name: 'Narration__MaxModelCalls', value: narrationMaxModelCalls }
            // Four calls at a time lets the first cues of a session (English and Tamil each) finish inside the wait.
            { name: 'Narration__MaxConcurrency', value: '4' }
            { name: 'Gate__NarrationWait', value: '00:00:${padLeft(string(narrationWaitSeconds), 2, '0')}' }
            { name: 'Explanations__AzureOpenAi__Endpoint', value: azureOpenAiEndpoint }
            { name: 'Explanations__AzureOpenAi__DeploymentName', value: modelDeploymentName }
            { name: 'Explanations__AzureOpenAi__AuthMode', value: 'ManagedIdentity' }
            { name: 'Explanations__AzureOpenAi__ManagedIdentityClientId', value: identity.properties.clientId }
            { name: 'Gate__SlaSeconds', value: gateSlaSeconds }
            { name: 'APPLICATIONINSIGHTS_CONNECTION_STRING', secretRef: 'appinsights-connection-string' }
          ], reasoningEnv)
        }
      ]
      scale: {
        minReplicas: 0
        maxReplicas: 1
        rules: [
          {
            name: 'http'
            http: {
              metadata: {
                concurrentRequests: '50'
              }
            }
          }
        ]
      }
    }
  }
  dependsOn: [
    acrPull
  ]
}

output identityPrincipalId string = identity.properties.principalId
output identityClientId string = identity.properties.clientId
output registryName string = registry.name
output registryLoginServer string = registry.properties.loginServer
output webName string = web.name
output webUri string = 'https://${web.properties.configuration.ingress.fqdn}'
output applicationInsightsName string = insights.name
output logAnalyticsWorkspaceName string = logs.name
output logAnalyticsCustomerId string = logs.properties.customerId
