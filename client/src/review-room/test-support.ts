import type { ScenarioFieldsFragment, ScenarioId } from '../contracts/graphql.generated'
import { readScenarioResult } from '../contracts/validation'
import { scenarioResponses } from '../../../tests/contract-stubs/responses.generated'

export function scenarioFixture(id: ScenarioId): ScenarioFieldsFragment {
  const response = scenarioResponses.find(item => item.data.scenario.id === id)
  if (!response) throw new Error(`Missing approved scenario fixture ${id}.`)
  const result = readScenarioResult(structuredClone(response), id, `test-${id}`)
  if (result.__typename !== 'Scenario') throw new Error('Expected a scenario fixture.')
  return result
}

export function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

export async function settle() {
  for (let index = 0; index < 8; index++) await Promise.resolve()
}
