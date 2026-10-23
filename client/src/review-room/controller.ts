import type { ErrorFieldsFragment, ScenarioFieldsFragment, ScenarioId, ScenariosQuery } from '../contracts/graphql.generated'
import type { ScenarioRepository, SourceSelection } from '../contracts/interfaces'
import { ContractResponseError, readScenarioResult, readScenarios } from '../contracts/validation'
import { freshReplay, projectReplay } from './replay'
import type { ReplayState } from './replay'

export interface LoadFailure {
  readonly code: string
  readonly message: string
  readonly retryable: boolean
}

type Pair = readonly [ScenarioFieldsFragment, ScenarioFieldsFragment]
type LoadStatus = 'idle' | 'loading' | 'ready' | 'error'

export interface ReviewRoomState {
  readonly listStatus: Exclude<LoadStatus, 'idle'>
  readonly summaries: ScenariosQuery['scenarios']
  readonly listError: LoadFailure | null
  readonly selectedId: string | null
  readonly scenarioStatus: LoadStatus
  readonly scenario: ScenarioFieldsFragment | null
  readonly scenarioError: LoadFailure | null
  readonly replay: ReplayState
  readonly selection: SourceSelection | null
  readonly selectionError: string | null
  readonly comparison: {
    readonly status: LoadStatus
    readonly pair: Pair | null
    readonly error: LoadFailure | null
  }
}

function isScenarioId(id: string): id is ScenarioId {
  return id === 'S1' || id === 'S2' || id === 'S3'
}

function immutableCopy<T>(value: T): T {
  const copy = structuredClone(value)
  const seen = new Set<object>()
  function freeze(entry: unknown) {
    if (entry !== null && typeof entry === 'object' && !seen.has(entry)) {
      seen.add(entry)
      Object.values(entry).forEach(freeze)
      Object.freeze(entry)
    }
  }
  freeze(copy)
  return copy
}

function failure(error: unknown): LoadFailure {
  return error instanceof ContractResponseError
    ? { code: 'INVALID_OUTPUT', message: `The supplied response is invalid. ${error.message}`, retryable: true }
    : { code: 'LOAD_FAILED', message: 'The repository could not load the requested data. Retry or choose another scenario.', retryable: true }
}

function domainFailure(error: ErrorFieldsFragment): LoadFailure {
  return { code: error.code, message: error.message, retryable: error.retryable }
}

function checkVersion(scenario: ScenarioFieldsFragment, summaries: ScenariosQuery['scenarios']) {
  if (summaries.find(item => item.id === scenario.id)?.contentVersion !== scenario.contentVersion) {
    throw new ContractResponseError('The scenario version differs from its summary. Reload scenario choices.')
  }
}

function checkPair(pair: Pair) {
  const [first, second] = pair
  const sameMatch = first.match.homeTeam === second.match.homeTeam &&
    first.match.awayTeam === second.match.awayTeam && first.match.incidentMinute === second.match.incidentMinute &&
    first.match.scoreBefore.home === second.match.scoreBefore.home &&
    first.match.scoreBefore.away === second.match.scoreBefore.away
  const sameRules = first.rules.length === second.rules.length && first.rules.every(rule => {
    const other = second.rules.find(item => item.id === rule.id)
    return other && Object.entries(rule).every(([key, value]) =>
      Object.entries(other).some(([otherKey, otherValue]) => key === otherKey && value === otherValue))
  })
  if (first.id !== 'S1' || second.id !== 'S2' || first.contentVersion !== second.contentVersion ||
    first.comparison?.otherScenarioId !== second.id || second.comparison?.otherScenarioId !== first.id ||
    !sameMatch || !sameRules) {
    throw new ContractResponseError('The comparison pair has mismatched versions, match context or rule references.')
  }
}

