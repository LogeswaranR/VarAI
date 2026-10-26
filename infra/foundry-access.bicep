targetScope = 'resourceGroup'

@description('Name of the existing Foundry / Azure OpenAI account in this resource group. It is referenced, never created or changed.')
param accountName string

@description('Object ID of the Container App managed identity that calls the model.')
param appPrincipalId string

@description('Optional object ID of a person who needs the same data-plane role for local live tests. Leave empty to grant nothing.')
param operatorPrincipalId string = ''

// Built-in role "Cognitive Services OpenAI User": inference (chat completions) only, no key access and no management rights.
var openAiUserRoleId = '5e0bd9bd-7b93-4f28-af87-19fc36ad61bd'

resource account 'Microsoft.CognitiveServices/accounts@2024-10-01' existing = {
  name: accountName
}

resource appAccess 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: account
  name: guid(account.id, appPrincipalId, openAiUserRoleId)
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', openAiUserRoleId)
    principalId: appPrincipalId
    principalType: 'ServicePrincipal'
  }
}

resource operatorAccess 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (!empty(operatorPrincipalId)) {
  scope: account
  name: guid(account.id, operatorPrincipalId, openAiUserRoleId)
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', openAiUserRoleId)
    principalId: operatorPrincipalId
    principalType: 'User'
  }
}

output accountId string = account.id
