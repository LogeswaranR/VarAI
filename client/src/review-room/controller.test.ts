import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createScenarioRepositoryStub } from '../../../tests/contract-stubs/client'
import type { ScenarioFieldsFragment, ScenarioId, ScenarioQuery, ScenariosQuery } from '../contracts/graphql.generated'
import type { ScenarioRepository } from '../contracts/interfaces'
import { createReviewRoomController } from './controller'
import { projectReplay } from './replay'
import { deferred, scenarioFixture, settle } from './test-support'

type Controller = ReturnType<typeof createReviewRoomController>
const controllers: Controller[] = []

function start(repository = createScenarioRepositoryStub(), id: string | null = null) {
  const controller = createReviewRoomController(repository, id)
  controllers.push(controller)
  controller.start()
  return controller
}

async function ready(id: ScenarioId = 'S1', repository = createScenarioRepositoryStub()) {
  const controller = start(repository, id)
  await settle()
  expect(controller.getSnapshot().scenarioStatus).toBe('ready')
  return controller
}

function projection(controller: Controller) {
  const state = controller.getSnapshot()
  if (!state.scenario) throw new Error('The test requires a loaded scenario.')
  return projectReplay(state.scenario, state.replay, state.selection)
}

beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] }))
afterEach(() => {
  controllers.splice(0).forEach(controller => controller.stop())
  vi.useRealTimers()
})

