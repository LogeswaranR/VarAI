import operations from '../../../contracts/operations.graphql?raw'
import type { ExplanationClient, ScenarioRepository } from '../contracts/interfaces'
import { ContractResponseError, readExplanationResult, readScenarioResult, readScenarios } from '../contracts/validation'

export class GraphQlTransportError extends Error {}

export function createHttpClients(endpoint = '/graphql', fetcher: typeof fetch = (...args) => fetch(...args)): {
  repository: ScenarioRepository
  client: ExplanationClient
} {
  async function execute(operationName: 'Scenarios' | 'Scenario' | 'Explain', variables: object, signal?: AbortSignal) {
    const response = await fetcher(endpoint, {
      method: 'POST', credentials: 'same-origin', redirect: 'error', cache: 'no-store', signal,
      headers: { 'Content-Type': 'application/json', Accept: 'application/graphql-response+json, application/json' },
      body: JSON.stringify({ query: operations, operationName, variables }),
    })
    if (!response.ok) throw new GraphQlTransportError('GraphQL HTTP request failed.')
    const mediaType = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase()
    if (mediaType !== 'application/json' && mediaType !== 'application/graphql-response+json') {
      throw new GraphQlTransportError('GraphQL returned an unsupported media type.')
    }
    let payload: unknown
    try { payload = await response.json() } catch {
      throw new ContractResponseError('GraphQL returned invalid JSON.')
    }
    signal?.throwIfAborted()
    return payload
  }
  const repository: ScenarioRepository = {
    async list(signal) {
      return readScenarios(await execute('Scenarios', {}, signal))
    },
    async get(id, requestId, signal) {
      return readScenarioResult(await execute('Scenario', { id, requestId }, signal), id, requestId)
    },
  }
  const client: ExplanationClient = {
    async explain(request, signal) {
      // Validate against current server-supplied content, never a browser fixture or authored fallback.
      const scenario = await repository.get(request.scenarioId, request.requestId, signal)
      if (scenario.__typename === 'ContractError') return scenario
      return readExplanationResult(await execute('Explain', { input: request }, signal), request, scenario)
    },
  }
  return { repository, client }
}
