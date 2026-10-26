import { Scene } from './scene/Scene'
import { EvidenceExplorer } from './evidence/EvidenceExplorer'
import { ExplanationReader } from './explanation-view/ExplanationReader'
import { Comparison } from './comparison/Comparison'
import type { ReviewRoomSlots } from './review-room'

export const appPanels: ReviewRoomSlots = {
  scene: Scene, evidence: EvidenceExplorer, explanation: ExplanationReader, comparison: Comparison,
}