describe('VAR-102 deterministic replay and disclosure', () => {
  it('loads the three choices but never silently selects or plays a default', async () => {
    const repository = createScenarioRepositoryStub()
    const get = vi.spyOn(repository, 'get')
    const controller = start(repository)
    expect(controller.getSnapshot().listStatus).toBe('loading')
    await settle()
    expect(controller.getSnapshot().summaries.map(item => item.id)).toEqual(['S1', 'S2', 'S3'])
    expect(controller.getSnapshot().selectedId).toBeNull()
    expect(controller.getSnapshot().scenario).toBeNull()
    expect(get).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each(['S1', 'S2', 'S3'] as const)('%s releases each event exactly at its supplied offset, in order', async id => {
    const source = scenarioFixture(id)
    const original = JSON.stringify(source)
    const repository = { ...createScenarioRepositoryStub(), get: vi.fn(async () => source) }
    const controller = await ready(id, repository)
    const released: string[] = []
    controller.subscribe(() => {
      const event = projection(controller).events.at(-1)
      if (event && released.at(-1) !== event.id) released.push(event.id)
    })
    expect(projection(controller).events).toEqual([])
    expect(projection(controller).scene.visibleFacts).toEqual([])
    controller.play()
    expect(released).toEqual(['E-PASS'])
    let elapsed = 0
    for (const event of source.events.slice(1)) {
      vi.advanceTimersByTime(event.offsetMs - elapsed - 1)
      expect(released).not.toContain(event.id)
      vi.advanceTimersByTime(1)
      expect(released.at(-1)).toBe(event.id)
      elapsed = event.offsetMs
    }
    expect(released).toEqual(source.events.map(event => event.id))
    expect(controller.getSnapshot().replay.status).toBe('complete')
    expect(vi.getTimerCount()).toBe(0)
    expect(JSON.stringify(source)).toBe(original)
    expect(controller.getSnapshot().scenario).not.toBe(source)
    expect(Object.isFrozen(controller.getSnapshot().scenario?.facts[0])).toBe(true)
  })

  it.each(['S1', 'S2', 'S3'] as const)('%s pauses mid-event, resumes only the remaining time, and does not duplicate events', async id => {
    const controller = await ready(id)
    controller.pause()
    controller.play()
    controller.play()
    vi.advanceTimersByTime(375)
    controller.pause()
    const paused = controller.getSnapshot()
    expect(paused.replay).toMatchObject({ status: 'paused', elapsedMs: 375, eventCount: 1 })
    vi.advanceTimersByTime(60_000)
    expect(controller.getSnapshot()).toBe(paused)
    expect(vi.getTimerCount()).toBe(0)
    controller.play()
    vi.advanceTimersByTime(624)
    expect(projection(controller).events).toHaveLength(1)
    vi.advanceTimersByTime(1)
    expect(projection(controller).events.map(event => event.kind)).toEqual(['PASS', 'RECEIVER_TOUCH'])
    vi.advanceTimersByTime(4000)
    expect(controller.getSnapshot().replay.status).toBe('complete')
    controller.play()
    controller.pause()
    expect(controller.getSnapshot().replay.status).toBe('complete')
  })

  it('processes an event due exactly when Pause is pressed, even before its timer callback', async () => {
    const controller = await ready()
    controller.play()
    vi.spyOn(performance, 'now').mockReturnValue(1000)
    controller.pause()
    expect(controller.getSnapshot().replay).toMatchObject({ status: 'paused', eventCount: 2, elapsedMs: 1000 })
    expect(projection(controller).events.at(-1)?.kind).toBe('RECEIVER_TOUCH')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('uses nonzero, uneven supplied offsets and supports extra ordered events rather than hard-coded stages', async () => {
    const source = scenarioFixture('S1')
    const offsets = [200, 725, 1201, 1202, 4300, 6100]
    const events = source.events.map((event, index) => ({ ...event, offsetMs: offsets[index] }))
    events.splice(1, 0, { ...events[0], id: 'E-EXTRA-PASS', offsetMs: 201, revealFactIds: [] })
    const controller = await ready('S1', { ...createScenarioRepositoryStub(), get: async () => ({ ...source, events }) })
    controller.play()
    vi.advanceTimersByTime(199)
    expect(projection(controller).events).toHaveLength(0)
    vi.advanceTimersByTime(1)
    expect(projection(controller).events).toHaveLength(1)
    vi.advanceTimersByTime(1)
    expect(projection(controller).events).toHaveLength(2)
    vi.advanceTimersByTime(5899)
    expect(projection(controller).events.map(event => event.id)).toEqual(events.map(event => event.id))
    expect(controller.getSnapshot().replay).toMatchObject({ status: 'complete', elapsedMs: 6100 })
  })

  it('catches up delayed callbacks in source event order without timing drift', async () => {
    const controller = await ready()
    const counts: number[] = []
    controller.subscribe(() => {
      const count = controller.getSnapshot().replay.eventCount
      if (counts.at(-1) !== count) counts.push(count)
    })
    controller.play()
    vi.spyOn(performance, 'now').mockReturnValue(5000)
    vi.advanceTimersByTime(1000)
    expect(counts).toEqual([0, 1, 2, 3, 4, 5, 6])
    expect(controller.getSnapshot().replay.status).toBe('complete')
  })

  it.each(['playing', 'paused', 'complete'] as const)('restart from %s cancels old timers and starts a fresh immutable run', async status => {
    const controller = await ready()
    const source = controller.getSnapshot().scenario
    const previousRun = controller.getSnapshot().replay.replayRunId
    controller.play()
    vi.advanceTimersByTime(status === 'complete' ? 5000 : 375)
    if (status === 'paused') controller.pause()
    controller.restart()
    expect(controller.getSnapshot().replay).toEqual({
      replayRunId: previousRun + 1, status: 'ready', elapsedMs: 0, eventCount: 0,
    })
    vi.advanceTimersByTime(10_000)
    expect(projection(controller).events).toHaveLength(0)
    expect(controller.getSnapshot().scenario).toBe(source)
    expect(controller.getSnapshot().selection).toBeNull()
    controller.play()
    expect(projection(controller).events).toHaveLength(1)
    await controller.selectScenario('S1')
    expect(controller.getSnapshot().replay.replayRunId).toBe(previousRun + 2)
    expect(projection(controller).events).toHaveLength(0)
  })

  it.each(['S1', 'S2', 'S3'] as const)('%s gates facts, original decision, supplied outcome and after-score at exact boundaries', async id => {
    const controller = await ready(id)
    expect(projection(controller).evidence.contextEvidence.map(item => item.id)).toEqual(['MATCH-SCORE-BEFORE'])
    expect(projection(controller).scene.diagram).toMatchObject({
      status: 'UNAVAILABLE', markers: [], secondLastReferenceX: null,
    })
    expect(projection(controller).scene.diagram.textAlternative).toContain('Not yet revealed')
    controller.play()
    expect(projection(controller).scene.visibleFacts).toHaveLength(6)
    expect(projection(controller).scene.visibleFacts.some(fact => fact.key === 'ACTIVE_INVOLVEMENT')).toBe(false)
    if (id === 'S3') {
      expect(projection(controller).scene.diagram.status).toBe('UNAVAILABLE')
      expect(projection(controller).scene.diagram.textAlternative).toContain('Pass-time snapshot unavailable')
      expect(projection(controller).scene.visibleFacts.filter(fact => fact.status === 'MISSING').map(fact => fact.value)).toEqual([null, null])
    } else {
      expect(projection(controller).scene.diagram.status).toBe('ILLUSTRATIVE')
    }
    vi.advanceTimersByTime(2999)
    expect(projection(controller).evidence.contextEvidence.map(item => item.id)).toEqual(['MATCH-SCORE-BEFORE'])
    vi.advanceTimersByTime(1)
    expect(projection(controller).evidence.contextEvidence.map(item => item.id)).toEqual(['MATCH-SCORE-BEFORE', 'DECISION-ORIGINAL'])
    vi.advanceTimersByTime(1999)
    expect(projection(controller).reviewReady).toBe(false)
    expect(projection(controller).evidence.contextEvidence).toHaveLength(2)
    vi.advanceTimersByTime(1)
    expect(projection(controller).reviewReady).toBe(true)
    expect(projection(controller).evidence.contextEvidence.map(item => item.id)).toEqual([
      'MATCH-SCORE-BEFORE', 'DECISION-ORIGINAL', 'DECISION-REVIEW', 'MATCH-SCORE-AFTER',
    ])
    const outcome = projection(controller).evidence.contextEvidence[2]
    const score = projection(controller).evidence.contextEvidence[3]
    expect(outcome.value).toEqual(scenarioFixture(id).suppliedReviewOutcome)
    expect(score.value).toEqual(scenarioFixture(id).scoreAfterReview)
    expect(outcome.status).toBe(id === 'S3' ? 'MISSING' : 'SUPPLIED')
    controller.restart()
    expect(projection(controller).evidence.contextEvidence).toHaveLength(1)
    expect(projection(controller).scene.visibleFacts).toHaveLength(0)
  })

  it('withholds every diagram field until all relevant position facts are released, not merely the PASS kind', async () => {
    const source = scenarioFixture('S2')
    const events = source.events.map(event => ({
      ...event,
      revealFactIds: event.kind === 'PASS' ? event.revealFactIds.filter(id => id !== 'F-POSITION')
        : event.kind === 'GOAL' ? ['F-POSITION'] : event.revealFactIds,
    }))
    const controller = await ready('S2', { ...createScenarioRepositoryStub(), get: async () => ({ ...source, events }) })
    controller.play()
    expect(projection(controller).scene.diagram.markers).toEqual([])
    expect(projection(controller).scene.diagram.secondLastReferenceX).toBeNull()
    expect(projection(controller).scene.diagram.textAlternative).not.toBe(source.diagram.textAlternative)
    expect(projection(controller).scene.visibleFacts.some(fact => fact.id === 'F-POSITION')).toBe(false)
    vi.advanceTimersByTime(3000)
    expect(projection(controller).scene.diagram).toEqual(source.diagram)
  })

  it('validates released source selections and rejects stale callbacks after restart or selection', async () => {
    const controller = await ready()
    const run = controller.getSnapshot().replay.replayRunId
    expect(controller.inspectSources({ evidenceIds: ['F-POSITION'], ruleIds: [] }, run)).toBe(false)
    expect(controller.getSnapshot().selectionError).toContain('currently released')
    controller.play()
    expect(controller.inspectSources({ evidenceIds: ['F-POSITION'], ruleIds: ['R-OFFSIDE'] }, run)).toBe(true)
    expect(controller.getSnapshot().selection).toEqual({ evidenceIds: ['F-POSITION'], ruleIds: ['R-OFFSIDE'] })
    expect(controller.inspectSources({ evidenceIds: ['DECISION-REVIEW'], ruleIds: [] }, run)).toBe(false)
    expect(controller.inspectSources({ evidenceIds: [], ruleIds: ['UNKNOWN'] }, run)).toBe(false)
    controller.restart()
    expect(controller.getSnapshot().selection).toBeNull()
    expect(controller.getSnapshot().selectionError).toBeNull()
    expect(controller.inspectSources({ evidenceIds: ['MATCH-SCORE-BEFORE'], ruleIds: [] }, run)).toBe(false)
    await controller.selectScenario('S2')
    expect(controller.getSnapshot().selection).toBeNull()
  })
})

describe('VAR-102 repository, error and freshness boundary', () => {
  it.each(['S0', '', 's1', 'S1 '])('rejects invalid ID %j without a hidden default or repository request', async id => {
    const repository = createScenarioRepositoryStub()
    const get = vi.spyOn(repository, 'get')
    const controller = start(repository, id)
    await settle()
    expect(controller.getSnapshot().scenarioStatus).toBe('error')
    expect(controller.getSnapshot().scenarioError).toMatchObject({ code: 'INVALID_REQUEST', retryable: false })
    expect(controller.getSnapshot().scenario).toBeNull()
    expect(get).not.toHaveBeenCalled()
    await controller.selectScenario('S2')
    expect(controller.getSnapshot().scenario?.id).toBe('S2')
  })

  it('exposes list failure and explicitly retries rather than inventing choices', async () => {
    const base = createScenarioRepositoryStub()
    const list = vi.fn(base.list).mockRejectedValueOnce(new Error('Private transport diagnostic'))
    const controller = start({ ...base, list }, 'S1')
    await settle()
    expect(controller.getSnapshot().listError?.code).toBe('LOAD_FAILED')
    expect(controller.getSnapshot().listError?.message).not.toContain('Private')
    expect(controller.getSnapshot().summaries).toEqual([])
    expect(controller.getSnapshot().scenario).toBeNull()
    await controller.reloadChoices()
    expect(controller.getSnapshot().scenario?.id).toBe('S1')
    expect(list).toHaveBeenCalledTimes(2)
  })

  it.each(['empty', 'duplicate', 'incomplete'])('rejects %s summary lists without a selection fallback', async kind => {
    const base = createScenarioRepositoryStub()
    const original = await base.list()
    const value = kind === 'empty' ? [] : kind === 'duplicate' ? [original[0], original[0], original[2]]
      : original.map(item => ({ ...item, synthetic: undefined }))
    const controller = start({ ...base, list: async () => value as ScenariosQuery['scenarios'] }, 'S1')
    await settle()
    expect(controller.getSnapshot().listError?.code).toBe('INVALID_OUTPUT')
    expect(controller.getSnapshot().scenario).toBeNull()
  })

  it('clears stale replay while loading and gives explicit retries fresh correlation and run IDs', async () => {
    const base = createScenarioRepositoryStub()
    const get = vi.fn(base.get).mockRejectedValueOnce(new Error('Unavailable'))
    const controller = start({ ...base, get }, 'S1')
    await settle()
    const failedRun = controller.getSnapshot().replay.replayRunId
    expect(controller.getSnapshot().scenarioError).toMatchObject({ code: 'LOAD_FAILED', retryable: true })
    await controller.retryScenario()
    expect(controller.getSnapshot().scenario?.id).toBe('S1')
    expect(controller.getSnapshot().scenarioError).toBeNull()
    expect(controller.getSnapshot().replay.replayRunId).toBeGreaterThan(failedRun)
    expect(get.mock.calls[0][1]).not.toBe(get.mock.calls[1][1])
    expect(get.mock.calls[0][2]?.aborted).toBe(true)
  })

  it('preserves validated domain errors and their retry policy rather than success-shaped fallbacks', async () => {
    const base = createScenarioRepositoryStub()
    const controller = start({ ...base, get: (_id, requestId, signal) => base.get('UNKNOWN', requestId, signal) }, 'S1')
    await settle()
    expect(controller.getSnapshot().scenarioStatus).toBe('error')
    expect(controller.getSnapshot().scenarioError).toMatchObject({ code: 'SCENARIO_NOT_FOUND', retryable: false })
    expect(controller.getSnapshot().scenario).toBeNull()
  })

  it.each(['missing-null', 'wrong-id', 'wrong-version', 'wrong-schema', 'wrong-offset', 'missing-response'])(
    'rejects %s scenario responses at the host boundary', async kind => {
      const source = scenarioFixture('S1')
      const values: Record<string, unknown> = {
        'missing-null': { ...source, diagram: { ...source.diagram, secondLastReferenceX: undefined } },
        'wrong-id': scenarioFixture('S2'),
        'wrong-version': { ...source, contentVersion: 'another-version' },
        'wrong-schema': { ...source, schemaVersion: '0.1' },
        'wrong-offset': { ...source, events: source.events.map(event => ({ ...event, offsetMs: 0 })) },
        'missing-response': undefined,
      }
      const controller = start({
        ...createScenarioRepositoryStub(), get: async () => values[kind] as ScenarioQuery['scenario'],
      }, 'S1')
      await settle()
      expect(controller.getSnapshot().scenarioError?.code).toBe('INVALID_OUTPUT')
      expect(controller.getSnapshot().scenario).toBeNull()
    },
  )

  it('rejects mismatched error correlation instead of accepting another request’s error', async () => {
    const base = createScenarioRepositoryStub()
    const controller = start({ ...base, get: () => base.get('UNKNOWN', 'wrong-request') }, 'S1')
    await settle()
    expect(controller.getSnapshot().scenarioError?.code).toBe('INVALID_OUTPUT')
  })

  it.each(['success', 'failure'])('ignores stale %s after a newer selection, even when the repository ignores abort', async kind => {
    const old = deferred<ScenarioQuery['scenario']>()
    const next = deferred<ScenarioQuery['scenario']>()
    const get = vi.fn<ScenarioRepository['get']>()
      .mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise)
    const controller = start({ ...createScenarioRepositoryStub(), get })
    await settle()
    void controller.selectScenario('S1')
    const previousRun = controller.getSnapshot().replay.replayRunId
    void controller.selectScenario('S2')
    expect(controller.getSnapshot()).toMatchObject({ scenario: null, scenarioStatus: 'loading', selectedId: 'S2' })
    expect(get.mock.calls[0][2]?.aborted).toBe(true)
    next.resolve(scenarioFixture('S2'))
    await settle()
    if (kind === 'success') old.resolve(scenarioFixture('S1'))
    else old.reject(new Error('Old failed request'))
    await settle()
    expect(controller.getSnapshot().scenario?.id).toBe('S2')
    expect(controller.getSnapshot().scenarioError).toBeNull()
    expect(controller.getSnapshot().replay.replayRunId).toBeGreaterThan(previousRun)
  })

  it('also rejects stale same-ID requests and stale list completions', async () => {
    const lists = [deferred<ScenariosQuery['scenarios']>(), deferred<ScenariosQuery['scenarios']>()]
    const base = createScenarioRepositoryStub()
    const list = vi.fn<ScenarioRepository['list']>().mockReturnValueOnce(lists[0].promise).mockReturnValueOnce(lists[1].promise)
    const controller = start({ ...base, list })
    void controller.reloadChoices()
    lists[1].resolve(await base.list())
    await settle()
    lists[0].reject(new Error('Late list failure'))
    await settle()
    expect(controller.getSnapshot().listStatus).toBe('ready')
    expect(controller.getSnapshot().listError).toBeNull()

    const old = deferred<ScenarioQuery['scenario']>()
    const get = vi.fn<ScenarioRepository['get']>().mockReturnValueOnce(old.promise)
      .mockResolvedValueOnce({ ...scenarioFixture('S1'), label: 'New same-ID response' })
    const same = start({ ...base, get })
    await settle()
    void same.selectScenario('S1')
    await same.selectScenario('S1')
    old.resolve({ ...scenarioFixture('S1'), label: 'Old same-ID response' })
    await settle()
    expect(same.getSnapshot().scenario?.label).toBe('New same-ID response')
  })

  it('ignores post-stop completions and removes an active replay timer', async () => {
    const pending = deferred<ScenarioQuery['scenario']>()
    const controller = start({ ...createScenarioRepositoryStub(), get: () => pending.promise }, 'S1')
    await settle()
    controller.stop()
    const stopped = controller.getSnapshot()
    pending.resolve(scenarioFixture('S1'))
    await settle()
    expect(controller.getSnapshot()).toBe(stopped)
    const playing = await ready()
    playing.play()
    expect(vi.getTimerCount()).toBe(1)
    playing.stop()
    expect(vi.getTimerCount()).toBe(0)
    const finalState = playing.getSnapshot()
    playing.pause()
    expect(playing.getSnapshot()).toBe(finalState)
  })
})

describe('VAR-102 comparison injection boundary', () => {
  it('does not fetch or expose a pair until review-ready, and selection uses the normal reset path', async () => {
    const repository = createScenarioRepositoryStub()
    const get = vi.spyOn(repository, 'get')
    const controller = await ready('S1', repository)
    const run = controller.getSnapshot().replay.replayRunId
    await controller.loadComparison()
    await controller.selectComparison('S2', run)
    expect(get).toHaveBeenCalledTimes(1)
    expect(controller.getSnapshot().comparison.pair).toBeNull()
    controller.play()
    vi.advanceTimersByTime(5000)
    await controller.loadComparison()
    expect(controller.getSnapshot().comparison.pair?.map(item => item.id)).toEqual(['S1', 'S2'])
    expect(get).toHaveBeenCalledTimes(2)
    controller.inspectSources({ evidenceIds: ['DECISION-REVIEW'], ruleIds: [] }, run)
    await controller.selectComparison('S2', run)
    expect(controller.getSnapshot().scenario?.id).toBe('S2')
    expect(controller.getSnapshot().replay.replayRunId).toBeGreaterThan(run)
    expect(projection(controller).events).toHaveLength(0)
    expect(controller.getSnapshot().selection).toBeNull()
    expect(controller.getSnapshot().comparison.pair).toBeNull()
    await controller.selectComparison('S1', run)
    expect(controller.getSnapshot().scenario?.id).toBe('S2')
  })

  it('never requests a comparison for S3', async () => {
    const repository = createScenarioRepositoryStub()
    const get = vi.spyOn(repository, 'get')
    const controller = await ready('S3', repository)
    controller.play()
    vi.advanceTimersByTime(5000)
    await controller.loadComparison()
    expect(get).toHaveBeenCalledTimes(1)
    expect(controller.getSnapshot().comparison.pair).toBeNull()
  })

  it('never leaks an unreleased current fact through the full comparison input', async () => {
    const source = scenarioFixture('S1')
    const events = source.events.map(event => ({
      ...event, revealFactIds: event.revealFactIds.filter(id => id !== 'F-POSITION'),
    }))
    const get = vi.fn(async () => ({ ...source, events }))
    const controller = await ready('S1', { ...createScenarioRepositoryStub(), get })
    controller.play()
    vi.advanceTimersByTime(5000)
    await controller.loadComparison()
    expect(controller.getSnapshot().comparison.pair).toBeNull()
    expect(controller.getSnapshot().comparison.error?.message).toContain('did not release every scenario fact')
    expect(get).toHaveBeenCalledTimes(1)
    expect(projection(controller).scene.visibleFacts.some(fact => fact.id === 'F-POSITION')).toBe(false)
  })

  it('supports explicit comparison retry and rejects stale completion after restart', async () => {
    const base = createScenarioRepositoryStub()
    const pending = deferred<ScenarioQuery['scenario']>()
    const get = vi.fn(base.get).mockImplementationOnce(base.get).mockRejectedValueOnce(new Error('Pair unavailable'))
      .mockReturnValueOnce(pending.promise)
    const controller = await ready('S1', { ...base, get })
    controller.play()
    vi.advanceTimersByTime(5000)
    await controller.loadComparison()
    expect(controller.getSnapshot().comparison.error?.code).toBe('LOAD_FAILED')
    void controller.loadComparison(true)
    expect(get.mock.calls[1][1]).not.toBe(get.mock.calls[2][1])
    controller.restart()
    pending.resolve(scenarioFixture('S2'))
    await settle()
    expect(controller.getSnapshot().comparison).toEqual({ status: 'idle', pair: null, error: null })
    expect(get.mock.calls[2][2]?.aborted).toBe(true)
  })

  it.each(['match', 'rules'])('rejects a comparison with inconsistent %s rather than passing unsafe props', async field => {
    const first = scenarioFixture('S1')
    const second = scenarioFixture('S2')
    const other: ScenarioFieldsFragment = field === 'match'
      ? { ...second, match: { ...second.match, homeTeam: 'Different context' } }
      : { ...second, rules: second.rules.map(rule => ({ ...rule, summary: 'Different draft rule summary' })) }
    const controller = await ready('S1', {
      ...createScenarioRepositoryStub(), get: async id => id === 'S1' ? first : other,
    })
    controller.play()
    vi.advanceTimersByTime(5000)
    await controller.loadComparison()
    expect(controller.getSnapshot().comparison.pair).toBeNull()
    expect(controller.getSnapshot().comparison.error?.code).toBe('INVALID_OUTPUT')
  })
})
