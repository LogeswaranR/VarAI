import type { ErrorCode } from '../../client/src/contracts/graphql.generated'
import type { ExplanationClient, ScenarioRepository } from '../../client/src/contracts/interfaces'
import { assertError, readExplanationResult, readScenarioResult, readScenarios, wordCount } from '../../client/src/contracts/validation'
import { rules } from '../../client/src/contracts/rules.generated'
import { errorCases, explanationCases, scenarioResponses, summaryResponse } from './responses.generated'

export function createScenarioRepositoryStub(): ScenarioRepository {
  return {
    async list(signal) {
      signal?.throwIfAborted()
      return readScenarios(structuredClone(summaryResponse))
    },
    async get(id, requestId, signal) {
      signal?.throwIfAborted()
      const match = scenarioResponses.find(item => item.data.scenario.id === id)
      if (match) return readScenarioResult(structuredClone(match), id, requestId)
      const error = errorCases.find(item => item.response.data.explain.code === 'SCENARIO_NOT_FOUND')
      if (!error) throw new Error('The scenario-not-found fixture is missing.')
      const payload = { data: { scenario: { ...error.response.data.explain, requestId } } }
      return readScenarioResult(payload, id, requestId)
    },
  }
}

export function createExplanationClientStub(forcedError?: ErrorCode): ExplanationClient {
  return {
    async explain(request, signal) {
      signal?.throwIfAborted()
      const error = (code: ErrorCode) => {
        const fixture = errorCases.find(item => item.response.data.explain.code === code)
        if (!fixture) throw new Error('The requested error fixture is missing.')
        const result = { ...fixture.response.data.explain, requestId: wordCount(request.requestId) > 0 ? request.requestId : 'stub-invalid-request' }
        assertError(result, request.requestId)
        return result
      }
      if (request.schemaVersion !== rules.schemaVersion || wordCount(request.requestId) === 0 ||
        wordCount(request.contentVersion) === 0 || !['S1', 'S2', 'S3'].includes(request.scenarioId) ||
        !['CASUAL', 'ANALYST'].includes(request.audience) || !['AUTHORED', 'LIVE_AI'].includes(request.sourceMode)) {
        return error('INVALID_REQUEST')
      }
      if (forcedError) return error(forcedError)
      const scenario = scenarioResponses.find(item => item.data.scenario.id === request.scenarioId)?.data.scenario
      if (!scenario) return error('SCENARIO_NOT_FOUND')
      if (request.contentVersion !== scenario.contentVersion) return error('CONTENT_VERSION_MISMATCH')
      const match = explanationCases.find(item =>
        item.request.scenarioId === request.scenarioId && item.request.audience === request.audience &&
        item.request.sourceMode === request.sourceMode)
      if (!match) throw new Error('The requested explanation fixture is missing.')
      const response = structuredClone(match.response)
      response.data.explain.requestId = request.requestId
      return readExplanationResult(response, request, scenario)
    },
  }
}
