import type { ComponentType, ReactNode } from 'react'
import type {
  ComparisonInput, EvidenceExplorerInput, ExplanationClient, ExplanationReaderInput,
  ReviewContext, ScenarioRepository, SceneInput, SourceSelection,
} from '../contracts/interfaces'
import type { ScenarioFieldsFragment } from '../contracts/graphql.generated'
import type { FrontendPackage } from './fixtures'

export interface ReviewRoomHarnessInput {
  readonly repository: ScenarioRepository
  readonly context: ReviewContext
  readonly children: ReactNode
}

export interface HarnessSlots {
  readonly reviewRoom: ComponentType<ReviewRoomHarnessInput>
  readonly scene: ComponentType<SceneInput>
  readonly evidence: ComponentType<EvidenceExplorerInput>
  readonly explanation: ComponentType<ExplanationReaderInput>
  readonly comparison: ComponentType<ComparisonInput>
}

export interface FeatureHarnessInput {
  readonly slots: Partial<HarnessSlots>
  readonly context: ReviewContext
  readonly scene: SceneInput
  readonly evidence: EvidenceExplorerInput
  readonly repository: ScenarioRepository
  readonly client: ExplanationClient
  readonly pair: readonly [ScenarioFieldsFragment, ScenarioFieldsFragment]
  readonly inspectSources: (selection: SourceSelection) => void
  readonly selectScenario: (id: 'S1' | 'S2') => void
}

function Slot({ id, children }: { id: FrontendPackage; children?: ReactNode }) {
  return (
    <section className="harness-slot" aria-label={`${id} slot`} data-testid={`slot-${id}`}>
      <h2>{id}</h2>
      {children ?? <p data-testid={`placeholder-${id}`}>Placeholder only. This feature is not implemented.</p>}
    </section>
  )
}

export function FeatureHarness(props: FeatureHarnessInput) {
  const { reviewRoom: ReviewRoom, scene: Scene, evidence: Evidence, explanation: Explanation, comparison: Comparison } = props.slots
  const panels = (
    <div className="harness-panels">
      <Slot id="VAR-103">{Scene && <Scene {...props.scene} />}</Slot>
      <Slot id="VAR-104">{Evidence && <Evidence {...props.evidence} />}</Slot>
      <Slot id="VAR-106">
        {Explanation && <Explanation scenarioId={props.context.scenario.id} contentVersion={props.context.scenario.contentVersion}
          replayRunId={props.context.replayRunId} reviewReady={props.context.reviewReady} client={props.client} inspectSources={props.inspectSources} />}
      </Slot>
      <Slot id="VAR-107">
        {Comparison && <Comparison scenarioId={props.context.scenario.id} reviewReady={props.context.reviewReady}
          pair={props.pair} selectScenario={props.selectScenario} />}
      </Slot>
    </div>
  )
  return (
    <Slot id="VAR-102">
      {ReviewRoom
        ? <ReviewRoom repository={props.repository} context={props.context}>{panels}</ReviewRoom>
        : <><p data-testid="placeholder-VAR-102">Placeholder shell. No replay implementation is loaded.</p>{panels}</>}
    </Slot>
  )
}
