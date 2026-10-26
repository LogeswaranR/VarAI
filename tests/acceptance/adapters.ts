import { createExplanationClientStub, createScenarioRepositoryStub } from '../contract-stubs/client'
import type { AcceptanceAdapter } from './model'

export function createContractStubAdapter(): AcceptanceAdapter {
  return {
    kind: 'contract-stub',
    name: 'approved G00 v0.2 contract stubs; never a provider or integrated feature',
    application: { available: true },
    live: { available: true },
    repository: createScenarioRepositoryStub(),
    client: createExplanationClientStub(),
    failureClient: createExplanationClientStub,
    async withTeamLabels(id, labels) {
      const repository = createScenarioRepositoryStub()
      return {
        repository: {
          list: signal => repository.list(signal),
          async get(selectedId, requestId, signal) {
            const result = await repository.get(selectedId, requestId, signal)
            if (result.__typename === 'Scenario' && result.id === id) {
              return { ...result, match: { ...result.match, ...labels } }
            }
            return result
          },
        },
        client: createExplanationClientStub(),
      }
    },
  }
}
