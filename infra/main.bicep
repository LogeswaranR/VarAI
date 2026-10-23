targetScope = 'subscription'

@minLength(1)
@maxLength(32)
@description('Name of the azd environment. It names the resource group and seeds every resource name.')
param environmentName string

@minLength(1)
@description('Azure region for every new resource.')
param location string

@description('Subscription of the existing Foundry account. Empty means the deployment subscription.')
param foundrySubscriptionId string = ''

@minLength(1)
@description('Resource group of the existing Foundry account. Nothing in it is created or deleted by this template; one role assignment is added. Set with: azd env set AZURE_FOUNDRY_RESOURCE_GROUP <name>')
param foundryResourceGroupName string

@minLength(1)
@description('Name of the existing Foundry / Azure OpenAI account. Set with: azd env set AZURE_FOUNDRY_ACCOUNT <name>')
param foundryAccountName string

@minLength(1)
@description('Public Azure OpenAI endpoint of that account. Set with: azd env set AZURE_OPENAI_ENDPOINT https://<name>.openai.azure.com/')
param azureOpenAiEndpoint string

@description('Name of the model deployment to call.')
param modelDeploymentName string

@description('true turns AI narration on. Anything else keeps the app on deterministic English with no model calls.')
param narrationEnabled string = 'true'

@description('Seconds an operator has to decide a cue (also the program delay).')
param gateSlaSeconds string = '20'

@description('Most model calls the app may start during one process lifetime.')
param narrationMaxModelCalls string = '160'

@description('Reasoning effort sent with each narration call: none, low, medium, high or xhigh. Empty sends nothing and leaves the model default.')
param narrationReasoningEffort string = 'low'

@description('Container image set by azd after the first deploy. Empty on the first provision.')
param webImageName string = ''

@description('Optional object ID of a person who should also hold the model data-plane role for local live tests.')
param operatorPrincipalId string = ''

var tags = {
  'azd-env-name': environmentName
  project: 'varai'
  purpose: 'hackathon-prototype-synthetic-data'
}
var resourceToken = toLower(uniqueString(subscription().id, environmentName, location))
var effectiveFoundrySubscriptionId = empty(foundrySubscriptionId) ? subscription().subscriptionId : foundrySubscriptionId

resource group 'Microsoft.Resources/resourceGroups@2024-03-01' = {
  name: 'rg-${environmentName}'
  location: location
  tags: tags
}

module resources 'resources.bicep' = {
  name: 'varai-resources'
  scope: group
  params: {
    location: location
    tags: tags
    resourceToken: resourceToken
    azureOpenAiEndpoint: azureOpenAiEndpoint
    modelDeploymentName: modelDeploymentName
    narrationEnabled: narrationEnabled
    gateSlaSeconds: gateSlaSeconds
    narrationMaxModelCalls: narrationMaxModelCalls
    narrationReasoningEffort: narrationReasoningEffort
    webImageName: webImageName
  }
}

module foundryAccess 'foundry-access.bicep' = {
  name: 'varai-foundry-access'
  scope: resourceGroup(effectiveFoundrySubscriptionId, foundryResourceGroupName)
  params: {
    accountName: foundryAccountName
    appPrincipalId: resources.outputs.identityPrincipalId
    operatorPrincipalId: operatorPrincipalId
  }
}

output AZURE_LOCATION string = location
output AZURE_TENANT_ID string = tenant().tenantId
output AZURE_RESOURCE_GROUP string = group.name
output AZURE_CONTAINER_REGISTRY_ENDPOINT string = resources.outputs.registryLoginServer
output AZURE_CONTAINER_REGISTRY_NAME string = resources.outputs.registryName
output AZURE_CONTAINER_APP_NAME string = resources.outputs.webName
output SERVICE_WEB_URI string = resources.outputs.webUri
output AZURE_APPLICATION_INSIGHTS_NAME string = resources.outputs.applicationInsightsName
output AZURE_LOG_ANALYTICS_WORKSPACE_NAME string = resources.outputs.logAnalyticsWorkspaceName
output AZURE_LOG_ANALYTICS_CUSTOMER_ID string = resources.outputs.logAnalyticsCustomerId
output AZURE_MANAGED_IDENTITY_PRINCIPAL_ID string = resources.outputs.identityPrincipalId
output AZURE_FOUNDRY_ACCOUNT_ID string = foundryAccess.outputs.accountId