export function createReviewRoomController(repository: ScenarioRepository, initialScenarioId: string | null = null) {
  let state: ReviewRoomState = {
    listStatus: 'loading', summaries: [], listError: null,
    selectedId: initialScenarioId, scenarioStatus: 'idle', scenario: null, scenarioError: null,
    replay: freshReplay(0), selection: null, selectionError: null,
    comparison: { status: 'idle', pair: null, error: null },
  }
  const listeners = new Set<() => void>()
  let active = false
  let listAttempt = 0
  let scenarioAttempt = 0
  let pairAttempt = 0
  let listAbort: AbortController | null = null
  let scenarioAbort: AbortController | null = null
  let pairAbort: AbortController | null = null
  let timer: ReturnType<typeof setTimeout> | null = null
  let anchorTime = 0
  let anchorElapsed = 0

  function update(patch: Partial<ReviewRoomState>) {
    state = { ...state, ...patch }
    listeners.forEach(listener => listener())
  }

  function clearTimer() {
    if (timer !== null) clearTimeout(timer)
    timer = null
  }

  function cancelSelection() {
    clearTimer()
    scenarioAbort?.abort()
    pairAbort?.abort()
    scenarioAttempt++
    pairAttempt++
  }

  function clearedRun(): Pick<ReviewRoomState, 'replay' | 'selection' | 'selectionError' | 'comparison'> {
    return {
      replay: freshReplay(state.replay.replayRunId + 1), selection: null, selectionError: null,
      comparison: { status: 'idle', pair: null, error: null },
    }
  }

  async function selectScenario(id: string) {
    if (!active) return
    cancelSelection()
    update({
      ...clearedRun(), selectedId: id, scenario: null, scenarioStatus: 'loading', scenarioError: null,
    })
    if (!isScenarioId(id) || state.listStatus !== 'ready' || !state.summaries.some(item => item.id === id)) {
      update({
        scenarioStatus: 'error',
        scenarioError: { code: 'INVALID_REQUEST', message: 'Invalid scenario selection. Choose S1, S2 or S3 from the loaded choices.', retryable: false },
      })
      return
    }
    const attempt = scenarioAttempt
    const requestId = crypto.randomUUID()
    scenarioAbort = new AbortController()
    try {
      const result = await repository.get(id, requestId, scenarioAbort.signal)
      if (!active || attempt !== scenarioAttempt) return
      const checked = readScenarioResult({ data: { scenario: result } }, id, requestId)
      if (checked.__typename === 'ContractError') {
        update({ scenarioStatus: 'error', scenarioError: domainFailure(checked) })
        return
      }
      checkVersion(checked, state.summaries)
      update({ scenarioStatus: 'ready', scenario: immutableCopy(checked) })
    } catch (error) {
      if (active && attempt === scenarioAttempt) update({ scenarioStatus: 'error', scenarioError: failure(error) })
    }
  }

  async function reloadChoices() {
    if (!active) return
    cancelSelection()
    listAbort?.abort()
    const attempt = ++listAttempt
    listAbort = new AbortController()
    update({
      ...clearedRun(), listStatus: 'loading', summaries: [], listError: null,
      scenarioStatus: 'idle', scenario: null, scenarioError: null,
    })
    try {
      const result = await repository.list(listAbort.signal)
      if (!active || attempt !== listAttempt) return
      const summaries = readScenarios({ data: { scenarios: result } })
      if (summaries.length !== 3 || !['S1', 'S2', 'S3'].every(id => summaries.some(item => item.id === id))) {
        throw new ContractResponseError('Scenario choices must contain S1, S2 and S3.')
      }
      update({ summaries: immutableCopy(summaries), listStatus: 'ready' })
      if (state.selectedId !== null) await selectScenario(state.selectedId)
    } catch (error) {
      if (active && attempt === listAttempt) update({ listStatus: 'error', listError: failure(error) })
    }
  }

  function elapsedNow() {
    const duration = state.scenario?.events.at(-1)?.offsetMs ?? 0
    return Math.min(duration, anchorElapsed + Math.max(0, performance.now() - anchorTime))
  }

  function advance(schedule: boolean) {
    const scenario = state.scenario
    if (!active || !scenario || state.replay.status !== 'playing') return
    const run = state.replay.replayRunId
    const elapsed = elapsedNow()
    while (state.replay.eventCount < scenario.events.length &&
      scenario.events[state.replay.eventCount].offsetMs <= elapsed) {
      const event = scenario.events[state.replay.eventCount]
      update({
        replay: {
          ...state.replay, eventCount: state.replay.eventCount + 1, elapsedMs: event.offsetMs,
          status: event.kind === 'REVIEW_READY' ? 'complete' : 'playing',
        },
      })
      if (state.replay.replayRunId !== run || state.replay.status !== 'playing') return
    }
    const next = scenario.events[state.replay.eventCount]
    if (schedule && next) {
      timer = setTimeout(() => {
        timer = null
        advance(true)
      }, Math.max(0, next.offsetMs - elapsedNow()))
    }
  }

  function play() {
    if (!active || !state.scenario || !['ready', 'paused'].includes(state.replay.status)) return
    anchorElapsed = state.replay.elapsedMs
    anchorTime = performance.now()
    update({ replay: { ...state.replay, status: 'playing' } })
    advance(true)
  }

  function pause() {
    if (!active || state.replay.status !== 'playing') return
    clearTimer()
    advance(false)
    if (state.replay.status === 'playing') {
      update({ replay: { ...state.replay, elapsedMs: elapsedNow(), status: 'paused' } })
    }
  }

  function restart() {
    if (!active || !state.scenario) return
    cancelSelection()
    update(clearedRun())
  }

  function inspectSources(selection: SourceSelection, replayRunId: number) {
    if (!active || !state.scenario || replayRunId !== state.replay.replayRunId) return false
    const projection = projectReplay(state.scenario, state.replay, null)
    const evidenceIds = new Set<string>([
      ...projection.evidence.visibleFacts.map(fact => fact.id),
      ...projection.evidence.contextEvidence.map(entry => entry.id),
    ])
    const ruleIds = new Set(projection.evidence.rules.map(rule => rule.id))
    if (!Array.isArray(selection?.evidenceIds) || !Array.isArray(selection?.ruleIds) ||
      selection.evidenceIds.length + selection.ruleIds.length === 0 ||
      !selection.evidenceIds.every(id => evidenceIds.has(id)) || !selection.ruleIds.every(id => ruleIds.has(id))) {
      update({ selectionError: 'Those sources are not part of the currently released evidence. Continue the replay or choose a released source.' })
      return false
    }
    update({
      selection: immutableCopy({
        evidenceIds: [...new Set(selection.evidenceIds)], ruleIds: [...new Set(selection.ruleIds)],
      }),
      selectionError: null,
    })
    return true
  }

  async function loadComparison(retry = false) {
    const scenario = state.scenario
    if (!active || !scenario?.comparison || state.replay.status !== 'complete' ||
      (!retry && state.comparison.status !== 'idle') || state.comparison.status === 'loading') return
    if (projectReplay(scenario, state.replay, null).evidence.visibleFacts.length !== scenario.facts.length) {
      update({
        comparison: {
          status: 'error', pair: null,
          error: {
            code: 'INVALID_OUTPUT', retryable: false,
            message: 'Comparison input is withheld because this replay did not release every scenario fact. Reload scenario choices.',
          },
        },
      })
      return
    }
    pairAbort?.abort()
    pairAbort = new AbortController()
    const attempt = ++pairAttempt
    const requestId = crypto.randomUUID()
    const id = scenario.comparison.otherScenarioId
    update({ comparison: { status: 'loading', pair: null, error: null } })
    try {
      const result = await repository.get(id, requestId, pairAbort.signal)
      if (!active || attempt !== pairAttempt) return
      const checked = readScenarioResult({ data: { scenario: result } }, id, requestId)
      if (checked.__typename === 'ContractError') {
        update({ comparison: { status: 'error', pair: null, error: domainFailure(checked) } })
        return
      }
      checkVersion(checked, state.summaries)
      const other = immutableCopy(checked)
      const pair: Pair = scenario.id === 'S1' ? [scenario, other] : [other, scenario]
      checkPair(pair)
      update({ comparison: { status: 'ready', pair: Object.freeze(pair), error: null } })
    } catch (error) {
      if (active && attempt === pairAttempt) {
        update({ comparison: { status: 'error', pair: null, error: failure(error) } })
      }
    }
  }

  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    start() {
      if (active) return
      active = true
      void reloadChoices()
    },
    stop() {
      active = false
      cancelSelection()
      listAbort?.abort()
      listAttempt++
    },
    selectScenario,
    reloadChoices,
    retryScenario: () => {
      if (state.selectedId !== null) return selectScenario(state.selectedId)
    },
    play, pause, restart, inspectSources, loadComparison,
    selectComparison(id: 'S1' | 'S2', replayRunId: number) {
      if (!active || replayRunId !== state.replay.replayRunId || state.replay.status !== 'complete' ||
        state.comparison.status !== 'ready') return
      return selectScenario(id)
    },
  }
}
