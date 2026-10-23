import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createExplanationClientStub, createScenarioRepositoryStub } from '../../../../tests/contract-stubs/client'
import { ReviewRoom } from '../ReviewRoom'
import './preview.css'

if (!import.meta.env.DEV) throw new Error('The isolated review-room preview is development-only.')

const root = document.getElementById('root')
if (!root) throw new Error('The preview root element is missing.')
const repository = createScenarioRepositoryStub()
const client = createExplanationClientStub()

createRoot(root).render(
  <StrictMode>
    <aside className="review-room-preview-notice" aria-label="Preview limitations">
      <strong>ISOLATED DEVELOPMENT PREVIEW — T02 TEST FIXTURES</strong>
      <p>This is the VAR-102 replay shell with labelled placeholder panels. No VAR-101 implementation,
        HTTP API, live AI, scene renderer, evidence navigator, explanation reader or comparison feature is connected.</p>
    </aside>
    <ReviewRoom repository={repository} client={client} initialScenarioId="S1" />
  </StrictMode>,
)
